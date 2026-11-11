"""Link import → place recognition (code-first, optional Geoapify)."""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import unquote, urlparse

import httpx

from activities.link_resolve import expand_short_url
from activities.places import upsert_place_with_ref
from activities.restaurants_config import load_restaurants_config

logger = logging.getLogger("activities.restaurants")

TRACKER_KEYS = {
    "entry",
    "g_ep",
    "skid",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "fbclid",
    "gclid",
    "si",
    "feature",
}

RESTO_RE = re.compile(
    r"\b(restaurant|resto|bar|cafe|café|bakery|boulangerie|glacier|"
    r"pizzeria|brasserie|pub|taberna|trattoria)\b",
    re.I,
)
ATTR_RE = re.compile(
    r"\b(museum|musée|monument|viewpoint|park|parc|beach|plage|"
    r"market|marché|castle|château|cathedral|gallery|galerie)\b",
    re.I,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip_trackers(url: str) -> str:
    try:
        from urllib.parse import parse_qsl, urlencode, urlunparse

        p = urlparse(url)
        q = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True) if k not in TRACKER_KEYS and not k.startswith("utm_")]
        return urlunparse((p.scheme, p.netloc, p.path, p.params, urlencode(q), ""))
    except Exception:
        return url.split("?")[0]


def _extract_urls(text: str) -> List[str]:
    return list(
        dict.fromkeys(
            re.findall(r"https?://[^\s<>\"')\]]+", text or "")
        )
    )[:20]


def _decode_name(raw: str) -> str:
    try:
        return unquote(raw.replace("+", " ")).strip()
    except Exception:
        return raw.replace("+", " ").strip()


def parse_maps_url(url: str) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "source": "google_maps",
        "url_clean": _strip_trackers(url),
        "name": None,
        "lat": None,
        "lng": None,
        "map_center_lat": None,
        "map_center_lng": None,
        "google_cid": None,
        "short_link": False,
    }
    host = (urlparse(url).hostname or "").lower()
    if host in ("maps.app.goo.gl", "goo.gl", "g.co"):
        out["short_link"] = True
        expanded = expand_short_url(url)
        if expanded:
            return parse_maps_url(expanded)
        return out

    m = re.search(r"/maps/place/([^/]+)", url)
    if m:
        out["name"] = _decode_name(m.group(1))
    if not out["name"]:
        q = re.search(r"[?&]q=([^&]+)", url)
        if q:
            cand = _decode_name(q.group(1))
            # Ignore pure coordinates in q=
            if cand and not re.match(r"^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$", cand):
                out["name"] = cand
    exact = re.search(r"!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)", url)
    center = re.search(r"@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)", url)
    if exact:
        out["lat"] = float(exact.group(1))
        out["lng"] = float(exact.group(2))
    if center:
        out["map_center_lat"] = float(center.group(1))
        out["map_center_lng"] = float(center.group(2))
        if out["lat"] is None:
            out["lat"] = out["map_center_lat"]
            out["lng"] = out["map_center_lng"]
    cid = re.search(r"!1s0x[0-9a-fA-F]+:0x([0-9a-fA-F]+)", url)
    if cid:
        try:
            out["google_cid"] = str(int(cid.group(1), 16))
        except ValueError:
            pass
    return out


def classify_bucket(name: Optional[str], category: Optional[str] = None) -> str:
    s = f"{name or ''} {category or ''}"
    if RESTO_RE.search(s):
        return "restaurant"
    if ATTR_RE.search(s):
        return "attraction"
    return "unknown"


def parse_share_payload(text: str, max_links: int = 20) -> List[Dict[str, Any]]:
    text = (text or "").strip()
    if not text:
        return []
    urls = _extract_urls(text)[:max_links]
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    out: List[Dict[str, Any]] = []
    for href in urls:
        host = (urlparse(href).hostname or "").lower()
        if "instagram" in host or "instagr.am" in host:
            out.append(
                {
                    "source": "instagram",
                    "url_clean": href.split("?")[0],
                    "name": None,
                    "raw_text": text[:2000],
                    "bucket": "unknown",
                }
            )
            continue
        if "tiktok" in host:
            out.append(
                {
                    "source": "tiktok",
                    "url_clean": href.split("?")[0],
                    "name": None,
                    "raw_text": text[:2000],
                    "bucket": "unknown",
                }
            )
            continue
        if "google." in host or "goo.gl" in host or "maps.app" in host:
            p = parse_maps_url(href)
            if not p.get("name") and lines and not lines[0].startswith("http"):
                p["name"] = lines[0][:200]
            p["bucket"] = classify_bucket(p.get("name"))
            out.append(p)
            continue
        out.append(
            {
                "source": "unknown",
                "url_clean": href,
                "name": None,
                "bucket": "unknown",
            }
        )
    return out


