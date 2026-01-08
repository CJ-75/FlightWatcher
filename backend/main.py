"""
API Backend pour le scanner de vols Ryanair
"""
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Tuple, Dict
from datetime import date, datetime, timedelta
import sys
import os
import hashlib
import json
from pathlib import Path
from dotenv import load_dotenv

# Charger le fichier .env AVANT les imports Supabase
env_path = Path(__file__).parent / '.env'
print(f"📁 Chargement du fichier .env depuis: {env_path}")
if env_path.exists():
    print(f"✅ Fichier .env trouvé")
    load_dotenv(env_path, override=True)  # override=True pour forcer le rechargement
else:
    print(f"⚠️  Fichier .env introuvable: {env_path}")

# Vérifier les variables après chargement
supabase_url_check = os.getenv("SUPABASE_URL")
supabase_key_check = os.getenv("SUPABASE_ANON_KEY")
print(f"🔍 Vérification variables après chargement:")
print(f"   SUPABASE_URL: {'✅ Définie' if supabase_url_check else '❌ Manquante'}")
print(f"   SUPABASE_ANON_KEY: {'✅ Définie' if supabase_key_check else '❌ Manquante'}")

# Ajouter le chemin parent pour importer ryanair
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ryanair-py'))

from ryanair import Ryanair
from ryanair.types import Flight

# Import conditionnel de Supabase (avant les endpoints)
try:
    print("🔄 Tentative d'import des modules Supabase...")
    from supabase_client import get_supabase_client, get_supabase_service_client
    from db_models import SavedSearchDB, SavedFavoriteDB
    from auth_middleware import get_user_id_from_token, optional_auth
    from price_tracker import record_price_history
    print("✅ Modules Supabase importés avec succès")
    
    # Tester si les variables d'environnement sont définies (après chargement du .env)
    if not os.getenv("SUPABASE_URL") or not os.getenv("SUPABASE_ANON_KEY"):
        print("⚠️  Variables d'environnement Supabase manquantes")
        print("   Créez un fichier backend/.env avec SUPABASE_URL et SUPABASE_ANON_KEY")
        print("   Exécutez 'python backend/check_env.py' pour créer un fichier exemple")
        raise ValueError("Variables d'environnement Supabase manquantes")
    
    # Tester la connexion réelle
    print("🔌 Test de connexion Supabase...")
    test_client = get_supabase_client()
    print("✅ Connexion Supabase réussie")
    
    SUPABASE_AVAILABLE = True
    print("✅ Supabase configuré et disponible")
except Exception as e:
    print(f"⚠️  Supabase non disponible: {e}")
    import traceback
    print("📋 Détails de l'erreur:")
    traceback.print_exc()
    print("   Les fonctionnalités Supabase seront désactivées.")
    print("   Pour activer Supabase, configurez SUPABASE_URL et SUPABASE_ANON_KEY dans backend/.env")
    SUPABASE_AVAILABLE = False
    get_supabase_client = None
    get_supabase_service_client = None
    get_user_id_from_token = lambda r: None
    optional_auth = lambda f: f  # Décorateur par défaut qui ne fait rien
    record_price_history = lambda trips: None

app = FastAPI(title="Ryanair Flight Scanner API")

# CORS pour permettre les requêtes depuis le frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],  # Vite et autres ports React
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class FlightResponse(BaseModel):
    flightNumber: str
    origin: str
    originFull: str
    destination: str
    destinationFull: str
    departureTime: str  # ISO format
    price: float
    currency: str

class TripResponse(BaseModel):
    aller: FlightResponse
    retour: FlightResponse
    prix_total: float
    destination_code: str

class DateAvecHoraire(BaseModel):
    date: str  # ISO format
    heure_min: Optional[str] = "00:00"  # Format HH:MM
    heure_max: Optional[str] = "23:59"  # Format HH:MM

class ScanRequest(BaseModel):
    aeroport_depart: str = "BVA"  # Code IATA de l'aéroport de départ
    dates_depart: List[DateAvecHoraire]  # Dates avec horaires individuels
    dates_retour: List[DateAvecHoraire]  # Dates avec horaires individuels
    budget_max: Optional[int] = 200  # Prix max pour le total (aller + retour)
    limite_allers: Optional[int] = 50  # Nombre max d'allers à traiter pour les retours
    destinations_exclues: Optional[List[str]] = []  # Codes IATA des destinations à exclure
    destinations_incluses: Optional[List[str]] = None  # Codes IATA des destinations à inclure (si None, toutes sauf exclues)

class ScanResponse(BaseModel):
    resultats: List[TripResponse]
    nombre_requetes: int
    message: str

class AutoCheckRequest(BaseModel):
    search_id: str
    previous_results: Optional[List[TripResponse]] = None

class AutoCheckResponse(BaseModel):
    search_id: str
    current_results: List[TripResponse]
    new_results: List[TripResponse]
    nombre_requetes: int
    message: str

class InspireRequest(BaseModel):
    budget: int
    date_preset: str  # 'weekend', 'next-weekend', 'next-week', 'flexible'
    departure: str  # Code aéroport
    flexible_dates: Optional[Dict[str, List[DateAvecHoraire]]] = None  # Dates avec horaires individuels (pour tous les presets maintenant)
    destinations_exclues: Optional[List[str]] = None
    limite_allers: Optional[int] = None

class EnrichedTripResponse(TripResponse):
    discount_percent: Optional[float] = None
    is_good_deal: Optional[bool] = None
    image_url: Optional[str] = None
    avg_price_last_month: Optional[float] = None

class InspireResponse(BaseModel):
    resultats: List[EnrichedTripResponse]
    nombre_requetes: int
    message: str

