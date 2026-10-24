"""Hotel pool bootstrap: LiteAPI hotel list → curated 30–50 hotels / destination."""
from __future__ import annotations

import logging
import math
import re
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

from deals.destinations_seed import DESTINATIONS_SEED, destination_upsert_rows
from deals.liteapi_client import LiteApiClient, LiteApiError
from deals.liteapi_config import DealsConfig, load_deals_config

logger = logging.getLogger("deals.hotel_pool")

POOL_TARGET = 40
POOL_MIN = 30
POOL_MAX = 50
MIN_STARS = 3.0
MAX_STARS = 4.5
MIN_RATING_10 = 8.0
MIN_REVIEWS = 200
RADIUS_STEP_M = 500
MAX_RADIUS_EXPAND = 2
PAGE_LIMIT = 1000

# Name patterns for excluded lodging types (fallback if hotelTypes map missing)
_EXCLUDED_TYPE_RE = re.compile(
    r"\b(hostel|auberge|apartment|appartment|appart\b|aparthotel|guest\s*house|"
    r"guesthouse|vacation\s*home|holiday\s*home|villa|camping|homestay|capsule|"
    r"condo|residence|private\s*room|dorm)\b",
    re.I,
)

# hotelTypes.name keywords → exclude
_EXCLUDED_TYPE_NAME_RE = re.compile(
    r"hostel|apartment|appart|auberge|guest\s*house|vacation|villa|camping|"
    r"homestay|capsule|condo|residence",
    re.I,
)

# facility name hints for 24h reception
_RECEPTION_24H_RE = re.compile(r"24[\s\-]?hour|24h|réception\s*24|reception\s*24", re.I)


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def normalize_rating(rating: Optional[float]) -> Tuple[Optional[float], float]:
    """
    LiteAPI docs: rating e.g. 8.5 out of 10. Some feeds use 0–5.
    Returns (rating_on_10, scale_used).
    """
    if rating is None:
        return None, 10.0
    try:
        r = float(rating)
    except (TypeError, ValueError):
        return None, 10.0
    if r <= 0:
        return None, 10.0
    # Heuristic: values ≤ 5 with one decimal likely /5 scale
    if r <= 5.0:
        return r * 2.0, 5.0
    return r, 10.0


def extract_hotels_list(payload: Any) -> List[Dict[str, Any]]:
    if payload is None:
        return []
    if isinstance(payload, list):
        return [h for h in payload if isinstance(h, dict)]
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            return [h for h in data if isinstance(h, dict)]
        if isinstance(data, dict) and isinstance(data.get("hotels"), list):
            return [h for h in data["hotels"] if isinstance(h, dict)]
        if isinstance(payload.get("hotels"), list):
            return [h for h in payload["hotels"] if isinstance(h, dict)]
    return []


def build_excluded_type_ids(hotel_types: Iterable[Dict[str, Any]]) -> Set[int]:
    excluded: Set[int] = set()
    for t in hotel_types:
        if not isinstance(t, dict):
            continue
        name = str(t.get("name") or "")
        tid = t.get("id")
        if tid is None:
            continue
        if _EXCLUDED_TYPE_NAME_RE.search(name):
            try:
                excluded.add(int(tid))
            except (TypeError, ValueError):
                continue
    return excluded


def build_reception_24h_facility_ids(facilities: Iterable[Dict[str, Any]]) -> Set[int]:
    ids: Set[int] = set()
    for f in facilities:
        if not isinstance(f, dict):
            continue
        name = str(f.get("name") or f.get("facility") or "")
        fid = f.get("id")
        if fid is None:
            continue
        if _RECEPTION_24H_RE.search(name):
            try:
                ids.add(int(fid))
            except (TypeError, ValueError):
                continue
    return ids


