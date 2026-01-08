"""
Modèles de données pour Supabase
"""
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class SavedSearchDB(BaseModel):
    """Modèle pour une recherche sauvegardée en base"""
    id: Optional[str] = None
    name: str
    aeroport_depart: str
    dates_depart: List[Dict[str, Any]]  # Liste de DateAvecHoraire sérialisée
    dates_retour: List[Dict[str, Any]]
    budget_max: Optional[int] = 200
    limite_allers: Optional[int] = 50
    destinations_exclues: Optional[List[str]] = []
    destinations_incluses: Optional[List[str]] = None
    auto_check_enabled: bool = False
    auto_check_interval_seconds: Optional[int] = 300
    last_checked_at: Optional[datetime] = None
    last_check_results: Optional[List[Dict[str, Any]]] = None
    created_at: Optional[datetime] = None
    last_used: Optional[datetime] = None
    user_id: Optional[str] = None  # Pour futures fonctionnalités multi-utilisateurs

class SavedFavoriteDB(BaseModel):
    """Modèle pour un favori sauvegardé en base"""
    id: Optional[str] = None
    search_id: Optional[str] = None  # Référence à la recherche associée
    trip_data: Dict[str, Any]  # Données complètes du voyage (TripResponse sérialisé)
    search_request: Dict[str, Any]  # Requête de recherche associée
    is_still_valid: Optional[bool] = None
    last_checked: Optional[datetime] = None
    archived: bool = False
    created_at: Optional[datetime] = None
    user_id: Optional[str] = None

