"""
Hotel upsell for Search / Planner (§9.4).

Sync: catalogue + fenêtre canonique → hotel_rates_cache (0 LiteAPI).
Miss / dates hors fenêtre : job court → hotel_upsell_cache TTL 3 h.
Hors catalogue : unavailable (pas de job).
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
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="upsell")


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


def _rates_still_usable(row: Dict[str, Any], *, grace_hours: float = 72.0) -> bool:
    """
    Browse continuity: serve ok rates a bit after expires_at so the wall
    doesn't go empty when the refresh job lags (TTL can be hours).
    """
    if _is_fresh(row.get("expires_at")):
        return True
    if (row.get("status") or "") != "ok":
        return False
    top = row.get("top")
    if not isinstance(top, list) or not top:
        return False
    # Prefer fetched_at; else expires_at as anchor
    anchor = row.get("fetched_at") or row.get("expires_at")
    if not anchor:
        return False
    try:
        dt = datetime.fromisoformat(str(anchor).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        age_h = (_now() - dt).total_seconds() / 3600.0
        # If anchored on expires_at, allow grace past expiry; if fetched_at, cap total age
        if row.get("fetched_at"):
            return age_h <= max(grace_hours, 48.0)
        return age_h <= grace_hours
    except ValueError:
        return False


def find_destination_by_iata(supabase: Any, iata: str) -> Optional[Dict[str, Any]]:
    iata = (iata or "").strip().upper()
    if not iata:
        return None
    r = (
        supabase.table("deal_destinations")
        .select("id,slug,city_name,iata_arrival,timezone,pool_radius_m,active")
        .eq("iata_arrival", iata)
        .eq("active", True)
        .limit(1)
        .execute()
    )
    return (r.data or [None])[0]


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

    dest = find_destination_by_iata(supabase, iata)
    if not dest:
        return {**base, "status": "unavailable", "reason": "not_in_catalogue"}

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
                    "city": dest.get("city_name"),
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
                "city": dest.get("city_name"),
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
                "city": dest.get("city_name"),
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
            "city": dest.get("city_name"),
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
            "reason": ondemand.get("status"),
        }

    return {
        **base,
        "status": "miss",
        "mode": "canonical" if window else "ondemand",
        "destination_id": dest["id"],
        "destination_slug": dest.get("slug"),
        "city": dest.get("city_name"),
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
    error: Optional[str] = None,
) -> None:
    """No-op: hotel_upsell_cache dropped (jobs stay in-memory)."""
    return None


def _run_fetch_job(
    job_id: str,
    *,
    destination_id: str,
    checkin: date,
    checkout: date,
    adults: int,
    flight_pp: Optional[float] = None,
) -> None:
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

        dest_r = (
            supabase.table("deal_destinations")
            .select("*")
            .eq("id", destination_id)
            .limit(1)
            .execute()
        )
        dest = (dest_r.data or [None])[0]
        if not dest:
            raise LiteApiError("destination missing")

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
                }
            return

        pool_map = {str(h["hotel_id"]): h for h in pool_rows if h.get("hotel_id")}
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
        if not cands:
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
        # Persist full candidate list for later filter by different flight_pp
        offer = options[0] if options else None
        _mark_upsell_row(
            supabase,
            destination_id=destination_id,
            checkin=checkin,
            checkout=checkout,
            adults=adults,
            status="ok" if offer else "no_rates",
            offer=offer,
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
            }
    except Exception as e:
        logger.warning("upsell_fetch_fail job=%s: %s", job_id, e)
        try:
            if supabase:
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
) -> Dict[str, Any]:
    """Start async on-demand fetch if needed. Idempotent when pending/fresh."""
    looked = lookup_upsell(
        supabase,
        iata=iata,
        checkin=checkin,
        checkout=checkout,
        participants=participants,
        flight_pp=flight_pp,
    )
    if looked.get("status") == "ready":
        return {**looked, "job_id": None}
    if looked.get("status") == "unavailable" and looked.get("reason") == "not_in_catalogue":
        return looked
    if looked.get("status") == "unavailable" and looked.get("reason") == "bad_dates":
        return looked

    dest_id = looked.get("destination_id")
    if not dest_id:
        dest = find_destination_by_iata(supabase, iata)
        if not dest:
            return {**looked, "status": "unavailable", "reason": "not_in_catalogue"}
        dest_id = dest["id"]

    cin = _parse_ymd(checkin)
    cout = _parse_ymd(checkout)
    if not cin or not cout:
        return {**looked, "status": "unavailable", "reason": "bad_dates"}

    _, adults = rooms_for_participants(participants)

    # Already pending in DB
    if looked.get("status") == "pending":
        return {**looked, "job_id": None}

    if not check_rate_limit(rate_bucket):
        return {
            **looked,
            "status": "rate_limited",
            "reason": "too_many_fetches",
        }

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
            "checkin": cin.isoformat(),
            "checkout": cout.isoformat(),
            "participants": max(1, int(participants or 1)),
            "adults_lookup": adults,
            "destination_id": dest_id,
            "flight_pp": float(flight_pp) if flight_pp is not None else None,
        }

    _executor.submit(
        _run_fetch_job,
        job_id,
        destination_id=str(dest_id),
        checkin=cin,
        checkout=cout,
        adults=adults,
        flight_pp=float(flight_pp) if flight_pp is not None else None,
    )
    return {
        **looked,
        "status": "pending",
        "job_id": job_id,
        "destination_id": dest_id,
        "adults_lookup": adults,
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
        out.append(
            lookup_upsell(
                supabase,
                iata=str(item.get("iata") or ""),
                checkin=str(item.get("checkin") or ""),
                checkout=str(item.get("checkout") or ""),
                participants=int(item.get("participants") or 2),
                flight_pp=flight_pp,
            )
        )
    return out