def hotel_passes_filters(
    hotel: Dict[str, Any],
    *,
    center_lat: float,
    center_lng: float,
    radius_m: int,
    excluded_type_ids: Set[int],
) -> Optional[Dict[str, Any]]:
    """Return enriched candidate dict or None if filtered out."""
    hotel_id = hotel.get("id") or hotel.get("hotelId")
    if hotel_id is None:
        return None
    hotel_id = str(hotel_id)

    try:
        stars = float(hotel.get("stars")) if hotel.get("stars") is not None else None
    except (TypeError, ValueError):
        stars = None
    if stars is None or stars < MIN_STARS or stars > MAX_STARS:
        return None

    rating_raw = hotel.get("rating")
    rating_10, rating_scale = normalize_rating(
        float(rating_raw) if rating_raw is not None else None
    )
    if rating_10 is None or rating_10 < MIN_RATING_10:
        return None

    try:
        review_count = int(hotel.get("reviewCount") or hotel.get("review_count") or 0)
    except (TypeError, ValueError):
        review_count = 0
    if review_count < MIN_REVIEWS:
        return None

    type_id = hotel.get("hotelTypeId") or hotel.get("hotel_type_id")
    type_name = str(hotel.get("hotelType") or hotel.get("hotel_type") or "")
    try:
        type_id_int = int(type_id) if type_id is not None else None
    except (TypeError, ValueError):
        type_id_int = None
    if type_id_int is not None and type_id_int in excluded_type_ids:
        return None
    if type_name and _EXCLUDED_TYPE_RE.search(type_name):
        return None
    # Also check hotel name for hostel/apartment markers
    name = str(hotel.get("name") or "")
    if name and _EXCLUDED_TYPE_RE.search(name):
        return None

    try:
        lat = float(hotel.get("latitude") if hotel.get("latitude") is not None else hotel.get("lat"))
        lng = float(hotel.get("longitude") if hotel.get("longitude") is not None else hotel.get("lng"))
    except (TypeError, ValueError):
        return None

    distance_m = int(round(haversine_m(center_lat, center_lng, lat, lng)))
    if distance_m > radius_m:
        return None

    return {
        "hotel_id": hotel_id,
        "name": name or None,
        "stars": stars,
        "rating": rating_10,
        "rating_scale": rating_scale,
        "review_count": review_count,
        "lat": lat,
        "lng": lng,
        "distance_m": distance_m,
        "hotel_type": type_name or (str(type_id_int) if type_id_int is not None else None),
        "hotel_type_id": type_id_int,
        "main_photo": hotel.get("main_photo") or hotel.get("mainPhoto"),
        "thumbnail": hotel.get("thumbnail"),
        "address": hotel.get("address"),
        "facility_ids": list(hotel.get("facilityIds") or hotel.get("facility_ids") or []),
        "raw": hotel,
    }


def score_candidate(c: Dict[str, Any], radius_m: int) -> float:
    """note × log(avis) × proximité."""
    rating = float(c.get("rating") or 0)
    reviews = max(0, int(c.get("review_count") or 0))
    dist = float(c.get("distance_m") or radius_m)
    proximity = max(0.05, 1.0 - dist / max(1.0, float(radius_m)))
    return rating * math.log1p(reviews) * proximity


def select_pool(
    candidates: Sequence[Dict[str, Any]],
    *,
    radius_m: int,
    target: int = POOL_TARGET,
    max_n: int = POOL_MAX,
) -> List[Dict[str, Any]]:
    ranked = sorted(
        candidates,
        key=lambda c: score_candidate(c, radius_m),
        reverse=True,
    )
    out = ranked[: max_n]
    # assign pool_rank
    for i, c in enumerate(out[:target] if len(out) >= target else out, start=1):
        c["pool_rank"] = i
        c["pool_score"] = round(score_candidate(c, radius_m), 4)
    # if more than target kept for max, still rank them
    for i, c in enumerate(out, start=1):
        c["pool_rank"] = i
        c["pool_score"] = round(score_candidate(c, radius_m), 4)
    return out[:target] if len(out) > target else out


def mark_24h_reception(
    candidates: List[Dict[str, Any]],
    reception_facility_ids: Set[int],
) -> None:
    for c in candidates:
        fids = c.get("facility_ids") or []
        has = False
        for fid in fids:
            try:
                if int(fid) in reception_facility_ids:
                    has = True
                    break
            except (TypeError, ValueError):
                continue
        c["has_24h_reception"] = has


