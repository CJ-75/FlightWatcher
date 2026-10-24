"""Run Ryanair + Travelpayouts in parallel and merge results.

Always both providers when enabled. Soft deadline: return as soon as we have
enough coverage — don't wait for the slowest provider forever. Late results
still finish in background (cache warm for next search).
"""
from __future__ import annotations

import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, Future, wait, FIRST_COMPLETED
from typing import List, Optional, Sequence, Tuple

from api_models import DateAvecHoraire, TripResponse
from providers.base import SearchParams
from providers.ryanair_budget import PURPOSE_ORGANIC
from providers.ryanair_provider import RyanairProvider
from providers.throttle import fast_search_path, is_circuit_open
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
    from scan_log import slog

    if want("ryanair"):
        if is_circuit_open("ryanair"):
            slog("⏸ orchestrator: ryanair circuit open — skip")
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
    names = [getattr(p, "name", "?") for p in providers]
    slog(f"🔧 providers actifs: {', '.join(names) or '(aucun)'}")
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


def _merge_deadline_s() -> float:
    try:
        return max(3.0, float(os.getenv("SEARCH_MERGE_DEADLINE_S", "8")))
    except (TypeError, ValueError):
        return 8.0


def _merge_grace_s() -> float:
    """After first provider returns, wait this long for the second."""
    try:
        return max(0.0, float(os.getenv("SEARCH_MERGE_GRACE_S", "2.5")))
    except (TypeError, ValueError):
        return 2.5


def _drain_late(fut: Future, name: str) -> None:
    """Let a late provider finish for cache — never block the HTTP response."""
    from scan_log import slog

    try:
        trips, nq = fut.result()
        n = len(trips or [])
        slog("")
        slog(f"📦 RÉSULTATS [{name}] (late/cache) : {n} A/R  ({nq} req)")
        slog(f"⏱ late [{name}] finished — cache warm")
    except Exception as e:
        slog(f"⏱ late [{name}] error: {e}")


def _log_provider_counts(
    counts: dict[str, int],
    *,
    merged_n: int,
    origin: str,
    elapsed_s: float,
    pending_names: Optional[Sequence[str]] = None,
) -> None:
    """One clear terminal block: Ryanair vs Travelpayouts vs merged."""
    from scan_log import slog

    ry = counts.get("ryanair")
    tp = counts.get("travelpayouts")
    slog("")
    slog("-" * 56)
    slog(f"📊 RÉSULTATS PROVIDERS  ·  {origin}  ·  {elapsed_s:.1f}s")
    if ry is None:
        slog("   Ryanair       : (en cours / skip)")
    else:
        slog(f"   Ryanair       : {ry} A/R")
    if tp is None:
        slog("   Travelpayouts : (en cours / skip)")
    else:
        slog(f"   Travelpayouts : {tp} A/R")
    for name, n in sorted(counts.items()):
        if name in ("ryanair", "travelpayouts"):
            continue
        slog(f"   {name:<14}: {n} A/R")
    slog(f"   → Fusionnés   : {merged_n} A/R (dédupliqués)")
    if pending_names:
        slog(f"   ⏳ encore en fond : {', '.join(pending_names)}")
    slog("-" * 56)


