import type { AvailabilityState, EventPlatform, TripItemStatus } from './labels'

export type PlaceKind =
  | 'activity'
  | 'hotel'
  | 'restaurant'
  | 'bar'
  | 'cafe'
  | 'attraction'
  | 'airport'

export type PlaceOrigin =
  | 'osm'
  | 'overture'
  | 'viator'
  | 'liteapi'
  | 'user'
  | 'google'
  | 'other'

export type PlaceVisibility = 'public' | 'private'

export interface Place {
  id: string
  kind: PlaceKind
  name: string
  served_city_id?: string | null
  city_slug?: string | null
  location_precision?: 'exact' | 'city'
  origin?: PlaceOrigin
  visibility?: PlaceVisibility
  created_by?: string | null
  meta?: Record<string, unknown>
  restaurant_details?: RestaurantDetails | null
  attraction_details?: AttractionDetails | null
}

export interface RestaurantDetails {
  place_id: string
  cuisine?: string | null
  opening_hours_raw?: string | null
  opening_hours_norm?: string | null
  vegetarian?: boolean | null
  vegan?: boolean | null
  terrace?: boolean | null
  website?: string | null
  phone?: string | null
  menu_url?: string | null
  price_range?: string | null
  facts_sources?: unknown
}

export interface AttractionDetails {
  place_id: string
  category?: string | null
  opening_hours_raw?: string | null
  opening_hours_norm?: string | null
  website?: string | null
}

export type UserPlaceStatus = 'to_try' | 'loved' | 'meh'

export interface UserPlace {
  id: string
  user_id?: string | null
  draft_token?: string | null
  place_id: string
  status: UserPlaceStatus
  note?: string | null
  rating?: number | null
  source_url?: string | null
  city_slug?: string | null
  places?: Place | null
  created_at?: string
}

export interface TripItem {
  id: string
  planned_trip_id?: string | null
  draft_id?: string | null
  item_type: 'activity' | 'hotel' | 'restaurant'
  place_id?: string | null
  day_offset: number
  moment?: 'morning' | 'afternoon' | 'evening' | null
  sort_key: string
  status: TripItemStatus
  availability_state: AvailabilityState
  notes?: string | null
  meta?: Record<string, unknown>
  places?: Place | null
}

export interface ActivityListResponse {
  ok: boolean
  items: Record<string, unknown>[]
  city_slug?: string
  adults?: number
  cached?: boolean
  indicative?: boolean
  error?: string
  header?: string
  radius_km?: number
  count?: number
  fallback_hint?: string
}

export interface ActivityEventPayload {
  domain?: string
  event: string
  surface?: string
  platform?: EventPlatform
  place_id?: string
  trip_item_id?: string
  draft_token?: string
  planned_trip_id?: string
  meta?: Record<string, unknown>
}

export type LinkImportRow = {
  id?: string
  source: string
  url_clean: string
  status: string
  place_id?: string | null
  parse_result?: Record<string, unknown>
  bucket?: 'restaurant' | 'attraction' | 'unknown'
  open_chip?: { status: string; label: string }
}