def fetch_hotels_in_radius(
    client: LiteApiClient,
    *,
    lat: float,
    lng: float,
    radius_m: int,
) -> List[Dict[str, Any]]:
    radius_m = max(1000, int(radius_m))
    all_hotels: List[Dict[str, Any]] = []
    offset = 0
    seen: Set[str] = set()
    while True:
        payload = client.list_hotels(
            latitude=lat,
            longitude=lng,
            radius=radius_m,
            offset=offset,
            limit=PAGE_LIMIT,
            # API-side prefilter (docs: rating e.g. 8.6 /10). Local filters still apply.
            min_rating=MIN_RATING_10,
            min_reviews_count=MIN_REVIEWS,
            star_rating="3.0,3.5,4.0,4.5",
        )
        page = extract_hotels_list(payload)
        if not page:
            break
        for h in page:
            hid = str(h.get("id") or h.get("hotelId") or "")
            if hid and hid not in seen:
                seen.add(hid)
                all_hotels.append(h)
        if len(page) < PAGE_LIMIT:
            break
        offset += PAGE_LIMIT
        if offset >= 5000:
            break
    return all_hotels


def build_pool_for_destination(
    client: LiteApiClient,
    dest: Dict[str, Any],
    *,
    excluded_type_ids: Set[int],
    reception_facility_ids: Set[int],
) -> Dict[str, Any]:
    base_radius = max(1000, int(dest.get("pool_radius_m") or 2000))
    center_lat = float(dest["center_lat"])
    center_lng = float(dest["center_lng"])
    radius = base_radius
    selected: List[Dict[str, Any]] = []
    raw_count = 0
    expands = 0

    for attempt in range(MAX_RADIUS_EXPAND + 1):
        hotels = fetch_hotels_in_radius(
            client, lat=center_lat, lng=center_lng, radius_m=radius
        )
        raw_count = len(hotels)
        candidates: List[Dict[str, Any]] = []
        for h in hotels:
            c = hotel_passes_filters(
                h,
                center_lat=center_lat,
                center_lng=center_lng,
                radius_m=radius,
                excluded_type_ids=excluded_type_ids,
            )
            if c:
                candidates.append(c)
        mark_24h_reception(candidates, reception_facility_ids)
        selected = select_pool(candidates, radius_m=radius)
        if len(selected) >= POOL_MIN:
            break
        if attempt < MAX_RADIUS_EXPAND:
            radius += RADIUS_STEP_M
            expands += 1
            logger.warning(
                "pool_expand slug=%s attempt=%s new_radius=%s candidates=%s",
                dest.get("slug"),
                attempt + 1,
                radius,
                len(candidates),
            )

    alert = len(selected) < POOL_MIN
    if alert:
        logger.warning(
            "pool_below_min slug=%s size=%s raw=%s radius=%s",
            dest.get("slug"),
            len(selected),
            raw_count,
            radius,
        )

    return {
        "slug": dest.get("slug"),
        "radius_m": radius,
        "radius_expands": expands,
        "raw_count": raw_count,
        "pool_size": len(selected),
        "alert_below_min": alert,
        "hotels": selected,
    }


def _load_ref_maps(client: LiteApiClient) -> Tuple[Set[int], Set[int]]:
    excluded: Set[int] = set()
    reception: Set[int] = set()
    try:
        types_payload = client.list_hotel_types()
        types = extract_hotels_list(types_payload)  # same data[] shape
        if not types and isinstance(types_payload, dict):
            data = types_payload.get("data")
            if isinstance(data, list):
                types = [t for t in data if isinstance(t, dict)]
        excluded = build_excluded_type_ids(types)
        logger.info("hotel_types_excluded=%s", sorted(excluded)[:20])
    except LiteApiError as e:
        logger.warning("hotel_types_unavailable: %s — using name heuristics only", e)

    try:
        fac_payload = client.list_facilities()
        facs: List[Dict[str, Any]] = []
        if isinstance(fac_payload, dict) and isinstance(fac_payload.get("data"), list):
            facs = [f for f in fac_payload["data"] if isinstance(f, dict)]
        reception = build_reception_24h_facility_ids(facs)
        logger.info("reception_24h_facility_ids=%s", sorted(reception)[:10])
    except LiteApiError as e:
        logger.warning("facilities_unavailable: %s", e)
    except Exception as e:
        logger.warning("facilities_error: %s", e)

    return excluded, reception


def upsert_destinations(supabase: Any) -> List[Dict[str, Any]]:
    rows = destination_upsert_rows()
    result = (
        supabase.table("deal_destinations")
        .upsert(rows, on_conflict="slug")
        .execute()
    )
    data = list(result.data or [])
    if not data:
        # Some Supabase clients don't return rows on upsert — re-select
        sel = (
            supabase.table("deal_destinations")
            .select("*")
            .eq("active", True)
            .execute()
        )
        data = list(sel.data or [])
    return data