def scanner_vols_api(aeroport_depart: str, dates_depart: List[DateAvecHoraire], 
                     dates_retour: List[DateAvecHoraire], budget_max: int = 200,
                     limite_allers: int = 50, destinations_exclues: List[str] = None,
                     destinations_incluses: List[str] = None, 
                     record_prices: bool = True) -> Tuple[List[TripResponse], int]:
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
    
    # Normaliser les listes de destinations
    destinations_exclues = destinations_exclues or []
    destinations_incluses = destinations_incluses if destinations_incluses is not None else None
    
    # Étape 1: Récupérer TOUS les vols aller pour toutes les dates
    print(f"📥 Étape 1: Récupération de tous les vols aller depuis {aeroport_depart}...")
    tous_vols_aller = []
    
    for date_config in dates_depart:
        date_obj = datetime.fromisoformat(date_config.date).date()
        try:
            # Ne pas filtrer par prix au niveau des allers (on filtrera au niveau total)
            # Utiliser budget_max comme limite max pour éviter les prix trop élevés
            vols = api.get_cheapest_flights(
                airport=aeroport_depart,
                date_from=date_obj,
                date_to=date_obj,
                departure_time_from=date_config.heure_min or "00:00",
                departure_time_to=date_config.heure_max or "23:59",
                max_price=budget_max  # Limite pour éviter les prix trop élevés, mais le vrai filtre sera sur le total
            )
            # Filtrer par date exacte et horaire
            for vol in vols:
                vol_date = vol.departureTime.date()
                vol_heure = vol.departureTime.time()
                heure_min = datetime.strptime(date_config.heure_min or "00:00", "%H:%M").time()
                heure_max = datetime.strptime(date_config.heure_max or "23:59", "%H:%M").time()
                
                if vol_date == date_obj and heure_min <= vol_heure <= heure_max:
                    # Ne pas filtrer par prix ici, on vérifiera le total plus tard
                    # Filtrer par destinations si spécifié
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
    
    # Étape 2: Trier par prix et garder les plus pertinents
    tous_vols_aller.sort(key=lambda v: v.price)
    
    # Grouper par destination et garder le meilleur prix par destination
    vols_aller_optimises = {}
    for vol in tous_vols_aller:
        dest = vol.destination
        if dest not in vols_aller_optimises or vol.price < vols_aller_optimises[dest].price:
            vols_aller_optimises[dest] = vol
    
    # Prendre les N meilleurs (triés par prix)
    vols_aller_filtres = sorted(vols_aller_optimises.values(), key=lambda v: v.price)[:limite_allers]
    print(f"  ✓ {len(vols_aller_filtres)} destination(s) retenue(s) pour recherche de retours")
    
    # Étape 3: Chercher les retours uniquement pour les meilleurs allers
    print(f"📤 Étape 2: Recherche des vols retour pour les meilleures destinations...")
    for vol_aller in vols_aller_filtres:
        destination_code = vol_aller.destination
        
        # Chercher un retour pour chaque date de retour possible
        meilleur_retour = None
        meilleur_prix_total = float('inf')
        
        for date_retour_config in dates_retour:
            date_retour_obj = datetime.fromisoformat(date_retour_config.date).date()
            try:
                # Ne pas filtrer strictement par prix au niveau API pour les retours
                # On filtrera par prix total après
                vols_retour = api.get_cheapest_flights(
                    airport=destination_code,
                    date_from=date_retour_obj,
                    date_to=date_retour_obj,
                    destination_airport=aeroport_depart,
                    departure_time_from=date_retour_config.heure_min or "00:00",
                    departure_time_to=date_retour_config.heure_max or "23:59",
                    max_price=budget_max  # Limite haute pour éviter les prix déraisonnables
                )
                
                for vol_retour in vols_retour:
                    # Vérifier date et horaire exacts
                    vol_retour_date = vol_retour.departureTime.date()
                    vol_retour_heure = vol_retour.departureTime.time()
                    heure_min = datetime.strptime(date_retour_config.heure_min or "00:00", "%H:%M").time()
                    heure_max = datetime.strptime(date_retour_config.heure_max or "23:59", "%H:%M").time()
                    
                    if (vol_retour_date == date_retour_obj and 
                        heure_min <= vol_retour_heure <= heure_max):
                        prix_total = vol_aller.price + vol_retour.price
                        # Filtrer par prix total (pas par segment)
                        if prix_total <= budget_max and prix_total < meilleur_prix_total:
                            meilleur_retour = vol_retour
                            meilleur_prix_total = prix_total
            except Exception:
                continue
        
        # Si on a trouvé un retour valide
        if meilleur_retour:
            resultats.append(TripResponse(
                aller=FlightResponse(
                    flightNumber=vol_aller.flightNumber,
                    origin=vol_aller.origin,
                    originFull=vol_aller.originFull,
                    destination=vol_aller.destination,
                    destinationFull=vol_aller.destinationFull,
                    departureTime=vol_aller.departureTime.isoformat(),
                    price=vol_aller.price,
                    currency=vol_aller.currency
                ),
                retour=FlightResponse(
                    flightNumber=meilleur_retour.flightNumber,
                    origin=meilleur_retour.origin,
                    originFull=meilleur_retour.originFull,
                    destination=meilleur_retour.destination,
                    destinationFull=meilleur_retour.destinationFull,
                    departureTime=meilleur_retour.departureTime.isoformat(),
                    price=meilleur_retour.price,
                    currency=meilleur_retour.currency
                ),
                prix_total=meilleur_prix_total,
                destination_code=destination_code
            ))
    
    print(f"  ✓ {len(resultats)} voyage(s) aller-retour complet(s) trouvé(s)")
    
    # Enregistrer les prix dans price_history si activé
    if record_prices and resultats and SUPABASE_AVAILABLE:
        try:
            # Convertir les TripResponse en dict pour éviter import circulaire
            trips_dict = [trip.model_dump() for trip in resultats]
            record_price_history(trips_dict)
        except Exception as e:
            print(f"⚠️ Erreur enregistrement price_history: {e}")
            # Ne pas bloquer le scan
    
    return resultats, api.num_queries

