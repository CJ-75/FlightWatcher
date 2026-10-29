"""
Fetch / cache LiteAPI hotel image galleries for Deals lightbox.
"""
from __future__ import annotations

import html
import logging
import re
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from deals.liteapi_client import LiteApiClient, LiteApiError
from deals.liteapi_config import load_deals_config

logger = logging.getLogger("deals.hotel_gallery")

_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_CACHE_LOCK = threading.Lock()
_CACHE_TTL_S = 6 * 3600  # 6h — static content

_BLOCK_BREAK = re.compile(
    r"</?(?:p|div|br|li|ul|ol|h[1-6]|tr|section|article)[^>]*>",
    re.I,
)
_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"[ \t\f\v]+")
_BLANK = re.compile(r"\n{3,}")


def html_to_plain_text(raw: Any) -> Optional[str]:
    """Strip Nuitee/LiteAPI HTML descriptions into readable plain text."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    s = _BLOCK_BREAK.sub("\n", s)
    s = _TAG.sub("", s)
    s = html.unescape(s)
    s = _WS.sub(" ", s)
    s = _BLANK.sub("\n\n", s)
    lines = [ln.strip() for ln in s.splitlines()]
    s = "\n".join(ln for ln in lines if ln)
    return s or None


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
    # Prefer façade / lobby; demote bedroom & bathroom covers (v4 Lot C)
    try:
        from deals.pool_photos import _photo_score

        out.sort(
            key=lambda x: (
                0 if x.get("default") else 1,
                -_photo_score(str(x.get("url") or ""), x.get("caption")),
                x.get("order") or 0,
            )
        )
    except Exception:
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


# Conversion-facing amenities (EN Nuitee labels → FR chip). First match wins.
_FACILITY_MAP: Tuple[Tuple[str, str], ...] = (
    ("free wifi", "Wi-Fi gratuit"),
    ("wifi", "Wi-Fi"),
    ("free parking", "Parking gratuit"),
    ("parking", "Parking"),
    ("breakfast", "Petit-déjeuner"),
    ("restaurant", "Restaurant"),
    ("swimming pool", "Piscine"),
    ("outdoor pool", "Piscine"),
    ("indoor pool", "Piscine"),
    ("pool", "Piscine"),
    ("spa", "Spa"),
    ("fitness", "Salle de sport"),
    ("gym", "Salle de sport"),
    ("air conditioning", "Climatisation"),
    ("air-conditioned", "Climatisation"),
    ("airport shuttle", "Navette aéroport"),
    ("24-hour", "Réception 24h/24"),
    ("24 hour", "Réception 24h/24"),
    ("front desk", "Réception"),
    ("pet", "Animaux acceptés"),
    ("family room", "Chambres familiales"),
    ("non-smoking", "Chambres non-fumeurs"),
    ("elevator", "Ascenseur"),
    ("lift", "Ascenseur"),
    ("bar", "Bar"),
    ("laundry", "Laverie"),
    ("room service", "Room service"),
)


def _facility_label(raw: str) -> Optional[str]:
    s = (raw or "").strip()
    if not s:
        return None
    low = s.lower()
    for needle, fr in _FACILITY_MAP:
        if needle in low:
            return fr
    # Keep short already-localized / useful labels
    if len(s) <= 28 and not any(c in s for c in "<>{}"):
        return s
    return None


def _extract_facilities(data: Dict[str, Any], *, limit: int = 10) -> List[str]:
    raw_list: List[str] = []
    hf = data.get("hotelFacilities") or data.get("hotel_facilities")
    if isinstance(hf, list):
        for item in hf:
            if isinstance(item, str) and item.strip():
                raw_list.append(item.strip())
            elif isinstance(item, dict):
                n = item.get("name") or item.get("facility")
                if isinstance(n, str) and n.strip():
                    raw_list.append(n.strip())
    fac = data.get("facilities")
    if isinstance(fac, list):
        for item in fac:
            if isinstance(item, dict):
                n = item.get("name")
                if isinstance(n, str) and n.strip():
                    raw_list.append(n.strip())
            elif isinstance(item, str) and item.strip():
                raw_list.append(item.strip())

    out: List[str] = []
    seen = set()
    for raw in raw_list:
        label = _facility_label(raw)
        if not label or label in seen:
            continue
        seen.add(label)
        out.append(label)
        if len(out) >= limit:
            break
    return out


def _extract_check_times(data: Dict[str, Any]) -> Dict[str, Optional[str]]:
    block = data.get("checkinCheckoutTimes") or data.get("checkin_checkout_times") or {}
    if not isinstance(block, dict):
        block = {}
    cin = block.get("checkin") or block.get("checkinStart") or data.get("checkin")
    cout = block.get("checkout") or data.get("checkout")
    return {
        "checkin_time": str(cin).strip() if cin else None,
        "checkout_time": str(cout).strip() if cout else None,
    }


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

    lang = (language or "fr").strip().lower()[:5] or "fr"
    cache_key = f"{hid}:{lang}:v2"

    now = time.monotonic()
    with _CACHE_LOCK:
        hit = _CACHE.get(cache_key)
        if hit and now - hit[0] < _CACHE_TTL_S:
            return dict(hit[1])

    photos: List[Dict[str, Any]] = []
    name = None
    description = None
    address = None
    city = None
    facilities: List[str] = []
    checkin_time = None
    checkout_time = None
    lat = None
    lng = None
    # Seed from pool raw / main_photo (instant)
    if supabase:
        try:
            res = (
                supabase.table("hotel_pool")
                .select("name,main_photo,thumbnail,raw,lat,lng")
                .eq("hotel_id", hid)
                .limit(1)
                .execute()
            )
            if res.data:
                row = res.data[0]
                name = row.get("name")
                try:
                    lat = float(row["lat"]) if row.get("lat") is not None else None
                    lng = float(row["lng"]) if row.get("lng") is not None else None
                except (TypeError, ValueError):
                    lat = lng = None
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

    # Enrich via LiteAPI details (full gallery + conversion fields)
    cfg = load_deals_config()
    if cfg.api_key:
        client = LiteApiClient(cfg=cfg)
        try:
            payload = client.get_hotel_details(hid, language=lang, timeout=6)
            data = payload.get("data") if isinstance(payload, dict) else None
            if isinstance(data, dict):
                name = data.get("name") or name
                description = html_to_plain_text(
                    data.get("hotelDescription") or data.get("hotel_description")
                )
                address = (data.get("address") or "").strip() or None
                city = (data.get("city") or "").strip() or None
                facilities = _extract_facilities(data, limit=10)
                times = _extract_check_times(data)
                checkin_time = times.get("checkin_time")
                checkout_time = times.get("checkout_time")
                loc = data.get("location") if isinstance(data.get("location"), dict) else {}
                try:
                    if loc.get("latitude") is not None:
                        lat = float(loc.get("latitude"))
                    if loc.get("longitude") is not None:
                        lng = float(loc.get("longitude"))
                except (TypeError, ValueError):
                    pass
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
        "address": address,
        "city": city,
        "facilities": facilities,
        "checkin_time": checkin_time,
        "checkout_time": checkout_time,
        "lat": lat,
        "lng": lng,
        "photos": unique,
        "count": len(unique),
    }
    with _CACHE_LOCK:
        _CACHE[cache_key] = (time.monotonic(), result)
        if len(_CACHE) > 256:
            # drop oldest half
            items = sorted(_CACHE.items(), key=lambda kv: kv[1][0])
            for k, _ in items[:128]:
                _CACHE.pop(k, None)
    return result
