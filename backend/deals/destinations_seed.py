"""Curated deal destinations (FR-friendly weekend cities) — seed source of truth."""
from __future__ import annotations

from typing import Any, Dict, List

# Tourist-centre GPS (hand-picked), not airport coords.
# iata_arrival = primary low-cost arrival for Ryanair/FR market.
DESTINATIONS_SEED: List[Dict[str, Any]] = [
    {
        "slug": "lisbonne",
        "city_name": "Lisbonne",
        "country_code": "PT",
        "iata_arrival": "LIS",
        "center_lat": 38.7139,
        "center_lng": -9.1394,
        "pool_radius_m": 2200,
        "timezone": "Europe/Lisbon",
        "priority": 10,
    },
    {
        "slug": "porto",
        "city_name": "Porto",
        "country_code": "PT",
        "iata_arrival": "OPO",
        "center_lat": 41.1409,
        "center_lng": -8.6135,
        "pool_radius_m": 2000,
        "timezone": "Europe/Lisbon",
        "priority": 20,
    },
    {
        "slug": "barcelone",
        "city_name": "Barcelone",
        "country_code": "ES",
        "iata_arrival": "BCN",
        "center_lat": 41.3833,
        "center_lng": 2.1767,
        "pool_radius_m": 2000,
        "timezone": "Europe/Madrid",
        "priority": 30,
    },
    {
        "slug": "rome",
        "city_name": "Rome",
        "country_code": "IT",
        "iata_arrival": "CIA",
        "center_lat": 41.8986,
        "center_lng": 12.4768,
        "pool_radius_m": 2200,
        "timezone": "Europe/Rome",
        "priority": 40,
    },
    {
        "slug": "milan",
        "city_name": "Milan",
        "country_code": "IT",
        "iata_arrival": "BGY",
        "center_lat": 45.4642,
        "center_lng": 9.1900,
        "pool_radius_m": 2000,
        "timezone": "Europe/Rome",
        "priority": 50,
    },
    {
        "slug": "madrid",
        "city_name": "Madrid",
        "country_code": "ES",
        "iata_arrival": "MAD",
        "center_lat": 40.4168,
        "center_lng": -3.7038,
        "pool_radius_m": 2000,
        "timezone": "Europe/Madrid",
        "priority": 60,
    },
    {
        "slug": "dublin",
        "city_name": "Dublin",
        "country_code": "IE",
        "iata_arrival": "DUB",
        "center_lat": 53.3456,
        "center_lng": -6.2641,
        "pool_radius_m": 2000,
        "timezone": "Europe/Dublin",
        "priority": 70,
    },
    {
        "slug": "budapest",
        "city_name": "Budapest",
        "country_code": "HU",
        "iata_arrival": "BUD",
        "center_lat": 47.4979,
        "center_lng": 19.0402,
        "pool_radius_m": 2000,
        "timezone": "Europe/Budapest",
        "priority": 80,
    },
    {
        "slug": "prague",
        "city_name": "Prague",
        "country_code": "CZ",
        "iata_arrival": "PRG",
        "center_lat": 50.0875,
        "center_lng": 14.4213,
        "pool_radius_m": 2000,
        "timezone": "Europe/Prague",
        "priority": 90,
    },
    {
        "slug": "cracovie",
        "city_name": "Cracovie",
        "country_code": "PL",
        "iata_arrival": "KRK",
        "center_lat": 50.0619,
        "center_lng": 19.9368,
        "pool_radius_m": 1800,
        "timezone": "Europe/Warsaw",
        "priority": 100,
    },
]


def destination_upsert_rows() -> List[Dict[str, Any]]:
    rows = []
    for d in DESTINATIONS_SEED:
        rows.append(
            {
                **d,
                "active": True,
            }
        )
    return rows