def get_dates_from_preset(preset: str) -> Tuple[List[DateAvecHoraire], List[DateAvecHoraire]]:
    """
    Convertit un preset de dates en listes de DateAvecHoraire pour aller et retour
    Nouvelle méthode : calcul direct des jours jusqu'aux dates cibles
    weekday() retourne 0=lundi, 1=mardi, ..., 6=dimanche
    """
    today = date.today()
    dates_depart = []
    dates_retour = []
    
    # Obtenir le jour actuel (0=lundi, 1=mardi, ..., 6=dimanche)
    current_day = today.weekday()
    
    if preset == 'weekend':
        # Ce weekend : samedi et dimanche de cette semaine
        # Samedi = jour 5, Dimanche = jour 6
        saturday_offset = 5 - current_day
        sunday_offset = 6 - current_day
        
        # Si on est déjà après samedi, prendre le weekend suivant
        if saturday_offset < 0:
            saturday_offset += 7
        if sunday_offset < 0:
            sunday_offset += 7
        
        saturday = today + timedelta(days=saturday_offset)
        sunday = today + timedelta(days=sunday_offset)
        
        dates_depart.append(DateAvecHoraire(date=saturday.isoformat(), heure_min="06:00", heure_max="23:59"))
        dates_retour.append(DateAvecHoraire(date=sunday.isoformat(), heure_min="06:00", heure_max="23:59"))
        
    elif preset == 'next-weekend':
        # Weekend prochain : samedi et dimanche de la semaine suivante
        # Toujours ajouter 7 jours pour la semaine suivante
        days_until_next_saturday = 13 - current_day  # 5 (samedi) + 7 jours
        days_until_next_sunday = 14 - current_day    # 6 (dimanche) + 7 jours
        
        next_saturday = today + timedelta(days=days_until_next_saturday)
        next_sunday = today + timedelta(days=days_until_next_sunday)
        
        dates_depart.append(DateAvecHoraire(date=next_saturday.isoformat(), heure_min="06:00", heure_max="23:59"))
        dates_retour.append(DateAvecHoraire(date=next_sunday.isoformat(), heure_min="06:00", heure_max="23:59"))
        
    elif preset == 'next-week':
        # 3 jours la semaine prochaine (lundi-mercredi départ, jeudi-samedi retour)
        # Lundi = jour 0, donc pour la semaine prochaine : 0 + 7 = 7
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
    """
    Récupère le prix moyen du mois dernier pour une route donnée depuis Supabase
    """
    if not SUPABASE_AVAILABLE:
        return None
    
    try:
        supabase_service = get_supabase_service_client()
        if not supabase_service:
            return None
        
        # Utiliser la fonction SQL get_avg_price_last_30_days
        # La fonction retourne directement un DECIMAL ou NULL
        result = supabase_service.rpc(
            'get_avg_price_last_30_days',
            {
                'p_departure': departure_airport,
                'p_destination': destination_code
            }
        ).execute()
        
        # La fonction RPC retourne directement la valeur (DECIMAL) ou None
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
    """
    Calcule le pourcentage de réduction par rapport au prix moyen
    """
    if avg_price is None or avg_price == 0:
        return 0.0
    
    if current_price >= avg_price:
        return 0.0
    
    discount = ((avg_price - current_price) / avg_price) * 100
    return round(discount, 1)

def enrich_trip_results(trips: List[TripResponse], departure_airport: str) -> List[EnrichedTripResponse]:
    """
    Enrichit les résultats de trips avec discount, images et flags
    """
    enriched = []
    
    for trip in trips[:15]:  # Limiter à 15 résultats pour performance
        # Récupérer prix moyen
        avg_price = get_avg_price_last_month(departure_airport, trip.destination_code)
        
        # Calculer discount
        discount_percent = calculate_discount(trip.prix_total, avg_price)
        
        # Générer URL image Unsplash
        city_name = trip.aller.destinationFull.split(',')[0].strip()
        image_url = f"https://source.unsplash.com/800x600/?{city_name}"
        
        # Créer trip enrichi
        enriched_trip = EnrichedTripResponse(
            aller=trip.aller,
            retour=trip.retour,
            prix_total=trip.prix_total,
            destination_code=trip.destination_code,
            discount_percent=discount_percent if discount_percent > 0 else None,
            is_good_deal=discount_percent > 20,
            image_url=image_url,
            avg_price_last_month=avg_price
        )
        
        enriched.append(enriched_trip)
    
    return enriched

@app.get("/")
def read_root():
    return {"message": "Ryanair Flight Scanner API", "status": "ok"}

def generate_cache_key(request: ScanRequest) -> str:
    """Génère une clé de cache unique pour une requête"""
    cache_data = {
        "departure_airport": request.aeroport_depart or "BVA",
        "budget_max": request.budget_max or 200,
        "dates_depart": [d.model_dump() for d in request.dates_depart],
        "dates_retour": [d.model_dump() for d in request.dates_retour],
        "destinations_exclues": sorted(request.destinations_exclues or []),
        "destinations_incluses": sorted(request.destinations_incluses) if request.destinations_incluses else None
    }
    cache_str = json.dumps(cache_data, sort_keys=True)
    return hashlib.md5(cache_str.encode()).hexdigest()

