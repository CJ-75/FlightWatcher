"""Ryanair search via ryanair-py."""
from __future__ import annotations

import sys
import os
from datetime import datetime
from typing import List, Tuple

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "ryanair-py"))

from ryanair import Ryanair

from api_models import FlightResponse, TripResponse
from city_names_fr import destination_full_fr
from providers.base import SearchParams
from supabase_deps import SUPABASE_AVAILABLE, record_price_history


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

        print(
            f"📥 [ryanair] vols aller depuis {aeroport_depart} "
            f"({pax} pax, budget {params.budget_max}€/pers → max {budget_total}€)..."
        )
        tous_vols_aller = []

        for date_config in dates_depart:
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
                print(f"  [ryanair] Erreur date {date_config.date}: {e}")
                continue

        print(f"  ✓ [ryanair] {len(tous_vols_aller)} vol(s) aller")

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

        for vol_aller in vols_aller_filtres:
            destination_code = vol_aller.destination
            meilleur_retour = None
            meilleur_prix_total = float("inf")

            for date_retour_config in dates_retour:
                date_retour_obj = datetime.fromisoformat(date_retour_config.date).date()
                try:
                    vols_retour = api.get_cheapest_flights(
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

            if meilleur_retour:
                aller_pp = round(vol_aller.price / pax, 2)
                retour_pp = round(meilleur_retour.price / pax, 2)
                resultats.append(
                    TripResponse(
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
                )

        print(f"  ✓ [ryanair] {len(resultats)} A/R")

        if params.record_prices and resultats and SUPABASE_AVAILABLE:
            try:
                record_price_history([trip.model_dump() for trip in resultats])
            except Exception as e:
                print(f"⚠️ Erreur price_history ryanair: {e}")

        return resultats, api.num_queries
