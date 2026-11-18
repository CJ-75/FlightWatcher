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

    # Existing planner rows keyed by source itinerary_item id (idempotent restore).
    existing_by_src: Dict[str, Dict[str, Any]] = {}
    try:
        q = (
            supabase.table("trip_items")
            .select("id,status,meta,item_type")
        )
        if planned_trip_id:
            q = q.eq("planned_trip_id", planned_trip_id)
        else:
            q = q.eq("draft_id", draft_id)
        for row in list(q.execute().data or []):
            m = row.get("meta") if isinstance(row.get("meta"), dict) else {}
            src = str(m.get("from_itinerary_item_id") or "").strip()
            if src:
                existing_by_src[src] = row
    except Exception as e:
        logger.debug("apply existing lookup: %s", e)

    created = 0
    restored = 0
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
            "source_itinerary_id": itinerary_id,
            "itinerary_kind": kind,
        }
        if it.get("viator_product_code"):
            meta["viator_product_code"] = it.get("viator_product_code")
            meta["product_code"] = it.get("viator_product_code")
        if it.get("photo"):
            meta["photo"] = it.get("photo")
        if title:
            meta["title"] = title
        raw_meta = it.get("meta") if isinstance(it.get("meta"), dict) else {}
        for key in ("maps_url", "lat", "lng", "travel_minutes", "photos"):
            if raw_meta.get(key) is not None and key not in meta:
                meta[key] = raw_meta.get(key)
        photo_url = ""
        raw_photo = meta.get("photo")
        if isinstance(raw_photo, str) and raw_photo.strip():
            photo_url = raw_photo.strip()
        if not photo_url:
            photos = meta.get("photos")
            if isinstance(photos, list):
                for entry in photos:
                    if isinstance(entry, str) and entry.strip():
                        photo_url = entry.strip()
                        break
        if photo_url:
            meta["photo_url"] = photo_url
        place = it.get("places") if isinstance(it.get("places"), dict) else {}
        place_meta = place.get("meta") if isinstance(place.get("meta"), dict) else {}
        if meta.get("lat") is None and place_meta.get("lat") is not None:
            meta["lat"] = place_meta.get("lat")
        if meta.get("lng") is None and place_meta.get("lng") is not None:
            meta["lng"] = place_meta.get("lng")
        if not meta.get("maps_url") and place_meta.get("maps_url"):
            meta["maps_url"] = place_meta.get("maps_url")

        notes_parts = [p for p in (title, note) if p]
        notes = " — ".join(notes_parts) if notes_parts else None
        viator_code = str(
            meta.get("product_code") or meta.get("viator_product_code") or ""
        ).strip()
        has_viator = bool(viator_code) and not viator_code.startswith("skip-")
        # Hors catalogue Viator → validée d’office (stops Pop place/free).
        item_status = "idea" if has_viator else "validated"

        src_id = str(it.get("id") or "").strip()
        if src_id and src_id in existing_by_src:
            ex = existing_by_src[src_id]
            if str(ex.get("status") or "") == "skipped":
                try:
                    supabase.table("trip_items").update(
                        {
                            "status": item_status,
                            "updated_at": _now_iso(),
                        }
                    ).eq("id", ex["id"]).execute()
                    restored += 1
                except Exception as e:
                    logger.debug("apply restore: %s", e)
                    skipped += 1
            else:
                skipped += 1
            continue

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
                    "status": item_status,
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
                    "status": item_status,
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
                "status": item_status,
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

    # Persist Pop provenance on the trip so hub/detail can show the Pop tag.
    if planned_trip_id and itinerary_id:
        try:
            cur = (
                supabase.table("planned_trips")
                .select("meta")
                .eq("id", planned_trip_id)
                .limit(1)
                .execute()
            )
            row = (cur.data or [None])[0] or {}
            cur_meta = (
                dict(row.get("meta") or {})
                if isinstance(row.get("meta"), dict)
                else {}
            )
            next_meta = {
                **cur_meta,
                "from_pop": True,
                "source_itinerary_id": str(
                    cur_meta.get("source_itinerary_id") or itinerary_id
                ).strip(),
            }
            if next_meta != cur_meta:
                supabase.table("planned_trips").update({"meta": next_meta}).eq(
                    "id", planned_trip_id
                ).execute()
        except Exception as e:
            logger.debug("apply meta source: %s", e)

    return {
        "ok": True,
        "created": created,
        "restored": restored,
        "skipped": skipped,
    }
