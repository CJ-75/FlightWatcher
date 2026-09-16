from typing import List

from fastapi import APIRouter, HTTPException, Request

from api_models import (
    DateAvecHoraire,
    ScanRequest,
    TripResponse,
    FlightResponse,
    SavedSearchRequest,
    SavedSearchResponse,
    SavedFavoriteRequest,
    SavedFavoriteResponse,
)
from supabase_deps import (
    SUPABASE_AVAILABLE,
    get_supabase_client,
    get_user_id_from_token,
    optional_auth,
)

router = APIRouter()


@router.get("/api/supabase/status")
def supabase_status():
    """Vérifie si Supabase est configuré et teste la connexion"""
    if not SUPABASE_AVAILABLE or get_supabase_client is None:
        return {
            "available": False,
            "message": "Supabase n'est pas configuré (variables d'environnement manquantes)",
        }

    try:
        client = get_supabase_client()
        client.table('user_profiles').select('id').limit(1).execute()
        return {
            "available": True,
            "message": "Supabase est configuré et connecté ✅",
        }
    except Exception as e:
        return {
            "available": False,
            "message": f"Supabase configuré mais erreur de connexion: {str(e)}",
        }


@router.post("/api/supabase/searches", response_model=SavedSearchResponse)
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
            "check_interval_seconds": 3600,
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
            last_used=saved.get("last_used"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Supabase: {str(e)}")


@router.get("/api/supabase/searches", response_model=List[SavedSearchResponse])
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

        result.data.reverse()

        searches = []
        for item in result.data:
            dates_depart = [DateAvecHoraire(**d) for d in item["dates_depart"]]
            dates_retour = [DateAvecHoraire(**d) for d in item["dates_retour"]]

            request_obj = ScanRequest(
                aeroport_depart=item["departure_airport"],
                dates_depart=dates_depart,
                dates_retour=dates_retour,
                budget_max=item.get("budget_max", 200),
                limite_allers=item.get("limite_allers", 50),
                destinations_exclues=item.get("destinations_exclues", []),
                destinations_incluses=item.get("destinations_incluses"),
            )

            searches.append(SavedSearchResponse(
                id=item["id"],
                name=item["name"],
                request=request_obj,
                created_at=item["created_at"],
                last_used=item.get("last_used"),
            ))

        return searches
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Supabase: {str(e)}")


@router.delete("/api/supabase/searches/{search_id}")
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
        supabase.table("saved_searches")\
            .delete()\
            .eq("id", search_id)\
            .eq("user_id", user_id)\
            .execute()
        return {"success": True, "message": "Recherche supprimée"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Supabase: {str(e)}")


@router.post("/api/supabase/favorites", response_model=SavedFavoriteResponse)
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
            "is_available": True,
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
            is_still_valid=saved.get("is_available"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Supabase: {str(e)}")


@router.get("/api/supabase/favorites", response_model=List[SavedFavoriteResponse])
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

        result.data.reverse()

        favorites = []
        for item in result.data:
            trip = TripResponse(
                aller=FlightResponse(**item["outbound_flight"]),
                retour=FlightResponse(**item["return_flight"]),
                prix_total=item["total_price"],
                destination_code=item["destination_code"],
            )
            search_request = ScanRequest(**item["search_request"])

            favorites.append(SavedFavoriteResponse(
                id=item["id"],
                trip=trip,
                search_request=search_request,
                created_at=item["created_at"],
                is_still_valid=item.get("is_available"),
            ))

        return favorites
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Supabase: {str(e)}")


@router.delete("/api/supabase/favorites/{favorite_id}")
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
        supabase.table("favorites")\
            .delete()\
            .eq("id", favorite_id)\
            .eq("user_id", user_id)\
            .execute()
        return {"success": True, "message": "Favori supprimé"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur Supabase: {str(e)}")
