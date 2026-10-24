"""
Recherche d'hôtels avec cache, rate limiting et tiers de prix
"""
from fastapi import APIRouter, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, date, timedelta
import statistics
import hashlib

router = APIRouter(prefix="/api/hotels", tags=["hotels"])

# Import conditionnel de Supabase
try:
    from supabase_client import get_supabase_service_client
    SUPABASE_AVAILABLE = True
except:
    SUPABASE_AVAILABLE = False
    get_supabase_service_client = None

# Configuration
CACHE_TTL_HOURS = 2
RATE_LIMIT_PER_HOUR = 20
RATE_LIMIT_WINDOW_MINUTES = 60

# Tiers de prix (multiplicateurs du médian)
PRICE_TIERS = {
    "economique": 0.6,   # Sous 60% du médian
    "confort": 1.0,      # Sous le médian
    "charme": 1.5        # Sous 150% du médian
}

# Constantes pour la note pondérée (Bayesian average)
CONFIDENCE_THRESHOLD = 100  # Nombre d'avis pour "confiance"
GLOBAL_MEAN_RATING = 7.5    # Note moyenne globale estimée


class HotelSearchRequest(BaseModel):
    city_code: str
    check_in: str  # ISO date
    check_out: str  # ISO date
    tier: str = "confort"  # economique, confort, charme
    sort_by: str = "value"  # value, rating, price


class HotelResult(BaseModel):
    id: str
    name: str
    stars: Optional[int]
    rating: float
    review_count: int
    weighted_rating: float
    price_per_night: float
    total_price: float
    currency: str = "EUR"
    image_url: Optional[str]
    address: Optional[str]
    amenities: List[str] = []
    value_score: float  # Score rapport qualité/prix


class HotelSearchResponse(BaseModel):
    hotels: List[HotelResult]
    count: int
    tier: str
    tier_max_price: float
    city_median_price: float
    from_cache: bool
    cache_expires_at: Optional[str]


class PriceTiersResponse(BaseModel):
    economique: float
    confort: float
    charme: float
    counts: Dict[str, int]
    median_price: float


def generate_cache_key(city_code: str, check_in: str, check_out: str) -> str:
    """Génère une clé de cache unique"""
    return f"{city_code}:{check_in}:{check_out}"


def weighted_rating(rating: float, review_count: int) -> float:
    """
    Calcule la note pondérée (moyenne bayésienne).
    Tire vers la moyenne globale si peu d'avis.
    """
    return (
        (review_count * rating + CONFIDENCE_THRESHOLD * GLOBAL_MEAN_RATING) 
        / (review_count + CONFIDENCE_THRESHOLD)
    )


def value_score(rating: float, review_count: int, price: float, median_price: float) -> float:
    """
    Calcule le score rapport qualité/prix.
    Note haute + prix bas = bon score.
    """
    w_rating = weighted_rating(rating, review_count)
    price_ratio = price / median_price if median_price > 0 else 1
    return w_rating / price_ratio


async def get_identifier(request: Request, draft_token: Optional[str] = None) -> tuple:
    """
    Récupère l'identifiant pour le rate limiting.
    Priorité: user_id > draft_token > IP
    """
    # Essayer d'extraire le user_id
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        try:
            from auth_middleware import get_user_id_from_token
            user_id = get_user_id_from_token(request)
            if user_id:
                return (user_id, "user")
        except:
            pass
    
    # Utiliser le token du brouillon si fourni
    if draft_token:
        return (draft_token, "token")
    
    # Fallback sur l'IP (moins fiable)
    client_ip = request.client.host if request.client else "unknown"
    return (f"ip:{client_ip}", "ip")


async def check_rate_limit(identifier: str, identifier_type: str) -> bool:
    """Vérifie et met à jour le rate limit pour un identifiant"""
    if not SUPABASE_AVAILABLE:
        return True  # Pas de limite si pas de base
    
    supabase = get_supabase_service_client()
    if not supabase:
        return True
    
    try:
        # Utiliser la fonction SQL si disponible
        result = supabase.rpc(
            'check_rate_limit',
            {
                'p_identifier': identifier,
                'p_identifier_type': identifier_type,
                'p_limit': RATE_LIMIT_PER_HOUR,
                'p_window_minutes': RATE_LIMIT_WINDOW_MINUTES
            }
        ).execute()
        
        return result.data if result.data is not None else True
    except Exception as e:
        print(f"⚠️ Erreur rate limit: {e}")
        return True  # En cas d'erreur, laisser passer


