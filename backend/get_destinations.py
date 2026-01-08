"""
Script utilitaire pour obtenir toutes les destinations disponibles depuis un aéroport
et les grouper par pays pour le frontend
"""
import sys
import os
from datetime import datetime, date, timedelta
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ryanair-py'))
from ryanair import Ryanair

def get_destinations_by_country(airport_code: str) -> dict:
    """Récupère toutes les destinations depuis un aéroport et les groupe par pays"""
    api = Ryanair(currency="EUR")
    
    # Chercher sur plusieurs dates pour obtenir TOUTES les destinations disponibles
    # Certaines destinations peuvent ne pas avoir de vols tous les jours
    date_debut = date.today() + timedelta(days=30)
    date_fin = date_debut + timedelta(days=60)  # Chercher sur 60 jours
    
    try:
        print(f"🔍 Recherche des destinations depuis {airport_code} du {date_debut} au {date_fin}...")
        
        # Récupérer tous les vols disponibles sur la plage de dates
        vols = api.get_cheapest_flights(
            airport=airport_code,
            date_from=date_debut,
            date_to=date_fin,
            max_price=1000  # Prix élevé pour ne pas filtrer
        )
        
        print(f"  ✓ {len(vols)} vol(s) trouvé(s)")
        
        # Grouper par pays et dédoublonner les destinations
        destinations_par_pays = defaultdict(dict)  # Utiliser un dict pour dédoublonner par code
        
        for vol in vols:
            dest_code = vol.destination
            dest_full = vol.destinationFull
            
            # Extraire le pays depuis destinationFull (format: "City, Country")
            if ', ' in dest_full:
                country = dest_full.split(', ')[-1]
            else:
                country = "Autre"
            
            # Garder seulement la première occurrence de chaque destination
            if dest_code not in destinations_par_pays[country]:
                destinations_par_pays[country][dest_code] = {
                    'code': dest_code,
                    'nom': dest_full.split(',')[0].strip(),
                    'pays': country,
                    'destinationFull': dest_full
                }
        
        # Convertir les dict en listes et trier
        result = {}
        for pays in sorted(destinations_par_pays.keys()):
            result[pays] = sorted(destinations_par_pays[pays].values(), key=lambda x: x['nom'])
        
        total_destinations = sum(len(dests) for dests in result.values())
        print(f"  ✓ {total_destinations} destination(s) unique(s) trouvée(s) réparties sur {len(result)} pays")
        
        return result
    except Exception as e:
        print(f"Erreur: {e}")
        return {}

if __name__ == "__main__":
    airport = sys.argv[1] if len(sys.argv) > 1 else "BVA"
    destinations = get_destinations_by_country(airport)
    
    print(f"Destinations depuis {airport}:")
    for pays, dests in destinations.items():
        print(f"\n{pays}:")
        for dest in dests:
            print(f"  - {dest['code']}: {dest['nom']}")

