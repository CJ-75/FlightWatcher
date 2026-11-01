"""Create place + liteapi ref + trip_item when a hotel is selected — Lot A."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger("activities.hotel_place")


def _hotel_id(hotel: Optional[Dict[str, Any]]) -> Optional[str]:
    if not hotel or not isinstance(hotel, dict):
        return None
    hid = hotel.get("id") or hotel.get("hotel_id") or hotel.get("hotelId")
    if hid is None:
        return None
    s = str(hid).strip()
    return s if s and s != "primary" else None


def ensure_hotel_place_and_item(
    supabase,
    *,
    hotel: Optional[Dict[str, Any]],
    draft_id: Optional[str] = None,
    planned_trip_id: Optional[str] = None,
    status: str = "idea",
    user_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Upsert places/place_refs for LiteAPI hotel and attach trip_items row.
    No backfill — call only on new selection.
    """
    if not supabase:
        return None
    if (draft_id is None) == (planned_trip_id is None):
        logger.warning("ensure_hotel_place_and_item: need exactly one owner")
        return None
    hid = _hotel_id(hotel)
    if not hid or not hotel:
        return None

    from activities.places import upsert_place_with_ref

    lat = hotel.get("latitude") or hotel.get("lat")
    lng = hotel.get("longitude") or hotel.get("lng")
    try:
        lat_f = float(lat) if lat is not None else None
        lng_f = float(lng) if lng is not None else None
    except (TypeError, ValueError):
        lat_f = lng_f = None

    place = upsert_place_with_ref(
        supabase,
        kind="hotel",
        name=str(hotel.get("name") or "Hôtel"),
        provider="liteapi",
        external_id=hid,
        lat=lat_f,
        lng=lng_f,
        location_precision="exact" if lat_f is not None and lng_f is not None else "city",
        city_slug=None,
        meta={
            "stars": hotel.get("stars"),
            "board": hotel.get("board"),
            "photo": hotel.get("photo") or hotel.get("thumbnail"),
        },
    )
    if not place:
        return None

    place_id = place["id"]
    now = datetime.now(timezone.utc).isoformat()

    # Soft-replace previous hotel item for same owner
    try:
        q = (
            supabase.table("trip_items")
            .select("id")
            .eq("item_type", "hotel")
        )
        if draft_id:
            q = q.eq("draft_id", draft_id)
        else:
            q = q.eq("planned_trip_id", planned_trip_id)
        prev = q.execute()
        for row in prev.data or []:
            supabase.table("trip_items").delete().eq("id", row["id"]).execute()
    except Exception as e:
        logger.debug("clear previous hotel items: %s", e)

    item = {
        "draft_id": draft_id,
        "planned_trip_id": planned_trip_id,
        "item_type": "hotel",
        "place_id": place_id,
        "day_offset": 0,
        "moment": None,
        "sort_key": "a0",
        "status": status if status in ("idea", "validated", "booked", "skipped") else "idea",
        "availability_state": "ok",
        "added_by": user_id,
        "meta": {
            "hotel_id": hid,
            "public_hotel_price": hotel.get("public_hotel_price"),
            "hotel_pp": hotel.get("hotel_pp"),
        },
        "updated_at": now,
    }
    try:
        res = supabase.table("trip_items").insert(item).execute()
        return (res.data or [None])[0]
    except Exception as e:
        logger.warning("trip_items hotel insert: %s", e)
        return None