def _race_providers(
    providers: list,
    params: SearchParams,
    *,
    deadline_s: float,
    grace_s: float,
) -> Tuple[List[TripResponse], int]:
    """
    Always start all providers. Return when:
    - all finished, or
    - wall deadline hit and we have ≥1 batch, or
    - first batch landed and grace elapsed (second still running → background).
    """
    from scan_log import slog

    origin = (params.aeroport_depart or "?").upper()

    if not providers:
        return [], 0
    if len(providers) == 1:
        p = providers[0]
        trips, nq = p.search_roundtrips(params)
        _log_provider_counts(
            {p.name: len(trips or [])},
            merged_n=len(trips or []),
            origin=origin,
            elapsed_s=0.0,
        )
        return trips, nq

    batches: List[List[TripResponse]] = []
    counts: dict[str, int] = {}
    total_queries = 0
    providers_done: set[str] = set()
    start = time.monotonic()
    first_done_at: Optional[float] = None

    with ThreadPoolExecutor(max_workers=len(providers)) as pool:
        futures: dict[Future, str] = {
            pool.submit(p.search_roundtrips, params): p.name for p in providers
        }
        pending = set(futures.keys())

        while pending:
            elapsed = time.monotonic() - start
            remaining = deadline_s - elapsed
            if remaining <= 0 and batches:
                slog(
                    f"⏱ merge deadline {deadline_s:.1f}s — "
                    f"return with {len(providers_done)}/{len(providers)} providers"
                )
                break
            if remaining <= 0 and not batches:
                # nothing yet — keep a tiny bit of hope
                remaining = 0.5

            if first_done_at is not None and batches:
                grace_left = grace_s - (time.monotonic() - first_done_at)
                if grace_left <= 0:
                    slog(
                        f"⏱ merge grace {grace_s:.1f}s after first provider — "
                        f"return ({', '.join(sorted(providers_done)) or '?'})"
                    )
                    break
                timeout = min(remaining, grace_left, 0.35)
            else:
                timeout = min(max(remaining, 0.05), 0.5)

            done, pending = wait(pending, timeout=timeout, return_when=FIRST_COMPLETED)
            for fut in done:
                name = futures[fut]
                try:
                    trips, nq = fut.result()
                    n = len(trips or [])
                    batches.append(trips or [])
                    counts[name] = n
                    total_queries += int(nq or 0)
                    providers_done.add(name)
                    slog(f"✅ [{name}] {n} A/R trouvés  ({nq} req)")
                    if first_done_at is None:
                        first_done_at = time.monotonic()
                except Exception as e:
                    slog(f"❌ [{name}] échec: {e}")
                    counts[name] = 0
                    providers_done.add(name)
                    if first_done_at is None:
                        first_done_at = time.monotonic()

        pending_names = [futures[f] for f in pending]
        # Late providers → background (cache); don't cancel mid-HTTP
        for fut in pending:
            name = futures[fut]
            threading.Thread(
                target=_drain_late,
                args=(fut, name),
                daemon=True,
                name=f"fw-late-{name}",
            ).start()
            slog(f"⏳ [{name}] continue en fond (comptera en late)")

        merged = merge_trips(batches)
        _log_provider_counts(
            counts,
            merged_n=len(merged),
            origin=origin,
            elapsed_s=time.monotonic() - start,
            pending_names=pending_names or None,
        )
        return merged, total_queries


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
    *,
    deadline_s: Optional[float] = None,
    grace_s: Optional[float] = None,
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
    return _race_providers(
        providers,
        params,
        deadline_s=deadline_s if deadline_s is not None else _merge_deadline_s(),
        grace_s=grace_s if grace_s is not None else _merge_grace_s(),
    )


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

    Always Ryanair + Travelpayouts when enabled. Soft merge deadline so Search
    never waits on the slowest provider.
    """
    origins = parse_origins(aeroport_depart)
    active = _active_providers(only=providers)
    purpose = ryanair_purpose or PURPOSE_ORGANIC
    # Organic / click search → fast throttle; seed/revalidate keep slow gap
    use_fast = purpose in (PURPOSE_ORGANIC, "organic", "click", "user", "")

    deadline = _merge_deadline_s()
    grace = _merge_grace_s()

    with fast_search_path(use_fast):
        # Single origin
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
                deadline_s=deadline,
                grace_s=grace,
            )
            cap = max(limite_allers or 50, 30)
            capped = trips[: cap * 2]
            _maybe_record_observations(capped, record_prices=record_prices)
            return capped, nq

        # Multi-origin city aggregation (e.g. Paris = CDG,ORY,BVA)
        from scan_log import slog

        slog(f"📥 multi-origin scan: {','.join(origins)}")
        batches: List[List[TripResponse]] = []
        total_queries = 0
        # Share one wall clock across origins so Paris ≠ 3× deadline
        workers = min(len(origins), 4)
        per_origin_limit = max(12, (limite_allers or 50) // len(origins))
        start = time.monotonic()

        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {
                pool.submit(
                    _search_one_origin,
                    origin,
                    active,
                    dates_depart,
                    dates_retour,
                    budget_max,
                    per_origin_limit,
                    destinations_exclues,
                    destinations_incluses,
                    record_prices,
                    passengers,
                    direct,
                    purpose,
                    # nested race gets remaining budget
                    deadline_s=max(2.0, deadline - (time.monotonic() - start)),
                    grace_s=grace,
                ): origin
                for origin in origins
            }
            pending = set(futures.keys())
            while pending:
                left = deadline - (time.monotonic() - start)
                if left <= 0 and batches:
                    slog(f"⏱ multi-origin deadline — {len(batches)} origin batch(es)")
                    break
                done, pending = wait(
                    pending,
                    timeout=min(max(left, 0.1), 0.5),
                    return_when=FIRST_COMPLETED,
                )
                for fut in done:
                    origin = futures[fut]
                    try:
                        trips, nq = fut.result()
                        batches.append(trips)
                        total_queries += nq
                        slog(f"✅ origin {origin}: {len(trips)} trips")
                    except Exception as e:
                        slog(f"❌ origin {origin} failed: {e}")
            for fut in pending:
                origin = futures[fut]
                threading.Thread(
                    target=_drain_late,
                    args=(fut, f"origin:{origin}"),
                    daemon=True,
                ).start()

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
        from scan_log import slog

        slog(f"⚠️ price_observations skip: {e}")