@app.post("/api/scan", response_model=ScanResponse)
@optional_auth
async def scan_flights(request: ScanRequest, http_request: Request = None):
    """Scan les vols avec paramètres personnalisés et cache"""
    try:
        # Vérifier le cache si Supabase est disponible
        cache_key = generate_cache_key(request)
        cached_result = None
        
        if SUPABASE_AVAILABLE:
            try:
                supabase_service = get_supabase_service_client()
                if supabase_service:
                    # Chercher dans le cache
                    cache_result = supabase_service.table("search_results_cache")\
                        .select("results, expires_at, hit_count")\
                        .eq("cache_key", cache_key)\
                        .gt("expires_at", datetime.now().isoformat())\
                        .execute()
                    
                    if cache_result.data and len(cache_result.data) > 0:
                        cached = cache_result.data[0]
                        # Mettre à jour hit_count
                        supabase_service.table("search_results_cache")\
                            .update({
                                "hit_count": (cached.get("hit_count", 0) or 0) + 1,
                                "last_hit_at": datetime.now().isoformat()
                            })\
                            .eq("cache_key", cache_key)\
                            .execute()
                        
                        cached_result = cached["results"]
                        print(f"✅ Résultats récupérés depuis le cache (hit #{cached.get('hit_count', 0) + 1})")
            except Exception as e:
                print(f"⚠️ Erreur vérification cache: {e}")
        
        # Si cache valide, retourner les résultats
        if cached_result:
            return ScanResponse(
                resultats=[TripResponse(**r) for r in cached_result],
                nombre_requetes=0,
                message=f"Scan terminé (cache): {len(cached_result)} voyage(s) trouvé(s)"
            )
        
        # Sinon, effectuer le scan
        resultats, num_requetes = scanner_vols_api(
            aeroport_depart=request.aeroport_depart or "BVA",
            dates_depart=request.dates_depart,
            dates_retour=request.dates_retour,
            budget_max=request.budget_max or 200,
            limite_allers=request.limite_allers or 50,
            destinations_exclues=request.destinations_exclues or [],
            destinations_incluses=request.destinations_incluses,
            record_prices=True
        )
        
        # Mettre en cache les résultats si Supabase est disponible
        if SUPABASE_AVAILABLE and resultats:
            try:
                supabase_service = get_supabase_service_client()
                if supabase_service:
                    expires_at = (datetime.now().timestamp() + 3600) * 1000  # +1h en millisecondes
                    expires_at_iso = datetime.fromtimestamp(expires_at / 1000).isoformat()
                    
                    cache_data = {
                        "cache_key": cache_key,
                        "departure_airport": request.aeroport_depart or "BVA",
                        "budget_max": request.budget_max or 200,
                        "dates_depart": [d.model_dump() for d in request.dates_depart],
                        "dates_retour": [d.model_dump() for d in request.dates_retour],
                        "results": [r.model_dump() for r in resultats],
                        "expires_at": expires_at_iso,
                        "hit_count": 0
                    }
                    
                    supabase_service.table("search_results_cache")\
                        .upsert(cache_data, on_conflict="cache_key")\
                        .execute()
                    
                    print(f"✅ Résultats mis en cache (clé: {cache_key[:8]}...)")
            except Exception as e:
                print(f"⚠️ Erreur mise en cache: {e}")
        
        return ScanResponse(
            resultats=resultats,
            nombre_requetes=num_requetes,
            message=f"Scan terminé: {len(resultats)} voyage(s) trouvé(s)"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "ryanair-scanner"}

