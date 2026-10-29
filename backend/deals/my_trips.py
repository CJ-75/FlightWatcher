"""
D6 — anonymous « Mon voyage » drafts (booking-oriented, not Planner).
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger("deals.my_trips")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_draft(
    supabase,
    *,
    payload: Dict[str, Any],
    user_id: Optional[str] = None,
    deal_key: Optional[str] = None,
) -> Dict[str, Any]:
    token = secrets.token_urlsafe(24)
    raw = dict(payload or {})
    if deal_key and not raw.get("deal_key"):
        raw["deal_key"] = deal_key
    # Never persist client-stated pack price — rebuild from deal/rates.
    from deals.draft_pricing import trust_create_payload

    trusted = trust_create_payload(supabase, raw)
    flight = trusted.get("flight") or {}
    hotel = trusted.get("hotel")
    dates = trusted.get("dates") or {}
    row = {
        "draft_token": token,
        "user_id": user_id,
        "status": "draft",
        "payload": trusted,
        "deal_key": deal_key or trusted.get("deal_key"),
        "origin_iata": trusted.get("origin_iata") or trusted.get("departure_airport"),
        "dest_iata": trusted.get("destination") or flight.get("destination") or flight.get("destination_iata"),
        "city_name": trusted.get("city"),
        "out_date": dates.get("outbound"),
        "ret_date": dates.get("inbound"),
        "adults": int(trusted.get("adults") or 2),
        "expires_at": (_now() + timedelta(days=7)).isoformat(),
        "created_at": _now().isoformat(),
        "updated_at": _now().isoformat(),
    }
    # Drop hotel from requiring auth — keep in payload
    res = supabase.table("my_trip_drafts").insert(row).execute()
    if not res.data:
        raise RuntimeError("failed to create draft")
    data = res.data[0]
    return {
        "id": data["id"],
        "draft_token": data["draft_token"],
        "status": data["status"],
        "payload": data.get("payload") or payload,
        "expires_at": data.get("expires_at"),
        "hotel": hotel,
        "invite_available": True,
    }


def get_draft(supabase, draft_token: str, *, touch_view: bool = False) -> Optional[Dict[str, Any]]:
    res = (
        supabase.table("my_trip_drafts")
        .select("*")
        .eq("draft_token", draft_token)
        .limit(1)
        .execute()
    )
    if not res.data:
        return None
    row = res.data[0]
    if row.get("status") == "archived":
        return None
    exp = row.get("expires_at")
    if exp:
        try:
            exp_dt = datetime.fromisoformat(str(exp).replace("Z", "+00:00"))
            if exp_dt.tzinfo is None:
                exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            if _now() > exp_dt and row.get("status") == "draft":
                supabase.table("my_trip_drafts").update(
                    {"status": "archived", "updated_at": _now().isoformat()}
                ).eq("id", row["id"]).execute()
                return None
        except ValueError:
            pass
    if touch_view:
        # Lot G — return-to-page signal (last_viewed_at in payload)
        try:
            now = _now().isoformat()
            payload = _merge_payload(row, {"last_viewed_at": now})
            supabase.table("my_trip_drafts").update(
                {"payload": payload, "updated_at": now}
            ).eq("id", row["id"]).execute()
            row = {**row, "payload": payload, "updated_at": now}
        except Exception as e:
            logger.debug("touch_view: %s", e)
    return row


def claim_draft(supabase, draft_token: str, user_id: str) -> Optional[Dict[str, Any]]:
    row = get_draft(supabase, draft_token)
    if not row:
        return None
    if row.get("user_id") and row["user_id"] != user_id:
        return None
    now = _now().isoformat()
    res = (
        supabase.table("my_trip_drafts")
        .update(
            {
                "user_id": user_id,
                "status": "active",
                "updated_at": now,
            }
        )
        .eq("id", row["id"])
        .execute()
    )
    # Attach guest hotel bookings so they appear on /bookings after login
    try:
        supabase.table("hotel_bookings").update({"user_id": user_id}).eq(
            "draft_token", draft_token
        ).is_("user_id", "null").execute()
    except Exception as e:
        logger.warning("claim_draft attach bookings: %s", e)
    return (res.data or [row])[0]


def archive_expired_drafts(supabase) -> Dict[str, Any]:
    now = _now().isoformat()
    try:
        res = (
            supabase.table("my_trip_drafts")
            .update({"status": "archived", "updated_at": now})
            .eq("status", "draft")
            .lt("expires_at", now)
            .execute()
        )
        return {"archived": len(res.data or [])}
    except Exception as e:
        logger.warning("archive drafts: %s", e)
        return {"archived": 0, "error": str(e)}


def _merge_payload(row: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(row.get("payload") or {})
    payload.update(patch)
    return payload


def update_draft_hotel(
    supabase,
    draft_token: str,
    *,
    hotel: Optional[Dict[str, Any]],
    price_per_person: Optional[float] = None,
) -> Optional[Dict[str, Any]]:
    """
    Compose / switch hotel on an existing Mon voyage draft (flight stays).
    `price_per_person` from the client is ignored — server recalculates.
    """
    _ = price_per_person  # intentionally unused (API compat)
    row = get_draft(supabase, draft_token)
    if not row:
        return None
    now = _now().isoformat()
    from deals.draft_pricing import trust_hotel_patch

    payload = trust_hotel_patch(supabase, row, hotel)
    payload["hotel_selected_at"] = now
    trusted_hotel = payload.get("hotel")
    res = (
        supabase.table("my_trip_drafts")
        .update({"payload": payload, "updated_at": now})
        .eq("id", row["id"])
        .execute()
    )
    out = (res.data or [{**row, "payload": payload}])[0]
    out["hotel"] = trusted_hotel
    return out


_COMPOSE_OPTION_KEYS = (
    "id",
    "hotel_id",
    "name",
    "stars",
    "rating",
    "review_count",
    "photo",
    "thumbnail",
    "board",
    "hotel_pp",
    "public_hotel_price",
    "distance_m",
    "refundable",
    "cancel_deadline",
)


def _slim_compose_option(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    hid = raw.get("id") or raw.get("hotel_id")
    if hid is None or str(hid).strip() == "":
        return None
    out: Dict[str, Any] = {}
    for k in _COMPOSE_OPTION_KEYS:
        if k in raw and raw[k] is not None:
            out[k] = raw[k]
    out["id"] = str(hid)
    if out.get("hotel_id") is None:
        out["hotel_id"] = str(hid)
    return out


def save_compose_options(
    supabase,
    draft_token: str,
    *,
    options: Any,
    night_cap: Optional[float] = None,
    city: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Snapshot the hotel list shown on MyTrip compose so reload keeps the same
    hotels (live revalidate may drop unavailable ones / refresh prices).
    """
    row = get_draft(supabase, draft_token)
    if not row:
        return None
    slim: list = []
    seen = set()
    for item in options or []:
        if len(slim) >= 12:
            break
        opt = _slim_compose_option(item)
        if not opt:
            continue
        key = str(opt.get("id") or "")
        if not key or key in seen:
            continue
        seen.add(key)
        slim.append(opt)
    now = _now().isoformat()
    patch: Dict[str, Any] = {
        "compose_options": slim,
        "compose_options_at": now,
    }
    if night_cap is not None:
        try:
            patch["compose_night_cap"] = float(night_cap)
        except (TypeError, ValueError):
            pass
    if city:
        patch["compose_city"] = str(city)[:120]
    payload = _merge_payload(row, patch)
    res = (
        supabase.table("my_trip_drafts")
        .update({"payload": payload, "updated_at": now})
        .eq("id", row["id"])
        .execute()
    )
    return (res.data or [{**row, "payload": payload, "updated_at": now}])[0]


