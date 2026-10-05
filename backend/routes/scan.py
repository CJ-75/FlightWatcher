import hashlib
import json
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request

from api_models import (
    DateAvecHoraire,
    ScanRequest,
    ScanResponse,
    TripResponse,
    AutoCheckResponse,
    InspireRequest,
    InspireResponse,
)
from flight_scanner import (
    scanner_vols_api,
    get_dates_from_preset,
    enrich_trip_results,
)
from supabase_deps import SUPABASE_AVAILABLE, get_supabase_service_client, optional_auth

router = APIRouter()


def generate_cache_key(request: ScanRequest) -> str:
    """Génère une clé de cache unique pour une requête"""
    cache_data = {
        "departure_airport": request.aeroport_depart or "BVA",
        "budget_max": request.budget_max or 200,
        "passengers": max(1, min(6, int(request.passengers or 1))),
        "dates_depart": [d.model_dump() for d in request.dates_depart],
        "dates_retour": [d.model_dump() for d in request.dates_retour],
        "destinations_exclues": sorted(request.destinations_exclues or []),
        "destinations_incluses": sorted(request.destinations_incluses) if request.destinations_incluses else None,
    }
    cache_str = json.dumps(cache_data, sort_keys=True)
    return hashlib.md5(cache_str.encode()).hexdigest()


