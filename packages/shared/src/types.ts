export interface FlightResponse {
  flightNumber: string
  origin: string
  originFull: string
  destination: string
  destinationFull: string
  departureTime: string
  price: number
  currency: string
}

export interface TripResponse {
  aller: FlightResponse
  retour: FlightResponse
  prix_total: number
  destination_code: string
}

export interface ScanResponse {
  resultats: TripResponse[]
  nombre_requetes: number
  message: string
}

export interface DateAvecHoraire {
  date: string
  heure_min?: string
  heure_max?: string
}

export interface Destination {
  code: string
  nom: string
  pays: string
  destinationFull: string
}

export interface ScanRequest {
  aeroport_depart?: string
  dates_depart: DateAvecHoraire[]
  dates_retour: DateAvecHoraire[]
  budget_max?: number
  limite_allers?: number
  destinations_exclues?: string[]
  destinations_incluses?: string[] | null
  /** Adult passengers (Ryanair adultPaxCount). Default 1. */
  passengers?: number
}

export interface Airport {
  code: string
  name: string
  city: string
  country: string
}

export interface EnrichedTripResponse extends TripResponse {
  discount_percent?: number
  is_good_deal?: boolean
  image_url?: string
  avg_price_last_month?: number
}

export interface InspireRequest {
  budget: number
  date_preset: 'weekend' | 'next-weekend' | 'next-week' | 'flexible'
  departure: string
  flexible_dates?: {
    dates_depart: DateAvecHoraire[]
    dates_retour: DateAvecHoraire[]
  }
  destinations_exclues?: string[]
  limite_allers?: number
  /** Adult passengers (Ryanair adultPaxCount). Default 1. */
  passengers?: number
}

export interface InspireResponse {
  resultats: EnrichedTripResponse[]
  nombre_requetes: number
  message: string
}

export interface SavedSearch {
  id: string
  name: string
  request: ScanRequest
  createdAt: string
  lastUsed?: string
  autoCheckEnabled?: boolean
  autoCheckIntervalSeconds?: number
  lastCheckResults?: TripResponse[]
  lastCheckedAt?: string
}

export interface SavedFavorite {
  id: string
  trip: TripResponse
  searchRequest: ScanRequest
  createdAt: string
  lastChecked?: string
  isStillValid?: boolean
  archived?: boolean
}

export interface ApiConfig {
  available: boolean
  supabase_url?: string
  supabase_anon_key?: string
}
