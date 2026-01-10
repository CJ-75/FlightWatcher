"""
Routes API pour le panneau d'administration
"""
from fastapi import APIRouter, Request, HTTPException, Query, status
from typing import Optional, Dict, List
from pydantic import BaseModel
from datetime import datetime
from admin_auth import require_admin, verify_admin
from admin_services import AdminService
from auth_middleware import get_user_id_from_token
from supabase_client import get_supabase_service_client, get_supabase_client

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Modèles Pydantic pour les requêtes/réponses
class UserUpdateRequest(BaseModel):
    is_admin: Optional[bool] = None
    full_name: Optional[str] = None
    email_notifications: Optional[bool] = None

class PlanCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    price_monthly: Optional[float] = None
    price_yearly: Optional[float] = None
    stripe_price_id_monthly: Optional[str] = None
    stripe_price_id_yearly: Optional[str] = None
    max_searches_per_month: Optional[int] = None
    max_saved_searches: Optional[int] = None
    features: Optional[Dict] = None
    active: bool = True

class PlanUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price_monthly: Optional[float] = None
    price_yearly: Optional[float] = None
    stripe_price_id_monthly: Optional[str] = None
    stripe_price_id_yearly: Optional[str] = None
    max_searches_per_month: Optional[int] = None
    max_saved_searches: Optional[int] = None
    features: Optional[Dict] = None
    active: Optional[bool] = None

class SettingsUpdateRequest(BaseModel):
    plan_id: str
    features: Dict[str, Dict]  # {feature_name: {enabled: bool, limit_value: int}}

class PasswordVerificationRequest(BaseModel):
    password: str

# ==================== AUTHENTIFICATION ====================

@router.get("/verify")
async def verify_admin_status(request: Request):
    """Vérifie que l'utilisateur est administrateur (email uniquement, pas de mot de passe)"""
    from admin_auth import verify_admin, get_user_email_from_token
    
    user_id = get_user_id_from_token(request)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentification requise"
        )
    
    # Debug: récupérer l'email pour le retourner dans la réponse
    email = get_user_email_from_token(request)
    if not email:
        from admin_auth import get_user_email as get_email_from_db
        email = await get_email_from_db(user_id)
    
    # Vérifier uniquement l'email (le mot de passe sera vérifié séparément)
    is_admin_email = await verify_admin(user_id, request, password=None)
    
    return {
        "is_admin_email": is_admin_email,
        "is_admin": is_admin_email,  # Pour compatibilité avec l'ancien code
        "user_id": user_id,
        "email": email,  # Retourner l'email pour debug
        "requires_password": is_admin_email,  # Si email admin, mot de passe requis
        "message": "Email admin confirmé, mot de passe requis" if is_admin_email else f"Accès refusé pour: {email}"
    }

@router.post("/verify-password")
async def verify_admin_password_endpoint(request: Request, password_data: PasswordVerificationRequest):
    """Vérifie le mot de passe admin et crée une session"""
    from fastapi import Response
    from admin_auth import verify_admin
    
    user_id = get_user_id_from_token(request)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentification requise"
        )
    
    # Vérifier l'email ET le mot de passe
    is_admin = await verify_admin(user_id, request, password=password_data.password)
    
    if is_admin:
        # Créer une réponse avec un cookie pour marquer que le mot de passe est vérifié
        response = Response(content='{"success": true, "message": "Mot de passe admin correct"}', media_type="application/json")
        # Cookie valide 24h, httpOnly pour la sécurité
        # Note: path="/" pour que le cookie soit disponible sur tous les chemins
        # domain=None pour que le cookie soit disponible sur le même domaine (localhost)
        response.set_cookie(
            key="admin_password_verified",
            value="true",
            max_age=86400,  # 24 heures
            httponly=True,
            samesite="lax",
            secure=False,  # Mettre à True en production avec HTTPS
            path="/"  # Disponible sur tous les chemins
        )
        return response
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Mot de passe incorrect ou email non autorisé"
        )

@router.post("/impersonate/{target_user_id}")
@require_admin
async def create_impersonation_token(target_user_id: str, request: Request):
    """
    Crée un token temporaire pour l'impersonation d'un utilisateur
    Note: L'implémentation complète nécessiterait Supabase Admin API
    Pour l'instant, on retourne les informations nécessaires
    """
    admin_id = get_user_id_from_token(request)
    
    # Vérifier que l'utilisateur cible existe
    supabase = get_supabase_service_client() or get_supabase_client()
    user_result = supabase.table("user_profiles")\
        .select("id, email, full_name")\
        .eq("id", target_user_id)\
        .execute()
    
    if not user_result.data:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    # En production, créer un token temporaire via Supabase Admin API
    # Pour l'instant, on retourne les infos nécessaires
    return {
        "target_user_id": target_user_id,
        "target_user_email": user_result.data[0].get("email"),
        "admin_id": admin_id,
        "expires_at": (datetime.now().timestamp() + 3600) * 1000,  # 1h
        "message": "Token d'impersonation créé (à implémenter avec Supabase Admin API)"
    }

