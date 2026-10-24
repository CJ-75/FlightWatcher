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

export type FlightProviderId = 'ryanair' | 'travelpayouts'

export interface TripResponse {
  aller: FlightResponse
  retour: FlightResponse
  prix_total: number
  destination_code: string
  provider?: FlightProviderId | string
  airline?: string | null
  transfers?: number | null
  booking_url?: string | null
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
  /** Non-stop only (Travelpayouts). Default false. */
  direct?: boolean
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
  /** Non-stop only (Travelpayouts). Default false. */
  direct?: boolean
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

export type DealProviderId = 'mock' | 'expedia' | 'lastminute' | 'liteapi'

export interface ApiConfig {
  available: boolean
  supabase_url?: string
  supabase_anon_key?: string
  deals_provider?: DealProviderId | string
  liteapi_env?: string | null
  currency?: string
  window_kinds?: string[]
  occupancies?: number[]
  weekends_ahead?: number
  budget_flight_pp?: number
  budget_pack_pp?: number
  excluded_fees_display?: string
  flight_cta_timing?: string
  payment_public_key?: string | null
}

export type DealWindowKind = 'FRI_SUN' | 'SAT_MON'

export interface TravelDealDates {
  outbound: string
  inbound: string
}

/** Stable key: `{origin}-{dest}-{window_id}-{adults}` */
export type DealKey = string

export interface TravelDealFlight {
  price_pp: number
  outbound_local?: string
  inbound_local?: string
  direct?: boolean
  airline?: string
  booking_url?: string
  origin_iata?: string
  destination_iata?: string
}

export interface TravelDealHotel {
  id: string
  name?: string
  stars?: number
  rating?: number
  review_count?: number
  distance_m?: number
  photo?: string
  board?: string
  refundable?: boolean
  cancel_deadline?: string | null
}

export interface TravelDealPriceBreakdown {
  flight_pp: number
  hotel_public_total: number
  /** Taxes payable on site — shown separately (not folded into price_pp). */
  excluded_fees: number
}

export interface TravelDealFlags {
  late_arrival?: boolean
  late_departure?: boolean
  breakfast?: boolean
}

export type PlannedTripStatus = 'draft' | 'scanning' | 'planning' | 'locked'
export type TripProposalStatus = 'pending' | 'accepted' | 'rejected'
export type TripMemberRole = 'organizer' | 'traveler'
export type TripMemberStatus = 'joined' | 'guest'

export interface PlannedTrip {
  id: string
  organizer_id: string
  name: string
  /** Single IATA or comma-separated city airports (e.g. CDG,ORY,BVA). */
  departure_airport: string
  arrival_airport?: string | null
  passengers: number
  /** Non-stop only when scanning (aligned with Search). */
  direct?: boolean
  dates_depart: DateAvecHoraire[]
  dates_retour: DateAvecHoraire[]
  budget_max: number
  invite_token: string
  status: PlannedTripStatus
  /** Server-side price watch (cron) */
  auto_scan_enabled?: boolean
  auto_scan_interval_seconds?: number
  last_scan_at?: string | null
  last_notified_at?: string | null
  last_notified_cheapest?: number | null
  created_at: string
  updated_at?: string
  proposals_count?: number
  accepted_proposal?: TripProposal | null
  /** False when arrival is no longer served from departure (Ryanair routes). */
  route_ok?: boolean
  invalid_arrival_codes?: string[]
  /** Participant display names (organizer first) for list cards */
  member_names?: string[]
  members_count?: number
  organizer?: {
    id: string
    full_name?: string | null
    avatar_url?: string | null
  } | null
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
  /** Guest invite email */
  email?: string | null
  role: TripMemberRole
  status: TripMemberStatus
  joined_at: string
}

export interface AddTripMemberRequest {
  /** @deprecated prefer first_name + last_name */
  display_name?: string
  first_name?: string
  last_name?: string
  email?: string | null
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
  direct?: boolean
}

export interface UpdatePlannedTripRequest {
  name?: string
  departure_airport?: string
  arrival_airport?: string | null
  passengers?: number
  dates_depart?: DateAvecHoraire[]
  dates_retour?: DateAvecHoraire[]
  budget_max?: number
  direct?: boolean
  auto_scan_enabled?: boolean
  auto_scan_interval_seconds?: number
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

/**
 * Weekend « vol + hôtel » for Deals tab.
 * Legacy flat fields kept for mock / liked snapshots; LiteAPI fills nested ones.
 */
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
  /** Hotel booking CTA when in-app; otherwise partner / redirect URL. */
  booking_url: string
  badge?: string
  /** Stable key for likes, alerts, revalidate. */
  deal_key?: DealKey
  origin_iata?: string
  destination?: string
  window_kind?: DealWindowKind
  window_id?: string
  adults?: number
  flight?: TravelDealFlight
  hotel?: TravelDealHotel
  price_breakdown?: TravelDealPriceBreakdown
  ssp_source?: string | null
  flags?: TravelDealFlags
  /** Alternate hotels from cache top-3 (without #1). */
  alt_hotels?: TravelDealHotel[]
  fetched_at?: string
}

/** Persisted like of a TravelDeal for a user. */
export interface LikedDeal {
  id: string
  deal_id: string
  /** Stable key when available (LiteAPI). */
  deal_key?: string | null
  deal: TravelDeal
  created_at: string
}

export interface DealsListParams {
  origin?: string
  adults?: number
  window?: DealWindowKind
  max_pp?: number
}
