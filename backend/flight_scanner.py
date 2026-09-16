"""
Flight scanning logic for Ryanair API.
"""
import sys
import os
from datetime import date, datetime, timedelta
from typing import List, Optional, Tuple

# Ajouter le chemin parent pour importer ryanair
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ryanair-py'))

from ryanair import Ryanair

from api_models import (
    DateAvecHoraire,
    FlightResponse,
    TripResponse,
    EnrichedTripResponse,
)
from supabase_deps import SUPABASE_AVAILABLE, get_supabase_service_client, record_price_history


def scanner_vols_api(
    aeroport_depart: str,
    dates_depart: List[DateAvecHoraire],
    dates_retour: List[DateAvecHoraire],
    budget_max: int = 200,
    limite_allers: int = 50,
    destinations_exclues: List[str] = None,
    destinations_incluses: List[str] = None,
    record_prices: bool = True,
) -> Tuple[List[TripResponse], int]:
    """
    Fonction de scan optimisée :
    1. Récupère TOUS les vols aller d'abord
    2. Trie par prix et garde les plus pertinents
    3. Cherche les retours uniquement pour les meilleurs allers
    """
    api = Ryanair(currency="EUR")
    resultats = []

    if not dates_depart or not dates_retour:
        return [], 0

    destinations_exclues = destinations_exclues or []
    destinations_incluses = destinations_incluses if destinations_incluses is not None else None

    print(f"📥 Étape 1: Récupération de tous les vols aller depuis {aeroport_depart}...")
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
                max_price=budget_max,
            )
            for vol in vols:
                vol_date = vol.departureTime.date()
                vol_heure = vol.departureTime.time()
                heure_min = datetime.strptime(date_config.heure_min or "00:00", "%H:%M").time()
                heure_max = datetime.strptime(date_config.heure_max or "23:59", "%H:%M").time()

                if vol_date == date_obj and heure_min <= vol_heure <= heure_max:
                    dest_code = vol.destination
                    if dest_code in destinations_exclues:
                        continue
                    if destinations_incluses is not None and dest_code not in destinations_incluses:
                        continue
                    tous_vols_aller.append(vol)
        except Exception as e:
            print(f"  Erreur pour la date {date_config.date}: {e}")
            continue

    print(f"  ✓ {len(tous_vols_aller)} vol(s) aller trouvé(s)")

    if not tous_vols_aller:
        return [], api.num_queries

    tous_vols_aller.sort(key=lambda v: v.price)

    vols_aller_optimises = {}
    for vol in tous_vols_aller:
        dest = vol.destination
        if dest not in vols_aller_optimises or vol.price < vols_aller_optimises[dest].price:
            vols_aller_optimises[dest] = vol

    vols_aller_filtres = sorted(vols_aller_optimises.values(), key=lambda v: v.price)[:limite_allers]
    print(f"  ✓ {len(vols_aller_filtres)} destination(s) retenue(s) pour recherche de retours")

    print(f"📤 Étape 2: Recherche des vols retour pour les meilleures destinations...")
    for vol_aller in vols_aller_filtres:
        destination_code = vol_aller.destination
        meilleur_retour = None
        meilleur_prix_total = float('inf')

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
                    max_price=budget_max,
                )

                for vol_retour in vols_retour:
                    vol_retour_date = vol_retour.departureTime.date()
                    vol_retour_heure = vol_retour.departureTime.time()
                    heure_min = datetime.strptime(date_retour_config.heure_min or "00:00", "%H:%M").time()
                    heure_max = datetime.strptime(date_retour_config.heure_max or "23:59", "%H:%M").time()

                    if (
                        vol_retour_date == date_retour_obj
                        and heure_min <= vol_retour_heure <= heure_max
                    ):
                        prix_total = vol_aller.price + vol_retour.price
                        if prix_total <= budget_max and prix_total < meilleur_prix_total:
                            meilleur_retour = vol_retour
                            meilleur_prix_total = prix_total
            except Exception:
                continue

        if meilleur_retour:
            resultats.append(
                TripResponse(
                    aller=FlightResponse(
                        flightNumber=vol_aller.flightNumber,
                        origin=vol_aller.origin,
                        originFull=vol_aller.originFull,
                        destination=vol_aller.destination,
                        destinationFull=vol_aller.destinationFull,
                        departureTime=vol_aller.departureTime.isoformat(),
                        price=vol_aller.price,
                        currency=vol_aller.currency,
                    ),
                    retour=FlightResponse(
                        flightNumber=meilleur_retour.flightNumber,
                        origin=meilleur_retour.origin,
                        originFull=meilleur_retour.originFull,
                        destination=meilleur_retour.destination,
                        destinationFull=meilleur_retour.destinationFull,
                        departureTime=meilleur_retour.departureTime.isoformat(),
                        price=meilleur_retour.price,
                        currency=meilleur_retour.currency,
                    ),
                    prix_total=meilleur_prix_total,
                    destination_code=destination_code,
                )
            )

    print(f"  ✓ {len(resultats)} voyage(s) aller-retour complet(s) trouvé(s)")

    if record_prices and resultats and SUPABASE_AVAILABLE:
        try:
            trips_dict = [trip.model_dump() for trip in resultats]
            record_price_history(trips_dict)
        except Exception as e:
            print(f"⚠️ Erreur enregistrement price_history: {e}")

    return resultats, api.num_queries


