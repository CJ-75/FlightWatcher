import secrets
from datetime import datetime

from fastapi import APIRouter, HTTPException, Request

from supabase_deps import (
    SUPABASE_AVAILABLE,
    get_supabase_client,
    get_user_id_from_token,
    optional_auth,
)

router = APIRouter()


@router.get("/api/auth/me")
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

        profile_result = supabase.table("user_profiles")\
            .select("*")\
            .eq("id", user_id)\
            .execute()

        profile = profile_result.data[0] if profile_result.data else None

        return {
            "authenticated": True,
            "user_id": user_id,
            "profile": profile,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.post("/api/user/profile")
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

        if not body.get("referral_code"):
            body["referral_code"] = secrets.token_urlsafe(8).upper()[:8]

        result = supabase.table("user_profiles")\
            .upsert({
                "id": user_id,
                **body,
                "last_active": datetime.now().isoformat(),
            })\
            .execute()

        return {"success": True, "profile": result.data[0] if result.data else None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")
