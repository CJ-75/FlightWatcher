"""trip_items CRUD + draft→planned transfer — Lot A/E."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger("activities.trip_items")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def transfer_trip_items_draft_to_planned(
    supabase,
    *,
    draft_id: str,
    planned_trip_id: str,
) -> Dict[str, Any]:
    """Reassign all trip_items from draft to planned trip (XOR owners)."""
    if not supabase or not draft_id or not planned_trip_id:
        return {"ok": False, "moved": 0, "error": "missing_ids"}
    try:
        res = (
            supabase.table("trip_items")
            .update(
                {
                    "draft_id": None,
                    "planned_trip_id": planned_trip_id,
                    "updated_at": _now_iso(),
                }
            )
            .eq("draft_id", draft_id)
            .execute()
        )
        n = len(res.data or [])
        return {"ok": True, "moved": n}
    except Exception as e:
        logger.warning("transfer_trip_items_draft_to_planned: %s", e)
        return {"ok": False, "moved": 0, "error": str(e)}


def _place_row(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    place = item.get("places")
    if isinstance(place, list):
        place = place[0] if place else None
    return place if isinstance(place, dict) else None


def _photo_from_payload(payload: Any) -> Optional[str]:
    if not isinstance(payload, dict):
        return None
    photo = str(payload.get("photo_url") or "").strip()
    if photo:
        return photo
    photos = payload.get("photos")
    if isinstance(photos, list) and photos:
        first = photos[0]
        if isinstance(first, dict):
            url = str(first.get("url") or first.get("thumb") or "").strip()
            if url:
                return url
        elif isinstance(first, str) and first.strip():
            return first.strip()
    return None


def _cached_product_photo(supabase, product_code: str) -> Optional[str]:
    """Resolve a product photo from provider_cache without hitting Viator."""
    if not supabase or not product_code:
        return None
    try:
        from activities.cache import cache_get
    except Exception:
        return None
    code = str(product_code).strip()
    for key in (f"{code}:detail2", code):
        cached = cache_get(
            supabase, provider="viator", resource="product", cache_key=key
        )
        photo = _photo_from_payload(cached)
        if photo:
            return photo
    # Fallback: recent city/geo search catalogs often already hold photo_url.
    try:
        for resource in ("city_search", "geo_search"):
            res = (
                supabase.table("provider_cache")
                .select("payload")
                .eq("provider", "viator")
                .eq("resource", resource)
                .order("fetched_at", desc=True)
                .limit(24)
                .execute()
            )
            for row in res.data or []:
                payload = row.get("payload")
                if not isinstance(payload, dict):
                    continue
                for it in payload.get("items") or []:
                    if not isinstance(it, dict):
                        continue
                    if str(it.get("product_code") or "").strip() != code:
                        continue
                    photo = _photo_from_payload(it)
                    if photo:
                        return photo
    except Exception as e:
        logger.debug("catalog photo scan: %s", e)
    return None


def enrich_trip_items_photos(
    supabase,
    items: List[Dict[str, Any]],
    *,
    persist: bool = True,
) -> List[Dict[str, Any]]:
    """Ensure each activity row exposes meta.photo_url for Planner thumbs."""
    if not items:
        return items
    out: List[Dict[str, Any]] = []
    for raw in items:
        item = dict(raw)
        meta = (
            dict(item.get("meta") or {})
            if isinstance(item.get("meta"), dict)
            else {}
        )
        photo = str(meta.get("photo_url") or "").strip()
        if not photo:
            place = _place_row(item)
            if place:
                place_meta = (
                    place.get("meta")
                    if isinstance(place.get("meta"), dict)
                    else {}
                )
                photo = str(place_meta.get("photo_url") or "").strip()
        if not photo:
            code = str(meta.get("product_code") or "").strip()
            if code:
                photo = _cached_product_photo(supabase, code) or ""
        if photo and str(meta.get("photo_url") or "").strip() != photo:
            meta["photo_url"] = photo
            item["meta"] = meta
            if persist and item.get("id"):
                try:
                    supabase.table("trip_items").update({"meta": meta}).eq(
                        "id", item["id"]
                    ).execute()
                except Exception as e:
                    logger.debug("persist trip_item photo: %s", e)
        out.append(item)
    return out


def list_trip_items(
    supabase,
    *,
    draft_id: Optional[str] = None,
    planned_trip_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    if not supabase:
        return []
    try:
        q = supabase.table("trip_items").select("*, places(*)")
        if draft_id:
            q = q.eq("draft_id", draft_id)
        elif planned_trip_id:
            q = q.eq("planned_trip_id", planned_trip_id)
        else:
            return []
        res = q.order("day_offset").order("sort_key").execute()
        return list(res.data or [])
    except Exception as e:
        logger.warning("list_trip_items: %s", e)
        return []


def add_activity_item(
    supabase,
    *,
    place_id: str,
    draft_id: Optional[str] = None,
    planned_trip_id: Optional[str] = None,
    day_offset: int = 0,
    moment: Optional[str] = None,
    sort_key: str = "a0",
    user_id: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    return add_place_item(
        supabase,
        place_id=place_id,
        item_type="activity",
        draft_id=draft_id,
        planned_trip_id=planned_trip_id,
        day_offset=day_offset,
        moment=moment,
        sort_key=sort_key,
        user_id=user_id,
        meta=meta,
    )


def add_place_item(
    supabase,
    *,
    place_id: str,
    item_type: str = "activity",
    draft_id: Optional[str] = None,
    planned_trip_id: Optional[str] = None,
    day_offset: int = 0,
    moment: Optional[str] = None,
    sort_key: str = "a0",
    user_id: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    if (draft_id is None) == (planned_trip_id is None):
        return None
    itype = item_type if item_type in ("activity", "hotel", "restaurant") else "activity"
    row = {
        "draft_id": draft_id,
        "planned_trip_id": planned_trip_id,
        "item_type": itype,
        "place_id": place_id,
        "day_offset": int(day_offset or 0),
        "moment": moment,
        "sort_key": sort_key or "a0",
        "status": "idea",
        "availability_state": "ok",
        "added_by": user_id,
        "meta": meta or {},
        "updated_at": _now_iso(),
    }
    try:
        res = supabase.table("trip_items").insert(row).execute()
        return (res.data or [None])[0]
    except Exception as e:
        logger.warning("add_place_item: %s", e)
        return None


def update_item_status(
    supabase,
    item_id: str,
    *,
    status: Optional[str] = None,
    availability_state: Optional[str] = None,
    sort_key: Optional[str] = None,
    day_offset: Optional[int] = None,
    moment: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    patch: Dict[str, Any] = {"updated_at": _now_iso()}
    if status:
        patch["status"] = status
    if availability_state:
        patch["availability_state"] = availability_state
    if sort_key is not None:
        patch["sort_key"] = sort_key
    if day_offset is not None:
        patch["day_offset"] = day_offset
    if moment is not None:
        patch["moment"] = moment
    try:
        res = (
            supabase.table("trip_items")
            .update(patch)
            .eq("id", item_id)
            .execute()
        )
        return (res.data or [None])[0]
    except Exception as e:
        logger.warning("update_item_status: %s", e)
        return None


def mark_items_needs_check_on_date_change(
    supabase,
    *,
    draft_id: Optional[str] = None,
    planned_trip_id: Optional[str] = None,
) -> int:
    """Non-booked activities → availability_state=needs_check (keep status)."""
    items = list_trip_items(
        supabase, draft_id=draft_id, planned_trip_id=planned_trip_id
    )
    n = 0
    for it in items:
        if it.get("item_type") not in ("activity", "restaurant"):
            continue
        if it.get("status") == "booked":
            continue
        if update_item_status(
            supabase, it["id"], availability_state="needs_check"
        ):
            n += 1
    return n
