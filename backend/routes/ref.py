import csv
import json
import os
import sys
from collections import defaultdict
from datetime import date, timedelta
from typing import List, Optional

from ryanair_routes import fetch_destinations_by_country
from airports_catalog import common_airports_from_travelpayouts, merge_airport_lists
from city_names_fr import (
    CITY_FR_BY_IATA,
    COUNTRY_FR_BY_ISO,
    city_for_code,
    country_for_code,
    localize_airport_dict,
)
from fastapi import APIRouter, HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'ryanair-py'))
from ryanair import Ryanair

router = APIRouter()


def _generate_airports_from_api(country_names: dict) -> List[dict]:
    """Charge les aéroports actifs Ryanair via l'API locate (source de vérité)."""
    import urllib.request

    url = 'https://www.ryanair.com/api/views/locate/5/airports/fr/active'
    try:
        print("🔍 Chargement des aéroports actifs Ryanair...")
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'FlightWatcher/1.0', 'Accept': 'application/json'},
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode('utf-8'))

        airports_list = []
        for item in data if isinstance(data, list) else []:
            code = (item.get('code') or '').strip().upper()
            if len(code) != 3:
                continue
            name = (item.get('name') or code).strip()
            city = ((item.get('city') or {}).get('name') or name).strip()
            iso = ((item.get('country') or {}).get('code') or '').strip().upper()
            airports_list.append(
                localize_airport_dict(
                    {
                        'code': code,
                        'name': name,
                        'city': CITY_FR_BY_IATA.get(code) or city,
                        'country': country_names.get(iso, iso or 'Europe'),
                    }
                )
            )

        airports_list.sort(key=lambda a: a['code'])
        print(f"  ✓ {len(airports_list)} aéroport(s) Ryanair trouvé(s)")
        return airports_list
    except Exception as e:
        print(f"⚠️  Erreur lors de la génération depuis l'API: {e}")
        return [
            {'code': 'BVA', 'name': 'Paris Beauvais', 'city': 'Paris', 'country': 'France'},
            {'code': 'MRS', 'name': 'Marseille Provence', 'city': 'Marseille', 'country': 'France'},
            {'code': 'NCE', 'name': 'Nice', 'city': 'Nice', 'country': 'France'},
            {'code': 'TLS', 'name': 'Toulouse', 'city': 'Toulouse', 'country': 'France'},
            {'code': 'NTE', 'name': 'Nantes', 'city': 'Nantes', 'country': 'France'},
            {'code': 'DUB', 'name': 'Dublin', 'city': 'Dublin', 'country': 'Irlande'},
            {'code': 'BCN', 'name': 'Barcelone', 'city': 'Barcelone', 'country': 'Espagne'},
            {'code': 'LIS', 'name': 'Lisbonne', 'city': 'Lisbonne', 'country': 'Portugal'},
        ]