def geoapify_reverse_or_nearby(
    lat: float, lng: float, name: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    cfg = load_restaurants_config()
    if not cfg.geoapify_api_key:
        return None
    try:
        params = {
            "lat": lat,
            "lon": lng,
            "apiKey": cfg.geoapify_api_key,
            "limit": 5,
        }
        if name:
            # text search biased to point
            r = httpx.get(
                "https://api.geoapify.com/v1/geocode/search",
                params={
                    "text": name,
                    "bias": f"proximity:{lng},{lat}",
                    "limit": 5,
                    "apiKey": cfg.geoapify_api_key,
                },
                timeout=6.0,
            )
        else:
            r = httpx.get(
                "https://api.geoapify.com/v2/place-details",
                params=params,
                timeout=6.0,
            )
        if r.status_code != 200:
            return None
        data = r.json()
        feats = data.get("features") or []
        if not feats:
            return None
        f0 = feats[0]
        props = f0.get("properties") or {}
        coords = (f0.get("geometry") or {}).get("coordinates") or [lng, lat]
        return {
            "name": props.get("name") or props.get("formatted") or name,
            "lat": float(coords[1]),
            "lng": float(coords[0]),
            "category": props.get("categories") or props.get("category"),
            "city": props.get("city") or props.get("municipality"),
            "opening_hours": props.get("opening_hours"),
            "cuisine": props.get("cuisine") or props.get("catering", {}).get("cuisine")
            if isinstance(props.get("catering"), dict)
            else props.get("cuisine"),
            "website": props.get("website"),
            "phone": props.get("phone") or props.get("contact", {}).get("phone")
            if isinstance(props.get("contact"), dict)
            else None,
            "osm_id": props.get("osm_id") or props.get("place_id"),
            "attribution": "© OpenStreetMap contributors · Powered by Geoapify",
        }
    except Exception as e:
        logger.debug("geoapify: %s", e)
        return None


def recognize_and_upsert(
    supabase,
    parsed: Dict[str, Any],
    *,
    user_id: Optional[str] = None,
    city_slug: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Create/find place from parsed link. Personal place if no external match.
    """
    name = (parsed.get("name") or "Lieu").strip()[:300]
    lat = parsed.get("lat")
    lng = parsed.get("lng")
    bucket = parsed.get("bucket") or classify_bucket(name)
    kind = "restaurant" if bucket == "restaurant" else (
        "attraction" if bucket == "attraction" else "restaurant"
    )

    geo = None
    if lat is not None and lng is not None:
        geo = geoapify_reverse_or_nearby(float(lat), float(lng), name)

    if geo and geo.get("name"):
        name = str(geo["name"])[:300]
        lat = geo.get("lat", lat)
        lng = geo.get("lng", lng)
        if geo.get("category"):
            bucket = classify_bucket(name, str(geo["category"]))
            kind = "restaurant" if bucket == "restaurant" else (
                "attraction" if bucket == "attraction" else kind
            )

    provider = "other"
    external_id = None
    origin = "user"
    visibility = "private"

    if geo and geo.get("osm_id"):
        # use other+prefix until migration expands place_refs.provider CHECK
        provider = "other"
        external_id = f"osm:{geo['osm_id']}"
        origin = "osm"
        visibility = "public"
    elif parsed.get("google_cid"):
        provider = "other"
        external_id = f"google_cid:{parsed['google_cid']}"
        origin = "google"
        visibility = "private"  # until confirmed public
    else:
        # stable user-personal id from coords+name
        external_id = f"user:{name}:{lat}:{lng}".lower()[:200]
        provider = "other"
        origin = "user"
        visibility = "private"

    place = upsert_place_with_ref(
        supabase,
        kind=kind if kind in (
            "activity", "hotel", "restaurant", "bar", "cafe", "attraction", "airport"
        ) else "restaurant",
        name=name,
        provider=provider,
        external_id=external_id,
        lat=float(lat) if lat is not None else None,
        lng=float(lng) if lng is not None else None,
        location_precision="exact" if lat is not None else "city",
        city_slug=city_slug or (geo.get("city") if geo else None),
        meta={
            "origin": origin,
            "visibility": visibility,
            "source_url": parsed.get("url_clean"),
            "attribution": (geo or {}).get("attribution"),
            "created_by": user_id,
        },
    )

    place_id = (place or {}).get("id")
    if place_id and supabase:
        # Best-effort columns (migration Lot A)
        try:
            supabase.table("places").update(
                {
                    "origin": origin,
                    "visibility": visibility,
                    "created_by": user_id,
                    "updated_at": _now(),
                }
            ).eq("id", place_id).execute()
        except Exception:
            pass

        if kind in ("restaurant", "bar", "cafe"):
            try:
                supabase.table("restaurant_details").upsert(
                    {
                        "place_id": place_id,
                        "cuisine": (geo or {}).get("cuisine"),
                        "opening_hours_raw": (geo or {}).get("opening_hours"),
                        "website": (geo or {}).get("website"),
                        "phone": (geo or {}).get("phone"),
                        "facts_sources": [
                            {"src": "geoapify"} if geo else {"src": "user"}
                        ],
                        "refreshed_at": _now(),
                    }
                ).execute()
            except Exception as e:
                logger.debug("restaurant_details: %s", e)
        elif kind == "attraction":
            try:
                supabase.table("attraction_details").upsert(
                    {
                        "place_id": place_id,
                        "category": str((geo or {}).get("category") or "")[:120] or None,
                        "opening_hours_raw": (geo or {}).get("opening_hours"),
                        "website": (geo or {}).get("website"),
                        "refreshed_at": _now(),
                    }
                ).execute()
            except Exception as e:
                logger.debug("attraction_details: %s", e)

    status = "recognized" if place_id and (geo or parsed.get("lat")) else "needs_clarify"
    if not place_id:
        status = "failed"

    return {
        "status": status,
        "bucket": bucket,
        "place": place,
        "place_id": place_id,
        "parse": parsed,
        "geo": geo,
    }