def replace_pool_rows(
    supabase: Any,
    destination_id: str,
    hotels: Sequence[Dict[str, Any]],
) -> int:
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("hotel_pool").delete().eq("destination_id", destination_id).execute()
    if not hotels:
        return 0
    rows = []
    for h in hotels:
        rows.append(
            {
                "destination_id": destination_id,
                "hotel_id": h["hotel_id"],
                "name": h.get("name"),
                "stars": h.get("stars"),
                "rating": h.get("rating"),
                "rating_scale": h.get("rating_scale") or 10,
                "review_count": h.get("review_count") or 0,
                "lat": h.get("lat"),
                "lng": h.get("lng"),
                "distance_m": h.get("distance_m"),
                "hotel_type": h.get("hotel_type"),
                "has_24h_reception": bool(h.get("has_24h_reception")),
                "main_photo": h.get("main_photo"),
                "thumbnail": h.get("thumbnail"),
                "address": h.get("address"),
                "raw": {
                    "hotel_type_id": h.get("hotel_type_id"),
                    "facility_ids": h.get("facility_ids"),
                    "pool_score": h.get("pool_score"),
                },
                "pool_rank": h.get("pool_rank") or 0,
                "refreshed_at": now,
            }
        )
    # batch insert (Supabase ~1000 row limit — we have ≤50)
    supabase.table("hotel_pool").insert(rows).execute()
    return len(rows)


def bootstrap_hotel_pools(
    supabase: Any,
    *,
    client: Optional[LiteApiClient] = None,
    cfg: Optional[DealsConfig] = None,
    slugs: Optional[Sequence[str]] = None,
) -> Dict[str, Any]:
    """
    Upsert seed destinations, then rebuild hotel_pool for each active destination.
    """
    cfg = cfg or load_deals_config()
    owns = client is None
    client = client or LiteApiClient(cfg=cfg)
    if not cfg.api_key:
        raise LiteApiError(
            "LiteAPI API key required for bootstrap_hotel_pools "
            "(set LITEAPI_API_KEY_SANDBOX or _PROD)"
        )

    try:
        destinations = upsert_destinations(supabase)
        by_slug = {d["slug"]: d for d in destinations if d.get("slug")}
        # Ensure seed order / all seed slugs present
        target_slugs = [d["slug"] for d in DESTINATIONS_SEED]
        if slugs:
            want = {s.strip().lower() for s in slugs}
            target_slugs = [s for s in target_slugs if s in want]

        excluded, reception = _load_ref_maps(client)
        results = []
        for slug in target_slugs:
            dest = by_slug.get(slug)
            if not dest:
                # merge seed coords if select missed fields
                seed = next((s for s in DESTINATIONS_SEED if s["slug"] == slug), None)
                if not seed:
                    continue
                logger.warning("destination_missing_after_upsert slug=%s", slug)
                results.append({"slug": slug, "error": "destination_not_found"})
                continue

            seed = next((s for s in DESTINATIONS_SEED if s["slug"] == slug), {})
            dest_full = {**seed, **dest}

            try:
                built = build_pool_for_destination(
                    client,
                    dest_full,
                    excluded_type_ids=excluded,
                    reception_facility_ids=reception,
                )
                n = replace_pool_rows(supabase, dest["id"], built["hotels"])
                results.append(
                    {
                        "slug": slug,
                        "destination_id": dest["id"],
                        "pool_size": n,
                        "raw_count": built["raw_count"],
                        "radius_m": built["radius_m"],
                        "radius_expands": built["radius_expands"],
                        "alert_below_min": built["alert_below_min"],
                        "status": "ok" if n >= POOL_MIN else "below_min",
                    }
                )
                logger.info(
                    "pool_done slug=%s size=%s raw=%s radius=%s",
                    slug,
                    n,
                    built["raw_count"],
                    built["radius_m"],
                )
            except Exception as e:
                logger.exception("pool_failed slug=%s", slug)
                results.append({"slug": slug, "error": str(e), "status": "error"})

        ok = sum(1 for r in results if r.get("status") == "ok")
        return {
            "destinations": len(target_slugs),
            "ok": ok,
            "below_min": sum(1 for r in results if r.get("status") == "below_min"),
            "errors": sum(1 for r in results if r.get("status") == "error"),
            "results": results,
        }
    finally:
        if owns:
            client.close()
