from pydantic import BaseModel
from typing import List, Optional, Dict


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
    budget_max: Optional[int] = 200  # Prix max aller-retour PAR PERSONNE
    limite_allers: Optional[int] = 50  # Nombre max d'allers à traiter pour les retours
    destinations_exclues: Optional[List[str]] = []  # Codes IATA des destinations à exclure
    destinations_incluses: Optional[List[str]] = None  # Codes IATA des destinations à inclure (si None, toutes sauf exclues)
    passengers: Optional[int] = 1  # Adultes (Ryanair adultPaxCount), 1–6


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
    budget: int  # Max aller-retour PAR PERSONNE
    date_preset: str  # 'weekend', 'next-weekend', 'next-week', 'flexible'
    departure: str  # Code aéroport
    flexible_dates: Optional[Dict[str, List[DateAvecHoraire]]] = None  # Dates avec horaires individuels (pour tous les presets maintenant)
    destinations_exclues: Optional[List[str]] = None
    limite_allers: Optional[int] = None
    passengers: Optional[int] = 1  # Adultes (Ryanair adultPaxCount), 1–6


class EnrichedTripResponse(TripResponse):
    discount_percent: Optional[float] = None
    is_good_deal: Optional[bool] = None
    image_url: Optional[str] = None
    avg_price_last_month: Optional[float] = None


class InspireResponse(BaseModel):
    resultats: List[EnrichedTripResponse]
    nombre_requetes: int
    message: str


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
