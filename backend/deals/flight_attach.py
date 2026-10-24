"""Attach round-trip flights to canonical week-end windows (§7)."""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional, Sequence, Tuple
from zoneinfo import ZoneInfo

from deals.airport_tz import tz_for_iata

# Arrival too early for check-in night (bad UX)
ARRIVAL_EXCLUDE_BEFORE = time(5, 0)  # 00:00–04:59 excluded
LATE_ARRIVAL_FROM = time(22, 0)  # 22:00–23:59
LATE_DEPARTURE_FROM = time(18, 0)  # return dep ≥ 18:00

# Short-haul duration estimate when no arrivalTime in scanner payload
CRUISE_KMH = 780.0
TAXI_PAD_MIN = 45
DURATION_MIN_CLAMP = (75, 240)  # minutes


@dataclass
class AttachResult:
    ok: bool
    late_arrival: bool = False
    late_departure: bool = False
    reason: str = ""
    arrival_local: Optional[datetime] = None
    return_dep_local: Optional[datetime] = None


def _parse_iso_naive(iso: str) -> Optional[datetime]:
    if not iso:
        return None
    raw = iso.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        try:
            dt = datetime.fromisoformat(raw[:19])
        except ValueError:
            return None
    if dt.tzinfo is not None:
        return dt.replace(tzinfo=None)
    return dt


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


# Approximate airport coords for duration estimate (subset)
_IATA_COORDS: Dict[str, Tuple[float, float]] = {
    "BVA": (49.4544, 2.1128),
    "ORY": (48.7233, 2.3794),
    "CDG": (49.0097, 2.5479),
    "MRS": (43.4393, 5.2214),
    "NCE": (43.6584, 7.2159),
    "LYS": (45.7256, 5.0811),
    "TLS": (43.6291, 1.3638),
    "LIS": (38.7742, -9.1342),
    "OPO": (41.2481, -8.6814),
    "BCN": (41.2971, 2.0785),
    "MAD": (40.4983, -3.5676),
    "CIA": (41.7994, 12.5949),
    "FCO": (41.8003, 12.2389),
    "BGY": (45.6739, 9.7042),
    "MXP": (45.6306, 8.7281),
    "DUB": (53.4213, -6.2701),
    "BUD": (47.4298, 19.2611),
    "PRG": (50.1008, 14.2600),
    "KRK": (50.0777, 19.7848),
}


def estimate_duration_minutes(origin: str, dest: str) -> int:
    o = _IATA_COORDS.get((origin or "").upper())
    d = _IATA_COORDS.get((dest or "").upper())
    if not o or not d:
        return 150  # ~2h30 default EU short-haul
    km = haversine_km(o[0], o[1], d[0], d[1])
    minutes = int(round((km / CRUISE_KMH) * 60 + TAXI_PAD_MIN))
    return max(DURATION_MIN_CLAMP[0], min(DURATION_MIN_CLAMP[1], minutes))


def estimate_arrival_local(
    departure_iso: str,
    *,
    origin_iata: str,
    dest_iata: str,
    dest_timezone: str,
    arrival_iso: Optional[str] = None,
) -> Optional[datetime]:
    """
    Arrival wall-clock in destination local TZ.
    Prefer explicit arrival_iso; else estimate from origin dep + duration + TZ convert.
    """
    dest_tz = ZoneInfo(dest_timezone or tz_for_iata(dest_iata))

    if arrival_iso:
        arr = _parse_iso_naive(arrival_iso)
        if arr is not None:
            # Treat as already dest-local if naive
            return arr.replace(tzinfo=dest_tz)

    dep = _parse_iso_naive(departure_iso)
    if dep is None:
        return None

    origin_tz = ZoneInfo(tz_for_iata(origin_iata))
    dep_aware = dep.replace(tzinfo=origin_tz)
    duration = timedelta(minutes=estimate_duration_minutes(origin_iata, dest_iata))
    arrival_utc = (dep_aware + duration).astimezone(ZoneInfo("UTC"))
    return arrival_utc.astimezone(dest_tz)


def return_departure_local(
    departure_iso: str,
    *,
    dest_timezone: str,
    dest_iata: str = "",
) -> Optional[datetime]:
    """Return leg departs from destination — treat naive ISO as dest-local."""
    dep = _parse_iso_naive(departure_iso)
    if dep is None:
        return None
    dest_tz = ZoneInfo(dest_timezone or tz_for_iata(dest_iata))
    return dep.replace(tzinfo=dest_tz)


