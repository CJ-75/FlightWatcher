"""Travelpayouts / Aviasales Data API (prices_for_dates)."""
from __future__ import annotations

import gzip
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from api_models import FlightResponse, TripResponse
from city_names_fr import destination_full_fr
from providers.base import SearchParams

API_URL = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates"
AVIASALES_HOST = "https://www.aviasales.com"

# Short in-memory cache to respect rate limits
_CACHE: Dict[str, Tuple[float, List[dict]]] = {}
_CACHE_TTL = 15 * 60  # 15 min


def travelpayouts_enabled() -> bool:
    if (os.getenv("TRAVELPAYOUTS_ENABLED") or "true").strip().lower() in (
        "0",
        "false",
        "no",
        "off",
    ):
        return False
    return bool((os.getenv("TRAVELPAYOUTS_API_TOKEN") or "").strip())


def _token() -> str:
    return (os.getenv("TRAVELPAYOUTS_API_TOKEN") or "").strip()


def _marker() -> str:
    return (os.getenv("TRAVELPAYOUTS_MARKER") or "").strip()


def _clamp_passengers(passengers) -> int:
    try:
        n = int(passengers or 1)
    except (TypeError, ValueError):
        n = 1
    return max(1, min(6, n))


def _build_booking_url(link: Optional[str]) -> Optional[str]:
    if not link:
        return None
    path = str(link).strip()
    if path.startswith("http"):
        url = path
    else:
        if not path.startswith("/"):
            path = "/" + path
        url = AVIASALES_HOST + path
    marker = _marker()
    if marker:
        sep = "&" if "?" in url else "?"
        # Partner deep-link style used by Travelpayouts
        if "marker=" not in url:
            url = f"{url}{sep}marker={urllib.parse.quote(marker)}"
    return url


def _fetch_prices(
    *,
    origin: str,
    destination: Optional[str],
    departure_at: str,
    return_at: str,
    direct: bool,
    limit: int = 50,
) -> Tuple[List[dict], int]:
    token = _token()
    if not token:
        return [], 0

    cache_key = f"{origin}|{destination or '-'}|{departure_at}|{return_at}|{direct}|{limit}"
    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _CACHE_TTL:
        return cached[1], 0

    params = {
        "origin": origin,
        "departure_at": departure_at,
        "return_at": return_at,
        "one_way": "false",
        "direct": "true" if direct else "false",
        "currency": "EUR",
        "market": "fr",
        "sorting": "price",
        "limit": str(min(max(limit, 1), 100)),
        "page": "1",
        "token": token,
    }
    if destination:
        params["destination"] = destination

    url = API_URL + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "FlightWatcher/1.0",
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate",
            "X-Access-Token": token,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            raw = resp.read()
            if resp.headers.get("Content-Encoding") == "gzip" or raw[:2] == b"\x1f\x8b":
                try:
                    raw = gzip.decompress(raw)
                except Exception:
                    pass
            payload = json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as e:
        from scan_log import slog

        slog(f"⚠️ [travelpayouts] HTTP {e.code}: {e.read()[:200]!r}")
        return [], 1
    except Exception as e:
        from scan_log import slog

        slog(f"⚠️ [travelpayouts] fetch error: {e}")
        return [], 1

    if not payload.get("success"):
        from scan_log import slog

        slog(f"⚠️ [travelpayouts] unsuccessful: {payload.get('error')}")
        return [], 1

    data = payload.get("data") or []
    if isinstance(data, dict):
        # Older shapes
        rows = []
        for dest, offers in data.items():
            if isinstance(offers, dict):
                for offer in offers.values():
                    if isinstance(offer, dict):
                        offer.setdefault("destination", dest)
                        rows.append(offer)
        data = rows
    if not isinstance(data, list):
        data = []

    _CACHE[cache_key] = (now, data)
    return data, 1


def _parse_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    s = str(value).strip().replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(s)
    except Exception:
        return None


