"""
Hotel upsell for Search / Planner / MyTrip compose (§9.4).

Séjours / Search prefetch: catalogue + fenêtre → hotel_rates_cache (0 LiteAPI).
Miss : job on-demand → peut écrire hotel_rates_cache (FREE window).

MyTrip compose (live=True): toujours LiteAPI (ignore le cache en lecture).
Après succès, écrit hotel_rates_cache pour que le reload /trip?compose=1
puisse réafficher via lookup si LiteAPI/rate-limit échoue.
"""
from __future__ import annotations

import logging
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from deals.hotel_scoring import build_candidates
from deals.liteapi_client import LiteApiClient, LiteApiError
from deals.liteapi_config import load_deals_config

logger = logging.getLogger("deals.upsell")

UPSELL_TTL = timedelta(hours=3)
# Rate-limit: max fetches started per user (or anon bucket) per window
RATE_LIMIT_MAX = 20
RATE_LIMIT_WINDOW_S = 3600

_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = threading.Lock()
_rate: Dict[str, List[float]] = {}
_rate_lock = threading.Lock()
# Single worker: hotel work never saturates CPU/network vs flight Search
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="upsell")


def _yield_to_search() -> None:
    try:
        from search_priority import wait_while_search_busy

        wait_while_search_busy()
    except Exception:
        pass


def rooms_for_participants(participants: int) -> Tuple[int, int]:
    """
    Occupancy « par chambre de 2 ».
    Returns (rooms, adults_per_rate_lookup) — rate cache keyed by 1 or 2 adults.
    """
    n = max(1, int(participants or 1))
    rooms = (n + 1) // 2
    adults_lookup = 1 if n == 1 else 2
    return rooms, adults_lookup


def hotel_pp_from_public(
    public_hotel_one_room: float,
    *,
    participants: int,
) -> float:
    rooms, _ = rooms_for_participants(participants)
    n = max(1, int(participants or 1))
    total = float(public_hotel_one_room) * rooms
    return round(total / n, 2)


def _parse_ymd(raw: str) -> Optional[date]:
    if not raw:
        return None
    try:
        return date.fromisoformat(str(raw)[:10])
    except ValueError:
        return None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _is_fresh(expires_at: Any) -> bool:
    if not expires_at:
        return False
    try:
        exp = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        return _now() < exp
    except ValueError:
        return False


def _stale_grace_hours(default: float = 24.0) -> float:
    """v3.3 Lot C: cap stale rates (was 72h — too wide)."""
    import os

    try:
        return max(0.0, float(os.getenv("DEALS_RATES_STALE_GRACE_H", str(default))))
    except (TypeError, ValueError):
        return default