def get_dates_from_preset(preset: str) -> Tuple[List[DateAvecHoraire], List[DateAvecHoraire]]:
    """
    Convertit un preset de dates en listes de DateAvecHoraire pour aller et retour
    weekday() retourne 0=lundi, 1=mardi, ..., 6=dimanche
    """
    today = date.today()
    dates_depart = []
    dates_retour = []
    current_day = today.weekday()

    if preset == 'weekend':
        if current_day == 4:
            departure_date = today
            sunday_offset = 6 - current_day
            return_date = today + timedelta(days=sunday_offset)
        else:
            saturday_offset = 5 - current_day
            sunday_offset = 6 - current_day

            if current_day == 6:
                saturday_offset += 7
                sunday_offset += 7
            else:
                if saturday_offset < 0:
                    saturday_offset += 7
                if sunday_offset < 0:
                    sunday_offset += 7

            departure_date = today + timedelta(days=saturday_offset)
            return_date = today + timedelta(days=sunday_offset)

        dates_depart.append(DateAvecHoraire(date=departure_date.isoformat(), heure_min="06:00", heure_max="23:59"))
        dates_retour.append(DateAvecHoraire(date=return_date.isoformat(), heure_min="06:00", heure_max="23:59"))

    elif preset == 'next-weekend':
        if current_day == 4:
            departure_date = today + timedelta(days=7)
            days_until_next_sunday = 13 - current_day
            return_date = today + timedelta(days=days_until_next_sunday)
            dates_depart.append(DateAvecHoraire(date=departure_date.isoformat(), heure_min="06:00", heure_max="23:59"))
            dates_retour.append(DateAvecHoraire(date=return_date.isoformat(), heure_min="06:00", heure_max="23:59"))
        elif current_day == 5 or current_day == 6:
            days_until_next_friday = 11 - current_day
            days_until_next_sunday = 13 - current_day

            friday_date = today + timedelta(days=days_until_next_friday)
            sunday_date = today + timedelta(days=days_until_next_sunday)

            dates_depart.append(DateAvecHoraire(date=friday_date.isoformat(), heure_min="06:00", heure_max="23:59"))
            dates_retour.append(DateAvecHoraire(date=sunday_date.isoformat(), heure_min="06:00", heure_max="23:59"))
        else:
            days_until_next_saturday = 12 - current_day
            days_until_next_sunday = 13 - current_day

            departure_date = today + timedelta(days=days_until_next_saturday)
            return_date = today + timedelta(days=days_until_next_sunday)
            dates_depart.append(DateAvecHoraire(date=departure_date.isoformat(), heure_min="06:00", heure_max="23:59"))
            dates_retour.append(DateAvecHoraire(date=return_date.isoformat(), heure_min="06:00", heure_max="23:59"))

    elif preset == 'next-week':
        days_until_next_monday = 7 - current_day

        next_monday = today + timedelta(days=days_until_next_monday)
        next_tuesday = next_monday + timedelta(days=1)
        next_wednesday = next_monday + timedelta(days=2)
        next_thursday = next_monday + timedelta(days=3)
        next_friday = next_monday + timedelta(days=4)
        next_saturday = next_monday + timedelta(days=5)

        dates_depart.extend([
            DateAvecHoraire(date=next_monday.isoformat(), heure_min="06:00", heure_max="23:59"),
            DateAvecHoraire(date=next_tuesday.isoformat(), heure_min="06:00", heure_max="23:59"),
            DateAvecHoraire(date=next_wednesday.isoformat(), heure_min="06:00", heure_max="23:59"),
        ])
        dates_retour.extend([
            DateAvecHoraire(date=next_thursday.isoformat(), heure_min="06:00", heure_max="23:59"),
            DateAvecHoraire(date=next_friday.isoformat(), heure_min="06:00", heure_max="23:59"),
            DateAvecHoraire(date=next_saturday.isoformat(), heure_min="06:00", heure_max="23:59"),
        ])

    return dates_depart, dates_retour


def get_avg_price_last_month(departure_airport: str, destination_code: str) -> Optional[float]:
    """Récupère le prix moyen du mois dernier pour une route donnée depuis Supabase"""
    if not SUPABASE_AVAILABLE:
        return None

    try:
        supabase_service = get_supabase_service_client()
        if not supabase_service:
            return None

        result = supabase_service.rpc(
            'get_avg_price_last_30_days',
            {
                'p_departure': departure_airport,
                'p_destination': destination_code,
            },
        ).execute()

        if result.data is not None:
            try:
                avg_price = float(result.data)
                if avg_price > 0:
                    return avg_price
            except (ValueError, TypeError):
                pass

        return None
    except Exception as e:
        print(f"⚠️ Erreur récupération prix moyen: {e}")
        return None


def calculate_discount(current_price: float, avg_price: Optional[float]) -> float:
    """Calcule le pourcentage de réduction par rapport au prix moyen"""
    if avg_price is None or avg_price == 0:
        return 0.0

    if current_price >= avg_price:
        return 0.0

    discount = ((avg_price - current_price) / avg_price) * 100
    return round(discount, 1)


def enrich_trip_results(trips: List[TripResponse], departure_airport: str) -> List[EnrichedTripResponse]:
    """Enrichit les résultats de trips avec discount, images et flags"""
    enriched = []

    for trip in trips[:15]:
        avg_price = get_avg_price_last_month(departure_airport, trip.destination_code)
        discount_percent = calculate_discount(trip.prix_total, avg_price)
        city_name = trip.aller.destinationFull.split(',')[0].strip()
        image_url = f"https://source.unsplash.com/800x600/?{city_name}"

        enriched_trip = EnrichedTripResponse(
            aller=trip.aller,
            retour=trip.retour,
            prix_total=trip.prix_total,
            destination_code=trip.destination_code,
            discount_percent=discount_percent if discount_percent > 0 else None,
            is_good_deal=discount_percent > 20,
            image_url=image_url,
            avg_price_last_month=avg_price,
        )
        enriched.append(enriched_trip)

    return enriched
