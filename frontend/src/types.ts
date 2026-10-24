export interface FlightResponse {
  flightNumber: string;
  origin: string;
  originFull: string;
  destination: string;
  destinationFull: string;
  departureTime: string;
  price: number;
  currency: string;
}

export interface TripResponse {
  aller: FlightResponse;
  retour: FlightResponse;
  prix_total: number;
  destination_code: string;
}

export interface ScanResponse {
  resultats: TripResponse[];
  nombre_requetes: number;
  message: string;
}

export interface DateAvecHoraire {
  date: string;  // ISO date string
  heure_min?: string;  // HH:MM format
  heure_max?: string;  // HH:MM format
}

export interface Destination {
  code: string;
  nom: string;
  pays: string;
  destinationFull: string;
}

export interface ScanRequest {
  aeroport_depart?: string;  // Code IATA (ex: "BVA")
  dates_depart: DateAvecHoraire[];  // Dates avec horaires individuels
  dates_retour: DateAvecHoraire[];   // Dates avec horaires individuels
  budget_max?: number;  // Max price per segment
  limite_allers?: number;  // Nombre max d'allers à traiter (défaut: 50)
  destinations_exclues?: string[];  // Codes IATA des destinations à exclure
  destinations_incluses?: string[] | null;  // Codes IATA des destinations à inclure (si null, toutes sauf exclues)
}

export interface Airport {
  code: string;
  name: string;
  city: string;
  country: string;
}

export interface EnrichedTripResponse extends TripResponse {
  discount_percent?: number;
  is_good_deal?: boolean;
  image_url?: string;
  avg_price_last_month?: number;
}

export interface InspireRequest {
  budget: number;
  date_preset: 'weekend' | 'next-weekend' | 'next-week' | 'flexible';
  departure: string;
  flexible_dates?: {
    dates_depart: DateAvecHoraire[];
    dates_retour: DateAvecHoraire[];
  };
  destinations_exclues?: string[];
  limite_allers?: number;
}

export interface InspireResponse {
  resultats: EnrichedTripResponse[];
  nombre_requetes: number;
  message: string;
}

// ==================== DRAFT TYPES ====================

export interface DraftChecklist {
  flight_booked?: boolean;
  hotel_booked?: boolean;
  activities_planned?: boolean;
  transport_arranged?: boolean;
}

export interface DraftParticipant {
  email: string;
  name?: string;
  status: 'invited' | 'accepted' | 'declined';
  invited_at?: string;
  invited_by?: string;
}

export interface TripDraft {
  id: string;
  token: string;
  status: 'draft' | 'flight_booked' | 'hotel_booked' | 'complete' | 'expired';
  flight_data: TripResponse;
  departure_airport: string;
  destination_code: string;
  destination_name?: string;
  outbound_date: string;
  return_date: string;
  flight_total_price: number;
  hotel_data?: HotelResult;
  hotel_price_per_night?: number;
  hotel_total_price?: number;
  participants: DraftParticipant[];
  checklist: DraftChecklist;
  notes?: string;
  created_at: string;
  updated_at: string;
  user_id?: string;
  can_invite: boolean;
}

export interface CreateDraftRequest {
  flight_data: TripResponse;
  departure_airport: string;
  destination_code: string;
  destination_name?: string;
  outbound_date: string;
  return_date: string;
}

export interface UpdateDraftRequest {
  hotel_data?: HotelResult;
  hotel_price_per_night?: number;
  hotel_total_price?: number;
  checklist?: DraftChecklist;
  notes?: string;
  status?: TripDraft['status'];
}

// ==================== HOTEL TYPES ====================

export interface HotelResult {
  id: string;
  name: string;
  stars?: number;
  rating: number;
  review_count: number;
  weighted_rating: number;
  price_per_night: number;
  total_price: number;
  currency: string;
  image_url?: string;
  address?: string;
  amenities: string[];
  value_score: number;
}

export interface HotelSearchRequest {
  city_code: string;
  check_in: string;
  check_out: string;
  tier?: 'economique' | 'confort' | 'charme';
  sort_by?: 'value' | 'rating' | 'price';
}

export interface HotelSearchResponse {
  hotels: HotelResult[];
  count: number;
  tier: string;
  tier_max_price: number;
  city_median_price: number;
  from_cache: boolean;
  cache_expires_at?: string;
}

export interface PriceTiers {
  economique: number;
  confort: number;
  charme: number;
  counts: {
    economique: number;
    confort: number;
    charme: number;
  };
  median_price: number;
}