def mark_flight_booked(supabase, draft_token: str) -> Optional[Dict[str, Any]]:
    """Lot F — step ① done → unlock hotel at flight dates."""
    row = get_draft(supabase, draft_token)
    if not row:
        return None
    now = _now().isoformat()
    payload = _merge_payload(
        row,
        {
            "flight_booked": True,
            "flight_booked_at": now,
        },
    )
    update: Dict[str, Any] = {
        "payload": payload,
        "updated_at": now,
        "flight_booked_at": now,
    }
    try:
        res = (
            supabase.table("my_trip_drafts")
            .update(update)
            .eq("id", row["id"])
            .execute()
        )
        return (res.data or [{**row, **update}])[0]
    except Exception as e:
        # Column may be missing before Lot F SQL — payload only
        logger.warning("mark_flight_booked columns: %s", e)
        res = (
            supabase.table("my_trip_drafts")
            .update({"payload": payload, "updated_at": now})
            .eq("id", row["id"])
            .execute()
        )
        return (res.data or [{**row, "payload": payload}])[0]


ALLOWED_TRIP_EVENTS = frozenset(
    {
        "view",
        "company_click",
        "flight_booked_yes",
        "flight_booked_no",
        "hotel_checkout_open",
        "hotel_paid",
        "account_cta",
    }
)


