import csv
import json
import os
import sys
from collections import defaultdict
from datetime import date, timedelta
from typing import List, Optional

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
            airports_list.append({
                'code': code,
                'name': name,
                'city': city,
                'country': country_names.get(iso, iso or 'Europe'),
            })

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
            {'code': 'STN', 'name': 'London Stansted', 'city': 'London', 'country': 'Royaume-Uni'},
            {'code': 'DUB', 'name': 'Dublin', 'city': 'Dublin', 'country': 'Irlande'},
            {'code': 'BCN', 'name': 'Barcelone', 'city': 'Barcelone', 'country': 'Espagne'},
        ]


@router.get("/api/airports")
def get_airports(query: Optional[str] = None):
    """Récupère la liste des aéroports avec code, ville et pays, optionnellement filtrée par recherche"""
    try:
        country_names = {
            'FR': 'France', 'GB': 'Royaume-Uni', 'ES': 'Espagne', 'IT': 'Italie',
            'DE': 'Allemagne', 'PT': 'Portugal', 'GR': 'Grèce', 'IE': 'Irlande',
            'BE': 'Belgique', 'NL': 'Pays-Bas', 'CH': 'Suisse', 'AT': 'Autriche',
            'PL': 'Pologne', 'CZ': 'République tchèque', 'HU': 'Hongrie', 'RO': 'Roumanie',
            'BG': 'Bulgarie', 'HR': 'Croatie', 'SI': 'Slovénie', 'SK': 'Slovaquie',
            'DK': 'Danemark', 'SE': 'Suède', 'NO': 'Norvège', 'FI': 'Finlande',
            'AL': 'Albanie', 'BA': 'Bosnie-Herzégovine', 'CY': 'Chypre', 'EE': 'Estonie',
            'LT': 'Lituanie', 'LU': 'Luxembourg', 'LV': 'Lettonie', 'ME': 'Monténégro',
            'MT': 'Malte', 'RS': 'Serbie', 'TR': 'Turquie', 'MA': 'Maroc', 'JO': 'Jordanie',
        }

        airports = []
        airports_file = os.path.join(os.path.dirname(__file__), '..', '..', 'ryanair-py', 'ryanair', 'airports.csv')

        if not os.path.exists(airports_file):
            print("⚠️  Fichier airports.csv introuvable, génération depuis l'API Ryanair...")
            airports = _generate_airports_from_api(country_names)
        else:
            with open(airports_file, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    iata_code = row.get('iata_code', '').strip()
                    municipality = row.get('municipality', '').strip()
                    iso_country = row.get('iso_country', '').strip()
                    airport_name = row.get('name', '').strip()

                    if not iata_code or len(iata_code) != 3:
                        continue

                    country = country_names.get(iso_country, iso_country)

                    airport_data = {
                        'code': iata_code,
                        'name': airport_name or 'N/A',
                        'city': municipality or 'N/A',
                        'country': country,
                    }

                    if query:
                        query_lower = query.lower()
                        if (
                            query_lower in iata_code.lower()
                            or query_lower in airport_name.lower()
                            or query_lower in municipality.lower()
                            or query_lower in country.lower()
                        ):
                            airports.append(airport_data)
                    else:
                        airports.append(airport_data)

        if query and airports:
            query_lower = query.lower()
            airports = [
                a for a in airports
                if (
                    query_lower in a['code'].lower()
                    or query_lower in a['name'].lower()
                    or query_lower in a['city'].lower()
                    or query_lower in a['country'].lower()
                )
            ]

        airports.sort(key=lambda x: x['code'])

        return {"airports": airports, "count": len(airports)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/destinations")
def get_destinations(airport: str = "BVA"):
    """Récupère toutes les destinations disponibles depuis un aéroport, groupées par pays"""
    try:
        api = Ryanair(currency="EUR")

        date_debut = date.today() + timedelta(days=30)
        date_fin = date_debut + timedelta(days=60)

        print(f"🔍 Recherche des destinations depuis {airport} du {date_debut} au {date_fin}...")

        vols = api.get_cheapest_flights(
            airport=airport,
            date_from=date_debut,
            date_to=date_fin,
            max_price=1000,
        )

        print(f"  ✓ {len(vols)} vol(s) trouvé(s)")

        destinations_par_pays = defaultdict(dict)

        for vol in vols:
            dest_code = vol.destination
            dest_full = vol.destinationFull

            if ', ' in dest_full:
                country = dest_full.split(', ')[-1]
            else:
                country = "Autre"

            if dest_code not in destinations_par_pays[country]:
                destinations_par_pays[country][dest_code] = {
                    'code': dest_code,
                    'nom': dest_full.split(',')[0].strip(),
                    'pays': country,
                    'destinationFull': dest_full,
                }

        result = {}
        for pays in sorted(destinations_par_pays.keys()):
            result[pays] = sorted(destinations_par_pays[pays].values(), key=lambda x: x['nom'])

        total_destinations = sum(len(dests) for dests in result.values())
        print(f"  ✓ {total_destinations} destination(s) unique(s) trouvée(s) réparties sur {len(result)} pays")

        return {"destinations": result, "aeroport": airport}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
