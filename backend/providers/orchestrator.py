"""Run Ryanair + Travelpayouts in parallel and merge results."""
from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Optional, Sequence, Tuple

from api_models import DateAvecHoraire, TripResponse
from providers.base import SearchParams
from providers.ryanair_budget import PURPOSE_ORGANIC
from providers.ryanair_provider import RyanairProvider
from providers.throttle import is_circuit_open
from providers.travelpayouts_provider import TravelpayoutsProvider, travelpayouts_enabled


def _active_providers(only: Optional[Sequence[str]] = None) -> list:
    """
    Build provider list. `only` restricts to named providers
    (e.g. seed: ["travelpayouts"]).
    """
    allowed = {p.strip().lower() for p in only} if only else None

    def want(name: str) -> bool:
        return allowed is None or name in allowed

    providers = []
    if want("ryanair"):
        if is_circuit_open("ryanair"):
            print("⏸ orchestrator: ryanair circuit open — skip")
        else:
            providers.append(RyanairProvider())
    if want("travelpayouts") and travelpayouts_enabled() and not is_circuit_open(
        "travelpayouts"
    ):
        providers.append(TravelpayoutsProvider())

    if not providers:
        # Prefer TP if available when Ryanair is cooling down / filtered out
        if want("travelpayouts") and travelpayouts_enabled():
            providers.append(TravelpayoutsProvider())
        elif want("ryanair"):
            providers.append(RyanairProvider())
    return providers


def parse_origins(aeroport_depart: str) -> List[str]:
    """Parse one or more IATA origins: 'BVA' or 'CDG,ORY,BVA'."""
    raw = (aeroport_depart or "").strip().upper()
    parts = re.split(r"[,;|/\s]+", raw)
    out: List[str] = []
    seen = set()
    for p in parts:
        code = p.strip()
        if len(code) == 3 and code.isalpha() and code not in seen:
            seen.add(code)
            out.append(code)
    return out or ["BVA"]