def record_trip_event(
    supabase,
    draft_token: str,
    event: str,
    *,
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Lot E — conversion funnel event (no auth; token is the proof)."""
    token = (draft_token or "").strip()
    ev = (event or "").strip().lower()
    if not token:
        return {"ok": False, "error": "missing_token"}
    if ev not in ALLOWED_TRIP_EVENTS:
        return {"ok": False, "error": "invalid_event"}
    row = get_draft(supabase, token)
    if not row:
        return {"ok": False, "error": "not_found"}
    payload = {
        "draft_token": token,
        "event": ev,
        "meta": meta or {},
        "created_at": _now().isoformat(),
    }
    try:
        res = supabase.table("my_trip_events").insert(payload).execute()
        data = (res.data or [payload])[0]
        return {"ok": True, "event": data}
    except Exception as e:
        logger.warning("record_trip_event: %s", e)
        return {"ok": False, "error": str(e)}


def mark_hotel_booked(
    supabase,
    draft_token: str,
    *,
    booking_id: Optional[str] = None,
    confirmation_code: Optional[str] = None,
    holder_email: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Lot D — guest hotel payment succeeded → step ② Réservé ✓."""
    row = get_draft(supabase, draft_token)
    if not row:
        return None
    now = _now()
    now_iso = now.isoformat()
    extra: Dict[str, Any] = {
        "hotel_booked": True,
        "hotel_booked_at": now_iso,
    }
    if booking_id:
        extra["hotel_booking_id"] = str(booking_id)
    if confirmation_code:
        extra["hotel_confirmation_code"] = str(confirmation_code)
    if holder_email:
        extra["hotel_holder_email"] = str(holder_email).strip().lower()
    payload = _merge_payload(row, extra)
    # Keep paid trips findable — don't archive after the default 7-day draft TTL
    expires = now + timedelta(days=90)
    ret = row.get("ret_date")
    if ret:
        try:
            from datetime import date as date_cls

            expires = datetime.combine(
                date_cls.fromisoformat(str(ret)[:10]),
                datetime.min.time(),
                tzinfo=timezone.utc,
            ) + timedelta(days=60)
        except Exception:
            pass
    update: Dict[str, Any] = {
        "payload": payload,
        "updated_at": now_iso,
        "hotel_booked_at": now_iso,
        "status": "active",
        "expires_at": expires.isoformat(),
    }
    try:
        res = (
            supabase.table("my_trip_drafts")
            .update(update)
            .eq("id", row["id"])
            .execute()
        )
        return (res.data or [{**row, **update}])[0]
    except Exception as e:
        logger.warning("mark_hotel_booked columns: %s", e)
        soft = {
            "payload": payload,
            "updated_at": now_iso,
            "status": "active",
            "expires_at": expires.isoformat(),
        }
        try:
            res = (
                supabase.table("my_trip_drafts")
                .update(soft)
                .eq("id", row["id"])
                .execute()
            )
            return (res.data or [{**row, **soft}])[0]
        except Exception as e2:
            logger.warning("mark_hotel_booked soft: %s", e2)
            res = (
                supabase.table("my_trip_drafts")
                .update({"payload": payload, "updated_at": now_iso})
                .eq("id", row["id"])
                .execute()
            )
            return (res.data or [{**row, "payload": payload}])[0]


def send_draft_email(
    supabase,
    draft_token: str,
    *,
    email: str,
    consent: bool,
) -> Dict[str, Any]:
    """Lot F — email trip link only if consent. No account creation."""
    if not consent:
        return {"ok": False, "error": "consent_required"}
    email_n = (email or "").strip().lower()
    if "@" not in email_n or "." not in email_n.split("@")[-1]:
        return {"ok": False, "error": "invalid_email"}
    row = get_draft(supabase, draft_token)
    if not row:
        return {"ok": False, "error": "not_found"}

    from deals.email_rate_limit import check_and_record

    limited = check_and_record(email_n, draft_token)
    if limited:
        return {"ok": False, "error": limited}

    from email_notify import send_my_trip_link

    city = row.get("city_name") or (row.get("payload") or {}).get("city") or "week-end"
    sent = send_my_trip_link(
        email=email_n,
        city=str(city),
        draft_token=draft_token,
        out_date=str(row.get("out_date") or "")[:10] or None,
        ret_date=str(row.get("ret_date") or "")[:10] or None,
    )
    if not sent:
        return {"ok": False, "error": "email_not_sent"}

    now = _now().isoformat()
    payload = _merge_payload(
        row,
        {
            "share_email": email_n,
            "share_email_sent_at": now,
            "share_email_consent": True,
        },
    )
    update: Dict[str, Any] = {
        "payload": payload,
        "updated_at": now,
        "share_email": email_n,
    }
    try:
        supabase.table("my_trip_drafts").update(update).eq("id", row["id"]).execute()
    except Exception as e:
        logger.warning("share_email column: %s", e)
        supabase.table("my_trip_drafts").update(
            {"payload": payload, "updated_at": now}
        ).eq("id", row["id"]).execute()
    return {"ok": True, "email": email_n}
