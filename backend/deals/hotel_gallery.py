"""
Fetch / cache LiteAPI hotel image galleries for Deals lightbox.
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from deals.liteapi_client import LiteApiClient, LiteApiError
from deals.liteapi_config import load_deals_config

logger = logging.getLogger("deals.hotel_gallery")

_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_CACHE_LOCK = threading.Lock()
_CACHE_TTL_S = 6 * 3600  # 6h — static content


def _extract_urls(payload: Any) -> List[Dict[str, Any]]:
    """Normalize hotelImages → [{url, thumb, caption, order}]."""
    data = payload.get("data") if isinstance(payload, dict) else None
    if data is None and isinstance(payload, dict):
        data = payload
    if not isinstance(data, dict):
        return []
    images = data.get("hotelImages") or data.get("hotel_images") or []
    if not isinstance(images, list):
        return []
    out: List[Dict[str, Any]] = []
    seen = set()
    for img in images:
        if isinstance(img, str):
            url = img.strip()
            caption = None
            order = len(out)
            thumb = url
            default = False
        elif isinstance(img, dict):
            url = (img.get("url") or img.get("hdUrl") or "").strip()
            thumb = (img.get("thumbnailUrl") or img.get("url") or url or "").strip()
            caption = img.get("caption") or img.get("title")
            try:
                order = int(img.get("order") if img.get("order") is not None else len(out))
            except (TypeError, ValueError):
                order = len(out)
            default = bool(img.get("defaultImage") or img.get("default_image"))
        else:
            continue
        if not url or url in seen:
            continue
        seen.add(url)
        out.append(
            {
                "url": url,
                "thumb": thumb or url,
                "caption": caption,
                "order": order,
                "default": default,
            }
        )
    out.sort(key=lambda x: (0 if x.get("default") else 1, x.get("order") or 0))
    return out[:40]


def photos_from_pool_raw(raw: Any) -> List[str]:
    """Best-effort extract from hotel_pool.raw without LiteAPI call."""
    if not isinstance(raw, dict):
        return []
    urls: List[str] = []
    for key in ("hotelImages", "hotel_images", "images", "photos"):
        block = raw.get(key)
        if isinstance(block, list):
            for item in block:
                if isinstance(item, str) and item.strip():
                    urls.append(item.strip())
                elif isinstance(item, dict):
                    u = (item.get("url") or item.get("hdUrl") or "").strip()
                    if u:
                        urls.append(u)
    for key in ("main_photo", "mainPhoto", "thumbnail"):
        u = raw.get(key)
        if isinstance(u, str) and u.strip():
            urls.append(u.strip())
    # dedupe
    seen = set()
    out = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out[:24]


def get_hotel_gallery(
    supabase: Any,
    hotel_id: str,
    *,
    language: str = "fr",
    fallback_photo: Optional[str] = None,
) -> Dict[str, Any]:
    hid = (hotel_id or "").strip()
    if not hid:
        return {"hotel_id": "", "photos": [], "name": None}

    now = time.monotonic()
    with _CACHE_LOCK:
        hit = _CACHE.get(hid)
        if hit and now - hit[0] < _CACHE_TTL_S:
            return dict(hit[1])

    photos: List[Dict[str, Any]] = []
    name = None
    description = None
    # Seed from pool raw / main_photo (instant)
    if supabase:
        try:
            res = (
                supabase.table("hotel_pool")
                .select("name,main_photo,thumbnail,raw")
                .eq("hotel_id", hid)
                .limit(1)
                .execute()
            )
            if res.data:
                row = res.data[0]
                name = row.get("name")
                for u in photos_from_pool_raw(row.get("raw")):
                    photos.append({"url": u, "thumb": u, "caption": None, "order": len(photos)})
                for key in ("main_photo", "thumbnail"):
                    u = (row.get(key) or "").strip()
                    if u and not any(p["url"] == u for p in photos):
                        photos.insert(0, {"url": u, "thumb": u, "caption": None, "order": 0})
        except Exception as e:
            logger.debug("pool gallery seed: %s", e)

    if fallback_photo and not any(p["url"] == fallback_photo for p in photos):
        photos.insert(
            0,
            {"url": fallback_photo, "thumb": fallback_photo, "caption": None, "order": 0},
        )

    # Enrich via LiteAPI details (full gallery)
    cfg = load_deals_config()
    if cfg.api_key:
        client = LiteApiClient(cfg=cfg)
        try:
            payload = client.get_hotel_details(hid, language=language, timeout=6)
            data = payload.get("data") if isinstance(payload, dict) else None
            if isinstance(data, dict):
                name = data.get("name") or name
                description = data.get("hotelDescription") or data.get("hotel_description")
                api_photos = _extract_urls(payload)
                if api_photos:
                    photos = api_photos
        except LiteApiError as e:
            logger.info("hotel_gallery liteapi miss %s: %s", hid, e)
        except Exception as e:
            logger.warning("hotel_gallery fail %s: %s", hid, e)
        finally:
            client.close()

    # Dedup urls keep order
    seen = set()
    unique = []
    for p in photos:
        u = p.get("url")
        if u and u not in seen:
            seen.add(u)
            unique.append(p)

    result = {
        "hotel_id": hid,
        "name": name,
        "description": description,
        "photos": unique,
        "count": len(unique),
    }
    with _CACHE_LOCK:
        _CACHE[hid] = (time.monotonic(), result)
        if len(_CACHE) > 256:
            # drop oldest half
            items = sorted(_CACHE.items(), key=lambda kv: kv[1][0])
            for k, _ in items[:128]:
                _CACHE.pop(k, None)
    return result