@router.get("/api/airports")
def get_airports(query: Optional[str] = None):
    """Ryanair actives + aéroports courants (Travelpayouts), labels FR."""
    try:
        country_names = dict(COUNTRY_FR_BY_ISO)

        ryanair = _generate_airports_from_api(country_names)
        if not ryanair:
            airports_file = os.path.join(
                os.path.dirname(__file__), "..", "..", "ryanair-py", "ryanair", "airports.csv"
            )
            if os.path.exists(airports_file):
                with open(airports_file, "r", encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        iata_code = row.get("iata_code", "").strip()
                        municipality = row.get("municipality", "").strip()
                        iso_country = row.get("iso_country", "").strip()
                        airport_name = row.get("name", "").strip()
                        if not iata_code or len(iata_code) != 3:
                            continue
                        ryanair.append(
                            localize_airport_dict(
                                {
                                    "code": iata_code,
                                    "name": airport_name or "N/A",
                                    "city": municipality or "N/A",
                                    "country": country_names.get(
                                        iso_country, iso_country
                                    ),
                                }
                            )
                        )

        common = common_airports_from_travelpayouts(country_names)
        # Ryanair first so their FR labels win on overlap
        airports = merge_airport_lists(ryanair, common)

        if query:
            query_lower = query.lower()
            airports = [
                a
                for a in airports
                if (
                    query_lower in a["code"].lower()
                    or query_lower in a["name"].lower()
                    or query_lower in a["city"].lower()
                    or query_lower in a["country"].lower()
                )
            ]

        return {"airports": airports, "count": len(airports)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/destinations")
def get_destinations(airport: str = "BVA"):
    """Destinations: routes Ryanair si dispo, sinon catalogue commun (multi-compagnies)."""
    try:
        code = (airport or "BVA").strip().upper()
        if len(code) != 3:
            raise HTTPException(status_code=400, detail="Code aéroport invalide")

        destinations_par_pays = _destinations_from_routes(code)
        # Widget vide (ex. CDG/ORY) → catalogue commun direct, pas le fallback vols Ryanair
        if not destinations_par_pays:
            destinations_par_pays = _destinations_from_catalog(exclude_code=code)
        else:
            # Peu de routes Ryanair → enrichir avec le catalogue commun
            ryanair_count = sum(len(v) for v in destinations_par_pays.values())
            if ryanair_count < 15:
                destinations_par_pays = _merge_destination_maps(
                    destinations_par_pays,
                    _destinations_from_catalog(exclude_code=code),
                )

        result = {}
        for pays in sorted(destinations_par_pays.keys()):
            result[pays] = sorted(
                destinations_par_pays[pays].values(), key=lambda x: x["nom"]
            )

        total = sum(len(dests) for dests in result.values())
        print(
            f"  ✓ {total} destination(s) depuis {code} ({len(result)} pays)"
        )
        return {"destinations": result, "aeroport": code}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _merge_destination_maps(base: dict, extra: dict) -> dict:
    out = defaultdict(dict)
    for pays, items in (base or {}).items():
        for code, dest in items.items():
            out[pays][code] = dest
    for pays, items in (extra or {}).items():
        for code, dest in items.items():
            if code not in out[pays]:
                out[pays][code] = dest
    return out


def _destinations_from_catalog(*, exclude_code: str) -> dict:
    """Popular airports as destinations for exclude / multi-airline UX."""
    country_names = dict(COUNTRY_FR_BY_ISO)
    airports = common_airports_from_travelpayouts(country_names)
    by_country = defaultdict(dict)
    for a in airports:
        dest_code = (a.get("code") or "").strip().upper()
        if dest_code == exclude_code or len(dest_code) != 3:
            continue
        pays = (a.get("country") or "Autre").strip() or "Autre"
        city = (a.get("city") or dest_code).strip()
        by_country[pays][dest_code] = {
            "code": dest_code,
            "nom": city,
            "pays": pays,
            "destinationFull": f"{city}, {pays}",
        }
    return by_country


def _destinations_from_routes(airport_code: str) -> dict:
    """Source de vérité: widget routes Ryanair (pas de destinations fantômes)."""
    print(f"🔍 Routes Ryanair depuis {airport_code}...")
    by_country = fetch_destinations_by_country(airport_code)
    print(f"  ✓ {sum(len(v) for v in by_country.values())} route(s) widget")
    return by_country


def _destinations_from_flights(airport_code: str) -> dict:
    api = Ryanair(currency="EUR")
    date_debut = date.today() + timedelta(days=30)
    date_fin = date_debut + timedelta(days=60)
    print(
        f"🔍 Fallback vols depuis {airport_code} du {date_debut} au {date_fin}..."
    )
    vols = api.get_cheapest_flights(
        airport=airport_code,
        date_from=date_debut,
        date_to=date_fin,
        max_price=1000,
    )
    by_country = defaultdict(dict)
    for vol in vols:
        dest_code = vol.destination
        dest_full = vol.destinationFull
        if ", " in dest_full:
            country = dest_full.split(", ")[-1]
        else:
            country = "Autre"
        if dest_code not in by_country[country]:
            city = city_for_code(dest_code, dest_full.split(",")[0].strip())
            pays = country_for_code(dest_code, country) or country
            by_country[pays][dest_code] = {
                "code": dest_code,
                "nom": city,
                "pays": pays,
                "destinationFull": f"{city}, {pays}",
            }
    return by_country