async def get_cached_hotels(cache_key: str) -> Optional[dict]:
    """Récupère les résultats du cache si valides"""
    if not SUPABASE_AVAILABLE:
        return None
    
    supabase = get_supabase_service_client()
    if not supabase:
        return None
    
    try:
        result = supabase.table("hotel_rates_cache") \
            .select("*") \
            .eq("cache_key", cache_key) \
            .gt("expires_at", datetime.now().isoformat()) \
            .execute()
        
        if result.data:
            # Mettre à jour les stats de hit
            cache_id = result.data[0]["id"]
            supabase.table("hotel_rates_cache") \
                .update({
                    "hit_count": (result.data[0].get("hit_count", 0) or 0) + 1,
                    "last_hit_at": datetime.now().isoformat()
                }) \
                .eq("id", cache_id) \
                .execute()
            
            return result.data[0]
        
        return None
    except Exception as e:
        print(f"⚠️ Erreur lecture cache: {e}")
        return None


async def save_to_cache(
    cache_key: str, 
    city_code: str, 
    check_in: str, 
    check_out: str,
    hotels: List[dict],
    stats: dict
):
    """Sauvegarde les résultats dans le cache"""
    if not SUPABASE_AVAILABLE:
        return
    
    supabase = get_supabase_service_client()
    if not supabase:
        return
    
    try:
        expires_at = (datetime.now() + timedelta(hours=CACHE_TTL_HOURS)).isoformat()
        
        cache_data = {
            "cache_key": cache_key,
            "city_code": city_code,
            "check_in": check_in,
            "check_out": check_out,
            "results": hotels,
            "hotel_count": len(hotels),
            "price_min": stats.get("price_min"),
            "price_max": stats.get("price_max"),
            "price_median": stats.get("price_median"),
            "price_p25": stats.get("price_p25"),
            "price_p75": stats.get("price_p75"),
            "expires_at": expires_at,
            "hit_count": 0
        }
        
        supabase.table("hotel_rates_cache") \
            .upsert(cache_data, on_conflict="cache_key") \
            .execute()
            
    except Exception as e:
        print(f"⚠️ Erreur sauvegarde cache: {e}")


async def fetch_hotels_from_api(city_code: str, check_in: str, check_out: str) -> List[dict]:
    """
    Appelle l'API externe (LiteAPI ou autre) pour récupérer les hôtels.
    TODO: Remplacer par l'intégration réelle LiteAPI.
    """
    # Pour l'instant, retourner des données de démonstration
    # TODO: Intégrer LiteAPI
    import random
    
    hotel_names = [
        f"Hotel Central {city_code}",
        f"Grand Hotel {city_code}",
        f"Boutique Hotel Old Town",
        f"City View Apartments",
        f"Comfort Inn {city_code}",
        f"Budget Stay Express",
        f"Luxury Palace Hotel",
        f"Seaside Resort",
        f"Historic Quarter B&B",
        f"Modern Loft Suites",
        f"Garden View Hotel",
        f"Airport Express Inn",
    ]
    
    hotels = []
    for i, name in enumerate(hotel_names):
        price = random.uniform(40, 200)
        rating = random.uniform(6.5, 9.8)
        review_count = random.randint(10, 3000)
        
        hotels.append({
            "id": f"hotel_{city_code}_{i}",
            "name": name,
            "stars": random.randint(2, 5),
            "rating": round(rating, 1),
            "review_count": review_count,
            "price_per_night": round(price, 2),
            "currency": "EUR",
            "image_url": f"https://source.unsplash.com/800x600/?hotel,{city_code}",
            "address": f"123 Main Street, {city_code}",
            "amenities": random.sample(["wifi", "breakfast", "parking", "pool", "gym", "spa", "restaurant", "bar"], k=random.randint(2, 5))
        })
    
    return hotels


