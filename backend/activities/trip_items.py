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
    photo = str(payload.get("photo_url") or payload.get("photoUrl") or "").strip()
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
    # Raw Viator product payloads store variants under images[].
    images = payload.get("images")
    if isinstance(images, list) and images:
        try:
            from activities.service import _pick_product_photo_url

            picked = _pick_product_photo_url(images)
            if picked:
                return str(picked).strip() or None
        except Exception:
            pass
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
    if not code or code.startswith("skip-"):
        return None
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


def _live_product_photo(supabase, product_code: str) -> Optional[str]:
    """Fetch + cache Viator product detail to recover a missing photo_url."""
    code = str(product_code or "").strip()
    if not code or code.startswith("skip-"):
        return None
    try:
        from activities.cache import cache_set
        from activities.config import load_activities_config
        from activities.service import _normalize_product_detail
        from activities.viator_client import ViatorClient, ViatorError
    except Exception as e:
        logger.debug("live photo imports: %s", e)
        return None
    try:
        cfg = load_activities_config()
        client = ViatorClient(cfg)
        if not getattr(client, "enabled", False):
            return None
        raw = client.product_detail(code)
        if not isinstance(raw, dict):
            return None
        norm = _normalize_product_detail(raw)
        try:
            cache_set(
                supabase,
                provider="viator",
                resource="product",
                cache_key=f"{code}:detail2",
                payload=norm,
                ttl_h=getattr(cfg, "cache_ttl_h", 24) or 24,
            )
        except Exception as e:
            logger.debug("live photo cache_set: %s", e)
        return _photo_from_payload(norm)
    except ViatorError as e:
        logger.debug("live product photo viator: %s", e)
        return None
    except Exception as e:
        logger.debug("live product photo: %s", e)
        return None


def resolve_product_photo(
    supabase,
    product_code: str,
    *,
    allow_live: bool = True,
) -> Optional[str]:
    """Best-effort photo for a Viator product_code (cache, then optional live)."""
    photo = _cached_product_photo(supabase, product_code)
    if photo:
        return photo
    if allow_live:
        return _live_product_photo(supabase, product_code)
    return None


def _persist_place_photo(supabase, place: Dict[str, Any], photo: str) -> Dict[str, Any]:
    """Write photo_url onto places.meta and return the updated place dict."""
    if not place or not photo:
        return place
    place_meta = (
        dict(place.get("meta") or {})
        if isinstance(place.get("meta"), dict)
        else {}
    )
    if str(place_meta.get("photo_url") or "").strip() == photo:
        return {**place, "meta": place_meta}
    place_meta["photo_url"] = photo
    pid = place.get("id")
    if pid and supabase:
        try:
            supabase.table("places").update(
                {"meta": place_meta, "updated_at": _now_iso()}
            ).eq("id", pid).execute()
        except Exception as e:
            logger.debug("persist place photo: %s", e)
    return {**place, "meta": place_meta}


def enrich_trip_items_photos(
    supabase,
    items: List[Dict[str, Any]],
    *,
    persist: bool = True,
    allow_live: bool = True,
    live_limit: int = 8,
) -> List[Dict[str, Any]]:
    """Ensure each activity row exposes meta.photo_url for Planner thumbs."""
    if not items:
        return items
    out: List[Dict[str, Any]] = []
    live_left = max(0, int(live_limit or 0))
    for raw in items:
        item = dict(raw)
        meta = (
            dict(item.get("meta") or {})
            if isinstance(item.get("meta"), dict)
            else {}
        )
        photo = str(meta.get("photo_url") or "").strip()
        place = _place_row(item)
        if not photo and place:
            place_meta = (
                place.get("meta")
                if isinstance(place.get("meta"), dict)
                else {}
            )
            photo = str(place_meta.get("photo_url") or "").strip()
        code = str(meta.get("product_code") or "").strip()
        if not photo and code and not code.startswith("skip-"):
            photo = _cached_product_photo(supabase, code) or ""
            if not photo and allow_live and live_left > 0:
                live_left -= 1
                photo = _live_product_photo(supabase, code) or ""
        if photo:
            if str(meta.get("photo_url") or "").strip() != photo:
                meta["photo_url"] = photo
                item["meta"] = meta
                if persist and item.get("id"):
                    try:
                        supabase.table("trip_items").update({"meta": meta}).eq(
                            "id", item["id"]
                        ).execute()
                    except Exception as e:
                        logger.debug("persist trip_item photo: %s", e)
            if place:
                updated_place = (
                    _persist_place_photo(supabase, place, photo)
                    if persist
                    else {**place, "meta": {**(place.get("meta") or {}), "photo_url": photo}}
                )
                # Keep embedded places shape stable for the API response.
                if isinstance(item.get("places"), list):
                    item["places"] = [updated_place]
                else:
                    item["places"] = updated_place
        out.append(item)
    return out


# Planner / hero only need identity + thumb fields — avoid fat place joins.
_TRIP_ITEMS_LIST_SELECT = (
    "id,item_type,status,sort_key,day_offset,moment,notes,title,meta,"
    "place_id,draft_id,planned_trip_id,places(id,name,meta)"
)


def list_trip_items(
    supabase,
    *,
    draft_id: Optional[str] = None,
    planned_trip_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    if not supabase:
        return []
    try:
        q = supabase.table("trip_items").select(_TRIP_ITEMS_LIST_SELECT)
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


def list_trip_items_by_draft_ids(
    supabase,
    draft_ids: List[str],
) -> List[Dict[str, Any]]:
    """Batch-load trip_items for many draft owners (Planner inherit merge)."""
    if not supabase:
        return []
    ids = [str(d).strip() for d in (draft_ids or []) if str(d or "").strip()]
    if not ids:
        return []
    try:
        res = (
            supabase.table("trip_items")
            .select(_TRIP_ITEMS_LIST_SELECT)
            .in_("draft_id", ids)
            .order("day_offset")
            .order("sort_key")
            .execute()
        )
        return list(res.data or [])
    except Exception as e:
        logger.warning("list_trip_items_by_draft_ids: %s", e)
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