@router.post("/api/scan", response_model=ScanResponse)
@optional_auth
async def scan_flights(request: ScanRequest, http_request: Request = None):
    """Scan les vols avec paramètres personnalisés et cache"""
    try:
        cache_key = generate_cache_key(request)
        cached_result = None

        if SUPABASE_AVAILABLE:
            try:
                supabase_service = get_supabase_service_client()
                if supabase_service:
                    cache_result = supabase_service.table("search_results_cache")\
                        .select("results, expires_at, hit_count")\
                        .eq("cache_key", cache_key)\
                        .gt("expires_at", datetime.now().isoformat())\
                        .execute()

                    if cache_result.data and len(cache_result.data) > 0:
                        cached = cache_result.data[0]
                        supabase_service.table("search_results_cache")\
                            .update({
                                "hit_count": (cached.get("hit_count", 0) or 0) + 1,
                                "last_hit_at": datetime.now().isoformat(),
                            })\
                            .eq("cache_key", cache_key)\
                            .execute()

                        cached_result = cached["results"]
                        print(f"✅ Résultats récupérés depuis le cache (hit #{cached.get('hit_count', 0) + 1})")
            except Exception as e:
                print(f"⚠️ Erreur vérification cache: {e}")

        if cached_result:
            return ScanResponse(
                resultats=[TripResponse(**r) for r in cached_result],
                nombre_requetes=0,
                message=f"Scan terminé (cache): {len(cached_result)} voyage(s) trouvé(s)",
            )

        resultats, num_requetes = scanner_vols_api(
            aeroport_depart=request.aeroport_depart or "BVA",
            dates_depart=request.dates_depart,
            dates_retour=request.dates_retour,
            budget_max=request.budget_max or 200,
            limite_allers=request.limite_allers or 50,
            destinations_exclues=request.destinations_exclues or [],
            destinations_incluses=request.destinations_incluses,
            record_prices=True,
            passengers=request.passengers or 1,
        )

        if SUPABASE_AVAILABLE and resultats:
            try:
                supabase_service = get_supabase_service_client()
                if supabase_service:
                    expires_at = (datetime.now().timestamp() + 3600) * 1000
                    expires_at_iso = datetime.fromtimestamp(expires_at / 1000).isoformat()

                    cache_data = {
                        "cache_key": cache_key,
                        "departure_airport": request.aeroport_depart or "BVA",
                        "budget_max": request.budget_max or 200,
                        "dates_depart": [d.model_dump() for d in request.dates_depart],
                        "dates_retour": [d.model_dump() for d in request.dates_retour],
                        "results": [r.model_dump() for r in resultats],
                        "expires_at": expires_at_iso,
                        "hit_count": 0,
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
            message=f"Scan terminé: {len(resultats)} voyage(s) trouvé(s)",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/inspire", response_model=InspireResponse)
@optional_auth
async def inspire_trip(request: InspireRequest, http_request: Request = None):
    """Endpoint simplifié pour mode découverte avec enrichissement"""
    try:
        if request.flexible_dates:
            dates_depart_raw = request.flexible_dates.get('dates_depart', [])
            dates_retour_raw = request.flexible_dates.get('dates_retour', [])

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
            dates_depart, dates_retour = get_dates_from_preset(request.date_preset)

        if not dates_depart or not dates_retour:
            raise HTTPException(status_code=400, detail="Impossible de générer les dates pour ce preset")

        resultats, num_requetes = scanner_vols_api(
            aeroport_depart=request.departure,
            dates_depart=dates_depart,
            dates_retour=dates_retour,
            budget_max=request.budget,
            limite_allers=request.limite_allers or 30,
            destinations_exclues=request.destinations_exclues or [],
            destinations_incluses=None,
            record_prices=True,
            passengers=request.passengers or 1,
        )

        enriched_results = enrich_trip_results(resultats, request.departure)
        enriched_results.sort(key=lambda t: t.prix_total)

        return InspireResponse(
            resultats=enriched_results,
            nombre_requetes=num_requetes,
            message=(
                f"{len(enriched_results)} destination(s) trouvée(s) "
                f"pour {request.budget}€/pers"
                f"{f' × {request.passengers or 1}' if (request.passengers or 1) > 1 else ''}"
            ),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/auto-check")
async def auto_check_flights(request: Request):
    """Vérifie automatiquement les vols et identifie les nouveaux résultats"""
    try:
        body = await request.json()
        search_id = body.get("search_id")
        previous_results_data = body.get("previous_results", [])

        scan_request = ScanRequest(
            aeroport_depart=body.get("aeroport_depart", "BVA"),
            dates_depart=[DateAvecHoraire(**d) if isinstance(d, dict) else d for d in body.get("dates_depart", [])],
            dates_retour=[DateAvecHoraire(**d) if isinstance(d, dict) else d for d in body.get("dates_retour", [])],
            budget_max=body.get("budget_max", 200),
            limite_allers=body.get("limite_allers", 50),
            destinations_exclues=body.get("destinations_exclues", []),
            destinations_incluses=body.get("destinations_incluses"),
            passengers=body.get("passengers", 1),
        )

        resultats, num_requetes = scanner_vols_api(
            aeroport_depart=scan_request.aeroport_depart or "BVA",
            dates_depart=scan_request.dates_depart,
            dates_retour=scan_request.dates_retour,
            budget_max=scan_request.budget_max or 200,
            limite_allers=scan_request.limite_allers or 50,
            destinations_exclues=scan_request.destinations_exclues or [],
            destinations_incluses=scan_request.destinations_incluses,
            passengers=scan_request.passengers or 1,
        )

        previous_results = []
        if previous_results_data:
            for prev_data in previous_results_data:
                if isinstance(prev_data, dict):
                    previous_results.append(TripResponse(**prev_data))
                else:
                    previous_results.append(prev_data)

        nouveaux_resultats = []
        if previous_results:
            previous_ids = set()
            for prev_trip in previous_results:
                trip_id = (
                    prev_trip.destination_code,
                    prev_trip.aller.departureTime,
                    prev_trip.retour.departureTime,
                )
                previous_ids.add(trip_id)

            for trip in resultats:
                trip_id = (
                    trip.destination_code,
                    trip.aller.departureTime,
                    trip.retour.departureTime,
                )
                if trip_id not in previous_ids:
                    nouveaux_resultats.append(trip)
        else:
            nouveaux_resultats = resultats

        return AutoCheckResponse(
            search_id=search_id,
            current_results=resultats,
            new_results=nouveaux_resultats,
            nombre_requetes=num_requetes,
            message=f"{len(nouveaux_resultats)} nouveau(x) résultat(s) trouvé(s) sur {len(resultats)} total",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