# ==================== USERS ====================

@router.get("/users")
@require_admin
async def get_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    email: Optional[str] = None,
    is_admin: Optional[bool] = None,
    request: Request = None
):
    """Récupère la liste paginée des utilisateurs"""
    filters = {}
    if email:
        filters["email"] = email
    if is_admin is not None:
        filters["is_admin"] = is_admin
    
    return AdminService.get_users(page, page_size, filters)

@router.get("/users/{user_id}")
@require_admin
async def get_user_details(user_id: str):
    """Récupère les détails d'un utilisateur avec ses statistiques"""
    user_details = AdminService.get_user_details(user_id)
    if not user_details:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    return user_details

@router.put("/users/{user_id}")
@require_admin
async def update_user(user_id: str, update_data: UserUpdateRequest):
    """Met à jour un utilisateur (sauf le statut admin qui ne peut pas être modifié depuis le frontend)"""
    supabase = get_supabase_service_client() or get_supabase_client()
    
    update_dict = update_data.model_dump(exclude_unset=True)
    
    # Empêcher la modification du statut admin depuis le frontend
    # Le statut admin est géré uniquement via la liste hardcodée dans admin_auth.py
    if "is_admin" in update_dict:
        del update_dict["is_admin"]
    
    if not update_dict:
        raise HTTPException(status_code=400, detail="Aucune modification valide fournie")
    
    result = supabase.table("user_profiles")\
        .update(update_dict)\
        .eq("id", user_id)\
        .execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    return {"success": True, "user": result.data[0]}

@router.post("/users/{user_id}/toggle")
@require_admin
async def toggle_user_status(user_id: str):
    """Active ou désactive un utilisateur (via un champ is_active si ajouté)"""
    # Pour l'instant, on peut utiliser un champ dans metadata
    supabase = get_supabase_service_client() or get_supabase_client()
    
    # Récupérer l'utilisateur actuel
    user_result = supabase.table("user_profiles")\
        .select("metadata")\
        .eq("id", user_id)\
        .execute()
    
    if not user_result.data:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
    
    metadata = user_result.data[0].get("metadata", {}) or {}
    is_active = metadata.get("is_active", True)
    
    # Toggle
    metadata["is_active"] = not is_active
    
    result = supabase.table("user_profiles")\
        .update({"metadata": metadata})\
        .eq("id", user_id)\
        .execute()
    
    return {
        "success": True,
        "is_active": not is_active,
        "user": result.data[0] if result.data else None
    }

# ==================== SEARCHES ====================

@router.get("/searches")
@require_admin
async def get_searches(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    user_id: Optional[str] = None,
    departure_airport: Optional[str] = None,
    auto_check_enabled: Optional[bool] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
):
    """Récupère la liste paginée des recherches sauvegardées"""
    filters = {}
    if user_id:
        filters["user_id"] = user_id
    if departure_airport:
        filters["departure_airport"] = departure_airport
    if auto_check_enabled is not None:
        filters["auto_check_enabled"] = auto_check_enabled
    if date_from:
        filters["date_from"] = date_from
    if date_to:
        filters["date_to"] = date_to
    
    return AdminService.get_searches(page, page_size, filters)