def _rates_still_usable(
    row: Dict[str, Any], *, grace_hours: Optional[float] = None
) -> bool:
    """
    Browse continuity: serve ok rates a bit after expires_at so the wall
    doesn't go empty when the refresh job lags.
    Beyond grace → miss (caller may show flight-only / indicative night).
    """
    grace = _stale_grace_hours() if grace_hours is None else float(grace_hours)
    if _is_fresh(row.get("expires_at")):
        return True
    if (row.get("status") or "") != "ok":
        return False
    top = row.get("top")
    if not isinstance(top, list) or not top:
        return False
    # Age since expiry (not since fetch) — honest 24h post-TTL window
    exp = row.get("expires_at")
    if not exp:
        return False
    try:
        dt = datetime.fromisoformat(str(exp).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        past_h = (_now() - dt).total_seconds() / 3600.0
        return 0 <= past_h <= grace
    except ValueError:
        return False


def find_destination_by_iata(supabase: Any, iata: str) -> Optional[Dict[str, Any]]:
    """
    Arrival IATA → hotel catalogue destination via served city
    (FCO/CIA → Rome). Prefer resolve_hotel_destination for full meta.
    """
    from deals.city_mapping import resolve_hotel_destination

    resolved = resolve_hotel_destination(supabase, iata=iata)
    if not resolved:
        return None
    dest = resolved.get("destination")
    if not isinstance(dest, dict):
        return None
    # Ensure city label / served_city_id visible to callers
    out = dict(dest)
    if resolved.get("city_name"):
        out["city_name"] = resolved["city_name"]
    if resolved.get("served_city_id") and not out.get("served_city_id"):
        out["served_city_id"] = resolved["served_city_id"]
    return out


def _pool_size(supabase: Any, destination_id: str) -> int:
    if not supabase or not destination_id:
        return 0
    try:
        res = (
            supabase.table("hotel_pool")
            .select("hotel_id", count="exact")
            .eq("destination_id", destination_id)
            .limit(1)
            .execute()
        )
        if getattr(res, "count", None) is not None:
            return int(res.count or 0)
        return len(res.data or [])
    except Exception:
        try:
            res = (
                supabase.table("hotel_pool")
                .select("hotel_id")
                .eq("destination_id", destination_id)
                .limit(5)
                .execute()
            )
            return len(res.data or [])
        except Exception:
            return 0


def _insert_destination_for_iata(
    supabase: Any,
    *,
    iata: str,
    city: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Create a minimal deal_destinations row from served city / CITY_FR."""
    from deals.airport_tz import tz_for_iata
    from deals.city_mapping import _slugify, resolve_served_city
    from city_names_fr import city_for_code, country_for_code

    code = (iata or "").strip().upper()
    if len(code) != 3:
        return None

    served = resolve_served_city(supabase, code, require_verified=False)
    city_name = (
        (city or "").strip()
        or (served or {}).get("city_name")
        or city_for_code(code, code)
    )
    slug = _slugify(str(city_name))
    country = (
        (served or {}).get("country_code")
        or country_for_code(code, "")
        or ""
    ).upper()
    lat = (served or {}).get("center_lat")
    lng = (served or {}).get("center_lng")
    tz = (served or {}).get("timezone") or tz_for_iata(code) or "Europe/Paris"
    primary = ((served or {}).get("primary_iata") or code).upper()
    served_id = (served or {}).get("served_city_id")

    row: Dict[str, Any] = {
        "slug": slug,
        "city_name": city_name,
        "country_code": country or "",
        "iata_arrival": primary,
        "center_lat": lat,
        "center_lng": lng,
        "pool_radius_m": 2500,
        "timezone": tz,
        "priority": 900,
        "active": True,
    }
    if served_id:
        row["served_city_id"] = served_id

    try:
        # Prefer existing slug / iata
        existing = (
            supabase.table("deal_destinations")
            .select("*")
            .eq("slug", slug)
            .limit(1)
            .execute()
        )
        if existing.data:
            return existing.data[0]
        exact = (
            supabase.table("deal_destinations")
            .select("*")
            .eq("iata_arrival", primary)
            .eq("active", True)
            .limit(1)
            .execute()
        )
        if exact.data:
            return exact.data[0]

        ins = supabase.table("deal_destinations").insert(row).execute()
        if ins.data:
            return ins.data[0]
        # re-select
        again = (
            supabase.table("deal_destinations")
            .select("*")
            .eq("slug", slug)
            .limit(1)
            .execute()
        )
        return (again.data or [None])[0]
    except Exception as e:
        logger.warning("insert destination %s: %s", code, e)
        return None


def _bootstrap_pool_for_dest(supabase: Any, dest: Dict[str, Any]) -> int:
    """LiteAPI list → hotel_pool for one destination (quick, upsell path)."""
    _yield_to_search()
    cfg = load_deals_config()
    if not cfg.api_key:
        logger.warning("bootstrap pool skipped: no LiteAPI key")
        return 0
    client = LiteApiClient(cfg=cfg)
    try:
        from deals.hotel_pool import (
            _load_ref_maps,
            build_pool_for_destination,
            extract_hotels_list,
            hotel_passes_filters,
            mark_24h_reception,
            replace_pool_rows,
            select_pool,
        )

        lat = dest.get("center_lat")
        lng = dest.get("center_lng")
        excluded, reception = _load_ref_maps(client)

        if lat is not None and lng is not None:
            built = build_pool_for_destination(
                client,
                dest,
                excluded_type_ids=excluded,
                reception_facility_ids=reception,
            )
            return replace_pool_rows(supabase, dest["id"], built["hotels"])

        # No coords — list by city name, infer center from hotels
        city = (dest.get("city_name") or "").strip()
        country = (dest.get("country_code") or "").strip() or None
        if not city:
            return 0
        payload = client.list_hotels(
            city_name=city,
            country_code=country,
            limit=80,
            min_rating=7.5,
            min_reviews_count=30,
            star_rating="3.0,3.5,4.0,4.5",
        )
        raw = extract_hotels_list(payload)
        if not raw:
            return 0
        # Median-ish center from first hotels with coords
        coords: List[Tuple[float, float]] = []
        for h in raw:
            try:
                hlat = float(h.get("latitude") if h.get("latitude") is not None else h.get("lat"))
                hlng = float(h.get("longitude") if h.get("longitude") is not None else h.get("lng"))
                coords.append((hlat, hlng))
            except (TypeError, ValueError):
                continue
        if not coords:
            return 0
        center_lat = sum(c[0] for c in coords) / len(coords)
        center_lng = sum(c[1] for c in coords) / len(coords)
        radius = int(dest.get("pool_radius_m") or 3000)
        candidates = []
        for h in raw:
            c = hotel_passes_filters(
                h,
                center_lat=center_lat,
                center_lng=center_lng,
                radius_m=radius * 2,
                excluded_type_ids=excluded,
            )
            if c:
                candidates.append(c)
        mark_24h_reception(candidates, reception)
        selected = select_pool(candidates, radius_m=radius * 2, target=30, max_n=40)
        # Persist inferred center for next time
        try:
            supabase.table("deal_destinations").update(
                {"center_lat": center_lat, "center_lng": center_lng}
            ).eq("id", dest["id"]).execute()
        except Exception:
            pass
        return replace_pool_rows(supabase, dest["id"], selected)
    except Exception as e:
        logger.warning("bootstrap pool dest=%s: %s", dest.get("slug") or dest.get("id"), e)
        return 0
    finally:
        try:
            client.close()
        except Exception:
            pass


def ensure_destination_with_pool(
    supabase: Any,
    *,
    iata: str,
    city: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Resolve or create deal_destinations for arrival IATA, ensure hotel_pool
    has at least one hotel. Used when Search destination is outside seed catalogue.
    """
    from deals.city_mapping import resolve_hotel_destination

    code = (iata or "").strip().upper()
    if len(code) != 3 or not supabase:
        return None

    resolved = resolve_hotel_destination(supabase, iata=code, city=city)
    dest = resolved.get("destination") if resolved else None
    if not dest:
        dest = _insert_destination_for_iata(supabase, iata=code, city=city)
    if not dest or not dest.get("id"):
        return None

    if _pool_size(supabase, str(dest["id"])) > 0:
        return dest

    n = _bootstrap_pool_for_dest(supabase, dest)
    logger.info(
        "ensure_destination_with_pool iata=%s slug=%s pool=%s",
        code,
        dest.get("slug"),
        n,
    )
    return dest if n > 0 else dest


def find_window_by_dates(
    supabase: Any, checkin: date, checkout: date
) -> Optional[Dict[str, Any]]:
    r = (
        supabase.table("deal_windows")
        .select("*")
        .eq("checkin", checkin.isoformat())
        .eq("checkout", checkout.isoformat())
        .limit(1)
        .execute()
    )
    return (r.data or [None])[0]


def _top_public(top: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(top, list) or not top:
        return None
    first = top[0]
    if not isinstance(first, dict):
        return None
    price = first.get("public_hotel_price")
    if price is None:
        price = first.get("public_price")
    try:
        public = float(price)
    except (TypeError, ValueError):
        return None
    if public <= 0:
        return None
    hid = first.get("hotel_id") or first.get("id")
    photo = first.get("photo") or first.get("thumbnail") or first.get("main_photo")
    return {
        "hotel_id": hid,
        "id": str(hid) if hid is not None else "",
        "name": first.get("name"),
        "public_hotel_price": public,
        "board": first.get("board") or first.get("board_name"),
        "stars": first.get("stars"),
        "rating": first.get("rating"),
        "distance_m": first.get("distance_m"),
        "station_name": first.get("station_name"),
        "station_distance_m": first.get("station_distance_m"),
        "stations": first.get("stations"),
        "photo": photo,
        "thumbnail": first.get("thumbnail") or photo,
        "main_photo": first.get("main_photo") or photo,
        "refundable": bool(first.get("refundable")),
        "excluded_fees": first.get("excluded_fees") or 0,
    }


def _normalize_top_list(top: Any) -> List[Dict[str, Any]]:
    if not isinstance(top, list):
        return []
    out: List[Dict[str, Any]] = []
    for item in top:
        if not isinstance(item, dict):
            continue
        offer = _top_public([item])
        if offer:
            out.append(
                {
                    **offer,
                    "rating": item.get("rating") if item.get("rating") is not None else offer.get("rating"),
                    "review_count": item.get("review_count"),
                    "score": item.get("score"),
                }
            )
    return out


def _rates_row_to_lookup(row: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not _rates_still_usable(row):
        return None
    top_list = _normalize_top_list(row.get("top"))
    offer = top_list[0] if top_list else _top_public(row.get("top"))
    if not offer:
        return None
    stale = not _is_fresh(row.get("expires_at"))
    return {
        "offer": offer,
        "top": top_list or [offer],
        "fetched_at": row.get("fetched_at"),
        "expires_at": row.get("expires_at"),
        "source": "rates_cache_stale" if stale else "rates_cache",
    }


def read_rates_cache(
    supabase: Any,
    *,
    destination_id: str,
    window_id: str,
    adults: int,
) -> Optional[Dict[str, Any]]:
    r = (
        supabase.table("hotel_rates_cache")
        .select("top,status,expires_at,fetched_at")
        .eq("destination_id", destination_id)
        .eq("window_id", window_id)
        .eq("adults", adults)
        .eq("status", "ok")
        .limit(1)
        .execute()
    )
    rows = r.data or []
    if not rows:
        return None
    return _rates_row_to_lookup(rows[0])


def read_rates_cache_by_dates(
    supabase: Any,
    *,
    destination_id: str,
    checkin: date,
    checkout: date,
    adults: int,
) -> Optional[Dict[str, Any]]:
    """Fallback when deal_windows row is missing for these exact dates."""
    r = (
        supabase.table("hotel_rates_cache")
        .select("top,status,expires_at,fetched_at")
        .eq("destination_id", destination_id)
        .eq("checkin", checkin.isoformat())
        .eq("checkout", checkout.isoformat())
        .eq("adults", adults)
        .eq("status", "ok")
        .limit(1)
        .execute()
    )
    rows = r.data or []
    if not rows:
        return None
    return _rates_row_to_lookup(rows[0])


def read_upsell_cache(
    supabase: Any,
    *,
    destination_id: str,
    checkin: date,
    checkout: date,
    adults: int,
) -> Optional[Dict[str, Any]]:
    """hotel_upsell_cache retired — use rates_cache + in-memory jobs."""
    return None


def _ready_with_options(
    base: Dict[str, Any],
    *,
    offer: Dict[str, Any],
    top: Optional[List[Dict[str, Any]]],
    flight_pp: Optional[float],
    participants: int,
    extras: Dict[str, Any],
) -> Dict[str, Any]:
    from deals.hotel_budget import filter_hotels_for_city, hotel_pp_of, nights_between

    candidates = list(top or [])
    if offer and offer not in candidates:
        candidates = [offer] + [
            c for c in candidates if c.get("hotel_id") != offer.get("hotel_id")
        ]
    checkin = base.get("checkin")
    checkout = base.get("checkout")
    nights = nights_between(
        str(checkin) if checkin else None,
        str(checkout) if checkout else None,
    )
    options, meta = filter_hotels_for_city(
        candidates,
        adults=participants,
        nights=nights,
        tier="confort",
        sort="value",
        top_n=8,
        require_photo=True,
    )
    try:
        from deals.stations import enrich_hotels_with_stations, stations_for

        stns = stations_for(city=base.get("city"), iata=base.get("iata"))
        if stns:
            options = enrich_hotels_with_stations(options, stns, top_n=2)
    except Exception:
        pass
    primary = options[0] if options else None
    public = float((primary or offer).get("public_hotel_price") or 0)
    hotel_pp = hotel_pp_of(primary or offer, adults=participants)
    if hotel_pp is None and public > 0:
        hotel_pp = hotel_pp_from_public(public, participants=participants)
    out = {
        **base,
        **extras,
        "status": "ready" if primary else "miss",
        "hotel_pp": hotel_pp,
        "hotel_public_total_one_room": public if primary else None,
        "hotel": primary,
        "hotel_name": (primary or {}).get("name"),
        "hotel_id": (primary or {}).get("hotel_id"),
        "options": options,
        "max_hotel_pp": meta.get("night_cap"),  # night € cap (confort), not flight×
        "night_cap": meta.get("night_cap"),
        "median_night": meta.get("median_night"),
        "tier": meta.get("tier"),
        "nights": nights,
    }
    if not primary:
        out["reason"] = "no_hotel_in_city_tier"
    return out


def lookup_upsell(
    supabase: Any,
    *,
    iata: str,
    checkin: str,
    checkout: str,
    participants: int = 2,
    flight_pp: Optional[float] = None,
    city: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Cache-only lookup. Never calls LiteAPI.
    status: ready | miss | pending | unavailable
    When flight_pp set, options filtered to hotel_pp <= 2.5× flight_pp, ranked by rating.
    """
    cin = _parse_ymd(checkin)
    cout = _parse_ymd(checkout)
    base = {
        "iata": (iata or "").upper(),
        "checkin": checkin[:10] if checkin else None,
        "checkout": checkout[:10] if checkout else None,
        "participants": max(1, int(participants or 1)),
        "flight_pp": float(flight_pp) if flight_pp is not None else None,
    }
    if not cin or not cout or cout <= cin:
        return {**base, "status": "unavailable", "reason": "bad_dates"}

    from deals.city_mapping import resolve_hotel_destination

    resolved = resolve_hotel_destination(supabase, iata=iata, city=city)
    dest = resolved.get("destination") if resolved else None
    if not dest:
        return {**base, "status": "unavailable", "reason": "not_in_catalogue"}

    city_label = (resolved or {}).get("city_name") or dest.get("city_name") or city
    served_city_id = (resolved or {}).get("served_city_id") or dest.get("served_city_id")
    base["city"] = city_label
    base["served_city_id"] = served_city_id

    rooms, adults = rooms_for_participants(participants)
    window = find_window_by_dates(supabase, cin, cout)

    if window:
        cached = read_rates_cache(
            supabase,
            destination_id=dest["id"],
            window_id=window["id"],
            adults=adults,
        )
        if cached:
            return _ready_with_options(
                base,
                offer=cached["offer"],
                top=cached.get("top"),
                flight_pp=flight_pp,
                participants=participants,
                extras={
                    "mode": "canonical",
                    "destination_id": dest["id"],
                    "destination_slug": dest.get("slug"),
                    "city": city_label,
                    "served_city_id": served_city_id,
                    "window_id": window["id"],
                    "window_kind": window.get("kind"),
                    "adults_lookup": adults,
                    "rooms": rooms,
                    "source": cached["source"],
                    "fetched_at": cached.get("fetched_at"),
                    "expires_at": cached.get("expires_at"),
                },
            )

    # Soft-fill / odd dates: rates keyed by checkin/checkout without deal_windows
    by_dates = read_rates_cache_by_dates(
        supabase,
        destination_id=dest["id"],
        checkin=cin,
        checkout=cout,
        adults=adults,
    )
    if by_dates:
        return _ready_with_options(
            base,
            offer=by_dates["offer"],
            top=by_dates.get("top"),
            flight_pp=flight_pp,
            participants=participants,
            extras={
                "mode": "rates_by_dates",
                "destination_id": dest["id"],
                "destination_slug": dest.get("slug"),
                "city": city_label,
                "served_city_id": served_city_id,
                "window_id": window["id"] if window else None,
                "window_kind": window.get("kind") if window else None,
                "adults_lookup": adults,
                "rooms": rooms,
                "source": by_dates["source"],
                "fetched_at": by_dates.get("fetched_at"),
                "expires_at": by_dates.get("expires_at"),
            },
        )

    ondemand = read_upsell_cache(
        supabase,
        destination_id=dest["id"],
        checkin=cin,
        checkout=cout,
        adults=adults,
    )
    if ondemand and ondemand.get("status") == "ready":
        offer = ondemand["offer"]
        top_od = ondemand.get("top") or [offer]
        return _ready_with_options(
            base,
            offer=offer,
            top=top_od if isinstance(top_od, list) else [offer],
            flight_pp=flight_pp,
            participants=participants,
            extras={
                "mode": "ondemand",
                "destination_id": dest["id"],
                "destination_slug": dest.get("slug"),
                "city": city_label,
                "served_city_id": served_city_id,
                "window_id": window["id"] if window else None,
                "window_kind": window.get("kind") if window else None,
                "adults_lookup": adults,
                "rooms": rooms,
                "source": ondemand["source"],
                "fetched_at": ondemand.get("fetched_at"),
                "expires_at": ondemand.get("expires_at"),
            },
        )
    if ondemand and ondemand.get("status") == "pending":
        return {
            **base,
            "status": "pending",
            "mode": "ondemand",
            "destination_id": dest["id"],
            "destination_slug": dest.get("slug"),
            "city": city_label,
            "served_city_id": served_city_id,
            "adults_lookup": adults,
            "rooms": rooms,
            "reason": "fetch_in_progress",
        }
    if ondemand and ondemand.get("status") in ("no_rates", "error"):
        return {
            **base,
            "status": "unavailable",
            "mode": "ondemand",
            "destination_id": dest["id"],
            "city": city_label,
            "served_city_id": served_city_id,
            "reason": ondemand.get("status"),
        }

    return {
        **base,
        "status": "miss",
        "mode": "canonical" if window else "ondemand",
        "destination_id": dest["id"],
        "destination_slug": dest.get("slug"),
        "city": city_label,
        "served_city_id": served_city_id,
        "window_id": window["id"] if window else None,
        "window_kind": window.get("kind") if window else None,
        "adults_lookup": adults,
        "rooms": rooms,
        "reason": "cache_miss" if window else "non_canonical_dates",
    }


def check_rate_limit(bucket: str) -> bool:
    """True if allowed to start a new fetch."""
    now = time.time()
    with _rate_lock:
        stamps = [t for t in _rate.get(bucket, []) if now - t < RATE_LIMIT_WINDOW_S]
        if len(stamps) >= RATE_LIMIT_MAX:
            _rate[bucket] = stamps
            return False
        stamps.append(now)
        _rate[bucket] = stamps
        return True


def _mark_upsell_row(
    supabase: Any,
    *,
    destination_id: str,
    checkin: date,
    checkout: date,
    adults: int,
    status: str,
    offer: Optional[Dict[str, Any]] = None,
    top: Optional[List[Dict[str, Any]]] = None,
    error: Optional[str] = None,
) -> None:
    """
    v3.3: persist on-demand rates into hotel_rates_cache via FREE windows
    (hotel_upsell_cache was dropped).
    """
    if not supabase:
        return
    try:
        from deals.refresh_deal_rates import free_window
        from deals.ttl import expires_at_for
        from deals.windows import upsert_windows

        w = free_window(checkin, checkout)
        upsert_windows(supabase, [w])
        top_list: List[Dict[str, Any]] = []
        if isinstance(top, list) and top:
            top_list = [x for x in top if isinstance(x, dict)]
        elif isinstance(offer, dict):
            top_list = [offer]
        now = _now().isoformat()
        # Map job status → rates cache status
        cache_status = "ok" if status in ("ok", "ready") and top_list else (
            "no_rates" if status in ("no_rates", "ok", "ready") else "error"
        )
        if status == "pending":
            return  # don't clobber with empty pending rows
        supabase.table("hotel_rates_cache").upsert(
            {
                "destination_id": destination_id,
                "window_id": w["id"],
                "checkin": checkin.isoformat(),
                "checkout": checkout.isoformat(),
                "adults": adults,
                "top": top_list,
                "pool_size_requested": len(top_list),
                "hotels_returned": len(top_list),
                "fetched_at": now,
                "expires_at": expires_at_for(checkin.isoformat()).isoformat(),
                "status": cache_status,
            },
            on_conflict="destination_id,window_id,adults",
        ).execute()
        if error and cache_status == "error":
            logger.info("FREE rates error dest=%s: %s", destination_id, error)
    except Exception as e:
        logger.warning("persist FREE rates failed: %s", e)


def _run_fetch_job(
    job_id: str,
    *,
    destination_id: Optional[str],
    checkin: date,
    checkout: date,
    adults: int,
    flight_pp: Optional[float] = None,
    iata: Optional[str] = None,
    city: Optional[str] = None,
    persist_cache: bool = True,
) -> None:
    # Flight Search first — pause hotel LiteAPI while inspire/scan runs
    _yield_to_search()

    with _jobs_lock:
        job = _jobs.get(job_id) or {}
        job["status"] = "running"
        _jobs[job_id] = job

    from supabase_deps import get_supabase_service_client, get_supabase_client

    supabase = get_supabase_service_client() or get_supabase_client()
    cfg = load_deals_config()
    client = LiteApiClient(cfg=cfg)
    try:
        if not supabase:
            raise LiteApiError("Supabase unavailable")
        if not cfg.api_key:
            raise LiteApiError("LiteAPI key missing")

        dest = None
        if destination_id:
            dest_r = (
                supabase.table("deal_destinations")
                .select("*")
                .eq("id", destination_id)
                .limit(1)
                .execute()
            )
            dest = (dest_r.data or [None])[0]
        if not dest and iata:
            _yield_to_search()
            dest = ensure_destination_with_pool(supabase, iata=iata, city=city)
            if dest:
                destination_id = str(dest["id"])
                with _jobs_lock:
                    cur = _jobs.get(job_id) or {}
                    cur["destination_id"] = destination_id
                    _jobs[job_id] = cur
        if not dest or not destination_id:
            raise LiteApiError("destination missing")

        _yield_to_search()
        pool = (
            supabase.table("hotel_pool")
            .select("*")
            .eq("destination_id", destination_id)
            .order("pool_rank")
            .execute()
        )
        pool_rows = list(pool.data or [])
        hotel_ids = [str(h["hotel_id"]) for h in pool_rows if h.get("hotel_id")]
        if not hotel_ids:
            # First-time Search destination: build pool then re-read
            n = _bootstrap_pool_for_dest(supabase, dest)
            if n > 0:
                pool = (
                    supabase.table("hotel_pool")
                    .select("*")
                    .eq("destination_id", destination_id)
                    .order("pool_rank")
                    .execute()
                )
                pool_rows = list(pool.data or [])
                hotel_ids = [str(h["hotel_id"]) for h in pool_rows if h.get("hotel_id")]
        if not hotel_ids:
            if persist_cache:
                _mark_upsell_row(
                    supabase,
                    destination_id=destination_id,
                    checkin=checkin,
                    checkout=checkout,
                    adults=adults,
                    status="no_rates",
                    error="empty_pool",
                )
            with _jobs_lock:
                _jobs[job_id] = {
                    **(_jobs.get(job_id) or {}),
                    "status": "no_rates",
                    "done": True,
                    "reason": "empty_pool",
                }
            return

        pool_map = {str(h["hotel_id"]): h for h in pool_rows if h.get("hotel_id")}
        _yield_to_search()
        body = {
            "hotelIds": hotel_ids,
            "checkin": checkin.isoformat(),
            "checkout": checkout.isoformat(),
            "occupancies": [{"adults": adults}],
            "currency": cfg.currency,
            "guestNationality": cfg.guest_nationality,
            "maxRatesPerHotel": 1,
            "timeout": int(cfg.timeout_s),
        }
        raw = client.hotels_rates(body, timeout=cfg.timeout_s)
        cands = build_candidates(
            raw,
            pool_map,
            pool_radius_m=int(dest.get("pool_radius_m") or 2000),
            adults=adults,
            late_arrival=False,
            weights=cfg.score_weights,
            top_n=12,
        )
        try:
            from deals.stations import enrich_hotels_with_stations, stations_for

            stns = stations_for(
                city=(dest or {}).get("city_name") or city,
                iata=(iata or (dest or {}).get("iata_arrival")),
            )
            if stns:
                cands = enrich_hotels_with_stations(cands, stns, top_n=2)
        except Exception as e:
            logger.warning("station enrich skip: %s", e)
        if not cands:
            if persist_cache:
                _mark_upsell_row(
                    supabase,
                    destination_id=destination_id,
                    checkin=checkin,
                    checkout=checkout,
                    adults=adults,
                    status="no_rates",
                )
            with _jobs_lock:
                _jobs[job_id] = {
                    **(_jobs.get(job_id) or {}),
                    "status": "no_rates",
                    "done": True,
                }
            return

        participants = int((_jobs.get(job_id) or {}).get("participants") or adults)
        job_flight_pp = flight_pp
        if job_flight_pp is None:
            try:
                job_flight_pp = (_jobs.get(job_id) or {}).get("flight_pp")
            except Exception:
                job_flight_pp = None
        from deals.hotel_budget import filter_hotels_for_city, nights_between

        nights = nights_between(checkin.isoformat(), checkout.isoformat())
        options, meta = filter_hotels_for_city(
            cands,
            adults=participants,
            nights=nights,
            tier="confort",
            sort="value",
            top_n=8,
            require_photo=True,
        )
        offer = options[0] if options else None
        # Persist so compose reload can lookup (live path still skips cache on read)
        if persist_cache:
            _mark_upsell_row(
                supabase,
                destination_id=destination_id,
                checkin=checkin,
                checkout=checkout,
                adults=adults,
                status="ok" if offer else "no_rates",
                offer=offer,
                top=options or cands[:8],
            )
        with _jobs_lock:
            _jobs[job_id] = {
                **(_jobs.get(job_id) or {}),
                "status": "ready" if options else "no_rates",
                "done": True,
                "hotel_pp": (options[0].get("hotel_pp") if options else None),
                "hotel_name": (options[0].get("name") if options else None),
                "hotel_id": (options[0].get("hotel_id") if options else None),
                "options": options,
                "max_hotel_pp": meta.get("night_cap"),
                "night_cap": meta.get("night_cap"),
                "median_night": meta.get("median_night"),
                "tier": meta.get("tier"),
                "nights": nights,
                "live": bool((_jobs.get(job_id) or {}).get("live")),
            }
    except Exception as e:
        logger.warning("upsell_fetch_fail job=%s: %s", job_id, e)
        try:
            if supabase and persist_cache:
                _mark_upsell_row(
                    supabase,
                    destination_id=destination_id,
                    checkin=checkin,
                    checkout=checkout,
                    adults=adults,
                    status="error",
                    error=str(e)[:200],
                )
        except Exception:
            pass
        with _jobs_lock:
            _jobs[job_id] = {
                **(_jobs.get(job_id) or {}),
                "status": "error",
                "done": True,
                "error": str(e)[:200],
            }
    finally:
        client.close()


def start_upsell_fetch(
    supabase: Any,
    *,
    iata: str,
    checkin: str,
    checkout: str,
    participants: int = 2,
    rate_bucket: str = "anon",
    flight_pp: Optional[float] = None,
    city: Optional[str] = None,
    live: bool = False,
) -> Dict[str, Any]:
    """
    Start async on-demand fetch if needed.

    live=True (MyTrip compose): always call LiteAPI, ignore hotel_rates_cache
    on read. Still persists the result so reload can serve via lookup.

    Never blocks on LiteAPI / pool bootstrap — that runs in the upsell worker
    and yields while a client flight Search is in flight.
    """
    cin = _parse_ymd(checkin)
    cout = _parse_ymd(checkout)
    base = {
        "iata": (iata or "").upper(),
        "checkin": checkin[:10] if checkin else None,
        "checkout": checkout[:10] if checkout else None,
        "participants": max(1, int(participants or 1)),
        "flight_pp": float(flight_pp) if flight_pp is not None else None,
        "city": city,
        "live": bool(live),
    }
    if not cin or not cout or cout <= cin:
        return {**base, "status": "unavailable", "reason": "bad_dates"}

    looked: Dict[str, Any]
    if live:
        # Do not read rates cache — resolve dest id only for the job
        dest = find_destination_by_iata(supabase, iata)
        looked = {
            **base,
            "status": "miss",
            "reason": "live_compose",
            "destination_id": dest["id"] if dest else None,
            "destination_slug": dest.get("slug") if dest else None,
            "city": (dest or {}).get("city_name") or city,
        }
    else:
        looked = lookup_upsell(
            supabase,
            iata=iata,
            checkin=checkin,
            checkout=checkout,
            participants=participants,
            flight_pp=flight_pp,
            city=city,
        )
        if looked.get("status") == "ready":
            return {**looked, "job_id": None, "live": False}
        if looked.get("status") == "unavailable" and looked.get("reason") == "bad_dates":
            return looked
        # Already pending in DB (non-live path)
        if looked.get("status") == "pending":
            return {**looked, "job_id": None}

    _, adults = rooms_for_participants(participants)

    if not check_rate_limit(rate_bucket):
        return {
            **looked,
            "status": "rate_limited",
            "reason": "too_many_fetches",
        }

    dest_id = looked.get("destination_id")
    if not dest_id:
        dest = find_destination_by_iata(supabase, iata)
        if dest:
            dest_id = dest["id"]

    # Outside catalogue: still queue a job (ensure+pool in background)
    if (
        looked.get("status") == "unavailable"
        and looked.get("reason") == "not_in_catalogue"
        and not dest_id
    ):
        looked = {
            **looked,
            "status": "miss",
            "reason": "ensuring_catalogue",
        }

    # Mark pending in rates cache (incl. live) so concurrent lookups see progress
    if dest_id:
        _mark_upsell_row(
            supabase,
            destination_id=str(dest_id),
            checkin=cin,
            checkout=cout,
            adults=adults,
            status="pending",
        )

    job_id = str(uuid.uuid4())
    with _jobs_lock:
        _jobs[job_id] = {
            "id": job_id,
            "status": "queued",
            "done": False,
            "iata": (iata or "").upper(),
            "city": city,
            "checkin": cin.isoformat(),
            "checkout": cout.isoformat(),
            "participants": max(1, int(participants or 1)),
            "adults_lookup": adults,
            "destination_id": dest_id,
            "flight_pp": float(flight_pp) if flight_pp is not None else None,
            "live": bool(live),
        }

    _executor.submit(
        _run_fetch_job,
        job_id,
        destination_id=str(dest_id) if dest_id else None,
        checkin=cin,
        checkout=cout,
        adults=adults,
        flight_pp=float(flight_pp) if flight_pp is not None else None,
        iata=(iata or "").upper() or None,
        city=city,
        persist_cache=True,
    )
    return {
        **looked,
        "status": "pending",
        "job_id": job_id,
        "destination_id": dest_id,
        "adults_lookup": adults,
        "live": bool(live),
        "mode": "live" if live else looked.get("mode") or "ondemand",
    }


def get_upsell_job(job_id: str) -> Optional[Dict[str, Any]]:
    with _jobs_lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None


def batch_lookup(
    supabase: Any,
    items: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for item in items[:40]:
        fp = item.get("flight_pp")
        try:
            flight_pp = float(fp) if fp is not None else None
        except (TypeError, ValueError):
            flight_pp = None
        city = item.get("city")
        out.append(
            lookup_upsell(
                supabase,
                iata=str(item.get("iata") or ""),
                checkin=str(item.get("checkin") or ""),
                checkout=str(item.get("checkout") or ""),
                participants=int(item.get("participants") or 2),
                flight_pp=flight_pp,
                city=str(city) if city else None,
            )
        )
    return out