def _in_time_window(dt: datetime, heure_min: str, heure_max: str) -> bool:
    try:
        t_min = datetime.strptime(heure_min or "00:00", "%H:%M").time()
        t_max = datetime.strptime(heure_max or "23:59", "%H:%M").time()
    except Exception:
        return True
    # Compare local clock if aware; else naive
    local = dt
    if local.tzinfo is not None:
        local = local.astimezone().replace(tzinfo=None)
    return t_min <= local.time() <= t_max


def _offer_to_trip(
    offer: dict,
    *,
    budget_max: float,
    dates_depart_by_day: Dict[str, Any],
    dates_retour_by_day: Dict[str, Any],
    destinations_exclues: List[str],
    destinations_incluses: Optional[List[str]],
    direct: bool,
) -> Optional[TripResponse]:
    origin_airport = (
        (offer.get("origin_airport") or offer.get("origin") or "")
        .strip()
        .upper()
    )
    dest_airport = (
        (offer.get("destination_airport") or offer.get("destination") or "")
        .strip()
        .upper()
    )
    if len(origin_airport) != 3 or len(dest_airport) != 3:
        return None
    if dest_airport in destinations_exclues:
        return None
    if destinations_incluses is not None and dest_airport not in destinations_incluses:
        return None

    transfers = int(offer.get("transfers") or 0)
    return_transfers = int(offer.get("return_transfers") or 0)
    if direct and (transfers > 0 or return_transfers > 0):
        return None

    try:
        price = float(offer.get("price") or 0)
    except (TypeError, ValueError):
        return None
    if price <= 0 or price > budget_max:
        return None

    dep = _parse_dt(offer.get("departure_at"))
    ret = _parse_dt(offer.get("return_at"))
    if not dep or not ret:
        return None

    dep_day = dep.date().isoformat()
    ret_day = ret.date().isoformat()
    dep_cfg = dates_depart_by_day.get(dep_day)
    ret_cfg = dates_retour_by_day.get(ret_day)
    if not dep_cfg or not ret_cfg:
        return None
    if not _in_time_window(dep, dep_cfg.heure_min or "00:00", dep_cfg.heure_max or "23:59"):
        return None
    if not _in_time_window(ret, ret_cfg.heure_min or "00:00", ret_cfg.heure_max or "23:59"):
        return None

    airline = (offer.get("airline") or "").strip().upper() or None
    flight_number_raw = offer.get("flight_number")
    if flight_number_raw is not None and airline:
        flight_number = f"{airline} {flight_number_raw}"
    elif flight_number_raw is not None:
        flight_number = str(flight_number_raw)
    else:
        flight_number = airline or "TP"

    # API gives one round-trip total — do not invent per-leg prices
    origin_full = destination_full_fr(origin_airport)
    dest_full = destination_full_fr(dest_airport)

    aller = FlightResponse(
        flightNumber=flight_number,
        origin=origin_airport,
        originFull=origin_full,
        destination=dest_airport,
        destinationFull=dest_full,
        departureTime=dep.isoformat(),
        price=0.0,
        currency="EUR",
    )
    retour = FlightResponse(
        flightNumber=flight_number,
        origin=dest_airport,
        originFull=dest_full,
        destination=origin_airport,
        destinationFull=origin_full,
        departureTime=ret.isoformat(),
        price=0.0,
        currency="EUR",
    )

    # Outbound stops only (never sum A/R — that invents "3 escales" on RT)
    outbound_stops = max(0, transfers)
    # Hide absurd stop counts on low-cost carriers (data often wrong)
    _LOW_COST = {"FR", "RK", "TO", "HV", "U2", "EC", "VY", "W4", "W6", "W9", "V7"}
    display_transfers: Optional[int]
    if airline in _LOW_COST and outbound_stops >= 2:
        display_transfers = None  # UI: no Direct / no fake multi-stop badge
    else:
        display_transfers = outbound_stops

    return TripResponse(
        aller=aller,
        retour=retour,
        prix_total=round(price, 2),
        destination_code=dest_airport,
        provider="travelpayouts",
        airline=airline,
        transfers=display_transfers,
        booking_url=_build_booking_url(offer.get("link")),
        leg_prices_reliable=False,
    )


