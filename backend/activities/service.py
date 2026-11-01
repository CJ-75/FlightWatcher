"""Activities listing / nearby / snapshots — Lot B/D."""
from __future__ import annotations

import hashlib
import logging
import math
import re
from typing import Any, Dict, List, Optional, Tuple

from activities.cache import cache_get, cache_set
from activities.config import ActivitiesConfig, load_activities_config
from activities.ranking import haversine_km, rank_activities
from activities.viator_client import ViatorClient, ViatorError

logger = logging.getLogger("activities.service")

# Viator taxonomy — Food & Drink + Dining Experiences (kept for Restaurants).
_GASTRONOMY_TAG_IDS = frozenset({21911, 11890})

_GASTRONOMY_TEXT_RE = re.compile(
    r"("
    r"food\s*&?\s*drink|food\s*tour|street\s*food|culinary|cooking\s*class|"
    r"wine\s*tast|foodie|gastronom|dining\s*experience|dinner\s*cruise|"
    r"brunch|tastings?|"
    r"gastronomie|culinaire|d[eé]gustation|atelier\s*cuisine|"
    r"cours\s*de\s*cuisine|visite\s*gourmande|food\s*tour|"
    r"d[iî]ner\s*croisi[eè]re|oenolog|œnolog|wine\s*tour|"
    r"cheese\s*tast|fromage|chocolat(e)?\s*(workshop|atelier|tast)|"
    r"beer\s*tast|bi[eè]re\s*d[eé]gust"
    r")",
    re.IGNORECASE,
)


def _extract_tag_ids(raw: Any) -> List[int]:
    out: List[int] = []
    if not isinstance(raw, list):
        return out
    for t in raw:
        if isinstance(t, int):
            out.append(t)
        elif isinstance(t, str) and t.isdigit():
            out.append(int(t))
        elif isinstance(t, dict):
            tid = t.get("tagId") or t.get("id") or t.get("tag_id")
            try:
                if tid is not None:
                    out.append(int(tid))
            except (TypeError, ValueError):
                continue
    return out


def is_gastronomy_activity(item: Dict[str, Any]) -> bool:
    """True for food/drink experiences — reserved for Restaurants, not Activités."""
    tags = item.get("tags")
    if tags is None:
        tags = []
    tag_ids = (
        tags
        if tags and isinstance(tags[0], int)
        else _extract_tag_ids(tags)
    )
    if any(tid in _GASTRONOMY_TAG_IDS for tid in tag_ids):
        return True
    blob = " ".join(
        str(x or "")
        for x in (
            item.get("title"),
            item.get("category"),
            item.get("tag"),
            item.get("description"),
        )
    )
    return bool(_GASTRONOMY_TEXT_RE.search(blob))


