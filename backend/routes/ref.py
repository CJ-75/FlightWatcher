import csv
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
    """Génère une liste d'aéroports en interrogeant l'API Ryanair depuis plusieurs hubs majeurs"""
    try:
        api = Ryanair(currency="EUR")
        airports_dict = {}

        major_hubs = [
            'BVA', 'CDG', 'ORY', 'STN', 'LGW', 'DUB', 'BCN', 'MAD', 'FCO', 'MXP',
            'AMS', 'BRU', 'BER', 'VIE', 'WAW', 'PRG', 'BUD', 'OTP', 'SOF',
            'CPH', 'ARN', 'OSL', 'HEL', 'LIS', 'OPO', 'ATH', 'DUB',
        ]

        print(f"🔍 Génération de la liste d'aéroports depuis {len(major_hubs)} hubs majeurs...")

        date_debut = date.today() + timedelta(days=30)
        date_fin = date_debut + timedelta(days=30)

        for hub in major_hubs:
            try:
                vols = api.get_cheapest_flights(
                    airport=hub,
                    date_from=date_debut,
                    date_to=date_fin,
                    max_price=1000,
                )

                if hub not in airports_dict:
                    airports_dict[hub] = {
                        'code': hub,
                        'name': f'Aéroport {hub}',
                        'city': hub,
                        'country': 'Europe',
                    }

                for vol in vols:
                    dest_code = vol.destination
                    if dest_code and len(dest_code) == 3 and dest_code not in airports_dict:
                        dest_full = getattr(vol, 'destinationFull', '') or ''
                        if ', ' in dest_full:
                            city = dest_full.split(',')[0].strip()
                            country = dest_full.split(',')[-1].strip()
                        else:
                            city = dest_code
                            country = 'Europe'

                        airports_dict[dest_code] = {
                            'code': dest_code,
                            'name': f'Aéroport {dest_code}',
                            'city': city,
                            'country': country,
                        }
            except Exception as e:
                print(f"  ⚠️  Erreur pour hub {hub}: {e}")
                continue

        airports_list = list(airports_dict.values())
        print(f"  ✓ {len(airports_list)} aéroport(s) trouvé(s)")

        return airports_list
    except Exception as e:
        print(f"⚠️  Erreur lors de la génération depuis l'API: {e}")
        return [
            {'code': 'BVA', 'name': 'Aéroport de Beauvais-Tillé', 'city': 'Beauvais', 'country': 'France'},
            {'code': 'CDG', 'name': 'Aéroport Charles de Gaulle', 'city': 'Paris', 'country': 'France'},
            {'code': 'ORY', 'name': 'Aéroport d\'Orly', 'city': 'Paris', 'country': 'France'},
            {'code': 'STN', 'name': 'London Stansted', 'city': 'London', 'country': 'Royaume-Uni'},
            {'code': 'LGW', 'name': 'London Gatwick', 'city': 'London', 'country': 'Royaume-Uni'},
            {'code': 'DUB', 'name': 'Dublin Airport', 'city': 'Dublin', 'country': 'Irlande'},
            {'code': 'BCN', 'name': 'Barcelone-El Prat', 'city': 'Barcelone', 'country': 'Espagne'},
            {'code': 'MAD', 'name': 'Madrid-Barajas', 'city': 'Madrid', 'country': 'Espagne'},
            {'code': 'FCO', 'name': 'Rome Fiumicino', 'city': 'Rome', 'country': 'Italie'},
            {'code': 'MXP', 'name': 'Milan Malpensa', 'city': 'Milan', 'country': 'Italie'},
            {'code': 'AMS', 'name': 'Amsterdam Schiphol', 'city': 'Amsterdam', 'country': 'Pays-Bas'},
            {'code': 'BRU', 'name': 'Bruxelles', 'city': 'Bruxelles', 'country': 'Belgique'},
            {'code': 'BER', 'name': 'Berlin Brandenburg', 'city': 'Berlin', 'country': 'Allemagne'},
            {'code': 'VIE', 'name': 'Vienne', 'city': 'Vienne', 'country': 'Autriche'},
            {'code': 'WAW', 'name': 'Varsovie Chopin', 'city': 'Varsovie', 'country': 'Pologne'},
            {'code': 'PRG', 'name': 'Prague', 'city': 'Prague', 'country': 'République tchèque'},
            {'code': 'BUD', 'name': 'Budapest', 'city': 'Budapest', 'country': 'Hongrie'},
            {'code': 'OTP', 'name': 'Bucarest', 'city': 'Bucarest', 'country': 'Roumanie'},
            {'code': 'SOF', 'name': 'Sofia', 'city': 'Sofia', 'country': 'Bulgarie'},
            {'code': 'CPH', 'name': 'Copenhague', 'city': 'Copenhague', 'country': 'Danemark'},
            {'code': 'ARN', 'name': 'Stockholm Arlanda', 'city': 'Stockholm', 'country': 'Suède'},
            {'code': 'OSL', 'name': 'Oslo Gardermoen', 'city': 'Oslo', 'country': 'Norvège'},
            {'code': 'HEL', 'name': 'Helsinki', 'city': 'Helsinki', 'country': 'Finlande'},
            {'code': 'LIS', 'name': 'Lisbonne', 'city': 'Lisbonne', 'country': 'Portugal'},
            {'code': 'OPO', 'name': 'Porto', 'city': 'Porto', 'country': 'Portugal'},
            {'code': 'ATH', 'name': 'Athènes', 'city': 'Athènes', 'country': 'Grèce'},
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
            'US': 'États-Unis', 'CA': 'Canada', 'MX': 'Mexique', 'BR': 'Brésil',
            'AR': 'Argentine', 'CL': 'Chili', 'CO': 'Colombie', 'PE': 'Pérou',
            'AU': 'Australie', 'NZ': 'Nouvelle-Zélande', 'JP': 'Japon', 'CN': 'Chine',
            'IN': 'Inde', 'TH': 'Thaïlande', 'VN': 'Vietnam', 'PH': 'Philippines',
            'ID': 'Indonésie', 'MY': 'Malaisie', 'SG': 'Singapour', 'AE': 'Émirats arabes unis',
            'TR': 'Turquie', 'EG': 'Égypte', 'MA': 'Maroc', 'ZA': 'Afrique du Sud',
            'IL': 'Israël', 'JO': 'Jordanie', 'LB': 'Liban', 'SA': 'Arabie saoudite',
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