@router.get("/searches/stats")
@require_admin
async def get_search_stats(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Récupère les statistiques des recherches"""
    start_dt = datetime.fromisoformat(start_date) if start_date else None
    end_dt = datetime.fromisoformat(end_date) if end_date else None
    
    return AdminService.get_search_stats(start_dt, end_dt)

# ==================== BOOKING SAS ====================

@router.get("/booking-sas")
@require_admin
async def get_booking_sas_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    user_id: Optional[str] = None,
    partner_id: Optional[str] = None,
    destination_code: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None
):
    """Récupère la liste paginée des événements Booking SAS"""
    filters = {}
    if user_id:
        filters["user_id"] = user_id
    if partner_id:
        filters["partner_id"] = partner_id
    if destination_code:
        filters["destination_code"] = destination_code
    if date_from:
        filters["date_from"] = date_from
    if date_to:
        filters["date_to"] = date_to
    
    return AdminService.get_booking_sas_events(page, page_size, filters)

@router.get("/booking-sas/stats")
@require_admin
async def get_booking_sas_stats(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    """Récupère les statistiques des événements Booking SAS"""
    start_dt = datetime.fromisoformat(start_date) if start_date else None
    end_dt = datetime.fromisoformat(end_date) if end_date else None
    
    return AdminService.get_booking_sas_stats(start_dt, end_dt)

# ==================== PLANS ====================

@router.get("/plans")
@require_admin
async def get_plans():
    """Récupère la liste des plans d'abonnement"""
    try:
        supabase = get_supabase_service_client() or get_supabase_client()
        
        result = supabase.table("subscription_plans")\
            .select("*")\
            .order("created_at", desc=False)\
            .execute()
        
        return {"plans": result.data if result.data else []}
    except Exception as e:
        print(f"❌ Erreur récupération plans: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la récupération des plans: {str(e)}"
        )

@router.post("/plans")
@require_admin
async def create_plan(plan_data: PlanCreateRequest):
    """Crée un nouveau plan d'abonnement"""
    supabase = get_supabase_service_client() or get_supabase_client()
    
    result = supabase.table("subscription_plans")\
        .insert(plan_data.model_dump())\
        .execute()
    
    return {"success": True, "plan": result.data[0] if result.data else None}

@router.put("/plans/{plan_id}")
@require_admin
async def update_plan(plan_id: str, plan_data: PlanUpdateRequest):
    """Met à jour un plan d'abonnement"""
    supabase = get_supabase_service_client() or get_supabase_client()
    
    update_dict = plan_data.model_dump(exclude_unset=True)
    
    result = supabase.table("subscription_plans")\
        .update(update_dict)\
        .eq("id", plan_id)\
        .execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Plan non trouvé")
    
    return {"success": True, "plan": result.data[0]}

@router.delete("/plans/{plan_id}")
@require_admin
async def delete_plan(plan_id: str):
    """Supprime un plan d'abonnement"""
    supabase = get_supabase_service_client() or get_supabase_client()
    
    result = supabase.table("subscription_plans")\
        .delete()\
        .eq("id", plan_id)\
        .execute()
    
    return {"success": True, "message": "Plan supprimé"}

# ==================== SETTINGS ====================

@router.get("/settings")
@require_admin
async def get_settings():
    """Récupère la configuration actuelle des plans et fonctionnalités"""
    try:
        supabase = get_supabase_service_client() or get_supabase_client()
        
        # Récupérer tous les plans
        plans_result = supabase.table("subscription_plans")\
            .select("*")\
            .execute()
        
        # Récupérer toutes les fonctionnalités (peut ne pas exister)
        features_by_plan = {}
        try:
            features_result = supabase.table("plan_features")\
                .select("*")\
                .execute()
            
            # Organiser les fonctionnalités par plan
            if features_result.data:
                for feature in features_result.data:
                    plan_id = feature["plan_id"]
                    if plan_id not in features_by_plan:
                        features_by_plan[plan_id] = []
                    features_by_plan[plan_id].append(feature)
        except Exception as e:
            # Si la table plan_features n'existe pas, retourner un dict vide
            print(f"⚠️  Table plan_features non disponible: {e}")
        
        return {
            "plans": plans_result.data if plans_result.data else [],
            "features_by_plan": features_by_plan
        }
    except Exception as e:
        print(f"❌ Erreur récupération settings: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la récupération des paramètres: {str(e)}"
        )

@router.put("/settings")
@require_admin
async def update_settings(settings_data: SettingsUpdateRequest):
    """Met à jour les fonctionnalités d'un plan"""
    supabase = get_supabase_service_client() or get_supabase_client()
    
    plan_id = settings_data.plan_id
    features = settings_data.features
    
    # Supprimer les fonctionnalités existantes pour ce plan
    supabase.table("plan_features")\
        .delete()\
        .eq("plan_id", plan_id)\
        .execute()
    
    # Insérer les nouvelles fonctionnalités
    features_to_insert = []
    for feature_name, feature_data in features.items():
        features_to_insert.append({
            "plan_id": plan_id,
            "feature_name": feature_name,
            "enabled": feature_data.get("enabled", True),
            "limit_value": feature_data.get("limit_value")
        })
    
    if features_to_insert:
        result = supabase.table("plan_features")\
            .insert(features_to_insert)\
            .execute()
        
        return {"success": True, "features": result.data}
    
    return {"success": True, "features": []}

