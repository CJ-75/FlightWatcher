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


def get_draft(supabase, draft_token: str) -> Optional[Dict[str, Any]]:
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
