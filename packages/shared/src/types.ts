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

export type DealProviderId = 'mock' | 'expedia' | 'lastminute' | 'liteapi' | 'community'

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
  carrier?: string
  booking_url?: string
  origin_iata?: string
  destination_iata?: string
  verification_level?: string
  out_dep_local?: string
  ret_dep_local?: string
  provider?: string
}

export interface TravelDealHotel {
  id: string
  name?: string
  stars?: number
  rating?: number
  review_count?: number
  distance_m?: number
  photo?: string
  /** Optional preloaded gallery URLs (lightbox may still fetch full set). */
  photos?: string[]
  board?: string
  refundable?: boolean
  cancel_deadline?: string | null
  /** Present on cache candidates for in-UI hotel switch. */
  public_hotel_price?: number
  excluded_fees?: number
}

export interface HotelGalleryPhoto {
  url: string
  thumb?: string
  caption?: string | null
  order?: number
  default?: boolean
}

export interface HotelGalleryResponse {
  hotel_id: string
  name?: string | null
  description?: string | null
  photos: HotelGalleryPhoto[]
  count?: number
}

export interface TravelDealPriceBreakdown {
  flight_pp: number
  hotel_public_total?: number
  hotel_pp?: number | null
  total_pp?: number
  /** Taxes payable on site — shown separately (not folded into price_pp). */
  excluded_fees?: number
  /** v3.3: false when photo-only / soft fill — do not treat as bookable stay total. */
  hotel_bookable?: boolean
  indicative_night_eur?: number | null
}

export interface TravelDealFlags {
  late_arrival?: boolean
  late_departure?: boolean
  breakfast?: boolean
  has_hotel?: boolean
  /** v3.3 Lot C — hotel has a usable rates price (not pool photo only). */
  hotel_bookable?: boolean
  soft_fill?: boolean
  soft_fill_mode?: string | null
  /** Honest label when stay total is flight-only. */
  price_label?: string | null
  source_mix?: string
  /** Human freshness — e.g. « Prix vérifié aujourd'hui » (no technical scan age). */
  verified_label?: string | null
  /** Lot C: live (Ryanair) | cached (Travelpayouts). */
  verification_level?: 'live' | 'cached' | string
  /** True when deal matches the origin filter; false = filler to keep the grid full. */
  match_origin?: boolean
  /** True when deal arrival IATA is in the selected destination city */
  match_destination?: boolean
  price_pax_note?: string | null
}

export interface TravelDealBadgeMeta {
  label: string
  discount_pct?: number | null
  scope?: 'flight' | 'pack'
  tooltip?: string
}

export interface MyTripDraft {
  id: string
  draft_token: string
  status: string
  payload?: Record<string, unknown>
  expires_at?: string
  deal_key?: string | null
  origin_iata?: string | null
  dest_iata?: string | null
  city_name?: string | null
  out_date?: string | null
  ret_date?: string | null
  adults?: number
  hotel?: unknown
  invite_available?: boolean
  /** Lot F */
  flight_booked_at?: string | null
  share_email?: string | null
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
  /** Honest market badge (flight-only % vs usual). */
  badge_meta?: TravelDealBadgeMeta
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
  /** Lot D */
  baggage_line?: string | null
  route_hint?: string | null
  origin_airport_label?: string | null
  arrival_airport_label?: string | null
  distance_label?: string | null
  price_pax_note?: string | null
  verification_level?: string
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
  /** Arrival city IATA(s); backend expands via served_city */
  destination?: string
  adults?: number
  window?: DealWindowKind
  max_pp?: number
  /** Wall size (backend default 36, max 48) */
  limit?: number
}

export interface DealCalendarCell {
  window_id: string
  kind?: DealWindowKind | string
  checkin?: string
  checkout?: string
  nights?: number
  hotel_id?: string | null
  hotel_min_public?: number | null
  flight_pp?: number | null
  price_pp?: number | null
  status: 'ok' | 'no_flight' | 'no_hotel' | 'empty' | string
}

export interface DealCalendarResponse {
  destination: {
    id: string
    slug?: string
    city_name?: string
    iata_arrival?: string
  }
  origin_iata: string
  adults: number
  window_kind: DealWindowKind | string
  cells: DealCalendarCell[]
  status: string
  fetched_at?: string | null
  expires_at?: string | null
}

export interface DealCalendarParams {
  origin: string
  slug?: string
  destination_id?: string
  /** Arrival IATA (TravelDeal.destination). */
  iata?: string
  adults?: number
  window?: DealWindowKind
}

