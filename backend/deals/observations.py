"""
D1 — async price_observations writer (no user_id).

Hooked after merged scanner results. Never blocks the search response path.
"""
from __future__ import annotations

import hashlib
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Union

logger = logging.getLogger("deals.observations")

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="price-obs")
_OBS_ENABLED = os.getenv("DEALS_OBSERVATIONS_ENABLED", "true").lower() in (
    "1",
    "true",
    "yes",
    "on",
)


def trip_type_for_nights(nights: int) -> str:
    n = int(nights or 0)
    if 1 <= n <= 3:
        return "WEEKEND"
    if 4 <= n <= 5:
        return "SHORT"
    if 6 <= n <= 9:
        return "WEEK"
    return "OTHER"


def _parse_ymd(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    s = str(raw).strip()
    if "T" in s:
        s = s.split("T", 1)[0]
    elif " " in s:
        s = s.split(" ", 1)[0]
    if len(s) >= 10:
        return s[:10]
    return None


def _nights(out_date: str, ret_date: str) -> int:
    try:
        a = date.fromisoformat(out_date)
        b = date.fromisoformat(ret_date)
        return max(1, (b - a).days)
    except ValueError:
        return 1


def _daily_salt() -> str:
    secret = (os.getenv("OBS_FINGERPRINT_SECRET") or os.getenv("CRON_SECRET") or "fw").strip()
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return f"{secret}:{day}"


def search_fingerprint(
    *,
    origin: str,
    dests: Sequence[str],
    out_dates: Sequence[str],
    ret_dates: Sequence[str],
    source: str,
) -> str:
    """Salted daily hash — counts distinct searches, not users."""
    payload = "|".join(
        [
            source,
            (origin or "").upper(),
            ",".join(sorted({d.upper() for d in dests if d})),
            ",".join(sorted(out_dates)),
            ",".join(sorted(ret_dates)),
            _daily_salt(),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]


def _leg(obj: Any, key: str, default: Any = None) -> Any:
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def trip_to_observation(
    trip: Any,
    *,
    source: str,
    fingerprint: str,
    served_city_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    aller = _leg(trip, "aller")
    retour = _leg(trip, "retour")
    origin = (_leg(aller, "origin") or "").strip().upper()
    dest = (
        _leg(trip, "destination_code")
        or _leg(aller, "destination")
        or ""
    ).strip().upper()
    out_dep = _leg(aller, "departureTime") or ""
    ret_dep = _leg(retour, "departureTime") or ""
    out_date = _parse_ymd(out_dep)
    ret_date = _parse_ymd(ret_dep)
    if not origin or not dest or not out_date or not ret_date:
        return None

    price = _leg(trip, "prix_total")
    try:
        price_pp = float(price)
    except (TypeError, ValueError):
        return None
    if price_pp <= 0:
        return None

    nights = _nights(out_date, ret_date)
    transfers = _leg(trip, "transfers")
    direct = True if transfers is None else int(transfers or 0) == 0
    provider = (_leg(trip, "provider") or "").strip().lower() or None
    carrier = (_leg(trip, "airline") or None)
    if not carrier and provider == "ryanair":
        carrier = "Ryanair"

    return {
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "source": source,
        "origin_iata": origin,
        "dest_iata": dest,
        "served_city_id": served_city_id,
        "out_date": out_date,
        "ret_date": ret_date,
        "nights": nights,
        "trip_type": trip_type_for_nights(nights),
        # Keep full ISO local times (TZ offset can exceed 32 chars)
        "out_dep_local": str(out_dep)[:64] if out_dep else None,
        "out_arr_local": (str(_leg(aller, "arrivalTime") or "")[:64] or None),
        "ret_dep_local": str(ret_dep)[:64] if ret_dep else None,
        "price_pp_eur": round(price_pp, 2),
        "direct": direct,
        "carrier": carrier,
        "provider": provider,
        "booking_url": _leg(trip, "booking_url"),
        "search_fingerprint": fingerprint or "",
    }


def _resolve_city_ids(
    supabase, dests: Sequence[str]
) -> Dict[str, Optional[str]]:
    out: Dict[str, Optional[str]] = {}
    try:
        from deals.city_mapping import resolve_served_city

        for d in dests:
            code = (d or "").upper()
            if not code or code in out:
                continue
            resolved = resolve_served_city(supabase, code)
            out[code] = resolved.get("served_city_id") if resolved else None
    except Exception as e:
        logger.debug("resolve city ids: %s", e)
    return out


def _write_batch(rows: List[Dict[str, Any]]) -> None:
    if not rows:
        return
    try:
        from supabase_deps import get_supabase_service_client, get_supabase_client

        supabase = get_supabase_service_client() or get_supabase_client()
        if not supabase:
            return

        dests = list({r["dest_iata"] for r in rows if r.get("dest_iata")})
        city_ids = _resolve_city_ids(supabase, dests)
        for r in rows:
            if not r.get("served_city_id"):
                r["served_city_id"] = city_ids.get(r.get("dest_iata") or "")

        # Chunk inserts
        chunk = 200
        for i in range(0, len(rows), chunk):
            part = rows[i : i + chunk]
            supabase.table("price_observations").insert(part).execute()
        logger.info("price_observations wrote %s rows", len(rows))
    except Exception as e:
        logger.error("price_observations write failed: %s", e)


def record_price_observations(
    trips: Sequence[Any],
    *,
    source: str = "organic_search",
    fingerprint: Optional[str] = None,
    sync: bool = False,
) -> None:
    """
    Fire-and-forget insert of observations from TripResponse (or dict) list.
    """
    if not _OBS_ENABLED or not trips:
        return

    fp = fingerprint or ""
    if not fp:
        origins = []
        dests = []
        outs = []
        rets = []
        for t in trips:
            aller = _leg(t, "aller")
            retour = _leg(t, "retour")
            o = (_leg(aller, "origin") or "").upper()
            d = (_leg(t, "destination_code") or _leg(aller, "destination") or "").upper()
            if o:
                origins.append(o)
            if d:
                dests.append(d)
            od = _parse_ymd(_leg(aller, "departureTime"))
            rd = _parse_ymd(_leg(retour, "departureTime"))
            if od:
                outs.append(od)
            if rd:
                rets.append(rd)
        origin = origins[0] if origins else ""
        fp = search_fingerprint(
            origin=origin,
            dests=dests,
            out_dates=outs,
            ret_dates=rets,
            source=source,
        )

    rows: List[Dict[str, Any]] = []
    for t in trips:
        obs = trip_to_observation(t, source=source, fingerprint=fp)
        if obs:
            rows.append(obs)
    if not rows:
        return

    if sync:
        _write_batch(rows)
        return

    try:
        _executor.submit(_write_batch, rows)
    except Exception as e:
        logger.error("price_observations schedule failed: %s", e)


def schedule_observations_from_search(
    trips: Sequence[Any],
    *,
    record_prices: bool,
    source: str = "organic_search",
) -> None:
    """Called from orchestrator when record_prices is True."""
    if not record_prices:
        return
    record_price_observations(trips, source=source)