def _time_slot(iso: str, bucket_minutes: int = 30) -> str:
    """Round ISO departure to a créneau (default 30 min) for schedule dedupe."""
    raw = (iso or "").strip()
    if len(raw) < 16:
        return raw[:10] if raw else ""
    day = raw[:10]
    try:
        hh = int(raw[11:13])
        mm = int(raw[14:16])
    except (TypeError, ValueError):
        return raw[:16]
    total = max(0, min(24 * 60 - 1, hh * 60 + mm))
    rounded = (total // bucket_minutes) * bucket_minutes
    return f"{day}T{rounded // 60:02d}:{rounded % 60:02d}"


def _schedule_key(trip: TripResponse) -> str:
    """Same origin/dest + same aller/retour créneau → one offer."""
    origin = (trip.aller.origin or "").upper()
    dest = (trip.destination_code or trip.aller.destination or "").upper()
    out = _time_slot(trip.aller.departureTime or "")
    back = _time_slot(trip.retour.departureTime or "")
    return f"{origin}|{dest}|{out}|{back}"


def _provider_rank(provider: Optional[str]) -> int:
    """Lower = preferred. Ryanair wins over Aviasales/Travelpayouts on duplicates."""
    p = (provider or "").lower()
    if p == "ryanair":
        return 0
    if p in ("travelpayouts", "aviasales"):
        return 2
    return 1


def _prefer_trip(a: TripResponse, b: TripResponse) -> TripResponse:
    """Prefer Ryanair over Aviasales; else cheaper."""
    ra, rb = _provider_rank(a.provider), _provider_rank(b.provider)
    if ra != rb:
        return a if ra < rb else b
    return a if a.prix_total <= b.prix_total else b


def merge_trips(batches: List[List[TripResponse]]) -> List[TripResponse]:
    """
    Merge provider results and collapse schedule duplicates.
    Same BVA→XXX créneau from Ryanair + Aviasales → keep Ryanair.
    """
    by_schedule: dict[str, TripResponse] = {}

    for batch in batches:
        for trip in batch or []:
            key = _schedule_key(trip)
            prev = by_schedule.get(key)
            if prev is None:
                by_schedule[key] = trip
            else:
                by_schedule[key] = _prefer_trip(prev, trip)

    merged = list(by_schedule.values())
    merged.sort(key=lambda t: (t.prix_total, _provider_rank(t.provider), t.destination_code))
    return merged


def _search_one_origin(
    origin: str,
    providers: list,
    dates_depart: List[DateAvecHoraire],
    dates_retour: List[DateAvecHoraire],
    budget_max: int,
    limite_allers: int,
    destinations_exclues: Optional[List[str]],
    destinations_incluses: Optional[List[str]],
    record_prices: bool,
    passengers: int,
    direct: bool,
    ryanair_purpose: Optional[str],
) -> Tuple[List[TripResponse], int]:
    params = SearchParams(
        aeroport_depart=origin,
        dates_depart=dates_depart,
        dates_retour=dates_retour,
        budget_max=budget_max,
        limite_allers=limite_allers,
        destinations_exclues=destinations_exclues or [],
        destinations_incluses=destinations_incluses,
        passengers=passengers,
        direct=direct,
        record_prices=record_prices,
        ryanair_purpose=ryanair_purpose or PURPOSE_ORGANIC,
    )
    batches: List[List[TripResponse]] = []
    total_queries = 0
    if len(providers) == 1:
        return providers[0].search_roundtrips(params)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {pool.submit(p.search_roundtrips, params): p.name for p in providers}
        for fut in as_completed(futures):
            name = futures[fut]
            try:
                trips, nq = fut.result()
                batches.append(trips)
                total_queries += nq
                print(f"✅ provider {name} @{origin}: {len(trips)} trips, {nq} req")
            except Exception as e:
                print(f"❌ provider {name} @{origin} failed: {e}")
    return merge_trips(batches), total_queries


def search_roundtrips(
    aeroport_depart: str,
    dates_depart: List[DateAvecHoraire],
    dates_retour: List[DateAvecHoraire],
    budget_max: int = 200,
    limite_allers: int = 50,
    destinations_exclues: Optional[List[str]] = None,
    destinations_incluses: Optional[List[str]] = None,
    record_prices: bool = True,
    passengers: int = 1,
    direct: bool = False,
    providers: Optional[Sequence[str]] = None,
    ryanair_purpose: Optional[str] = None,
) -> Tuple[List[TripResponse], int]:
    """
    Multi-provider round-trip search.

    providers: optional allow-list, e.g. ["travelpayouts"] for seed (v3.2).
    ryanair_purpose: hourly budget priority (click > revalidate > organic > promote).
    """
    origins = parse_origins(aeroport_depart)
    active = _active_providers(only=providers)
    purpose = ryanair_purpose or PURPOSE_ORGANIC

    # Single origin — keep previous behaviour
    if len(origins) == 1:
        trips, nq = _search_one_origin(
            origins[0],
            active,
            dates_depart,
            dates_retour,
            budget_max,
            limite_allers,
            destinations_exclues,
            destinations_incluses,
            record_prices,
            passengers,
            direct,
            purpose,
        )
        cap = max(limite_allers or 50, 30)
        capped = trips[: cap * 2]
        _maybe_record_observations(capped, record_prices=record_prices)
        return capped, nq

    # Multi-origin city aggregation (e.g. Paris = CDG,ORY,BVA)
    print(f"📥 multi-origin scan: {','.join(origins)}")
    batches: List[List[TripResponse]] = []
    total_queries = 0
    workers = min(len(origins), 4)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(
                _search_one_origin,
                origin,
                active,
                dates_depart,
                dates_retour,
                budget_max,
                max(20, (limite_allers or 50) // len(origins)),
                destinations_exclues,
                destinations_incluses,
                record_prices,
                passengers,
                direct,
                purpose,
            ): origin
            for origin in origins
        }
        for fut in as_completed(futures):
            origin = futures[fut]
            try:
                trips, nq = fut.result()
                batches.append(trips)
                total_queries += nq
                print(f"✅ origin {origin}: {len(trips)} trips")
            except Exception as e:
                print(f"❌ origin {origin} failed: {e}")

    merged = merge_trips(batches)
    cap = max(limite_allers or 50, 30) * max(1, len(origins))
    capped = merged[:cap]
    _maybe_record_observations(capped, record_prices=record_prices)
    return capped, total_queries


def _maybe_record_observations(
    trips: List[TripResponse],
    *,
    record_prices: bool,
    source: str = "organic_search",
) -> None:
    """D1: async market observations (Ryanair + Travelpayouts). Never blocks."""
    if not record_prices or not trips:
        return
    try:
        from deals.observations import schedule_observations_from_search

        schedule_observations_from_search(
            trips, record_prices=record_prices, source=source
        )
    except Exception as e:
        print(f"⚠️ price_observations skip: {e}")