def calculate_price_stats(hotels: List[dict]) -> dict:
    """Calcule les statistiques de prix"""
    if not hotels:
        return {}
    
    prices = [h["price_per_night"] for h in hotels]
    prices.sort()
    
    n = len(prices)
    return {
        "price_min": min(prices),
        "price_max": max(prices),
        "price_median": statistics.median(prices),
        "price_p25": prices[n // 4] if n >= 4 else prices[0],
        "price_p75": prices[3 * n // 4] if n >= 4 else prices[-1]
    }


def filter_and_enrich_hotels(
    hotels: List[dict], 
    tier: str, 
    median_price: float,
    check_in: str,
    check_out: str,
    sort_by: str = "value"
) -> List[HotelResult]:
    """Filtre par tier, enrichit avec scores et trie les hôtels"""
    
    # Calculer le nombre de nuits
    check_in_date = datetime.fromisoformat(check_in).date()
    check_out_date = datetime.fromisoformat(check_out).date()
    nights = (check_out_date - check_in_date).days
    nights = max(1, nights)
    
    # Calculer le plafond pour le tier
    tier_multiplier = PRICE_TIERS.get(tier, 1.0)
    tier_max_price = median_price * tier_multiplier
    
    enriched = []
    for hotel in hotels:
        price_per_night = hotel["price_per_night"]
        
        # Filtrer par tier
        if price_per_night > tier_max_price:
            continue
        
        # Calculer les scores
        w_rating = weighted_rating(hotel["rating"], hotel["review_count"])
        v_score = value_score(
            hotel["rating"], 
            hotel["review_count"], 
            price_per_night, 
            median_price
        )
        
        enriched.append(HotelResult(
            id=hotel["id"],
            name=hotel["name"],
            stars=hotel.get("stars"),
            rating=hotel["rating"],
            review_count=hotel["review_count"],
            weighted_rating=round(w_rating, 2),
            price_per_night=price_per_night,
            total_price=round(price_per_night * nights, 2),
            currency=hotel.get("currency", "EUR"),
            image_url=hotel.get("image_url"),
            address=hotel.get("address"),
            amenities=hotel.get("amenities", []),
            value_score=round(v_score, 2)
        ))
    
    # Trier selon le critère choisi
    if sort_by == "value":
        enriched.sort(key=lambda h: h.value_score, reverse=True)
    elif sort_by == "rating":
        enriched.sort(key=lambda h: h.weighted_rating, reverse=True)
    elif sort_by == "price":
        enriched.sort(key=lambda h: h.price_per_night)
    
    return enriched


@router.get("/tiers/{city_code}")
async def get_price_tiers(
    city_code: str,
    check_in: str,
    check_out: str,
    request: Request,
    draft_token: Optional[str] = None
):
    """
    Récupère les tiers de prix pour une ville et des dates.
    Utile pour afficher les onglets Économique/Confort/Charme.
    """
    cache_key = generate_cache_key(city_code, check_in, check_out)
    
    # Vérifier le cache
    cached = await get_cached_hotels(cache_key)
    
    if cached:
        median = cached.get("price_median", 100)
    else:
        # Pas de cache, on doit chercher (mais on ne compte pas dans le rate limit ici)
        hotels = await fetch_hotels_from_api(city_code, check_in, check_out)
        stats = calculate_price_stats(hotels)
        median = stats.get("price_median", 100)
        
        # Sauvegarder en cache pour les prochaines requêtes
        await save_to_cache(cache_key, city_code, check_in, check_out, hotels, stats)
    
    # Calculer les plafonds par tier
    tiers = {
        tier: round(median * multiplier, 2)
        for tier, multiplier in PRICE_TIERS.items()
    }
    
    # Compter les hôtels par tier (si on a le cache)
    counts = {"economique": 0, "confort": 0, "charme": 0}
    if cached and cached.get("results"):
        for hotel in cached["results"]:
            price = hotel["price_per_night"]
            if price <= tiers["economique"]:
                counts["economique"] += 1
            if price <= tiers["confort"]:
                counts["confort"] += 1
            if price <= tiers["charme"]:
                counts["charme"] += 1
    
    return PriceTiersResponse(
        economique=tiers["economique"],
        confort=tiers["confort"],
        charme=tiers["charme"],
        counts=counts,
        median_price=median
    )


@router.post("/search", response_model=HotelSearchResponse)
async def search_hotels(
    request: HotelSearchRequest,
    http_request: Request,
    background_tasks: BackgroundTasks,
    draft_token: Optional[str] = None
):
    """
    Recherche des hôtels avec cache et rate limiting.
    """
    cache_key = generate_cache_key(request.city_code, request.check_in, request.check_out)
    
    # 1. Vérifier le cache d'abord
    cached = await get_cached_hotels(cache_key)
    
    if cached:
        # Résultats en cache - pas de rate limit consommé
        hotels_raw = cached.get("results", [])
        median_price = cached.get("price_median", 100)
        
        # Filtrer et enrichir
        hotels = filter_and_enrich_hotels(
            hotels_raw, 
            request.tier, 
            median_price,
            request.check_in,
            request.check_out,
            request.sort_by
        )
        
        tier_max = median_price * PRICE_TIERS.get(request.tier, 1.0)
        
        return HotelSearchResponse(
            hotels=hotels,
            count=len(hotels),
            tier=request.tier,
            tier_max_price=round(tier_max, 2),
            city_median_price=median_price,
            from_cache=True,
            cache_expires_at=cached.get("expires_at")
        )
    
    # 2. Pas de cache - vérifier le rate limit
    identifier, identifier_type = await get_identifier(http_request, draft_token)
    
    if not await check_rate_limit(identifier, identifier_type):
        raise HTTPException(
            status_code=429,
            detail="Limite de recherches atteinte. Réessayez dans quelques minutes."
        )
    
    # 3. Appeler l'API externe
    hotels_raw = await fetch_hotels_from_api(request.city_code, request.check_in, request.check_out)
    
    # 4. Calculer les stats
    stats = calculate_price_stats(hotels_raw)
    median_price = stats.get("price_median", 100)
    
    # 5. Sauvegarder en cache (en arrière-plan)
    background_tasks.add_task(
        save_to_cache,
        cache_key,
        request.city_code,
        request.check_in,
        request.check_out,
        hotels_raw,
        stats
    )
    
    # 6. Filtrer et enrichir
    hotels = filter_and_enrich_hotels(
        hotels_raw, 
        request.tier, 
        median_price,
        request.check_in,
        request.check_out,
        request.sort_by
    )
    
    tier_max = median_price * PRICE_TIERS.get(request.tier, 1.0)
    expires_at = (datetime.now() + timedelta(hours=CACHE_TTL_HOURS)).isoformat()
    
    return HotelSearchResponse(
        hotels=hotels,
        count=len(hotels),
        tier=request.tier,
        tier_max_price=round(tier_max, 2),
        city_median_price=median_price,
        from_cache=False,
        cache_expires_at=expires_at
    )


@router.post("/prefetch")
async def prefetch_hotels(
    city_code: str,
    check_in: str,
    check_out: str,
    http_request: Request,
    background_tasks: BackgroundTasks,
    draft_token: Optional[str] = None
):
    """
    Précharge les hôtels en arrière-plan.
    À appeler dès l'étape 1 du wizard (récap vol).
    Ne bloque pas l'UI, ne retourne pas les résultats.
    """
    cache_key = generate_cache_key(city_code, check_in, check_out)
    
    # Vérifier si déjà en cache
    cached = await get_cached_hotels(cache_key)
    if cached:
        return {"status": "already_cached", "cache_key": cache_key}
    
    # Vérifier le rate limit
    identifier, identifier_type = await get_identifier(http_request, draft_token)
    
    if not await check_rate_limit(identifier, identifier_type):
        return {"status": "rate_limited", "cache_key": cache_key}
    
    # Lancer le fetch en arrière-plan
    async def fetch_and_cache():
        hotels_raw = await fetch_hotels_from_api(city_code, check_in, check_out)
        stats = calculate_price_stats(hotels_raw)
        await save_to_cache(cache_key, city_code, check_in, check_out, hotels_raw, stats)
    
    background_tasks.add_task(fetch_and_cache)
    
    return {"status": "prefetching", "cache_key": cache_key}


@router.get("/cache-status/{cache_key}")
async def check_cache_status(cache_key: str):
    """
    Vérifie si les résultats sont en cache.
    Utile pour le frontend qui attend le prefetch.
    """
    cached = await get_cached_hotels(cache_key)
    
    if cached:
        return {
            "cached": True,
            "hotel_count": cached.get("hotel_count", 0),
            "expires_at": cached.get("expires_at"),
            "median_price": cached.get("price_median")
        }
    
    return {"cached": False}
