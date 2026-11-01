"""Generic events table — Lot A."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger("activities.events")

VALID_PLATFORMS = frozenset({"web", "ios", "android"})


def record_event(
    supabase,
    *,
    domain: str,
    event: str,
    surface: Optional[str] = None,
    platform: Optional[str] = None,
    place_id: Optional[str] = None,
    trip_item_id: Optional[str] = None,
    draft_id: Optional[str] = None,
    planned_trip_id: Optional[str] = None,
    user_id: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if not supabase:
        return {"ok": False, "error": "no_supabase"}
    plat = (platform or "").lower().strip() or None
    if plat and plat not in VALID_PLATFORMS:
        plat = None
    row = {
        "domain": str(domain or "activity")[:64],
        "event": str(event or "unknown")[:64],
        "surface": (surface or None),
        "platform": plat,
        "place_id": place_id,
        "trip_item_id": trip_item_id,
        "draft_id": draft_id,
        "planned_trip_id": planned_trip_id,
        "user_id": user_id,
        "meta": meta or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        res = supabase.table("events").insert(row).execute()
        return {"ok": True, "event": (res.data or [row])[0]}
    except Exception as e:
        logger.warning("record_event: %s", e)
        return {"ok": False, "error": str(e)}
