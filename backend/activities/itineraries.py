"""create_itinerary_from_trip / apply_itinerary_to_trip — Lot G."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from activities.trip_items import add_activity_item, list_trip_items

logger = logging.getLogger("activities.itineraries")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_itinerary_from_trip(
    supabase,
    *,
    planned_trip_id: Optional[str] = None,
    draft_id: Optional[str] = None,
    title: str,
    owner_user_id: Optional[str] = None,
    visibility: str = "private",
    city_slug: Optional[str] = None,
) -> Dict[str, Any]:
    """Copy trip_items → itinerary_items without prices or absolute dates."""
    if not supabase:
        return {"ok": False, "error": "no_supabase"}
    items = list_trip_items(
        supabase, draft_id=draft_id, planned_trip_id=planned_trip_id
    )
    # Only place-backed items (activity/hotel/restaurant)
    usable = [i for i in items if i.get("place_id") and i.get("status") != "skipped"]
    if not usable:
        return {"ok": False, "error": "no_items"}
    itin = {
        "title": (title or "Parcours")[:200],
        "city_slug": city_slug,
        "visibility": visibility if visibility in ("private", "link", "public") else "private",
        "owner_user_id": owner_user_id,
        "meta": {
            "source_planned_trip_id": planned_trip_id,
            "source_draft_id": draft_id,
        },
        "updated_at": _now_iso(),
    }
    try:
        res = supabase.table("itineraries").insert(itin).execute()
        row = (res.data or [None])[0]
        if not row:
            return {"ok": False, "error": "insert_failed"}
        itin_id = row["id"]
        for it in usable:
            supabase.table("itinerary_items").insert(
                {
                    "itinerary_id": itin_id,
                    "place_id": it.get("place_id"),
                    "item_type": it.get("item_type"),
                    "day_offset": it.get("day_offset") or 0,
                    "moment": it.get("moment"),
                    "sort_key": it.get("sort_key") or "a0",
                    "notes": it.get("notes"),
                    "meta": {
                        # Explicitly no price / no absolute dates
                        "from_trip_item_id": it.get("id"),
                    },
                }
            ).execute()
        return {"ok": True, "itinerary": row, "items_count": len(usable)}
    except Exception as e:
        logger.warning("create_itinerary_from_trip: %s", e)
        return {"ok": False, "error": str(e)}


def apply_itinerary_to_trip(
    supabase,
    itinerary_id: str,
    *,
    planned_trip_id: Optional[str] = None,
    draft_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Materialize itinerary_items onto a trip.
    Availability recheck is best-effort (Lot G); missing places stay needs_check.
    """
    if not supabase or not itinerary_id:
        return {"ok": False, "error": "missing"}
    if (planned_trip_id is None) == (draft_id is None):
        return {"ok": False, "error": "exactly_one_owner"}
    try:
        items_res = (
            supabase.table("itinerary_items")
            .select("*")
            .eq("itinerary_id", itinerary_id)
            .order("day_offset")
            .order("sort_key")
            .execute()
        )
        items = list(items_res.data or [])
    except Exception as e:
        return {"ok": False, "error": str(e)}

    created = 0
    skipped = 0
    for it in items:
        place_id = it.get("place_id")
        if not place_id:
            skipped += 1
            continue
        row = {
            "draft_id": draft_id,
            "planned_trip_id": planned_trip_id,
            "item_type": it.get("item_type") or "activity",
            "place_id": place_id,
            "day_offset": it.get("day_offset") or 0,
            "moment": it.get("moment"),
            "sort_key": it.get("sort_key") or "a0",
            "status": "idea",
            "availability_state": "needs_check",
            "added_by": user_id,
            "meta": {"from_itinerary_item_id": it.get("id")},
            "updated_at": _now_iso(),
        }
        try:
            supabase.table("trip_items").insert(row).execute()
            created += 1
        except Exception as e:
            logger.debug("apply item: %s", e)
            skipped += 1
    return {"ok": True, "created": created, "skipped": skipped}