class TravelpayoutsProvider:
    name = "travelpayouts"

    def search_roundtrips(self, params: SearchParams) -> Tuple[List[TripResponse], int]:
        if not travelpayouts_enabled():
            return [], 0

        from providers.throttle import is_circuit_open, wait_provider_slot

        from scan_log import slog

        if is_circuit_open("travelpayouts"):
            slog("⏸ [travelpayouts] circuit open — skip")
            return [], 0
        wait_provider_slot("travelpayouts")

        origin = (params.aeroport_depart or "").strip().upper()
        if len(origin) != 3:
            return [], 0
        if not params.dates_depart or not params.dates_retour:
            return [], 0

        pax = _clamp_passengers(params.passengers)
        # Data API prices are typically for 1 adult; keep per-person budget as-is
        budget_max = float(params.budget_max or 200)
        destinations_exclues = params.destinations_exclues or []
        destinations_incluses = params.destinations_incluses
        direct = bool(params.direct)
        limite = min(params.limite_allers or 50, 80)

        dates_depart_by_day = {d.date[:10]: d for d in params.dates_depart}
        dates_retour_by_day = {d.date[:10]: d for d in params.dates_retour}

        # Build unique date pairs (cartesian but capped)
        pairs: List[Tuple[str, str]] = []
        for dd in params.dates_depart:
            for rd in params.dates_retour:
                d0 = dd.date[:10]
                d1 = rd.date[:10]
                if d1 >= d0:
                    pairs.append((d0, d1))
        # Dedup preserve order
        seen = set()
        uniq_pairs = []
        for p in pairs:
            if p not in seen:
                seen.add(p)
                uniq_pairs.append(p)
        # Cap fan-out
        uniq_pairs = uniq_pairs[:12]

        # Specific destinations or open inspire
        dest_targets: List[Optional[str]]
        if destinations_incluses:
            dest_targets = [c.strip().upper() for c in destinations_incluses if c]
        else:
            dest_targets = [None]

        slog(
            f"📥 [travelpayouts] depuis {origin} "
            f"({len(uniq_pairs)} paires dates, dest={len(dest_targets)}, "
            f"direct={direct}, budget={budget_max}€, pax={pax})..."
        )

        jobs: List[Tuple[Optional[str], str, str]] = []
        for dest in dest_targets[:40]:
            for dep_day, ret_day in uniq_pairs:
                jobs.append((dest, dep_day, ret_day))

        trips: List[TripResponse] = []
        queries = 0

        def _one(job: Tuple[Optional[str], str, str]) -> Tuple[List[TripResponse], int]:
            dest, dep_day, ret_day = job
            rows, nq = _fetch_prices(
                origin=origin,
                destination=dest,
                departure_at=dep_day,
                return_at=ret_day,
                direct=direct,
                limit=limite,
            )
            out: List[TripResponse] = []
            for offer in rows:
                trip = _offer_to_trip(
                    offer,
                    budget_max=budget_max,
                    dates_depart_by_day=dates_depart_by_day,
                    dates_retour_by_day=dates_retour_by_day,
                    destinations_exclues=destinations_exclues,
                    destinations_incluses=destinations_incluses,
                    direct=direct,
                )
                if trip:
                    out.append(trip)
            return out, nq

        # Parallel date-pair fetches (TP is independent of Ryanair throttle)
        from concurrent.futures import ThreadPoolExecutor, as_completed
        from providers.throttle import is_fast_search_path

        workers = min(8 if is_fast_search_path() else 3, max(1, len(jobs)))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futs = [pool.submit(_one, j) for j in jobs]
            for fut in as_completed(futs):
                try:
                    batch, nq = fut.result()
                    trips.extend(batch)
                    queries += nq
                except Exception as e:
                    slog(f"  [travelpayouts] pair error: {e}")

        # Best offer per destination (cheapest)
        by_dest: Dict[str, TripResponse] = {}
        for t in trips:
            prev = by_dest.get(t.destination_code)
            if prev is None or t.prix_total < prev.prix_total:
                by_dest[t.destination_code] = t

        resultats = sorted(by_dest.values(), key=lambda t: t.prix_total)[:limite]
        slog(
            f"  ✓ [travelpayouts] {len(resultats)} A/R ({queries} req, workers={workers})"
        )
        return resultats, queries
