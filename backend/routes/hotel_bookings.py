"""In-app hotel bookings via LiteAPI (prebook → pay → book)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
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


class RevalidateRequest(BaseModel):
    hotel_id: Optional[str] = None
    displayed_price_pp: Optional[float] = None
    # Mon voyage without community deal_key — load stay from draft
    draft_token: Optional[str] = None


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


def _resolve_booking_actor(request: Request, draft_token: Optional[str]) -> Dict[str, Optional[str]]:
    """JWT user and/or valid my_trip draft_token. At least one required."""
    user_id = get_user_id_from_token(request)
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
        if not result.get("ok"):
            raise HTTPException(
                status_code=409 if result.get("reason") == "unavailable" else 404,
                detail=result,
            )
        return result
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
    try:
        result = supabase.table("hotel_bookings").insert(row).execute()
    except Exception as e:
        # Column draft_token missing before Lot D SQL — retry without it if logged in
        if actor["user_id"] and "draft_token" in str(e).lower():
            row.pop("draft_token", None)
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
    if booking.get("status") in ("confirmed", "booking_pending"):
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

    client = LiteApiClient(cfg=cfg)
    try:
        supabase.table("hotel_bookings").update(
            {"status": "booking_pending", "updated_at": _now()}
        ).eq("id", booking_id).execute()

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

    rows = sorted(
        by_id.values(),
        key=lambda r: str(r.get("created_at") or ""),
        reverse=True,
    )
    return [_public_booking(r) for r in rows]


@router.get("/api/hotel-bookings/{booking_id}")
@optional_auth
async def get_booking(
    booking_id: str,
    request: Request,
    draft_token: Optional[str] = None,
):
    actor = _resolve_booking_actor(request, draft_token)
    supabase = _svc()
    booking = _fetch_booking_for_actor(
        supabase,
        booking_id,
        user_id=actor["user_id"],
        draft_token=actor["draft_token"],
    )
    return _public_booking(booking)


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
