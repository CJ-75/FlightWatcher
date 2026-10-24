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
    flight = (payload or {}).get("flight") or {}
    hotel = (payload or {}).get("hotel")
    dates = (payload or {}).get("dates") or {}
    row = {
        "draft_token": token,
        "user_id": user_id,
        "status": "draft",
        "payload": payload or {},
        "deal_key": deal_key or payload.get("deal_key"),
        "origin_iata": payload.get("origin_iata") or payload.get("departure_airport"),
        "dest_iata": payload.get("destination") or flight.get("destination"),
        "city_name": payload.get("city"),
        "out_date": dates.get("outbound"),
        "ret_date": dates.get("inbound"),
        "adults": int(payload.get("adults") or 2),
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
    res = (
        supabase.table("my_trip_drafts")
        .update(
            {
                "user_id": user_id,
                "status": "active",
                "updated_at": _now().isoformat(),
            }
        )
        .eq("id", row["id"])
        .execute()
    )
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
