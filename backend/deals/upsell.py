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
    return {
        "hotel_id": first.get("hotel_id") or first.get("id"),
        "name": first.get("name"),
        "public_hotel_price": public,
        "board": first.get("board") or first.get("board_name"),
        "stars": first.get("stars"),
        "rating": first.get("rating"),
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
    row = rows[0]
    if not _is_fresh(row.get("expires_at")):
        return None
    offer = _top_public(row.get("top"))
    if not offer:
        return None
    return {
        "offer": offer,
        "fetched_at": row.get("fetched_at"),
        "expires_at": row.get("expires_at"),
        "source": "rates_cache",
    }


def read_upsell_cache(
    supabase: Any,
    *,
    destination_id: str,
    checkin: date,
    checkout: date,
    adults: int,
) -> Optional[Dict[str, Any]]:
    r = (
        supabase.table("hotel_upsell_cache")
        .select("*")
        .eq("destination_id", destination_id)
        .eq("checkin", checkin.isoformat())
        .eq("checkout", checkout.isoformat())
        .eq("adults", adults)
        .limit(1)
        .execute()
    )
    rows = r.data or []
    if not rows:
        return None
    row = rows[0]
    if not _is_fresh(row.get("expires_at")):
        return None
    status = row.get("status") or "pending"
    if status == "pending":
        return {
            "status": "pending",
            "job_id": None,
            "source": "upsell_cache",
            "expires_at": row.get("expires_at"),
        }
    if status != "ok":
        return {
            "status": status,
            "source": "upsell_cache",
            "expires_at": row.get("expires_at"),
        }
    offer = row.get("offer") if isinstance(row.get("offer"), dict) else None
    if not offer or not offer.get("public_hotel_price"):
        return {"status": "no_rates", "source": "upsell_cache"}
    return {
        "status": "ready",
        "offer": offer,
        "fetched_at": row.get("fetched_at"),
        "expires_at": row.get("expires_at"),
        "source": "upsell_cache",
    }


def lookup_upsell(
    supabase: Any,
    *,
    iata: str,
    checkin: str,
    checkout: str,
    participants: int = 2,
) -> Dict[str, Any]:
    """
    Cache-only lookup. Never calls LiteAPI.
    status: ready | miss | pending | unavailable
    """
    cin = _parse_ymd(checkin)
    cout = _parse_ymd(checkout)
    base = {
        "iata": (iata or "").upper(),
        "checkin": checkin[:10] if checkin else None,
        "checkout": checkout[:10] if checkout else None,
        "participants": max(1, int(participants or 1)),
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
            public = float(cached["offer"]["public_hotel_price"])
            hotel_pp = hotel_pp_from_public(public, participants=participants)
            return {
                **base,
                "status": "ready",
                "mode": "canonical",
                "destination_id": dest["id"],
                "destination_slug": dest.get("slug"),
                "city": dest.get("city_name"),
                "window_id": window["id"],
                "window_kind": window.get("kind"),
                "adults_lookup": adults,
                "rooms": rooms,
                "hotel_pp": hotel_pp,
                "hotel_public_total_one_room": public,
                "hotel_name": cached["offer"].get("name"),
                "hotel_id": cached["offer"].get("hotel_id"),
                "source": cached["source"],
                "fetched_at": cached.get("fetched_at"),
                "expires_at": cached.get("expires_at"),
            }

    ondemand = read_upsell_cache(
        supabase,
        destination_id=dest["id"],
        checkin=cin,
        checkout=cout,
        adults=adults,
    )
    if ondemand and ondemand.get("status") == "ready":
        offer = ondemand["offer"]
        public = float(offer["public_hotel_price"])
        hotel_pp = hotel_pp_from_public(public, participants=participants)
        return {
            **base,
            "status": "ready",
            "mode": "ondemand",
            "destination_id": dest["id"],
            "destination_slug": dest.get("slug"),
            "city": dest.get("city_name"),
            "window_id": window["id"] if window else None,
            "window_kind": window.get("kind") if window else None,
            "adults_lookup": adults,
            "rooms": rooms,
            "hotel_pp": hotel_pp,
            "hotel_public_total_one_room": public,
            "hotel_name": offer.get("name"),
            "hotel_id": offer.get("hotel_id"),
            "source": ondemand["source"],
            "fetched_at": ondemand.get("fetched_at"),
            "expires_at": ondemand.get("expires_at"),
        }
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
    now = _now()
    expires = now + UPSELL_TTL
    row = {
        "destination_id": destination_id,
        "checkin": checkin.isoformat(),
        "checkout": checkout.isoformat(),
        "adults": adults,
        "status": status,
        "offer": offer,
        "error": error,
        "fetched_at": now.isoformat() if status != "pending" else None,
        "expires_at": expires.isoformat(),
    }
    supabase.table("hotel_upsell_cache").upsert(
        row,
        on_conflict="destination_id,checkin,checkout,adults",
    ).execute()


def _run_fetch_job(
    job_id: str,
    *,
    destination_id: str,
    checkin: date,
    checkout: date,
    adults: int,
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
            top_n=1,
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

        top = cands[0]
        offer = {
            "hotel_id": top.get("hotel_id"),
            "name": top.get("name"),
            "public_hotel_price": top.get("public_hotel_price"),
            "board": top.get("board"),
            "stars": top.get("stars"),
            "rating": top.get("rating"),
        }
        _mark_upsell_row(
            supabase,
            destination_id=destination_id,
            checkin=checkin,
            checkout=checkout,
            adults=adults,
            status="ok",
            offer=offer,
        )
        participants = int((_jobs.get(job_id) or {}).get("participants") or adults)
        hotel_pp = hotel_pp_from_public(
            float(offer["public_hotel_price"] or 0),
            participants=participants,
        )
        with _jobs_lock:
            _jobs[job_id] = {
                **(_jobs.get(job_id) or {}),
                "status": "ready",
                "done": True,
                "hotel_pp": hotel_pp,
                "hotel_name": offer.get("name"),
                "hotel_id": offer.get("hotel_id"),
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
) -> Dict[str, Any]:
    """Start async on-demand fetch if needed. Idempotent when pending/fresh."""
    looked = lookup_upsell(
        supabase,
        iata=iata,
        checkin=checkin,
        checkout=checkout,
        participants=participants,
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
        }

    _executor.submit(
        _run_fetch_job,
        job_id,
        destination_id=str(dest_id),
        checkin=cin,
        checkout=cout,
        adults=adults,
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
        out.append(
            lookup_upsell(
                supabase,
                iata=str(item.get("iata") or ""),
                checkin=str(item.get("checkin") or ""),
                checkout=str(item.get("checkout") or ""),
                participants=int(item.get("participants") or 2),
            )
        )
    return out
