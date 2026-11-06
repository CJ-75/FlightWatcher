"""In-app hotel bookings via LiteAPI (prebook → pay → book)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from deals.liteapi_client import LiteApiClient, LiteApiError
from deals.liteapi_config import load_deals_config
from deals.revalidate import revalidate_deal
from supabase_deps import (
    SUPABASE_AVAILABLE,
    get_supabase_client,
    get_supabase_service_client,
    get_user_id_from_token,
    optional_auth,
)

router = APIRouter()


def _require_user(request: Request) -> str:
    user_id = get_user_id_from_token(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentification requise")
    return user_id


def _svc():
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Supabase n'est pas configuré")
    client = get_supabase_service_client() or get_supabase_client()
    if not client:
        raise HTTPException(status_code=503, detail="Client Supabase indisponible")
    return client


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# Prefer real bookings over abandoned sandbox / prebook retries.
_STATUS_RANK = {
    "confirmed": 70,
    "booking_pending": 60,
    "payment_succeeded": 50,
    "payment_pending": 40,
    "prebooked": 30,
    "draft": 20,
    "cancelled": 10,
    "failed": 0,
}


def _booking_collapse_key(row: Dict[str, Any]) -> str:
    token = str(row.get("draft_token") or "").strip()
    if token:
        return f"draft:{token}"
    lite = str(row.get("liteapi_booking_id") or "").strip()
    if lite:
        return f"lite:{lite}"
    conf = str(row.get("confirmation_code") or "").strip()
    if conf:
        return f"conf:{conf}"
    return f"id:{row.get('id')}"


def _dedupe_booking_rows(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """One row per trip (draft_token) / LiteAPI id — keep best status, then newest."""
    best: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        key = _booking_collapse_key(r)
        prev = best.get(key)
        if not prev:
            best[key] = r
            continue
        rank_r = _STATUS_RANK.get(str(r.get("status") or ""), 0)
        rank_p = _STATUS_RANK.get(str(prev.get("status") or ""), 0)
        if rank_r > rank_p:
            best[key] = r
        elif rank_r == rank_p and str(r.get("created_at") or "") > str(
            prev.get("created_at") or ""
        ):
            best[key] = r
    return sorted(
        best.values(),
        key=lambda r: str(r.get("created_at") or ""),
        reverse=True,
    )


class RevalidateRequest(BaseModel):
    hotel_id: Optional[str] = None
    displayed_price_pp: Optional[float] = None
    # Mon voyage without community deal_key — load stay from draft
    draft_token: Optional[str] = None
    # Trip-page soft sync: 1 rates call, no margin calage
    soft: bool = False


class GuestInput(BaseModel):
    firstName: str
    lastName: str
    email: Optional[str] = None
    occupancyNumber: int = 1


class HolderInput(BaseModel):
    firstName: str
    lastName: str
    email: str


class PrebookRequest(BaseModel):
    deal_key: str
    offer_id: str
    hotel_id: str
    displayed_price: float
    charged_price: Optional[float] = None
    margin_pct_used: Optional[float] = None
    ssp_at_booking: Optional[float] = None
    deal_snapshot: Dict[str, Any] = Field(default_factory=dict)
    # Lot D: anonymous MyTrip — required when no JWT
    draft_token: Optional[str] = None


class BookRequest(BaseModel):
    holder: HolderInput
    guests: List[GuestInput] = Field(default_factory=list)
    payment_status: str = "succeeded"  # succeeded | requires_capture
    draft_token: Optional[str] = None
    # Sandbox: skip Payment SDK and book with ACC_CREDIT_CARD (LiteAPI test mode)
    sandbox_simulate: bool = False


class CancelRequest(BaseModel):
    draft_token: Optional[str] = None


def _user_id_from_access_token(access_token: Optional[str]) -> Optional[str]:
    """Decode Supabase JWT from query (mobile / in-browser PDF open)."""
    raw = (access_token or "").strip()
    if not raw:
        return None
    try:
        import jwt as pyjwt

        decoded = pyjwt.decode(raw, options={"verify_signature": False})
        sub = decoded.get("sub")
        return str(sub) if sub else None
    except Exception:
        return None


def _resolve_booking_actor(
    request: Request,
    draft_token: Optional[str],
    *,
    access_token: Optional[str] = None,
) -> Dict[str, Optional[str]]:
    """JWT user and/or valid my_trip draft_token. At least one required."""
    user_id = get_user_id_from_token(request) or _user_id_from_access_token(access_token)
    token = (draft_token or "").strip() or None
    if user_id:
        return {"user_id": user_id, "draft_token": token}
    if not token:
        raise HTTPException(status_code=401, detail="Authentification ou voyage requis")
    from deals.my_trips import get_draft

    row = get_draft(_svc(), token)
    if not row:
        raise HTTPException(status_code=401, detail="Voyage introuvable ou expiré")
    return {"user_id": None, "draft_token": token}


_INVOICE_STATUSES = frozenset({"confirmed", "payment_succeeded", "booking_pending"})


def _invoice_available(row: dict) -> bool:
    status = str(row.get("status") or "").strip().lower()
    if status not in _INVOICE_STATUSES:
        return False
    return bool(str(row.get("liteapi_booking_id") or "").strip())


def _unwrap_liteapi_data(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    data = raw.get("data")
    return data if isinstance(data, dict) else raw


def _map_liteapi_booking_status(status_raw: str) -> Optional[str]:
    s = (status_raw or "").strip().upper()
    if not s:
        return None
    if s in ("CONFIRMED", "BOOKED", "SUCCESS"):
        return "confirmed"
    if s in ("CANCELLED", "CANCELED"):
        return "cancelled"
    if "PENDING" in s or "PROCESS" in s:
        return "booking_pending"
    if "FAIL" in s or "ERROR" in s:
        return "failed"
    return None


def _parse_liteapi_cancel_fields(data: Dict[str, Any]) -> Dict[str, Any]:
    """Extract refundable + free-cancel deadline from retrieve booking payload."""
    out: Dict[str, Any] = {"refundable": None, "cancel_deadline": None}
    try:
        from deals.hotel_scoring import _cancel_deadline
    except Exception:
        _cancel_deadline = None  # type: ignore

    nodes: List[Any] = [data]
    rooms = data.get("bookedRooms") or data.get("booked_rooms") or []
    if isinstance(rooms, list):
        for room in rooms:
            if isinstance(room, dict):
                nodes.append(room)
                rate = room.get("rate")
                if isinstance(rate, dict):
                    nodes.append(rate)

    refundable: Optional[bool] = None
    for node in nodes:
        if not isinstance(node, dict):
            continue
        policies = node.get("cancellationPolicies") or node.get("cancellation_policies")
        if not isinstance(policies, dict):
            continue
        tag = str(policies.get("refundableTag") or policies.get("refundable_tag") or "").upper()
        if tag == "RFN":
            refundable = True
            break
        if tag == "NRFN":
            refundable = False
            break
    out["refundable"] = refundable

    if _cancel_deadline is not None:
        deadline = _cancel_deadline(data)
        if not deadline:
            for node in nodes[1:]:
                if isinstance(node, dict):
                    deadline = _cancel_deadline(node)
                    if deadline:
                        break
        out["cancel_deadline"] = deadline
    return out


def _parse_liteapi_booking(raw: Any) -> Dict[str, Any]:
    data = _unwrap_liteapi_data(raw)
    status = _map_liteapi_booking_status(str(data.get("status") or data.get("bookingStatus") or ""))
    confirmation = (
        data.get("hotelConfirmationCode")
        or data.get("confirmationCode")
        or data.get("confirmation_code")
        or data.get("supplierBookingId")
    )
    lite_id = (
        data.get("bookingId")
        or data.get("booking_id")
        or data.get("id")
    )
    cancel = _parse_liteapi_cancel_fields(data)
    return {
        "status": status,
        "confirmation_code": str(confirmation).strip() if confirmation else None,
        "liteapi_booking_id": str(lite_id).strip() if lite_id else None,
        "refundable": cancel.get("refundable"),
        "cancel_deadline": cancel.get("cancel_deadline"),
        "raw": raw if isinstance(raw, dict) else {"data": data},
        "data": data,
    }


def _merge_cancel_into_snapshot(
    snap: Any,
    *,
    refundable: Optional[bool],
    cancel_deadline: Optional[str],
) -> Optional[dict]:
    if refundable is None and not cancel_deadline:
        return None
    base = dict(snap) if isinstance(snap, dict) else {}
    hotel = (
        dict(base["hotel"])
        if isinstance(base.get("hotel"), dict)
        else {}
    )
    if refundable is not None:
        hotel["refundable"] = refundable
        base["refundable"] = refundable
    if cancel_deadline:
        hotel["cancel_deadline"] = cancel_deadline
        base["cancel_deadline"] = cancel_deadline
    base["hotel"] = hotel
    return base


def _resync_booking_from_liteapi(
    supabase,
    booking: dict,
    *,
    force: bool = False,
) -> dict:
    """
    Poll LiteAPI GET /bookings/{id} while pending (or when force=True).
    Persists status / confirmation / cancel policy; marks draft booked on confirm.
    """
    status_now = str(booking.get("status") or "").strip().lower()
    if status_now in ("cancelled", "failed") and not force:
        return booking
    if status_now not in ("booking_pending",) and not force:
        return booking

    lite_id = str(booking.get("liteapi_booking_id") or "").strip()
    if not lite_id:
        return booking

    client = LiteApiClient()
    try:
        raw = client.get_booking(lite_id)
    except LiteApiError:
        return booking
    finally:
        client.close()

    parsed = _parse_liteapi_booking(raw)
    new_status = parsed.get("status")
    # Never regress a confirmed booking back to pending
    if status_now == "confirmed" and new_status == "booking_pending":
        new_status = "confirmed"
    if not new_status and not force:
        return booking

    conf = parsed.get("confirmation_code")
    status_changed = bool(new_status and new_status != status_now)
    conf_changed = bool(
        conf and conf != str(booking.get("confirmation_code") or "").strip()
    )
    lite_changed = bool(
        parsed.get("liteapi_booking_id")
        and parsed["liteapi_booking_id"]
        != str(booking.get("liteapi_booking_id") or "").strip()
    )
    snap = _merge_cancel_into_snapshot(
        booking.get("deal_snapshot"),
        refundable=parsed.get("refundable"),
        cancel_deadline=parsed.get("cancel_deadline"),
    )
    snap_changed = snap is not None and snap != booking.get("deal_snapshot")

    if not (
        force or status_changed or conf_changed or lite_changed or snap_changed
    ):
        return booking

    patch: Dict[str, Any] = {"updated_at": _now()}
    if new_status:
        patch["status"] = new_status
    if conf:
        patch["confirmation_code"] = conf
    if parsed.get("liteapi_booking_id"):
        patch["liteapi_booking_id"] = parsed["liteapi_booking_id"]
    if snap is not None:
        patch["deal_snapshot"] = snap

    raw_book = booking.get("raw_book")
    if isinstance(raw_book, dict):
        patch["raw_book"] = {**raw_book, "_retrieve": parsed.get("raw")}
    else:
        patch["raw_book"] = parsed.get("raw")

    booking_id = str(booking.get("id") or "")
    if not booking_id:
        return booking
    updated = (
        supabase.table("hotel_bookings")
        .update(patch)
        .eq("id", booking_id)
        .execute()
    )
    row = (updated.data or [{**booking, **patch}])[0]

    became_confirmed = (
        new_status == "confirmed"
        and status_now != "confirmed"
    )
    draft_token = str(booking.get("draft_token") or "").strip()
    if became_confirmed and draft_token:
        try:
            from deals.my_trips import mark_hotel_booked, record_trip_event

            holder = _holder_from_raw(row.get("raw_book") or parsed.get("raw"))
            mark_hotel_booked(
                supabase,
                draft_token,
                booking_id=booking_id,
                confirmation_code=str(
                    row.get("confirmation_code") or conf or ""
                )
                or None,
                holder_email=(holder or {}).get("email"),
                charged_price=booking.get("charged_price"),
            )
            record_trip_event(
                supabase,
                draft_token,
                "hotel_booked",
                meta={"booking_id": booking_id, "source": "liteapi_resync"},
            )
        except Exception:
            pass

    return row


def _fetch_booking_for_actor(
    supabase,
    booking_id: str,
    *,
    user_id: Optional[str],
    draft_token: Optional[str],
):
    q = supabase.table("hotel_bookings").select("*").eq("id", booking_id)
    if user_id:
        q = q.eq("user_id", user_id)
    elif draft_token:
        q = q.eq("draft_token", draft_token)
    else:
        raise HTTPException(status_code=401, detail="Authentification requise")
    result = q.limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Réservation introuvable")
    return result.data[0]


def _raise_revalidate_result(result: dict):
    if result.get("ok"):
        return result
    raise HTTPException(
        status_code=409 if result.get("reason") == "unavailable" else 404,
        detail=result,
    )


@router.post("/api/deals/my-trip/{draft_token}/revalidate-hotel")
@optional_auth
async def revalidate_my_trip_hotel(
    draft_token: str, body: RevalidateRequest, request: Request
):
    """Revalidate hotel rates for a Mon voyage draft (no community deal_key)."""
    _ = request
    cfg = load_deals_config()
    if not cfg.api_key:
        raise HTTPException(status_code=503, detail="LiteAPI non configuré")
    token = (draft_token or "").strip()
    if not token:
        raise HTTPException(
            status_code=400, detail={"ok": False, "reason": "missing_draft_token"}
        )
    try:
        result = revalidate_deal(
            _svc(),
            f"mytrip-{token}",
            hotel_id=body.hotel_id,
            displayed_price_pp=body.displayed_price_pp,
            draft_token=token,
            cfg=cfg,
            soft=bool(body.soft),
        )
        return _raise_revalidate_result(result)
    except HTTPException:
        raise
    except LiteApiError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/deals/{deal_key}/revalidate")
@optional_auth
async def revalidate(deal_key: str, body: RevalidateRequest, request: Request):
    """Live revalidation + SSP margin calage. Calls LiteAPI."""
    _ = request  # auth optional for browse; booking requires auth later
    cfg = load_deals_config()
    if not cfg.api_key:
        raise HTTPException(status_code=503, detail="LiteAPI non configuré")
    try:
        supabase = _svc()
        result = revalidate_deal(
            supabase,
            deal_key,
            hotel_id=body.hotel_id,
            displayed_price_pp=body.displayed_price_pp,
            draft_token=body.draft_token,
            cfg=cfg,
        )
        return _raise_revalidate_result(result)
    except HTTPException:
        raise
    except LiteApiError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/hotel-bookings/prebook")
@optional_auth
async def prebook(body: PrebookRequest, request: Request):
    """
    LiteAPI prebook with usePaymentSdk=true.
    Persists prebook_id + transaction_id immediately.
    Auth: JWT user OR valid my_trip draft_token (Lot D guest).
    """
    actor = _resolve_booking_actor(request, body.draft_token)
    cfg = load_deals_config()
    if not cfg.booking_enabled:
        raise HTTPException(
            status_code=403,
            detail="Réservation hôtel désactivée (phase lecture seule)",
        )
    if not cfg.api_key:
        raise HTTPException(status_code=503, detail="LiteAPI non configuré")
    if not body.offer_id:
        raise HTTPException(status_code=400, detail="offer_id requis")

    supabase = _svc()
    client = LiteApiClient(cfg=cfg)
    try:
        raw = client.prebook(body.offer_id, use_payment_sdk=True)
    except LiteApiError as e:
        raise HTTPException(status_code=502, detail=f"Prebook échoué: {e}")
    finally:
        client.close()

    data = raw.get("data") if isinstance(raw, dict) else None
    if not isinstance(data, dict):
        data = raw if isinstance(raw, dict) else {}

    prebook_id = data.get("prebookId") or data.get("prebook_id")
    transaction_id = data.get("transactionId") or data.get("transaction_id")
    secret_key = data.get("secretKey") or data.get("secret_key")
    if not prebook_id or not transaction_id:
        raise HTTPException(
            status_code=502,
            detail="Réponse prebook incomplète (prebookId/transactionId manquants)",
        )

    row = {
        "user_id": actor["user_id"],
        "draft_token": actor["draft_token"],
        "deal_key": body.deal_key,
        "deal_snapshot": body.deal_snapshot or {},
        "hotel_id": body.hotel_id,
        "offer_id": body.offer_id,
        "prebook_id": str(prebook_id),
        "transaction_id": str(transaction_id),
        "displayed_price": body.displayed_price,
        "charged_price": body.charged_price or body.displayed_price,
        "margin_pct_used": body.margin_pct_used,
        "ssp_at_booking": body.ssp_at_booking,
        "status": "prebooked",
        "raw_prebook": raw,
        "updated_at": _now(),
    }
    if actor["draft_token"]:
        try:
            from deals.my_trips import get_draft

            linked_draft = get_draft(supabase, actor["draft_token"])
            if linked_draft and linked_draft.get("id"):
                row["draft_id"] = linked_draft["id"]
        except Exception:
            pass
    try:
        result = supabase.table("hotel_bookings").insert(row).execute()
    except Exception as e:
        # Backward-compatible during manual migration rollout.
        missing_link_column = any(
            key in str(e).lower() for key in ("draft_token", "draft_id")
        )
        if actor["user_id"] and missing_link_column:
            row.pop("draft_token", None)
            row.pop("draft_id", None)
            result = supabase.table("hotel_bookings").insert(row).execute()
        else:
            raise HTTPException(
                status_code=500,
                detail="Impossible d'enregistrer le prebook (appliquez apply_mytrip_guest_hotel_booking_migration.sql)",
            ) from e
    if not result.data:
        raise HTTPException(status_code=500, detail="Impossible d'enregistrer le prebook")
    booking = result.data[0]

    return {
        "booking_id": booking["id"],
        "prebook_id": booking["prebook_id"],
        "transaction_id": booking["transaction_id"],
        "secret_key": secret_key,
        "payment_public_key": cfg.payment_public_key or None,
        "liteapi_env": cfg.liteapi_env,
        "status": booking["status"],
        "charged_price": booking.get("charged_price"),
        "currency": cfg.currency,
    }


@router.post("/api/hotel-bookings/{booking_id}/book")
@optional_auth
async def book(booking_id: str, body: BookRequest, request: Request):
    """Call after payment succeeded / requires_capture. Never if payment failed."""
    actor = _resolve_booking_actor(request, body.draft_token)
    if body.payment_status not in ("succeeded", "requires_capture"):
        raise HTTPException(
            status_code=400,
            detail="Paiement non finalisé — book refusé",
        )

    supabase = _svc()
    booking = _fetch_booking_for_actor(
        supabase,
        booking_id,
        user_id=actor["user_id"],
        draft_token=actor["draft_token"],
    )
    status_now = str(booking.get("status") or "")
    if status_now == "confirmed":
        return _public_booking(booking)
    if status_now == "booking_pending":
        # Another request already claimed LiteAPI — return current row (idempotent).
        return _public_booking(booking)

    prebook_id = booking.get("prebook_id")
    transaction_id = booking.get("transaction_id")
    if not prebook_id or not transaction_id:
        raise HTTPException(status_code=400, detail="Prebook manquant")

    # LiteAPI: one primary guest per room (occupancyNumber = room index, not pax count)
    guests = [g.model_dump(exclude_none=True) for g in body.guests]
    if not guests:
        guests = [
            {
                "firstName": body.holder.firstName,
                "lastName": body.holder.lastName,
                "email": body.holder.email,
                "occupancyNumber": 1,
            }
        ]
    else:
        # Dedupe accidental duplicate occupancyNumber=1 (old FE sent 2 adults as 2 guests)
        by_occ: Dict[int, Dict[str, Any]] = {}
        for g in guests:
            occ = int(g.get("occupancyNumber") or 1)
            by_occ[occ] = {
                "firstName": g.get("firstName") or body.holder.firstName,
                "lastName": g.get("lastName") or body.holder.lastName,
                "email": g.get("email") or body.holder.email,
                "occupancyNumber": occ,
            }
        guests = [by_occ[k] for k in sorted(by_occ.keys())]

    cfg = load_deals_config()
    # Sandbox simulate (FE button) must NOT use TRANSACTION_ID — payment never ran.
    # LiteAPI docs: ACC_CREDIT_CARD simulates booking without charge in sandbox.
    if cfg.is_sandbox and body.sandbox_simulate:
        payment: Dict[str, Any] = {"method": "ACC_CREDIT_CARD"}
    else:
        payment = {
            "method": "TRANSACTION_ID",
            "transactionId": transaction_id,
        }

    # Atomic claim: only one concurrent book may call LiteAPI.
    claim = (
        supabase.table("hotel_bookings")
        .update({"status": "booking_pending", "updated_at": _now()})
        .eq("id", booking_id)
        .in_("status", ["prebooked", "payment_succeeded", "failed"])
        .execute()
    )
    if not (claim.data or []):
        fresh = _fetch_booking_for_actor(
            supabase,
            booking_id,
            user_id=actor["user_id"],
            draft_token=actor["draft_token"],
        )
        return _public_booking(fresh)

    client = LiteApiClient(cfg=cfg)
    try:
        raw = client.book(
            {
                "prebookId": prebook_id,
                "holder": body.holder.model_dump(),
                "guests": guests,
                "payment": payment,
            }
        )
    except LiteApiError as e:
        err_detail: Any = str(e)
        if e.body is not None:
            err_detail = {"message": str(e), "liteapi": e.body}
        supabase.table("hotel_bookings").update(
            {
                "status": "failed",
                "updated_at": _now(),
                "raw_book": {"error": str(e), "body": e.body},
            }
        ).eq("id", booking_id).execute()
        raise HTTPException(status_code=502, detail=err_detail)
    finally:
        client.close()

    data = raw.get("data") if isinstance(raw, dict) else None
    if not isinstance(data, dict):
        data = raw if isinstance(raw, dict) else {}

    liteapi_booking_id = (
        data.get("bookingId")
        or data.get("booking_id")
        or data.get("id")
    )
    confirmation = (
        data.get("hotelConfirmationCode")
        or data.get("confirmationCode")
        or data.get("confirmation_code")
    )
    status_raw = str(data.get("status") or data.get("bookingStatus") or "").lower()
    if status_raw in ("confirmed", "booked", "success"):
        status = "confirmed"
    elif "pending" in status_raw or "process" in status_raw:
        status = "booking_pending"
    else:
        status = "confirmed" if liteapi_booking_id else "booking_pending"

    upd = (
        supabase.table("hotel_bookings")
        .update(
            {
                "status": status,
                "liteapi_booking_id": str(liteapi_booking_id) if liteapi_booking_id else None,
                "confirmation_code": str(confirmation) if confirmation else None,
                "raw_book": raw,
                "updated_at": _now(),
            }
        )
        .eq("id", booking_id)
    )
    if actor["user_id"]:
        upd = upd.eq("user_id", actor["user_id"])
    elif actor["draft_token"]:
        upd = upd.eq("draft_token", actor["draft_token"])
    updated = upd.execute()
    row = (updated.data or [booking])[0]
    return _public_booking(row)


@router.post("/api/hotel-bookings/{booking_id}/cancel")
@optional_auth
async def cancel_booking(booking_id: str, body: CancelRequest, request: Request):
    """Cancel a confirmed LiteAPI hotel booking (from Mon voyage)."""
    actor = _resolve_booking_actor(request, body.draft_token)
    supabase = _svc()
    booking = _fetch_booking_for_actor(
        supabase,
        booking_id,
        user_id=actor["user_id"],
        draft_token=actor["draft_token"],
    )
    status_now = str(booking.get("status") or "").lower()
    if status_now == "cancelled":
        return {
            **_public_booking(booking),
            "already_cancelled": True,
        }
    if status_now not in ("confirmed", "booking_pending"):
        raise HTTPException(
            status_code=400,
            detail="Seule une réservation confirmée (ou en attente) peut être annulée",
        )

    liteapi_booking_id = str(booking.get("liteapi_booking_id") or "").strip()
    cfg = load_deals_config()
    raw_cancel: Any = None
    refund_amount: Optional[float] = None
    cancellation_fee: Optional[float] = None
    cancel_status = "cancelled"

    if liteapi_booking_id:
        client = LiteApiClient(cfg=cfg)
        try:
            raw_cancel = client.cancel_booking(liteapi_booking_id)
        except LiteApiError as e:
            err_detail: Any = str(e)
            if e.body is not None:
                err_detail = {"message": str(e), "liteapi": e.body}
            raise HTTPException(status_code=502, detail=err_detail)
        finally:
            client.close()

        data = raw_cancel.get("data") if isinstance(raw_cancel, dict) else None
        if not isinstance(data, dict):
            data = raw_cancel if isinstance(raw_cancel, dict) else {}
        status_raw = str(
            data.get("status") or data.get("bookingStatus") or "CANCELLED"
        ).upper()
        if "CHARGE" in status_raw:
            cancel_status = "cancelled"
        try:
            if data.get("refund_amount") is not None:
                refund_amount = float(data.get("refund_amount"))
            elif data.get("refundAmount") is not None:
                refund_amount = float(data.get("refundAmount"))
        except (TypeError, ValueError):
            refund_amount = None
        try:
            if data.get("cancellation_fee") is not None:
                cancellation_fee = float(data.get("cancellation_fee"))
            elif data.get("cancellationFee") is not None:
                cancellation_fee = float(data.get("cancellationFee"))
        except (TypeError, ValueError):
            cancellation_fee = None
    elif not cfg.is_sandbox:
        raise HTTPException(
            status_code=400,
            detail="Identifiant LiteAPI manquant — annulation impossible",
        )

    patch: Dict[str, Any] = {
        "status": cancel_status,
        "updated_at": _now(),
    }
    if isinstance(raw_cancel, dict):
        # Keep book payload; attach cancel response under raw_book._cancellation
        raw_book = booking.get("raw_book")
        if isinstance(raw_book, dict):
            patch["raw_book"] = {**raw_book, "_cancellation": raw_cancel}
        else:
            patch["raw_book"] = {"_cancellation": raw_cancel}

    upd = supabase.table("hotel_bookings").update(patch).eq("id", booking_id)
    if actor["user_id"]:
        upd = upd.eq("user_id", actor["user_id"])
    elif actor["draft_token"]:
        upd = upd.eq("draft_token", actor["draft_token"])
    updated = upd.execute()
    row = (updated.data or [{**booking, **patch}])[0]

    draft_token = (
        actor["draft_token"]
        or str(booking.get("draft_token") or "").strip()
        or None
    )
    draft_row = None
    if draft_token:
        try:
            from deals.my_trips import mark_hotel_cancelled, record_trip_event

            draft_row = mark_hotel_cancelled(
                supabase,
                draft_token,
                booking_id=booking_id,
                refund_amount=refund_amount,
                cancellation_fee=cancellation_fee,
            )
            record_trip_event(
                supabase,
                draft_token,
                "hotel_cancelled",
                meta={
                    "booking_id": booking_id,
                    "refund_amount": refund_amount,
                    "cancellation_fee": cancellation_fee,
                },
            )
        except Exception:
            draft_row = None

    out = _public_booking(row)
    out["refund_amount"] = refund_amount
    out["cancellation_fee"] = cancellation_fee
    if draft_row is not None:
        out["draft"] = draft_row
    return out


@router.get("/api/hotel-bookings")
@optional_auth
async def list_bookings(
    request: Request,
    draft_token: Optional[str] = Query(None),
):
    """
    Logged-in: bookings for user_id (optionally union draft_token rows).
    Guest: draft_token required — same proof as get_booking (valid my_trip).
    """
    user_id = get_user_id_from_token(request)
    token = (draft_token or "").strip() or None
    supabase = _svc()
    by_id: Dict[str, Dict[str, Any]] = {}

    if user_id:
        result = (
            supabase.table("hotel_bookings")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        for r in result.data or []:
            if r.get("id"):
                by_id[str(r["id"])] = r
    elif not token:
        raise HTTPException(
            status_code=401, detail="Authentification ou voyage requis"
        )

    if token:
        from deals.my_trips import get_draft

        if not get_draft(supabase, token):
            if not user_id:
                raise HTTPException(
                    status_code=401, detail="Voyage introuvable ou expiré"
                )
        else:
            result = (
                supabase.table("hotel_bookings")
                .select("*")
                .eq("draft_token", token)
                .order("created_at", desc=True)
                .execute()
            )
            for r in result.data or []:
                if r.get("id"):
                    by_id[str(r["id"])] = r

    rows = _dedupe_booking_rows(list(by_id.values()))
    return [_public_booking(r) for r in rows]


@router.get("/api/hotel-bookings/{booking_id}")
@optional_auth
async def get_booking(
    booking_id: str,
    request: Request,
    draft_token: Optional[str] = None,
    sync: Optional[bool] = Query(
        None,
        description="Force LiteAPI retrieve (cancel policy / confirmation refresh)",
    ),
):
    actor = _resolve_booking_actor(request, draft_token)
    supabase = _svc()
    booking = _fetch_booking_for_actor(
        supabase,
        booking_id,
        user_id=actor["user_id"],
        draft_token=actor["draft_token"],
    )
    # Auto-poll LiteAPI while booking_pending (settleHotelBooking); sync=1 forces refresh.
    booking = _resync_booking_from_liteapi(
        supabase, booking, force=bool(sync)
    )
    return _public_booking(booking)


@router.get("/api/hotel-bookings/{booking_id}/invoice")
@optional_auth
async def get_booking_invoice(
    booking_id: str,
    request: Request,
    draft_token: Optional[str] = Query(None),
    access_token: Optional[str] = Query(None),
):
    """Proxy LiteAPI guest invoice PDF (paid / reserved bookings only)."""
    actor = _resolve_booking_actor(
        request, draft_token, access_token=access_token
    )
    supabase = _svc()
    booking = _fetch_booking_for_actor(
        supabase,
        booking_id,
        user_id=actor["user_id"],
        draft_token=actor["draft_token"],
    )
    if not _invoice_available(booking):
        raise HTTPException(
            status_code=404,
            detail="Facture indisponible pour cette réservation",
        )
    lite_id = str(booking.get("liteapi_booking_id") or "").strip()
    try:
        client = LiteApiClient()
        pdf = client.get_invoice_pdf(lite_id)
    except LiteApiError as e:
        status = e.status_code if isinstance(e.status_code, int) else 502
        if status < 400 or status >= 600:
            status = 502
        raise HTTPException(
            status_code=status if status != 401 else 502,
            detail="Impossible de récupérer la facture",
        ) from e
    conf = str(booking.get("confirmation_code") or lite_id or booking_id)[:40]
    filename = f"facture-hotel-{conf}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "private, no-store",
        },
    )


def _nights_from_dates(dates: Any) -> Optional[int]:
    if not isinstance(dates, dict):
        return None
    out = dates.get("outbound")
    inn = dates.get("inbound")
    if not out or not inn:
        return None
    try:
        d0 = datetime.fromisoformat(str(out)[:10])
        d1 = datetime.fromisoformat(str(inn)[:10])
        n = (d1 - d0).days
        return n if n > 0 else None
    except Exception:
        return None


def _holder_from_raw(raw: Any) -> Optional[Dict[str, str]]:
    if not isinstance(raw, dict):
        return None
    data = raw.get("data") if isinstance(raw.get("data"), dict) else raw
    holder = data.get("holder") if isinstance(data, dict) else None
    if not isinstance(holder, dict):
        return None
    email = holder.get("email")
    first = holder.get("firstName") or holder.get("first_name")
    last = holder.get("lastName") or holder.get("last_name")
    if not email and not first:
        return None
    out: Dict[str, str] = {}
    if first:
        out["firstName"] = str(first)
    if last:
        out["lastName"] = str(last)
    if email:
        out["email"] = str(email)
    return out or None


def _public_booking(row: dict) -> dict:
    snap = row.get("deal_snapshot") or {}
    if not isinstance(snap, dict):
        snap = {}
    hotel = snap.get("hotel") if isinstance(snap.get("hotel"), dict) else {}
    flight = snap.get("flight") if isinstance(snap.get("flight"), dict) else {}
    pb = snap.get("price_breakdown") if isinstance(snap.get("price_breakdown"), dict) else {}
    dates = snap.get("dates") if isinstance(snap.get("dates"), dict) else None
    nights = snap.get("nights")
    if nights is None:
        nights = _nights_from_dates(dates)
    refundable = hotel.get("refundable")
    if refundable is None:
        refundable = snap.get("refundable")
    holder = _holder_from_raw(row.get("raw_book"))
    return {
        "id": row["id"],
        "deal_key": row.get("deal_key"),
        "hotel_id": row.get("hotel_id") or hotel.get("id"),
        "status": row.get("status"),
        "displayed_price": row.get("displayed_price"),
        "charged_price": row.get("charged_price"),
        "confirmation_code": row.get("confirmation_code"),
        "liteapi_booking_id": row.get("liteapi_booking_id"),
        "prebook_id": row.get("prebook_id"),
        "draft_token": row.get("draft_token"),
        "draft_id": row.get("draft_id"),
        "invoice_available": _invoice_available(row),
        "city": snap.get("city"),
        "hotel_name": hotel.get("name") or snap.get("hotel_name"),
        "hotel_photo": hotel.get("photo"),
        "hotel_stars": hotel.get("stars"),
        "hotel_rating": hotel.get("rating"),
        "board": hotel.get("board") or snap.get("board"),
        "refundable": refundable,
        "cancel_deadline": hotel.get("cancel_deadline") or snap.get("cancel_deadline"),
        "nights": nights,
        "adults": snap.get("adults"),
        "origin": snap.get("origin"),
        "destination": snap.get("destination") or snap.get("dest"),
        "flight_airline": flight.get("airline") or flight.get("carrier"),
        "excluded_fees": pb.get("excluded_fees"),
        "currency": "EUR",
        "holder": holder,
        "dates": dates,
        "deal_snapshot": snap,
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }
