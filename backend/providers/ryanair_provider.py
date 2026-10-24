"""Ryanair search via ryanair-py."""
from __future__ import annotations

import sys
import os
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import List, Optional, Tuple

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ryanair-py"))

from ryanair import Ryanair

from api_models import FlightResponse, TripResponse
from city_names_fr import destination_full_fr
from providers.base import SearchParams
from providers.ryanair_budget import PURPOSE_ORGANIC, try_acquire
from providers import ryanair_cache
from providers.throttle import (
    is_circuit_open,
    is_fast_search_path,
    record_provider_error,
    record_provider_ok,
    wait_provider_slot,
)
from supabase_deps import SUPABASE_AVAILABLE, record_price_history


def _cache_key(params: SearchParams) -> str:
    outs = ",".join(sorted(str(d.date)[:10] for d in (params.dates_depart or [])))
    rets = ",".join(sorted(str(d.date)[:10] for d in (params.dates_retour or [])))
    dests = ",".join(
        sorted((params.destinations_incluses or []) or ["*"])
    )
    return ryanair_cache.make_key(
        origin=params.aeroport_depart or "",
        dest=dests,
        out_date=outs,
        ret_date=rets,
        passengers=params.passengers or 1,
        budget=int(params.budget_max or 0),
    )

_ryanair_patched = False


def _patch_ryanair_no_403_retry() -> None:
    """Avoid 5× backoff on 403/429 — trip circuit and fail fast."""
    global _ryanair_patched
    if _ryanair_patched:
        return
    try:
        import requests
        from ryanair.ryanair import Ryanair as RyanairCls
    except Exception:
        return

    def _retryable_query(self, url, params=None):
        wait_provider_slot("ryanair")
        if is_circuit_open("ryanair"):
            raise RuntimeError("ryanair circuit open")
        self._num_queries += 1
        response = self.session.get(url, params=params, timeout=25)
        status = getattr(response, "status_code", None)
        if status in (403, 429):
            record_provider_error("ryanair", status)
            if status == 403:
                try:
                    from providers.ryanair_budget import record_forbidden

                    record_forbidden()
                except Exception:
                    pass
            response.raise_for_status()
        try:
            response.raise_for_status()
        except requests.HTTPError as e:
            code = getattr(getattr(e, "response", None), "status_code", None)
            if code and int(code) >= 500:
                record_provider_error("ryanair", code)
            raise
        record_provider_ok("ryanair")
        return response.json()

    RyanairCls._retryable_query = _retryable_query
    _ryanair_patched = True


_patch_ryanair_no_403_retry()


def _localize_flight(flight: FlightResponse) -> FlightResponse:
    data = {
        "originFull": destination_full_fr(flight.origin, fallback_full=flight.originFull),
        "destinationFull": destination_full_fr(
            flight.destination, fallback_full=flight.destinationFull
        ),
    }
    if hasattr(flight, "model_copy"):
        return flight.model_copy(update=data)
    return flight.copy(update=data)


def _clamp_passengers(passengers) -> int:
    try:
        n = int(passengers or 1)
    except (TypeError, ValueError):
        n = 1
    return max(1, min(6, n))


class RyanairProvider:
    name = "ryanair"

    def search_roundtrips(self, params: SearchParams) -> Tuple[List[TripResponse], int]:
        from scan_log import slog

        if is_circuit_open("ryanair"):
            slog("⏸ [ryanair] circuit open — skip")
            return [], 0

        key = _cache_key(params)
        cached = ryanair_cache.get(key)
        if cached is not None:
            trips, nq = cached
            slog(f"💾 [ryanair] cache hit ({len(trips)} trips)")
            return list(trips), int(nq)

        purpose = (params.ryanair_purpose or PURPOSE_ORGANIC).lower()
        if not try_acquire(purpose):
            slog(f"⏸ [ryanair] budget deny purpose={purpose}")
            return [], 0

        api = Ryanair(currency="EUR")
        resultats: List[TripResponse] = []
        pax = _clamp_passengers(params.passengers)
        pax_params = {"adultPaxCount": pax} if pax > 1 else None
        budget_total = int(params.budget_max) * pax
        aeroport_depart = (params.aeroport_depart or "BVA").strip().upper()
        dates_depart = params.dates_depart or []
        dates_retour = params.dates_retour or []
        limite_allers = params.limite_allers or 50
        destinations_exclues = params.destinations_exclues or []
        destinations_incluses = params.destinations_incluses

        if not dates_depart or not dates_retour:
            return [], 0

        slog(
            f"📥 [ryanair] vols aller depuis {aeroport_depart} "
            f"({pax} pax, budget {params.budget_max}€/pers → max {budget_total}€)..."
        )
        tous_vols_aller = []

        for date_config in dates_depart:
            if is_circuit_open("ryanair"):
                slog("⏸ [ryanair] circuit open mid-scan — abort")
                break
            date_obj = datetime.fromisoformat(date_config.date).date()
            try:
                vols = api.get_cheapest_flights(
                    airport=aeroport_depart,
                    date_from=date_obj,
                    date_to=date_obj,
                    departure_time_from=date_config.heure_min or "00:00",
                    departure_time_to=date_config.heure_max or "23:59",
                    max_price=budget_total,
                    custom_params=pax_params,
                )
                for vol in vols:
                    vol_date = vol.departureTime.date()
                    vol_heure = vol.departureTime.time()
                    heure_min = datetime.strptime(
                        date_config.heure_min or "00:00", "%H:%M"
                    ).time()
                    heure_max = datetime.strptime(
                        date_config.heure_max or "23:59", "%H:%M"
                    ).time()

                    if vol_date == date_obj and heure_min <= vol_heure <= heure_max:
                        dest_code = vol.destination
                        if dest_code in destinations_exclues:
                            continue
                        if (
                            destinations_incluses is not None
                            and dest_code not in destinations_incluses
                        ):
                            continue
                        tous_vols_aller.append(vol)
            except Exception as e:
                msg = str(e)
                slog(f"  [ryanair] Erreur date {date_config.date}: {e}")
                if "403" in msg or "429" in msg or "circuit open" in msg:
                    break
                continue

        slog(f"  ✓ [ryanair] {len(tous_vols_aller)} vol(s) aller")

        if not tous_vols_aller:
            return [], api.num_queries

        tous_vols_aller.sort(key=lambda v: v.price)
        vols_aller_optimises = {}
        for vol in tous_vols_aller:
            dest = vol.destination
            if dest not in vols_aller_optimises or vol.price < vols_aller_optimises[dest].price:
                vols_aller_optimises[dest] = vol

        vols_aller_filtres = sorted(
            vols_aller_optimises.values(), key=lambda v: v.price
        )[:limite_allers]

        # Parallel return legs on fast Search path (seed stays serial / gentler)
        workers_hint = 6 if is_fast_search_path() else 1
        workers = min(workers_hint, max(1, len(vols_aller_filtres)))

        def _best_return(vol_aller) -> Optional[TripResponse]:
            if is_circuit_open("ryanair"):
                return None
            # Own client per worker — Session is not thread-safe
            local_api = api if workers <= 1 else Ryanair(currency="EUR")
            destination_code = vol_aller.destination
            meilleur_retour = None
            meilleur_prix_total = float("inf")
            for date_retour_config in dates_retour:
                if is_circuit_open("ryanair"):
                    break
                date_retour_obj = datetime.fromisoformat(date_retour_config.date).date()
                try:
                    vols_retour = local_api.get_cheapest_flights(
                        airport=destination_code,
                        date_from=date_retour_obj,
                        date_to=date_retour_obj,
                        destination_airport=aeroport_depart,
                        departure_time_from=date_retour_config.heure_min or "00:00",
                        departure_time_to=date_retour_config.heure_max or "23:59",
                        max_price=budget_total,
                        custom_params=pax_params,
                    )
                    for vol_retour in vols_retour:
                        vol_retour_date = vol_retour.departureTime.date()
                        vol_retour_heure = vol_retour.departureTime.time()
                        heure_min = datetime.strptime(
                            date_retour_config.heure_min or "00:00", "%H:%M"
                        ).time()
                        heure_max = datetime.strptime(
                            date_retour_config.heure_max or "23:59", "%H:%M"
                        ).time()
                        if (
                            vol_retour_date == date_retour_obj
                            and heure_min <= vol_retour_heure <= heure_max
                        ):
                            prix_groupe = vol_aller.price + vol_retour.price
                            if (
                                prix_groupe <= budget_total
                                and prix_groupe < meilleur_prix_total
                            ):
                                meilleur_retour = vol_retour
                                meilleur_prix_total = prix_groupe
                except Exception:
                    continue

            if not meilleur_retour:
                return None
            aller_pp = round(vol_aller.price / pax, 2)
            retour_pp = round(meilleur_retour.price / pax, 2)
            return TripResponse(
                aller=_localize_flight(
                    FlightResponse(
                        flightNumber=vol_aller.flightNumber,
                        origin=vol_aller.origin,
                        originFull=vol_aller.originFull,
                        destination=vol_aller.destination,
                        destinationFull=vol_aller.destinationFull,
                        departureTime=vol_aller.departureTime.isoformat(),
                        price=aller_pp,
                        currency=vol_aller.currency,
                    )
                ),
                retour=_localize_flight(
                    FlightResponse(
                        flightNumber=meilleur_retour.flightNumber,
                        origin=meilleur_retour.origin,
                        originFull=meilleur_retour.originFull,
                        destination=meilleur_retour.destination,
                        destinationFull=meilleur_retour.destinationFull,
                        departureTime=meilleur_retour.departureTime.isoformat(),
                        price=retour_pp,
                        currency=meilleur_retour.currency,
                    )
                ),
                prix_total=round(aller_pp + retour_pp, 2),
                destination_code=destination_code,
                provider="ryanair",
                airline="FR",
                transfers=0,
                booking_url=None,
            )

        if workers == 1:
            for vol_aller in vols_aller_filtres:
                trip = _best_return(vol_aller)
                if trip:
                    resultats.append(trip)
        else:
            with ThreadPoolExecutor(max_workers=workers) as pool:
                futs = [pool.submit(_best_return, v) for v in vols_aller_filtres]
                for fut in as_completed(futs):
                    try:
                        trip = fut.result()
                        if trip:
                            resultats.append(trip)
                    except Exception:
                        continue

        resultats.sort(key=lambda t: t.prix_total)
        slog(f"  ✓ [ryanair] {len(resultats)} A/R (workers={workers})")

        if params.record_prices and resultats and SUPABASE_AVAILABLE:
            payload = [trip.model_dump() for trip in resultats]

            def _bg_history() -> None:
                try:
                    record_price_history(payload)
                except Exception as e:
                    slog(f"⚠️ Erreur price_history ryanair: {e}")

            threading.Thread(target=_bg_history, daemon=True, name="fw-ryanair-hist").start()

        nq = api.num_queries
        ryanair_cache.set(key, (list(resultats), nq))
        return resultats, nq
