"""Run Ryanair + Travelpayouts in parallel and merge results."""
from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Optional, Tuple

from api_models import DateAvecHoraire, TripResponse
from providers.base import SearchParams
from providers.ryanair_provider import RyanairProvider
from providers.travelpayouts_provider import TravelpayoutsProvider, travelpayouts_enabled


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


def _dedupe_key(trip: TripResponse) -> str:
    day_out = (trip.aller.departureTime or "")[:10]
    day_back = (trip.retour.departureTime or "")[:10]
    origin = (trip.aller.origin or "").upper()
    return f"{origin}|{trip.destination_code}|{day_out}|{day_back}|{trip.provider or ''}"


def _soft_price_bucket(price: float) -> int:
    return int(round(float(price) / 5.0) * 5)


def merge_trips(batches: List[List[TripResponse]]) -> List[TripResponse]:
    """Merge provider results: sort by price, soft-dedupe same dest/days/price."""
    merged: List[TripResponse] = []
    seen_exact = set()
    seen_soft = set()

    flat: List[TripResponse] = []
    for batch in batches:
        flat.extend(batch or [])
    flat.sort(key=lambda t: (t.prix_total, t.provider or "", t.destination_code))

    for trip in flat:
        exact = _dedupe_key(trip)
        if exact in seen_exact:
            continue
        soft = (
            f"{(trip.aller.origin or '').upper()}|"
            f"{trip.destination_code}|"
            f"{(trip.aller.departureTime or '')[:10]}|"
            f"{(trip.retour.departureTime or '')[:10]}|"
            f"{_soft_price_bucket(trip.prix_total)}"
        )
        # Keep both providers if prices differ; drop near-duplicates same day
        if soft in seen_soft and (trip.provider or "") == "travelpayouts":
            # Prefer keeping first (usually cheaper); skip near-dup TP
            continue
        seen_exact.add(exact)
        seen_soft.add(soft)
        merged.append(trip)

    merged.sort(key=lambda t: t.prix_total)
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
) -> Tuple[List[TripResponse], int]:
    origins = parse_origins(aeroport_depart)
    providers = [RyanairProvider()]
    if travelpayouts_enabled():
        providers.append(TravelpayoutsProvider())

    # Single origin — keep previous behaviour
    if len(origins) == 1:
        trips, nq = _search_one_origin(
            origins[0],
            providers,
            dates_depart,
            dates_retour,
            budget_max,
            limite_allers,
            destinations_exclues,
            destinations_incluses,
            record_prices,
            passengers,
            direct,
        )
        cap = max(limite_allers or 50, 30)
        return trips[: cap * 2], nq

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
                providers,
                dates_depart,
                dates_retour,
                budget_max,
                max(20, (limite_allers or 50) // len(origins)),
                destinations_exclues,
                destinations_incluses,
                record_prices,
                passengers,
                direct,
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
    return merged[:cap], total_queries