def exclude_gastronomy(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [it for it in items if not is_gastronomy_activity(it)]


def _normalize_product(p: Dict[str, Any], *, dest_label: Optional[str] = None) -> Dict[str, Any]:
    reviews = p.get("reviews") if isinstance(p.get("reviews"), dict) else {}
    pricing = p.get("pricing") if isinstance(p.get("pricing"), dict) else {}
    from_price = None
    currency = "EUR"
    summary = pricing.get("summary") if isinstance(pricing.get("summary"), dict) else {}
    if summary.get("fromPrice") is not None:
        from_price = summary.get("fromPrice")
    elif pricing.get("fromPrice") is not None:
        from_price = pricing.get("fromPrice")
    currency = str(pricing.get("currency") or summary.get("currency") or "EUR")
    images = p.get("images") or []
    photo = None
    if isinstance(images, list) and images:
        im0 = images[0]
        if isinstance(im0, dict):
            variants = im0.get("variants") or []
            if variants and isinstance(variants[0], dict):
                photo = variants[0].get("url")
            photo = photo or im0.get("url") or im0.get("imageSource")
    flags = p.get("flags") if isinstance(p.get("flags"), dict) else {}
    dur = None
    duration = p.get("duration")
    if isinstance(duration, dict):
        fixed = duration.get("fixedDurationInMinutes")
        if fixed:
            dur = round(float(fixed) / 60.0, 2)
    tags = _extract_tag_ids(p.get("tags"))
    return {
        "product_code": p.get("productCode") or p.get("code"),
        "title": p.get("title") or p.get("name"),
        "rating": reviews.get("combinedAverageRating") or p.get("rating"),
        "review_count": reviews.get("totalReviews") or p.get("review_count"),
        "duration_hours": dur,
        "price_from": from_price,
        "currency": currency,
        "photo_url": photo,
        "product_url": p.get("productUrl") or p.get("url"),
        "free_cancellation": bool(
            flags.get("freeCancellation") or p.get("freeCancellation")
        ),
        "instant_confirmation": bool(
            flags.get("instantConfirmation") or p.get("instantConfirmation")
        ),
        "category": (p.get("categories") or [None])[0]
        if isinstance(p.get("categories"), list)
        else p.get("category"),
        "tags": tags,
        "destination_label": dest_label,
        "raw_flags": flags,
    }


def geo_cell_key(lat: float, lng: float, cell_km: float) -> str:
    # Integer cell indices — stable for nearby points inside the same cell
    dlat = cell_km / 111.0
    cos = max(0.2, math.cos(math.radians(lat)))
    dlng = cell_km / (111.0 * cos)
    ilat = int(math.floor(lat / dlat))
    ilng = int(math.floor(lng / dlng))
    return f"{ilat}:{ilng}:{cell_km}"


# Fallback when viator_destination_map is empty (sandbox / before sync job).
# IDs = Viator Partner destinationId for major EU cities.
FALLBACK_CITY_DESTINATIONS: Dict[str, str] = {
    "paris": "479",
    "rome": "511",
    "roma": "511",
    "barcelone": "562",
    "barcelona": "562",
    "lisbonne": "645",
    "lisbon": "645",
    "lisboa": "645",
    "porto": "667",
    "milan": "223",
    "milano": "223",
    "amsterdam": "6",
    "londres": "737",
    "london": "737",
    "madrid": "657",
    "berlin": "357",
    "venise": "425",
    "venice": "425",
    "florence": "239",
    "nice": "467",
    "lyon": "404",
    "dublin": "549",
    "budapest": "372",
    "prague": "501",
    "praha": "501",
    "vienne": "534",
    "vienna": "534",
    "wien": "534",
    "malte": "662",
    "malta": "662",
    "palerme": "486",
    "palermo": "486",
    "seville": "701",
    "sevilla": "701",
    "valence": "732",
    "valencia": "732",
    "naples": "464",
    "napoli": "464",
    "edimbourg": "577",
    "edinburgh": "577",
    "manchester": "444",
    "birmingham": "360",
}


def _resolve_destination_id(supabase, slug: str) -> Optional[str]:
    """Resolve Viator destinationId — map row, then FALLBACK, then name match (1 query)."""
    key = (slug or "").strip().lower()
    if not key:
        return None
    if supabase:
        try:
            m = (
                supabase.table("viator_destination_map")
                .select("viator_destination_id")
                .eq("city_slug", key)
                .limit(1)
                .execute()
            )
            if m.data:
                return str(m.data[0].get("viator_destination_id") or "") or None
        except Exception:
            pass
    hit = FALLBACK_CITY_DESTINATIONS.get(key)
    if hit:
        return hit
    # Soft name match — still one DB hit, never mass product search
    if supabase:
        try:
            needle = key.replace("-", " ")
            m = (
                supabase.table("viator_destination_map")
                .select("viator_destination_id,city_slug,name")
                .ilike("name", f"%{needle}%")
                .limit(1)
                .execute()
            )
            if m.data:
                return str(m.data[0].get("viator_destination_id") or "") or None
            m2 = (
                supabase.table("viator_destination_map")
                .select("viator_destination_id")
                .ilike("city_slug", f"%{key}%")
                .limit(1)
                .execute()
            )
            if m2.data:
                return str(m2.data[0].get("viator_destination_id") or "") or None
        except Exception:
            pass
    return None


def search_city_activities(
    supabase,
    *,
    city_slug: str,
    destination_id: Optional[str] = None,
    adults: int = 2,
    cfg: Optional[ActivitiesConfig] = None,
) -> Dict[str, Any]:
    cfg = cfg or load_activities_config()
    adults = max(1, min(6, int(adults or 2)))
    slug = (city_slug or "").strip().lower()
    cache_key = f"city:{slug}:{destination_id or ''}:{adults}"
    cached = cache_get(
        supabase, provider="viator", resource="city_search", cache_key=cache_key
    )
    if isinstance(cached, dict) and cached.get("items"):
        items = exclude_gastronomy(
            [it for it in (cached.get("items") or []) if isinstance(it, dict)]
        )
        return {**cached, "items": items, "cached": True}

    client = ViatorClient(cfg)
    if not client.enabled:
        return {"ok": False, "error": "viator_disabled", "items": []}

    dest = destination_id or _resolve_destination_id(supabase, slug)
    if not dest:
        return {
            "ok": False,
            "error": "unknown_city",
            "items": [],
            "city_slug": slug,
            "hint": "Ville pas encore couverte — choisis une suggestion ou une grande ville EU",
        }

    try:
        raw = client.search_products(
            {
                "filtering": {"destination": str(dest)},
                "pagination": {"start": 1, "count": min(50, cfg.max_results * 2)},
                "currency": "EUR",
            }
        )
    except ViatorError as e:
        return {"ok": False, "error": str(e), "items": []}

    products = []
    if isinstance(raw, dict):
        products = raw.get("products") or raw.get("data") or []
    items = [
        _normalize_product(p)
        for p in products
        if isinstance(p, dict)
    ]
    items = exclude_gastronomy(items)
    items = rank_activities(items)
    # Cap to multiple of 3 between min and max
    n = max(cfg.min_results, min(cfg.max_results, len(items)))
    n = n - (n % 3) if n >= 3 else n
    items = items[:n] if n else items[: cfg.max_results]
    payload = {
        "ok": True,
        "city_slug": city_slug,
        "destination_id": str(dest),
        "adults": adults,
        "items": items,
        "indicative": False,
        "cached": False,
    }
    cache_set(
        supabase,
        provider="viator",
        resource="city_search",
        cache_key=cache_key,
        payload=payload,
        ttl_h=cfg.cache_ttl_h,
        license_class="basic_ephemeral",
    )
    return payload


def nearby_activities(
    supabase,
    *,
    lat: float,
    lng: float,
    adults: int = 2,
    cfg: Optional[ActivitiesConfig] = None,
) -> Dict[str, Any]:
    """Expand radius steps; max queries; quality relaxation — Lot D."""
    cfg = cfg or load_activities_config()
    # Round position — never store exact
    rlat = round(float(lat), 2)
    rlng = round(float(lng), 2)
    cell = geo_cell_key(rlat, rlng, cfg.geo_cache_cell_km)
    cache_key = f"geo:{cell}:{adults}"
    cached = cache_get(
        supabase, provider="viator", resource="geo_search", cache_key=cache_key
    )
    if isinstance(cached, dict) and cached.get("items"):
        items = exclude_gastronomy(
            [it for it in (cached.get("items") or []) if isinstance(it, dict)]
        )
        return {**cached, "items": items, "cached": True}

    # Destinations from map sorted by distance
    dests: List[Tuple[float, Dict[str, Any]]] = []
    if supabase:
        try:
            res = (
                supabase.table("viator_destination_map")
                .select("*")
                .limit(200)
                .execute()
            )
            for row in res.data or []:
                try:
                    dlat = float(row.get("lat"))
                    dlng = float(row.get("lng"))
                except (TypeError, ValueError):
                    continue
                km = haversine_km(rlat, rlng, dlat, dlng)
                dests.append((km, row))
        except Exception as e:
            logger.warning("nearby dest map: %s", e)
    dests.sort(key=lambda x: x[0])

    client = ViatorClient(cfg)
    if not client.enabled:
        return {"ok": False, "error": "viator_disabled", "items": []}

    collected: Dict[str, Dict[str, Any]] = {}
    queries = 0
    used_radius = None
    quality_idx = 0

    def quality_ok(item: Dict[str, Any], step: Tuple[float, int]) -> bool:
        min_r, min_n = step
        try:
            r = float(item.get("rating") or 0)
            n = int(item.get("review_count") or 0)
        except (TypeError, ValueError):
            return False
        return r >= min_r and n >= min_n

    for radius in cfg.radius_steps_km:
        used_radius = radius
        for km, row in dests:
            if km > radius:
                break
            if queries >= cfg.max_queries_per_geo:
                break
            dest_id = row.get("viator_destination_id")
            if not dest_id:
                continue
            queries += 1
            try:
                raw = client.search_products(
                    {
                        "filtering": {"destination": str(dest_id)},
                        "pagination": {"start": 1, "count": 20},
                        "currency": "EUR",
                    }
                )
            except ViatorError:
                continue
            products = []
            if isinstance(raw, dict):
                products = raw.get("products") or raw.get("data") or []
            for p in products:
                if not isinstance(p, dict):
                    continue
                norm = _normalize_product(
                    p, dest_label=row.get("name") or row.get("city_slug")
                )
                if is_gastronomy_activity(norm):
                    continue
                code = str(norm.get("product_code") or "")
                if not code or code in collected:
                    continue
                norm["_dest_km"] = km
                collected[code] = norm
        # Enough results at this radius?
        qstep = cfg.quality_steps[min(quality_idx, len(cfg.quality_steps) - 1)]
        filtered = [
            it for it in collected.values() if quality_ok(it, qstep)
        ]
        if len(filtered) >= cfg.min_results:
            break
        if queries >= cfg.max_queries_per_geo:
            break

    # Relax quality without expanding further
    items = list(collected.values())
    for qi, qstep in enumerate(cfg.quality_steps):
        quality_idx = qi
        filtered = [it for it in items if quality_ok(it, qstep)]
        if len(filtered) >= cfg.min_results:
            items = filtered
            break
    else:
        items = [it for it in items if quality_ok(it, cfg.quality_steps[-1])] or items

    items = exclude_gastronomy(items)
    dist_map = {
        str(it.get("product_code")): float(it.get("_dest_km") or 0) for it in items
    }
    items = rank_activities(items, distance_km=dist_map)
    n = max(cfg.min_results, min(cfg.max_results, len(items)))
    n = n - (n % 3) if n >= 3 else len(items)
    items = items[:n]

    payload = {
        "ok": True,
        "items": items,
        "radius_km": used_radius,
        "queries": queries,
        "quality_step": list(cfg.quality_steps[quality_idx]),
        "count": len(items),
        "cached": False,
        "header": (
            f"{len(items)} activités autour de toi, dans un rayon de {used_radius} km"
            if used_radius
            else f"{len(items)} activités autour de toi"
        ),
    }
    if len(items) < cfg.min_results:
        payload["fallback_hint"] = "Explorer une grande ville proche"
    cache_set(
        supabase,
        provider="viator",
        resource="geo_search",
        cache_key=cache_key,
        payload=payload,
        ttl_h=cfg.cache_ttl_h,
        license_class="basic_ephemeral",
    )
    return payload


def sync_destinations_map(supabase, cfg: Optional[ActivitiesConfig] = None) -> Dict[str, Any]:
    cfg = cfg or load_activities_config()
    client = ViatorClient(cfg)
    if not client.enabled:
        return {"ok": False, "error": "viator_disabled"}
    try:
        dests = client.list_destinations()
    except ViatorError as e:
        return {"ok": False, "error": str(e)}
    items = []
    if isinstance(dests, dict):
        items = dests.get("destinations") or dests.get("data") or []
    elif isinstance(dests, list):
        items = dests
    upserted = 0
    for d in items if isinstance(items, list) else []:
        if not isinstance(d, dict):
            continue
        dest_id = d.get("destinationId") or d.get("id")
        if dest_id is None:
            continue
        center = d.get("center") or {}
        lat = d.get("latitude") or (center.get("latitude") if isinstance(center, dict) else None)
        lng = d.get("longitude") or (center.get("longitude") if isinstance(center, dict) else None)
        name = d.get("name") or d.get("destinationName") or str(dest_id)
        slug = (
            str(name)
            .lower()
            .replace(" ", "-")
            .replace("'", "")
            .replace("é", "e")
            .replace("è", "e")
            .replace("à", "a")
        )[:80]
        row = {
            "viator_destination_id": str(dest_id),
            "name": name,
            "city_slug": slug,
            "lat": lat,
            "lng": lng,
            "meta": {"type": d.get("type") or d.get("destinationType")},
        }
        try:
            supabase.table("viator_destination_map").upsert(
                row, on_conflict="viator_destination_id"
            ).execute()
            upserted += 1
        except Exception as e:
            logger.debug("dest upsert: %s", e)
    cache_set(
        supabase,
        provider="viator",
        resource="destinations",
        cache_key="all",
        payload={"count": upserted},
        ttl_h=24 * 7,
        license_class="reference",
    )
    return {"ok": True, "upserted": upserted}
