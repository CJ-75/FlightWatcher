"""create_itinerary_from_trip / apply_itinerary_to_trip — Lot G + Lot 5 kinds."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from activities.trip_items import list_trip_items

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
                    "kind": "place"
                    if it.get("item_type") in ("hotel", "restaurant")
                    else "activity",
                    "day_offset": it.get("day_offset") or 0,
                    "moment": it.get("moment"),
                    "sort_key": it.get("sort_key") or "a0",
                    "notes": it.get("notes"),
                    "note": it.get("notes"),
                    "meta": {
                        "from_trip_item_id": it.get("id"),
                    },
                }
            ).execute()
        return {"ok": True, "itinerary": row, "items_count": len(usable)}
    except Exception as e:
        logger.warning("create_itinerary_from_trip: %s", e)
        return {"ok": False, "error": str(e)}


def _item_sort_key(it: Dict[str, Any]):
    return (
        int(it.get("day_offset") or 0),
        int(it.get("position") or 0),
        str(it.get("sort_key") or ""),
    )


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
    Supports place / activity / free (Lot 5). Free steps → trip_items notes.
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
            .execute()
        )
        items = sorted(list(items_res.data or []), key=_item_sort_key)
    except Exception as e:
        return {"ok": False, "error": str(e)}

    created = 0
    skipped = 0
    for idx, it in enumerate(items):
        kind = str(it.get("kind") or it.get("item_type") or "place").lower()
        place_id = it.get("place_id")
        title = (it.get("title") or "").strip() or None
        note = (it.get("note") or it.get("notes") or "").strip() or None
        day_offset = int(it.get("day_offset") or 0)
        moment = it.get("moment")
        sort_key = it.get("sort_key") or f"a{idx:02d}"
        meta: Dict[str, Any] = {
            "from_itinerary_item_id": it.get("id"),
            "itinerary_kind": kind,
        }
        if it.get("viator_product_code"):
            meta["viator_product_code"] = it.get("viator_product_code")
        if it.get("photo"):
            meta["photo"] = it.get("photo")
        if title:
            meta["title"] = title

        notes_parts = [p for p in (title, note) if p]
        notes = " — ".join(notes_parts) if notes_parts else None

        try:
            if kind == "free" or (not place_id and kind != "activity"):
                # Free-text step (or unresolved) → note-like activity row
                row = {
                    "draft_id": draft_id,
                    "planned_trip_id": planned_trip_id,
                    "item_type": "activity",
                    "place_id": None,
                    "day_offset": day_offset,
                    "moment": moment,
                    "sort_key": sort_key,
                    "status": "idea",
                    "availability_state": "ok",
                    "added_by": user_id,
                    "notes": notes,
                    "meta": {**meta, "kind": "free"},
                    "updated_at": _now_iso(),
                }
                supabase.table("trip_items").insert(row).execute()
                created += 1
                continue

            if place_id:
                itype = "activity"
                if kind == "place" or it.get("item_type") in ("hotel", "restaurant", "place"):
                    itype = (
                        it.get("item_type")
                        if it.get("item_type") in ("activity", "hotel", "restaurant")
                        else "restaurant"
                    )
                row = {
                    "draft_id": draft_id,
                    "planned_trip_id": planned_trip_id,
                    "item_type": itype if itype in ("activity", "hotel", "restaurant") else "activity",
                    "place_id": place_id,
                    "day_offset": day_offset,
                    "moment": moment,
                    "sort_key": sort_key,
                    "status": "idea",
                    "availability_state": "needs_check",
                    "added_by": user_id,
                    "notes": notes,
                    "meta": meta,
                    "updated_at": _now_iso(),
                }
                supabase.table("trip_items").insert(row).execute()
                created += 1
                continue

            # activity without place — keep as free note with viator code in meta
            row = {
                "draft_id": draft_id,
                "planned_trip_id": planned_trip_id,
                "item_type": "activity",
                "place_id": None,
                "day_offset": day_offset,
                "moment": moment,
                "sort_key": sort_key,
                "status": "idea",
                "availability_state": "needs_check",
                "added_by": user_id,
                "notes": notes,
                "meta": meta,
                "updated_at": _now_iso(),
            }
            supabase.table("trip_items").insert(row).execute()
            created += 1
        except Exception as e:
            logger.debug("apply item: %s", e)
            skipped += 1
    return {"ok": True, "created": created, "skipped": skipped}
