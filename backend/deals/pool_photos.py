"""
v3.3 Lot A — hotel photos live on hotel_pool, not hotel_rates_cache.

Card photo source of truth = hotel_pool.main_photo / thumbnail.
v4 Lot C — prefer façade / lobby / exterior; skip bedroom & bathroom when tagged.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Tuple

logger = logging.getLogger("deals.pool_photos")

_ROOM_HINT = re.compile(
    r"(bed\s*room|bedroom|bathroom|bath\s*room|salle[\s_-]*de[\s_-]*bain|"
    r"\bchambre\b|\bbath\b|\btoilet\b|\bwashroom\b|\ben\s*suite\b)",
    re.I,
)
_GOOD_HINT = re.compile(
    r"(exterior|outside|facade|fa[cç]ade|lobby|entrance|front|"
    r"building|pool|piscine|view|vue|terrace|terrasse|garden|jardin)",
    re.I,
)


def _photo_score(url: str, caption: Optional[str] = None) -> int:
    """Higher = better cover. Room/bath captions score very low."""
    blob = f"{caption or ''} {url or ''}"
    if _ROOM_HINT.search(blob):
        return -100
    if _GOOD_HINT.search(blob):
        return 50
    return 0


def pick_cover_photo(candidates: Sequence[Tuple[str, Optional[str]]]) -> Optional[str]:
    """
    Pick best cover URL from (url, caption) pairs.
    Never prefer bedroom/bathroom when an alternative exists.
    """
    scored: List[Tuple[int, int, str]] = []
    for i, (url, caption) in enumerate(candidates):
        u = (url or "").strip()
        if not u:
            continue
        scored.append((_photo_score(u, caption), -i, u))
    if not scored:
        return None
    scored.sort(reverse=True)
    best = scored[0]
    # If best is a room shot, try next non-room
    if best[0] < 0:
        for s, _neg_i, u in scored:
            if s >= 0:
                return u
    return best[2]


def extract_main_photo(obj: Any) -> Optional[str]:
    """Best-effort cover photo — façade/lobby preferred over chambre/SDB."""
    if not isinstance(obj, dict):
        return None
    candidates: List[Tuple[str, Optional[str]]] = []
    for key in ("main_photo", "mainPhoto", "photo", "thumbnail", "thumbnailUrl"):
        val = obj.get(key)
        if isinstance(val, str) and val.strip():
            candidates.append((val.strip(), None))
    raw = obj.get("raw")
    if isinstance(raw, dict):
        for key in ("main_photo", "mainPhoto", "thumbnail", "thumbnailUrl", "photo"):
            val = raw.get(key)
            if isinstance(val, str) and val.strip():
                candidates.append((val.strip(), None))
        for key in ("hotelImages", "hotel_images", "images", "photos"):
            block = raw.get(key)
            if not isinstance(block, list):
                continue
            for item in block:
                if isinstance(item, str) and item.strip():
                    candidates.append((item.strip(), None))
                elif isinstance(item, dict):
                    u = (
                        item.get("url")
                        or item.get("hdUrl")
                        or item.get("thumbnailUrl")
                        or ""
                    ).strip()
                    if u:
                        cap = item.get("caption") or item.get("title") or item.get("type")
                        candidates.append((u, str(cap) if cap else None))
    return pick_cover_photo(candidates)


def photos_map_from_pool(
    supabase: Any, hotel_ids: Sequence[str]
) -> Dict[str, str]:
    """hotel_id → main_photo/thumbnail from hotel_pool (chunked)."""
    ids = [str(i) for i in hotel_ids if i]
    if not ids or not supabase:
        return {}
    out: Dict[str, str] = {}
    need_raw: List[str] = []
    try:
        for i in range(0, len(ids), 80):
            chunk = ids[i : i + 80]
            # Slim first pass — skip bulky `raw` when columns already have a photo
            res = (
                supabase.table("hotel_pool")
                .select("hotel_id,main_photo,thumbnail")
                .in_("hotel_id", chunk)
                .execute()
            )
            seen_chunk: set = set()
            for row in res.data or []:
                hid = str(row.get("hotel_id") or "")
                if not hid or hid in out:
                    continue
                seen_chunk.add(hid)
                photo = extract_main_photo(row)
                if photo:
                    out[hid] = photo
                else:
                    need_raw.append(hid)
            for hid in chunk:
                if hid not in seen_chunk and hid not in out:
                    need_raw.append(hid)
        # Second pass only for hotels still missing a cover
        for i in range(0, len(need_raw), 80):
            chunk = need_raw[i : i + 80]
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