/** L9 — hotel upsell on Search / Planner flight cards. */
export type HotelUpsellStatus =
  | 'ready'
  | 'miss'
  | 'pending'
  | 'unavailable'
  | 'rate_limited'

export interface HotelUpsellLookupItem {
  iata: string
  checkin: string
  checkout: string
  participants?: number
  /** Flight price per person — caps hotel options at 2.5× */
  flight_pp?: number
}

/** Hotel option for Search combo wizard / Deals. */
export interface HotelUpsellOption {
  id?: string
  hotel_id?: string
  name?: string
  stars?: number
  rating?: number
  review_count?: number
  photo?: string
  thumbnail?: string
  board?: string
  hotel_pp?: number
  public_hotel_price?: number
  distance_m?: number
  refundable?: boolean
}

export interface HotelUpsellResult {
  iata: string
  checkin?: string | null
  checkout?: string | null
  participants: number
  status: HotelUpsellStatus | string
  mode?: 'canonical' | 'ondemand' | string
  hotel_pp?: number
  hotel_public_total_one_room?: number
  hotel_name?: string | null
  hotel_id?: string | null
  hotel?: HotelUpsellOption | null
  options?: HotelUpsellOption[]
  /** @deprecated night_cap preferred — was flight×2.5 */
  max_hotel_pp?: number | null
  night_cap?: number | null
  median_night?: number | null
  tier?: string | null
  nights?: number | null
  flight_pp?: number | null
  /** Arrival city label (served city), not airport code */
  city?: string | null
  served_city_id?: string | null
  destination_id?: string | null
  destination_slug?: string | null
  window_id?: string | null
  window_kind?: string | null
  rooms?: number
  adults_lookup?: number
  job_id?: string | null
  reason?: string
  source?: string
  fetched_at?: string | null
  expires_at?: string | null
}

export interface HotelUpsellJob {
  id: string
  status: string
  done?: boolean
  hotel_pp?: number
  hotel_name?: string | null
  hotel_id?: string | null
  options?: HotelUpsellOption[]
  max_hotel_pp?: number | null
  night_cap?: number | null
  median_night?: number | null
  tier?: string | null
  nights?: number | null
  error?: string
}

export type HotelBookingStatus =
  | 'draft'
  | 'prebooked'
  | 'payment_pending'
  | 'payment_succeeded'
  | 'booking_pending'
  | 'confirmed'
  | 'failed'
  | 'cancelled'

export type RevalidateAction = 'silent' | 'confirm' | 'fallback'

export interface DealRevalidateRequest {
  hotel_id?: string
  displayed_price_pp?: number
}

export interface DealRevalidateResponse {
  ok: boolean
  action?: RevalidateAction
  deal_key?: string
  hotel_id?: string
  hotel_name?: string
  hotel_switched?: boolean
  offer_id?: string
  board?: string
  refundable?: boolean
  cancel_deadline?: string | null
  displayed_price_pp?: number
  revalidated_price_pp?: number
  flight_pp?: number
  public_hotel_price?: number
  excluded_fees?: number
  ssp_total?: number | null
  retail_total?: number | null
  margin_pct_used?: number | null
  ssp_source?: string | null
  checkin?: string
  checkout?: string
  adults?: number
  currency?: string
  payment_public_key?: string | null
  deal_snapshot?: TravelDeal
  reason?: string
  detail?: string
  tried_hotels?: string[]
}

export interface HotelBookingPrebookRequest {
  deal_key: string
  offer_id: string
  hotel_id: string
  displayed_price: number
  charged_price?: number
  margin_pct_used?: number | null
  ssp_at_booking?: number | null
  deal_snapshot?: TravelDeal | Record<string, unknown>
}

export interface HotelBookingPrebookResponse {
  booking_id: string
  prebook_id: string
  transaction_id: string
  secret_key?: string | null
  payment_public_key?: string | null
  liteapi_env?: string
  status: HotelBookingStatus | string
  charged_price?: number
  currency?: string
}

export interface HotelBookingBookRequest {
  holder: { firstName: string; lastName: string; email: string }
  guests?: Array<{
    firstName: string
    lastName: string
    email?: string
    occupancyNumber?: number
  }>
  payment_status: 'succeeded' | 'requires_capture'
}

export interface HotelBooking {
  id: string
  deal_key?: string | null
  hotel_id?: string | null
  status: HotelBookingStatus | string
  displayed_price?: number | null
  charged_price?: number | null
  confirmation_code?: string | null
  liteapi_booking_id?: string | null
  prebook_id?: string | null
  city?: string
  hotel_name?: string
  dates?: TravelDealDates
  deal_snapshot?: TravelDeal | Record<string, unknown>
  created_at?: string
  updated_at?: string
}