def attach_trip_to_window(
    trip: Any,
    *,
    checkin: date,
    checkout: date,
    dest_timezone: str,
) -> AttachResult:
    """
    §7 rules (destination local time):
    - outbound arrival date == checkin, time in 05:00–23:59
    - 00:00–04:59 arrival → exclude
    - 22:00–23:59 → late_arrival
    - return departure date == checkout; ≥18:00 → late_departure
    """
    aller = trip.aller if hasattr(trip, "aller") else trip.get("aller") or {}
    retour = trip.retour if hasattr(trip, "retour") else trip.get("retour") or {}

    def _g(obj: Any, key: str, default: Any = None) -> Any:
        if isinstance(obj, dict):
            return obj.get(key, default)
        return getattr(obj, key, default)

    origin = (_g(aller, "origin") or "").upper()
    dest = (
        _g(aller, "destination")
        or (getattr(trip, "destination_code", None) if not isinstance(trip, dict) else trip.get("destination_code"))
        or ""
    ).upper()

    arrival = estimate_arrival_local(
        _g(aller, "departureTime") or "",
        origin_iata=origin,
        dest_iata=dest,
        dest_timezone=dest_timezone,
        arrival_iso=_g(aller, "arrivalTime"),
    )
    if arrival is None:
        return AttachResult(ok=False, reason="missing_arrival")

    arr_date = arrival.date()
    arr_clock = time(arrival.hour, arrival.minute, arrival.second)

    if arr_date != checkin:
        return AttachResult(
            ok=False,
            reason=f"arrival_date_mismatch:{arr_date}!={checkin}",
            arrival_local=arrival,
        )
    if arr_clock < ARRIVAL_EXCLUDE_BEFORE:
        return AttachResult(
            ok=False,
            reason="arrival_too_early",
            arrival_local=arrival,
        )

    late_arr = arr_clock >= LATE_ARRIVAL_FROM

    ret_dep = return_departure_local(
        _g(retour, "departureTime") or "",
        dest_timezone=dest_timezone,
        dest_iata=dest,
    )
    if ret_dep is None:
        return AttachResult(ok=False, reason="missing_return_dep", arrival_local=arrival)

    ret_date = ret_dep.date()
    ret_clock = time(ret_dep.hour, ret_dep.minute, ret_dep.second)
    if ret_date != checkout:
        return AttachResult(
            ok=False,
            reason=f"return_date_mismatch:{ret_date}!={checkout}",
            arrival_local=arrival,
            return_dep_local=ret_dep,
        )

    late_dep = ret_clock >= LATE_DEPARTURE_FROM
    return AttachResult(
        ok=True,
        late_arrival=late_arr,
        late_departure=late_dep,
        arrival_local=arrival,
        return_dep_local=ret_dep,
    )


def is_direct(trip: Any) -> bool:
    if isinstance(trip, dict):
        t = trip.get("transfers")
        if t is None:
            return True
        try:
            return int(t) == 0
        except (TypeError, ValueError):
            return True
    t = getattr(trip, "transfers", None)
    if t is None:
        return True
    try:
        return int(t) == 0
    except (TypeError, ValueError):
        return True


def trip_price_pp(trip: Any) -> float:
    if isinstance(trip, dict):
        return float(trip.get("prix_total") or 0)
    return float(getattr(trip, "prix_total", 0) or 0)


def pick_best_trip(
    trips: Sequence[Any],
    *,
    checkin: date,
    checkout: date,
    dest_timezone: str,
    budget_pp: float,
) -> Optional[Tuple[Any, AttachResult]]:
    """
    Cheapest under budget; prefer direct if within ±10% of cheapest eligible.
    """
    eligible: List[Tuple[Any, AttachResult, float, bool]] = []
    for trip in trips or []:
        price = trip_price_pp(trip)
        if price <= 0 or price > budget_pp:
            continue
        att = attach_trip_to_window(
            trip,
            checkin=checkin,
            checkout=checkout,
            dest_timezone=dest_timezone,
        )
        if not att.ok:
            continue
        eligible.append((trip, att, price, is_direct(trip)))

    if not eligible:
        return None

    cheapest = min(p for _, _, p, _ in eligible)
    # Prefer direct within 10% of cheapest
    directs = [e for e in eligible if e[3] and e[2] <= cheapest * 1.10]
    pool = directs if directs else eligible
    best = min(pool, key=lambda e: (e[2], 0 if e[3] else 1))
    return best[0], best[1]


def flight_snapshot(trip: Any, att: AttachResult) -> Dict[str, Any]:
    """JSON stored in deal_flight_cache.flight."""
    if hasattr(trip, "model_dump"):
        data = trip.model_dump()
    elif isinstance(trip, dict):
        data = dict(trip)
    else:
        data = {
            "aller": trip.aller.model_dump() if hasattr(trip.aller, "model_dump") else trip.aller,
            "retour": trip.retour.model_dump() if hasattr(trip.retour, "model_dump") else trip.retour,
            "prix_total": trip_price_pp(trip),
            "destination_code": getattr(trip, "destination_code", None),
            "provider": getattr(trip, "provider", None),
            "airline": getattr(trip, "airline", None),
            "transfers": getattr(trip, "transfers", None),
            "booking_url": getattr(trip, "booking_url", None),
        }
    data["late_arrival"] = att.late_arrival
    data["late_departure"] = att.late_departure
    if att.arrival_local:
        data["arrival_local"] = att.arrival_local.isoformat()
    if att.return_dep_local:
        data["return_departure_local"] = att.return_dep_local.isoformat()
    return data
