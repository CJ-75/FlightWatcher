"""
Gestion des brouillons de voyage (trip drafts)
Accessible SANS authentification via token unique
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, date
import secrets

router = APIRouter(prefix="/api/drafts", tags=["drafts"])

# Import conditionnel de Supabase
try:
    from supabase_client import get_supabase_service_client
    SUPABASE_AVAILABLE = True
except:
    SUPABASE_AVAILABLE = False
    get_supabase_service_client = None


class FlightData(BaseModel):
    aller: Dict[str, Any]
    retour: Dict[str, Any]
    prix_total: float
    destination_code: str


class CreateDraftRequest(BaseModel):
    flight_data: FlightData
    departure_airport: str
    destination_code: str
    destination_name: Optional[str] = None
    outbound_date: str  # ISO date
    return_date: str    # ISO date


class UpdateDraftRequest(BaseModel):
    hotel_data: Optional[Dict[str, Any]] = None
    hotel_price_per_night: Optional[float] = None
    hotel_total_price: Optional[float] = None
    checklist: Optional[Dict[str, bool]] = None
    notes: Optional[str] = None
    status: Optional[str] = None


class InviteParticipantRequest(BaseModel):
    email: str
    name: Optional[str] = None


class DraftResponse(BaseModel):
    id: str
    token: str
    status: str
    flight_data: Dict[str, Any]
    departure_airport: str
    destination_code: str
    destination_name: Optional[str]
    outbound_date: str
    return_date: str
    flight_total_price: float
    hotel_data: Optional[Dict[str, Any]]
    hotel_price_per_night: Optional[float]
    hotel_total_price: Optional[float]
    participants: List[Dict[str, Any]]
    checklist: Dict[str, Any]
    notes: Optional[str]
    created_at: str
    updated_at: str
    user_id: Optional[str]
    can_invite: bool  # True si user_id présent


def generate_token() -> str:
    """Génère un token unique pour le brouillon"""
    return secrets.token_urlsafe(16)


@router.post("", response_model=DraftResponse)
async def create_draft(request: CreateDraftRequest, http_request: Request):
    """
    Créer un nouveau brouillon de voyage.
    Accessible SANS authentification - génère un token unique.
    """
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Base de données non disponible")
    
    supabase = get_supabase_service_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Connexion base de données échouée")
    
    # Extraire user_id si authentifié (optionnel)
    user_id = None
    auth_header = http_request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        try:
            from auth_middleware import get_user_id_from_token
            user_id = get_user_id_from_token(http_request)
        except:
            pass
    
    token = generate_token()
    
    draft_data = {
        "token": token,
        "user_id": user_id,
        "status": "draft",
        "flight_data": request.flight_data.model_dump(),
        "departure_airport": request.departure_airport,
        "destination_code": request.destination_code,
        "destination_name": request.destination_name,
        "outbound_date": request.outbound_date,
        "return_date": request.return_date,
        "flight_total_price": request.flight_data.prix_total,
        "participants": [],
        "checklist": {
            "flight_booked": False,
            "hotel_booked": False,
            "activities_planned": False,
            "transport_arranged": False
        },
    }
    
    try:
        result = supabase.table("trip_drafts").insert(draft_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Erreur création brouillon")
        
        draft = result.data[0]
        return format_draft_response(draft)
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.get("/{token}", response_model=DraftResponse)
async def get_draft(token: str):
    """
    Récupérer un brouillon par son token.
    Accessible SANS authentification.
    """
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Base de données non disponible")
    
    supabase = get_supabase_service_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Connexion base de données échouée")
    
    try:
        result = supabase.table("trip_drafts") \
            .select("*") \
            .eq("token", token) \
            .gt("expires_at", datetime.now().isoformat()) \
            .neq("status", "expired") \
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Brouillon non trouvé ou expiré")
        
        return format_draft_response(result.data[0])
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.patch("/{token}", response_model=DraftResponse)
async def update_draft(token: str, request: UpdateDraftRequest):
    """
    Mettre à jour un brouillon.
    Accessible SANS authentification (via token).
    """
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Base de données non disponible")
    
    supabase = get_supabase_service_client()
    if not supabase:
        raise HTTPException(status_code=503, detail="Connexion base de données échouée")
    
    # Construire les données de mise à jour
    update_data = {}
    
    if request.hotel_data is not None:
        update_data["hotel_data"] = request.hotel_data
    if request.hotel_price_per_night is not None:
        update_data["hotel_price_per_night"] = request.hotel_price_per_night
    if request.hotel_total_price is not None:
        update_data["hotel_total_price"] = request.hotel_total_price
    if request.checklist is not None:
        update_data["checklist"] = request.checklist
    if request.notes is not None:
        update_data["notes"] = request.notes
    if request.status is not None:
        if request.status not in ["draft", "flight_booked", "hotel_booked", "complete"]:
            raise HTTPException(status_code=400, detail="Statut invalide")
        update_data["status"] = request.status
        
        # Si hôtel réservé, enregistrer la date
        if request.status == "hotel_booked":
            update_data["hotel_booked_at"] = datetime.now().isoformat()
    
    if not update_data:
        raise HTTPException(status_code=400, detail="Aucune donnée à mettre à jour")
    
    try:
        result = supabase.table("trip_drafts") \
            .update(update_data) \
            .eq("token", token) \
            .gt("expires_at", datetime.now().isoformat()) \
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Brouillon non trouvé ou expiré")
        
        return format_draft_response(result.data[0])
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur: {str(e)}")


@router.post("/{token}/checklist/{item}")
async def toggle_checklist_item(token: str, item: str, checked: bool = True):
    """
    Cocher/décocher un élément de la checklist.
    Accessible SANS authentification.
    """
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Base de données non disponible")
    
    supabase = get_supabase_service_client()
    
    # Récupérer le brouillon actuel
    result = supabase.table("trip_drafts") \
        .select("checklist, status") \
        .eq("token", token) \
        .execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Brouillon non trouvé")
    
    current_checklist = result.data[0].get("checklist", {})
    current_checklist[item] = checked
    
    # Déterminer le nouveau statut
    new_status = result.data[0].get("status", "draft")
    if item == "flight_booked" and checked:
        new_status = "flight_booked"
    elif item == "hotel_booked" and checked and current_checklist.get("flight_booked"):
        new_status = "hotel_booked"
    
    # Mettre à jour
    update_result = supabase.table("trip_drafts") \
        .update({"checklist": current_checklist, "status": new_status}) \
        .eq("token", token) \
        .execute()
    
    return {"success": True, "checklist": current_checklist, "status": new_status}


@router.post("/{token}/invite", response_model=DraftResponse)
async def invite_participant(token: str, request: InviteParticipantRequest, http_request: Request):
    """
    Inviter un participant au voyage.
    REQUIERT une authentification (login).
    """
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Base de données non disponible")
    
    # Vérifier l'authentification
    from auth_middleware import get_user_id_from_token
    user_id = get_user_id_from_token(http_request)
    
    if not user_id:
        raise HTTPException(
            status_code=401, 
            detail="Authentification requise pour inviter des participants"
        )
    
    supabase = get_supabase_service_client()
    
    # Récupérer le brouillon
    result = supabase.table("trip_drafts") \
        .select("*") \
        .eq("token", token) \
        .execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Brouillon non trouvé")
    
    draft = result.data[0]
    
    # Vérifier que l'utilisateur est propriétaire ou que le brouillon n'a pas de propriétaire
    if draft.get("user_id") and draft.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Vous n'êtes pas le propriétaire de ce brouillon")
    
    # Ajouter le participant
    participants = draft.get("participants", [])
    
    # Vérifier si déjà invité
    if any(p.get("email") == request.email for p in participants):
        raise HTTPException(status_code=400, detail="Ce participant est déjà invité")
    
    participants.append({
        "email": request.email,
        "name": request.name,
        "status": "invited",
        "invited_at": datetime.now().isoformat(),
        "invited_by": user_id
    })
    
    # Mettre à jour le brouillon (associer à l'utilisateur si pas encore fait)
    update_data = {
        "participants": participants,
        "user_id": user_id  # Associer le brouillon à l'utilisateur
    }
    
    update_result = supabase.table("trip_drafts") \
        .update(update_data) \
        .eq("token", token) \
        .execute()
    
    if not update_result.data:
        raise HTTPException(status_code=500, detail="Erreur mise à jour")
    
    return format_draft_response(update_result.data[0])


@router.post("/{token}/claim", response_model=DraftResponse)
async def claim_draft(token: str, http_request: Request):
    """
    Associer un brouillon anonyme à un compte utilisateur.
    Permet de retrouver le brouillon sur d'autres appareils.
    """
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Base de données non disponible")
    
    from auth_middleware import get_user_id_from_token
    user_id = get_user_id_from_token(http_request)
    
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentification requise")
    
    supabase = get_supabase_service_client()
    
    # Récupérer le brouillon
    result = supabase.table("trip_drafts") \
        .select("*") \
        .eq("token", token) \
        .execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Brouillon non trouvé")
    
    draft = result.data[0]
    
    # Vérifier que le brouillon n'appartient pas déjà à quelqu'un d'autre
    if draft.get("user_id") and draft.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Ce brouillon appartient à un autre utilisateur")
    
    # Associer à l'utilisateur
    update_result = supabase.table("trip_drafts") \
        .update({"user_id": user_id}) \
        .eq("token", token) \
        .execute()
    
    return format_draft_response(update_result.data[0])


@router.get("/user/list")
async def list_user_drafts(http_request: Request):
    """
    Lister tous les brouillons d'un utilisateur connecté.
    REQUIERT une authentification.
    """
    if not SUPABASE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Base de données non disponible")
    
    from auth_middleware import get_user_id_from_token
    user_id = get_user_id_from_token(http_request)
    
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentification requise")
    
    supabase = get_supabase_service_client()
    
    result = supabase.table("trip_drafts") \
        .select("*") \
        .eq("user_id", user_id) \
        .gt("expires_at", datetime.now().isoformat()) \
        .neq("status", "expired") \
        .order("created_at", desc=True) \
        .execute()
    
    return {
        "drafts": [format_draft_response(d) for d in (result.data or [])],
        "count": len(result.data or [])
    }


def format_draft_response(draft: dict) -> DraftResponse:
    """Formater la réponse du brouillon"""
    return DraftResponse(
        id=draft["id"],
        token=draft["token"],
        status=draft["status"],
        flight_data=draft["flight_data"],
        departure_airport=draft["departure_airport"],
        destination_code=draft["destination_code"],
        destination_name=draft.get("destination_name"),
        outbound_date=str(draft["outbound_date"]),
        return_date=str(draft["return_date"]),
        flight_total_price=float(draft["flight_total_price"]),
        hotel_data=draft.get("hotel_data"),
        hotel_price_per_night=float(draft["hotel_price_per_night"]) if draft.get("hotel_price_per_night") else None,
        hotel_total_price=float(draft["hotel_total_price"]) if draft.get("hotel_total_price") else None,
        participants=draft.get("participants", []),
        checklist=draft.get("checklist", {}),
        notes=draft.get("notes"),
        created_at=draft["created_at"],
        updated_at=draft["updated_at"],
        user_id=draft.get("user_id"),
        can_invite=draft.get("user_id") is not None
    )
