"""
v3.3 Lot A — hotel photos live on hotel_pool, not hotel_rates_cache.

Card photo source of truth = hotel_pool.main_photo / thumbnail.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence

logger = logging.getLogger("deals.pool_photos")


def extract_main_photo(obj: Any) -> Optional[str]:
    """Best-effort photo URL from a pool row, rates top item, or LiteAPI raw."""
    if not isinstance(obj, dict):
        return None
    for key in ("main_photo", "mainPhoto", "photo", "thumbnail", "thumbnailUrl"):
        val = obj.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    raw = obj.get("raw")
    if isinstance(raw, dict):
        for key in ("main_photo", "mainPhoto", "thumbnail", "thumbnailUrl", "photo"):
            val = raw.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
        for key in ("hotelImages", "hotel_images", "images", "photos"):
            block = raw.get(key)
            if not isinstance(block, list):
                continue
            for item in block:
                if isinstance(item, str) and item.strip():
                    return item.strip()
                if isinstance(item, dict):
                    u = (
                        item.get("url")
                        or item.get("hdUrl")
                        or item.get("thumbnailUrl")
                        or ""
                    ).strip()
                    if u:
                        return u
    return None


def photos_map_from_pool(
    supabase: Any, hotel_ids: Sequence[str]
) -> Dict[str, str]:
    """hotel_id → main_photo/thumbnail from hotel_pool (chunked)."""
    ids = [str(i) for i in hotel_ids if i]
    if not ids or not supabase:
        return {}
    out: Dict[str, str] = {}
    try:
        for i in range(0, len(ids), 80):
            chunk = ids[i : i + 80]
            res = (
                supabase.table("hotel_pool")
                .select("hotel_id,main_photo,thumbnail,raw")
                .in_("hotel_id", chunk)
                .execute()
            )
            for row in res.data or []:
                hid = str(row.get("hotel_id") or "")
                if not hid or hid in out:
                    continue
                photo = extract_main_photo(row)
                if photo:
                    out[hid] = photo
    except Exception as e:
        logger.warning("photos_map_from_pool: %s", e)
    return out


def overlay_pool_photos(
    hotels: Sequence[Any], photo_map: Dict[str, str]
) -> List[Dict[str, Any]]:
    """
    Prefer pool photo over rates-carried photo (stable wall).
    Hotels without id / without pool hit keep previous photo if any.
    """
    out: List[Dict[str, Any]] = []
    for h in hotels:
        if not isinstance(h, dict):
            continue
        hid = str(h.get("hotel_id") or h.get("id") or "")
        pool_photo = photo_map.get(hid) if hid else None
        if pool_photo:
            out.append(
                {
                    **h,
                    "photo": pool_photo,
                    "thumbnail": h.get("thumbnail") or pool_photo,
                    "main_photo": pool_photo,
                }
            )
        else:
            out.append(dict(h))
    return out


def backfill_pool_photos(
    supabase: Any,
    *,
    destination_id: Optional[str] = None,
    limit: int = 500,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """
    Fill hotel_pool.main_photo from raw JSON when column is empty.
    Idempotent; no LiteAPI rates calls (data already in row).
    """
    if not supabase:
        return {"ok": False, "error": "no_supabase"}
    q = (
        supabase.table("hotel_pool")
        .select("id,hotel_id,destination_id,main_photo,thumbnail,raw")
        .limit(max(1, min(int(limit), 2000)))
    )
    if destination_id:
        q = q.eq("destination_id", destination_id)
    try:
        res = q.execute()
    except Exception as e:
        return {"ok": False, "error": str(e)}

    scanned = 0
    missing = 0
    updated = 0
    still_missing = 0
    now = datetime.now(timezone.utc).isoformat()
    for row in res.data or []:
        scanned += 1
        if extract_main_photo(
            {"main_photo": row.get("main_photo"), "thumbnail": row.get("thumbnail")}
        ):
            continue
        missing += 1
        photo = extract_main_photo(row)
        if not photo:
            still_missing += 1
            continue
        if dry_run:
            updated += 1
            continue
        try:
            supabase.table("hotel_pool").update(
                {
                    "main_photo": photo,
                    "thumbnail": row.get("thumbnail") or photo,
                    "refreshed_at": now,
                }
            ).eq("id", row["id"]).execute()
            updated += 1
        except Exception as e:
            logger.warning("backfill photo fail hotel_id=%s: %s", row.get("hotel_id"), e)
            still_missing += 1

    share_ok = None
    if scanned:
        with_photo = scanned - still_missing - (missing - updated if not dry_run else 0)
        # after update, missing that got photo count as ok
        with_photo = scanned - still_missing
        share_ok = round(with_photo / scanned, 3)

    return {
        "ok": True,
        "scanned": scanned,
        "missing_before": missing,
        "updated": updated,
        "still_missing": still_missing,
        "share_with_photo": share_ok,
        "dry_run": dry_run,
    }