@app.post("/api/inspire", response_model=InspireResponse)
@optional_auth
async def inspire_trip(request: InspireRequest, http_request: Request = None):
    """
    Endpoint simplifié pour mode découverte avec enrichissement
    """
    try:
        # Récupérer les dates avec horaires individuels
        if request.flexible_dates:
            # Dates avec horaires individuels fournies par le frontend (pour tous les presets maintenant)
            dates_depart_raw = request.flexible_dates.get('dates_depart', [])
            dates_retour_raw = request.flexible_dates.get('dates_retour', [])
            
            # S'assurer que les dates sont au bon format
            dates_depart = []
            for d in dates_depart_raw:
                if isinstance(d, dict):
                    dates_depart.append(DateAvecHoraire(**d))
                else:
                    dates_depart.append(d)
            
            dates_retour = []
            for d in dates_retour_raw:
                if isinstance(d, dict):
                    dates_retour.append(DateAvecHoraire(**d))
                else:
                    dates_retour.append(d)
        else:
            # Fallback : générer les dates depuis le preset (sans horaires personnalisés)
            dates_depart, dates_retour = get_dates_from_preset(request.date_preset)
        
        if not dates_depart or not dates_retour:
            raise HTTPException(status_code=400, detail="Impossible de générer les dates pour ce preset")
        
        # Appeler scanner_vols_api existant avec les paramètres avancés
        resultats, num_requetes = scanner_vols_api(
            aeroport_depart=request.departure,
            dates_depart=dates_depart,
            dates_retour=dates_retour,
            budget_max=request.budget,
            limite_allers=request.limite_allers or 30,  # Utiliser la limite fournie ou 30 par défaut
            destinations_exclues=request.destinations_exclues or [],
            destinations_incluses=None,
            record_prices=True
        )
        
        # Enrichir les résultats
        enriched_results = enrich_trip_results(resultats, request.departure)
        
        # Trier par prix (meilleurs prix en premier)
        enriched_results.sort(key=lambda t: t.prix_total)
        
        return InspireResponse(
            resultats=enriched_results,
            nombre_requetes=num_requetes,
            message=f"{len(enriched_results)} destination(s) trouvée(s) pour {request.budget}€"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/airports")
def get_airports(query: Optional[str] = None):
    """Récupère la liste des aéroports avec code, ville et pays, optionnellement filtrée par recherche"""
    try:
        import csv
        from collections import defaultdict
        
        # Mapping des codes pays ISO vers noms de pays (les plus courants)
        # Pour une solution complète, on pourrait utiliser pycountry
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
        airports_file = os.path.join(os.path.dirname(__file__), '..', 'ryanair-py', 'ryanair', 'airports.csv')
        
        # Si le fichier CSV n'existe pas, générer une liste d'aéroports depuis l'API Ryanair
        if not os.path.exists(airports_file):
            print("⚠️  Fichier airports.csv introuvable, génération depuis l'API Ryanair...")
            airports = _generate_airports_from_api(country_names)
        else:
            # Lire depuis le fichier CSV
            with open(airports_file, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    iata_code = row.get('iata_code', '').strip()
                    municipality = row.get('municipality', '').strip()
                    iso_country = row.get('iso_country', '').strip()
                    airport_name = row.get('name', '').strip()
                    
                    # Ne garder que les aéroports avec un code IATA valide
                    if not iata_code or len(iata_code) != 3:
                        continue
                    
                    # Obtenir le nom du pays
                    country = country_names.get(iso_country, iso_country)
                    
                    airport_data = {
                        'code': iata_code,
                        'name': airport_name or 'N/A',
                        'city': municipality or 'N/A',
                        'country': country
                    }
                    
                    # Filtrer par recherche si fournie
                    if query:
                        query_lower = query.lower()
                        if (query_lower in iata_code.lower() or 
                            query_lower in airport_name.lower() or
                            query_lower in municipality.lower() or 
                            query_lower in country.lower()):
                            airports.append(airport_data)
                    else:
                        airports.append(airport_data)
        
        # Filtrer par recherche si fournie (pour les aéroports générés depuis l'API)
        if query and airports:
            query_lower = query.lower()
            airports = [a for a in airports if (
                query_lower in a['code'].lower() or 
                query_lower in a['name'].lower() or
                query_lower in a['city'].lower() or 
                query_lower in a['country'].lower()
            )]
        
        # Trier par code IATA
        airports.sort(key=lambda x: x['code'])
        
        return {"airports": airports, "count": len(airports)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def _generate_airports_from_api(country_names: dict) -> List[dict]:
    """Génère une liste d'aéroports en interrogeant l'API Ryanair depuis plusieurs hubs majeurs"""
    try:
        api = Ryanair(currency="EUR")
        airports_dict = {}  # Dict pour stocker les infos complètes
        
        # Liste des hubs Ryanair majeurs pour découvrir les aéroports
        major_hubs = ['BVA', 'CDG', 'ORY', 'STN', 'LGW', 'DUB', 'BCN', 'MAD', 'FCO', 'MXP', 
                     'AMS', 'BRU', 'BER', 'VIE', 'WAW', 'PRG', 'BUD', 'OTP', 'SOF', 
                     'CPH', 'ARN', 'OSL', 'HEL', 'LIS', 'OPO', 'ATH', 'DUB']
        
        print(f"🔍 Génération de la liste d'aéroports depuis {len(major_hubs)} hubs majeurs...")
        
        # Date pour la recherche (dans le futur)
        date_debut = date.today() + timedelta(days=30)
        date_fin = date_debut + timedelta(days=30)
        
        # Pour chaque hub, récupérer les destinations
        for hub in major_hubs:
            try:
                vols = api.get_cheapest_flights(
                    airport=hub,
                    date_from=date_debut,
                    date_to=date_fin,
                    max_price=1000
                )
                
                # Ajouter le hub lui-même
                if hub not in airports_dict:
                    airports_dict[hub] = {
                        'code': hub,
                        'name': f'Aéroport {hub}',
                        'city': hub,
                        'country': 'Europe'
                    }
                
                # Ajouter toutes les destinations trouvées
                for vol in vols:
                    dest_code = vol.destination
                    if dest_code and len(dest_code) == 3 and dest_code not in airports_dict:
                        # Essayer d'extraire le nom complet depuis destinationFull
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
                            'country': country
                        }
            except Exception as e:
                print(f"  ⚠️  Erreur pour hub {hub}: {e}")
                continue
        
        airports_list = list(airports_dict.values())
        print(f"  ✓ {len(airports_list)} aéroport(s) trouvé(s)")
        
        return airports_list
    except Exception as e:
        print(f"⚠️  Erreur lors de la génération depuis l'API: {e}")
        # Retourner une liste minimale d'aéroports Ryanair courants
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

@app.get("/api/destinations")
def get_destinations(airport: str = "BVA"):
    """Récupère toutes les destinations disponibles depuis un aéroport, groupées par pays"""
    try:
        from datetime import timedelta
        from collections import defaultdict
        api = Ryanair(currency="EUR")
        
        # Chercher sur plusieurs dates pour obtenir TOUTES les destinations disponibles
        # Certaines destinations peuvent ne pas avoir de vols tous les jours
        date_debut = date.today() + timedelta(days=30)
        date_fin = date_debut + timedelta(days=60)  # Chercher sur 60 jours
        
        print(f"🔍 Recherche des destinations depuis {airport} du {date_debut} au {date_fin}...")
        
        # Récupérer tous les vols disponibles sur la plage de dates
        vols = api.get_cheapest_flights(
            airport=airport,
            date_from=date_debut,
            date_to=date_fin,
            max_price=1000  # Prix élevé pour ne pas filtrer
        )
        
        print(f"  ✓ {len(vols)} vol(s) trouvé(s)")
        
        # Grouper par pays et dédoublonner les destinations (même destination peut apparaître plusieurs fois)
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
        
        return {"destinations": result, "aeroport": airport}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/auto-check")
async def auto_check_flights(request: Request):
    """Vérifie automatiquement les vols et identifie les nouveaux résultats"""
    try:
        # Extraire les données de la requête
        body = await request.json()
        search_id = body.get("search_id")
        previous_results_data = body.get("previous_results", [])
        
        # Construire le ScanRequest depuis les paramètres de la requête
        scan_request = ScanRequest(
            aeroport_depart=body.get("aeroport_depart", "BVA"),
            dates_depart=[DateAvecHoraire(**d) if isinstance(d, dict) else d for d in body.get("dates_depart", [])],
            dates_retour=[DateAvecHoraire(**d) if isinstance(d, dict) else d for d in body.get("dates_retour", [])],
            budget_max=body.get("budget_max", 200),
            limite_allers=body.get("limite_allers", 50),
            destinations_exclues=body.get("destinations_exclues", []),
            destinations_incluses=body.get("destinations_incluses")
        )
        
        # Effectuer la recherche
        resultats, num_requetes = scanner_vols_api(
            aeroport_depart=scan_request.aeroport_depart or "BVA",
            dates_depart=scan_request.dates_depart,
            dates_retour=scan_request.dates_retour,
            budget_max=scan_request.budget_max or 200,
            limite_allers=scan_request.limite_allers or 50,
            destinations_exclues=scan_request.destinations_exclues or [],
            destinations_incluses=scan_request.destinations_incluses
        )
        
        # Convertir les résultats précédents en TripResponse si nécessaire
        previous_results = []
        if previous_results_data:
            for prev_data in previous_results_data:
                if isinstance(prev_data, dict):
                    previous_results.append(TripResponse(**prev_data))
                else:
                    previous_results.append(prev_data)
        
        # Identifier les nouveaux résultats en comparant avec les précédents
        nouveaux_resultats = []
        if previous_results:
            # Créer un set des identifiants uniques des résultats précédents
            # Un voyage est identifié par: destination + aller.departureTime + retour.departureTime
            previous_ids = set()
            for prev_trip in previous_results:
                trip_id = (
                    prev_trip.destination_code,
                    prev_trip.aller.departureTime,
                    prev_trip.retour.departureTime
                )
                previous_ids.add(trip_id)
            
            # Trouver les nouveaux résultats
            for trip in resultats:
                trip_id = (
                    trip.destination_code,
                    trip.aller.departureTime,
                    trip.retour.departureTime
                )
                if trip_id not in previous_ids:
                    nouveaux_resultats.append(trip)
        else:
            # Si pas de résultats précédents, tous les résultats sont nouveaux
            nouveaux_resultats = resultats
        
        return AutoCheckResponse(
            search_id=search_id,
            current_results=resultats,
            new_results=nouveaux_resultats,
            nombre_requetes=num_requetes,
            message=f"{len(nouveaux_resultats)} nouveau(x) résultat(s) trouvé(s) sur {len(resultats)} total"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== ENDPOINTS SUPABASE ====================

class SavedSearchRequest(BaseModel):
    name: str
    request: ScanRequest

class SavedSearchResponse(BaseModel):
    id: str
    name: str
    request: ScanRequest
    created_at: str
    last_used: Optional[str] = None

class SavedFavoriteRequest(BaseModel):
    trip: TripResponse
    search_request: ScanRequest

class SavedFavoriteResponse(BaseModel):
    id: str
    trip: TripResponse
    search_request: ScanRequest
    created_at: str
    is_still_valid: Optional[bool] = None

# Modèles pour analytics
class SearchEventRequest(BaseModel):
    departure_airport: str
    date_preset: Optional[str] = None
    budget: Optional[int] = None
    dates_depart: List[DateAvecHoraire]
    dates_retour: List[DateAvecHoraire]
    destinations_exclues: Optional[List[str]] = []
    limite_allers: Optional[int] = 50
    results_count: Optional[int] = 0
    results: Optional[List[Dict]] = None
    search_duration_ms: Optional[int] = None
    api_requests_count: Optional[int] = None
    source: Optional[str] = "web"
    user_agent: Optional[str] = None
    session_id: Optional[str] = None

class BookingSasEventRequest(BaseModel):
    trip: EnrichedTripResponse
    partner_id: str
    partner_name: str
    redirect_url: str
    action_type: Optional[str] = "redirect"
    countdown_seconds: Optional[int] = None
    source: Optional[str] = "web"
    user_agent: Optional[str] = None
    session_id: Optional[str] = None
    search_event_id: Optional[str] = None  # ID de l'événement de recherche associé

@app.get("/api/config")
def get_config():
    """Retourne la configuration publique nécessaire au frontend"""
    import os
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")
    
    return {
        "supabase_url": supabase_url if supabase_url else None,
        "supabase_anon_key": supabase_anon_key if supabase_anon_key else None,
        "available": bool(supabase_url and supabase_anon_key)
    }

@app.get("/api/supabase/status")
def supabase_status():
    """Vérifie si Supabase est configuré et teste la connexion"""
    if not SUPABASE_AVAILABLE or get_supabase_client is None:
        return {
            "available": False,
            "message": "Supabase n'est pas configuré (variables d'environnement manquantes)"
        }
    
    # Tester la connexion réelle
    try:
        client = get_supabase_client()
        # Faire une requête simple pour vérifier la connexion
        result = client.table('user_profiles').select('id').limit(1).execute()
        return {
            "available": True,
            "message": "Supabase est configuré et connecté ✅"
        }
    except Exception as e:
        return {
            "available": False,
            "message": f"Supabase configuré mais erreur de connexion: {str(e)}"
        }

@app.post("/api/supabase/searches", response_model=SavedSearchResponse)
@optional_auth
async def save_search_supabase(search: SavedSearchRequest, request: Request):
    """Sauvegarde une recherche dans Supabase"""
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Supabase n'est pas configuré")
    
    user_id = get_user_id_from_token(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentification requise")
    
    try:
        supabase = get_supabase_client()
        
        # Convertir les dates en format JSON
        dates_depart_json = [d.model_dump() for d in search.request.dates_depart]
        dates_retour_json = [d.model_dump() for d in search.request.dates_retour]
        
        data = {
            "user_id": user_id,
            "name": search.name,
            "departure_airport": search.request.aeroport_depart or "BVA",
            "dates_depart": dates_depart_json,
            "dates_retour": dates_retour_json,
            "budget_max": search.request.budget_max or 200,
            "limite_allers": search.request.limite_allers or 50,
            "destinations_exclues": search.request.destinations_exclues or [],
            "destinations_incluses": search.request.destinations_incluses,
            "auto_check_enabled": False,
            "check_interval_seconds": 3600
        }
        
        result = supabase.table("saved_searches").insert(data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Erreur lors de la sauvegarde")
        
        saved = result.data[0]
        return SavedSearchResponse(
            id=saved["id"],
            name=saved["name"],
            request=search.request,
            created_at=saved["created_at"],
            last_used=saved.get("last_used")
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Supabase: {str(e)}")

@app.get("/api/supabase/searches", response_model=List[SavedSearchResponse])
@optional_auth
async def get_searches_supabase(request: Request):
    """Récupère toutes les recherches sauvegardées depuis Supabase"""
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Supabase n'est pas configuré")
    
    user_id = get_user_id_from_token(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentification requise")
    
    try:
        supabase = get_supabase_client()
        result = supabase.table("saved_searches")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("created_at", desc=False)\
            .execute()
        
        # Inverser pour avoir les plus récents en premier
        result.data.reverse()
        
        searches = []
        for item in result.data:
            # Reconstruire le ScanRequest depuis les données JSON
            dates_depart = [DateAvecHoraire(**d) for d in item["dates_depart"]]
            dates_retour = [DateAvecHoraire(**d) for d in item["dates_retour"]]
            
            request_obj = ScanRequest(
                aeroport_depart=item["departure_airport"],
                dates_depart=dates_depart,
                dates_retour=dates_retour,
                budget_max=item.get("budget_max", 200),
                limite_allers=item.get("limite_allers", 50),
                destinations_exclues=item.get("destinations_exclues", []),
                destinations_incluses=item.get("destinations_incluses")
            )
            
            searches.append(SavedSearchResponse(
                id=item["id"],
                name=item["name"],
                request=request_obj,
                created_at=item["created_at"],
                last_used=item.get("last_used")
            ))
        
        return searches
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Supabase: {str(e)}")

@app.delete("/api/supabase/searches/{search_id}")
@optional_auth
async def delete_search_supabase(search_id: str, request: Request):
    """Supprime une recherche depuis Supabase"""
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Supabase n'est pas configuré")
    
    user_id = get_user_id_from_token(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentification requise")
    
    try:
        supabase = get_supabase_client()
        result = supabase.table("saved_searches")\
            .delete()\
            .eq("id", search_id)\
            .eq("user_id", user_id)\
            .execute()
        return {"success": True, "message": "Recherche supprimée"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Supabase: {str(e)}")

@app.post("/api/supabase/favorites", response_model=SavedFavoriteResponse)
@optional_auth
async def save_favorite_supabase(favorite: SavedFavoriteRequest, request: Request):
    """Sauvegarde un favori dans Supabase"""
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Supabase n'est pas configuré")
    
    user_id = get_user_id_from_token(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentification requise")
    
    try:
        supabase = get_supabase_client()
        
        data = {
            "user_id": user_id,
            "destination_code": favorite.trip.destination_code,
            "destination_name": favorite.trip.aller.destinationFull,
            "outbound_date": favorite.trip.aller.departureTime.split('T')[0] if 'T' in favorite.trip.aller.departureTime else favorite.trip.aller.departureTime.split(' ')[0],
            "return_date": favorite.trip.retour.departureTime.split('T')[0] if 'T' in favorite.trip.retour.departureTime else favorite.trip.retour.departureTime.split(' ')[0],
            "total_price": favorite.trip.prix_total,
            "outbound_flight": favorite.trip.aller.model_dump(),
            "return_flight": favorite.trip.retour.model_dump(),
            "search_request": favorite.search_request.model_dump(),
            "is_archived": False,
            "is_available": True
        }
        
        result = supabase.table("favorites").insert(data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Erreur lors de la sauvegarde")
        
        saved = result.data[0]
        return SavedFavoriteResponse(
            id=saved["id"],
            trip=favorite.trip,
            search_request=favorite.search_request,
            created_at=saved["created_at"],
            is_still_valid=saved.get("is_available")
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Supabase: {str(e)}")

@app.get("/api/supabase/favorites", response_model=List[SavedFavoriteResponse])
@optional_auth
async def get_favorites_supabase(request: Request):
    """Récupère tous les favoris depuis Supabase"""
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Supabase n'est pas configuré")
    
    user_id = get_user_id_from_token(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentification requise")
    
    try:
        supabase = get_supabase_client()
        result = supabase.table("favorites")\
            .select("*")\
            .eq("user_id", user_id)\
            .order("created_at", desc=False)\
            .execute()
        
        # Inverser pour avoir les plus récents en premier
        result.data.reverse()
        
        favorites = []
        for item in result.data:
            trip = TripResponse(
                aller=FlightResponse(**item["outbound_flight"]),
                retour=FlightResponse(**item["return_flight"]),
                prix_total=item["total_price"],
                destination_code=item["destination_code"]
            )
            search_request = ScanRequest(**item["search_request"])
            
            favorites.append(SavedFavoriteResponse(
                id=item["id"],
                trip=trip,
                search_request=search_request,
                created_at=item["created_at"],
                is_still_valid=item.get("is_available")
            ))
        
        return favorites
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Supabase: {str(e)}")

@app.delete("/api/supabase/favorites/{favorite_id}")
@optional_auth
async def delete_favorite_supabase(favorite_id: str, request: Request):
    """Supprime un favori depuis Supabase"""
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Supabase n'est pas configuré")
    
    user_id = get_user_id_from_token(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentification requise")
    
    try:
        supabase = get_supabase_client()
        result = supabase.table("favorites")\
            .delete()\
            .eq("id", favorite_id)\
            .eq("user_id", user_id)\
            .execute()
        return {"success": True, "message": "Favori supprimé"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Supabase: {str(e)}")

# ==================== ENDPOINTS AUTH ====================

@app.get("/api/auth/me")
@optional_auth
async def get_current_user(request: Request):
    """Récupère les informations de l'utilisateur connecté"""
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Supabase n'est pas configuré")
    
    user_id = get_user_id_from_token(request)
    if not user_id:
        return {"authenticated": False}
    
    try:
        supabase = get_supabase_client()
        
        # Récupérer le profil utilisateur
        profile_result = supabase.table("user_profiles")\
            .select("*")\
            .eq("id", user_id)\
            .execute()
        
        profile = profile_result.data[0] if profile_result.data else None
        
        return {
            "authenticated": True,
            "user_id": user_id,
            "profile": profile
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

@app.post("/api/user/profile")
@optional_auth
async def update_user_profile(request: Request):
    """Met à jour le profil utilisateur"""
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Supabase n'est pas configuré")
    
    user_id = get_user_id_from_token(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentification requise")
    
    try:
        body = await request.json()
        supabase = get_supabase_client()
        
        # Générer referral_code si pas présent
        if not body.get("referral_code"):
            import secrets
            body["referral_code"] = secrets.token_urlsafe(8).upper()[:8]
        
        result = supabase.table("user_profiles")\
            .upsert({
                "id": user_id,
                **body,
                "last_active": datetime.now().isoformat()
            })\
            .execute()
        
        return {"success": True, "profile": result.data[0] if result.data else None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")

# ==================== ENDPOINTS ANALYTICS ====================

@app.post("/api/analytics/search-event")
@optional_auth
async def track_search_event(event: SearchEventRequest, request: Request):
    """Enregistre un événement de recherche pour analytics"""
    if not SUPABASE_AVAILABLE:
        # Ne pas bloquer si Supabase n'est pas disponible, juste logger
        print("⚠️  Supabase non disponible, événement de recherche non enregistré")
        return {"status": "skipped", "reason": "supabase_not_available"}
    
    try:
        user_id = get_user_id_from_token(request)
        supabase = get_supabase_client()
        
        # Récupérer l'IP et user agent depuis la requête
        client_ip = request.client.host if request.client else None
        user_agent = event.user_agent or request.headers.get("user-agent")
        
        # Récupérer session_id depuis le body ou les cookies
        session_id = event.session_id
        if not session_id:
            # Essayer de récupérer depuis les cookies
            cookie_header = request.headers.get("cookie", "")
            if cookie_header:
                for cookie in cookie_header.split(";"):
                    if "flightwatcher_session_id" in cookie:
                        session_id = cookie.split("=")[1].strip()
                        break
        
        print(f"📊 Analytics search_event - user_id: {user_id}, session_id: {session_id}")
        
        data = {
            "user_id": user_id,
            "session_id": session_id,
            "departure_airport": event.departure_airport,
            "date_preset": event.date_preset,
            "budget": event.budget,
            "dates_depart": [d.model_dump() for d in event.dates_depart],
            "dates_retour": [d.model_dump() for d in event.dates_retour],
            "destinations_exclues": event.destinations_exclues or [],
            "limite_allers": event.limite_allers,
            "results_count": event.results_count or 0,
            "results": [r if isinstance(r, dict) else r.model_dump() if hasattr(r, 'model_dump') else r for r in (event.results or [])],
            "search_duration_ms": event.search_duration_ms,
            "api_requests_count": event.api_requests_count,
            "source": event.source or "web",
            "user_agent": user_agent,
            "ip_address": client_ip
        }
        
        result = supabase.table("search_events").insert(data).execute()
        
        print(f"✅ Événement search_event enregistré avec succès: {result.data[0]['id'] if result.data else 'N/A'}")
        
        return {"status": "success", "id": result.data[0]["id"] if result.data else None}
    except Exception as e:
        # Ne pas faire échouer la requête principale si l'analytics échoue
        print(f"⚠️  Erreur enregistrement événement de recherche: {str(e)}")
        return {"status": "error", "message": str(e)}

@app.post("/api/analytics/booking-sas-event")
@optional_auth
async def track_booking_sas_event(event: BookingSasEventRequest, request: Request):
    """Enregistre un événement de clic sur le SAS de réservation pour analytics"""
    if not SUPABASE_AVAILABLE:
        # Ne pas bloquer si Supabase n'est pas disponible, juste logger
        print("⚠️  Supabase non disponible, événement SAS non enregistré")
        return {"status": "skipped", "reason": "supabase_not_available"}
    
    try:
        user_id = get_user_id_from_token(request)
        supabase = get_supabase_client()
        
        # Récupérer l'IP et user agent depuis la requête
        client_ip = request.client.host if request.client else None
        user_agent = event.user_agent or request.headers.get("user-agent")
        
        # Générer un ID unique pour le trip
        trip_id = f"{event.trip.destination_code}-{event.trip.aller.departureTime}-{event.trip.retour.departureTime}"
        
        # Récupérer session_id depuis le body ou les cookies
        session_id = event.session_id
        if not session_id:
            # Essayer de récupérer depuis les cookies
            cookie_header = request.headers.get("cookie", "")
            if cookie_header:
                for cookie in cookie_header.split(";"):
                    if "flightwatcher_session_id" in cookie:
                        session_id = cookie.split("=")[1].strip()
                        break
        
        data = {
            "user_id": user_id,
            "session_id": session_id,
            "search_event_id": event.search_event_id,
            "trip_id": trip_id,
            "destination_code": event.trip.destination_code,
            "destination_name": event.trip.aller.destinationFull.split(',')[0].strip(),
            "departure_airport": event.trip.aller.origin,
            "total_price": float(event.trip.prix_total),
            "trip_data": event.trip.model_dump(),
            "partner_id": event.partner_id,
            "partner_name": event.partner_name,
            "redirect_url": event.redirect_url,
            "action_type": event.action_type or "redirect",
            "countdown_seconds": event.countdown_seconds,
            "source": event.source or "web",
            "user_agent": user_agent,
            "ip_address": client_ip
        }
        
        print(f"📊 Analytics booking_sas_event - search_event_id: {event.search_event_id}, user_id: {user_id}, session_id: {session_id}")
        
        # Protection contre les doublons : vérifier s'il existe déjà un événement similaire récent (dans les 10 dernières secondes)
        # avec le même trip_id, partner_id et session_id
        from datetime import datetime, timedelta
        ten_seconds_ago = (datetime.now() - timedelta(seconds=10)).isoformat()
        
        duplicate_query = supabase.table("booking_sas_events")\
            .select("id")\
            .eq("trip_id", trip_id)\
            .eq("partner_id", event.partner_id)\
            .gte("created_at", ten_seconds_ago)\
            .limit(1)
        
        # Ajouter session_id à la vérification si disponible
        if session_id:
            duplicate_query = duplicate_query.eq("session_id", session_id)
        elif user_id:
            # Si pas de session_id mais user_id, vérifier par user_id
            duplicate_query = duplicate_query.eq("user_id", user_id)
        
        duplicate_check = duplicate_query.execute()
        
        if duplicate_check.data and len(duplicate_check.data) > 0:
            print(f"⚠️  Événement booking_sas_event déjà enregistré récemment (doublon évité): {duplicate_check.data[0]['id']}")
            return {"status": "skipped", "reason": "duplicate", "id": duplicate_check.data[0]['id']}
        
        result = supabase.table("booking_sas_events").insert(data).execute()
        
        print(f"✅ Événement booking_sas_event enregistré avec succès: {result.data[0]['id'] if result.data else 'N/A'}")
        
        return {"status": "success", "id": result.data[0]["id"] if result.data else None}
    except Exception as e:
        # Ne pas faire échouer la requête principale si l'analytics échoue
        import traceback
        print(f"⚠️  Erreur enregistrement événement SAS: {str(e)}")
        traceback.print_exc()
        return {"status": "error", "message": str(e)}

