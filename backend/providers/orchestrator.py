"""Run Ryanair + Travelpayouts in parallel and merge results."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Optional, Tuple

from api_models import DateAvecHoraire, TripResponse
from providers.base import SearchParams
from providers.ryanair_provider import RyanairProvider
from providers.travelpayouts_provider import TravelpayoutsProvider, travelpayouts_enabled


def _dedupe_key(trip: TripResponse) -> str:
    day_out = (trip.aller.departureTime or "")[:10]
    day_back = (trip.retour.departureTime or "")[:10]
    return f"{trip.destination_code}|{day_out}|{day_back}|{trip.provider or ''}"


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
    params = SearchParams(
        aeroport_depart=aeroport_depart,
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

    providers = [RyanairProvider()]
    if travelpayouts_enabled():
        providers.append(TravelpayoutsProvider())

    batches: List[List[TripResponse]] = []
    total_queries = 0

    if len(providers) == 1:
        trips, nq = providers[0].search_roundtrips(params)
        return trips, nq

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = {
            pool.submit(p.search_roundtrips, params): p.name for p in providers
        }
        for fut in as_completed(futures):
            name = futures[fut]
            try:
                trips, nq = fut.result()
                batches.append(trips)
                total_queries += nq
                print(f"✅ provider {name}: {len(trips)} trips, {nq} req")
            except Exception as e:
                print(f"❌ provider {name} failed: {e}")

    merged = merge_trips(batches)
    # Cap overall list similarly to limite_allers * ~2 providers
    cap = max(limite_allers or 50, 30)
    return merged[: cap * 2], total_queries
