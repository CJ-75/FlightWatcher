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
  /** Max round-trip price PER PERSON */
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
  /** Max round-trip price PER PERSON */
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

export type DealProviderId = 'mock' | 'expedia' | 'lastminute'

export interface TravelDealDates {
  outbound: string
  inbound: string
}

export type PlannedTripStatus = 'draft' | 'scanning' | 'planning' | 'locked'
export type TripProposalStatus = 'pending' | 'accepted' | 'rejected'
export type TripMemberRole = 'organizer' | 'traveler'

export interface PlannedTrip {
  id: string
  organizer_id: string
  name: string
  departure_airport: string
  arrival_airport?: string | null
  passengers: number
  dates_depart: DateAvecHoraire[]
  dates_retour: DateAvecHoraire[]
  budget_max: number
  invite_token: string
  status: PlannedTripStatus
  created_at: string
  updated_at?: string
  proposals_count?: number
  accepted_proposal?: TripProposal | null
}

export interface TripProposal {
  id: string
  trip_id: string
  trip_data: EnrichedTripResponse
  status: TripProposalStatus
  created_at: string
}

export interface TripMember {
  id: string
  trip_id: string
  user_id?: string | null
  display_name?: string | null
  role: TripMemberRole
  status: 'joined'
  joined_at: string
}

export interface PlannedTripDetail extends PlannedTrip {
  proposals: TripProposal[]
  members: TripMember[]
}

export interface CreatePlannedTripRequest {
  name: string
  departure_airport: string
  arrival_airport?: string | null
  passengers: number
  dates_depart: DateAvecHoraire[]
  dates_retour: DateAvecHoraire[]
  budget_max: number
}

export interface InvitePreview {
  name: string
  departure_airport: string
  arrival_airport?: string | null
  passengers: number
  dates_depart: DateAvecHoraire[]
  dates_retour: DateAvecHoraire[]
  budget_max: number
  organizer_name?: string | null
  accepted_trip?: EnrichedTripResponse | null
  members_count: number
  invite_token: string
}

/** Weekend pack (flight + hotel) for Deals tab. */
export interface TravelDeal {
  id: string
  title: string
  city: string
  country: string
  image_url: string
  price_per_person: number
  currency: string
  nights: number
  departure_airport: string
  dates: TravelDealDates
  hotel_name?: string
  hotel_stars?: number
  board?: string
  highlights: string[]
  description: string
  provider: DealProviderId
  booking_url: string
  badge?: string
}
