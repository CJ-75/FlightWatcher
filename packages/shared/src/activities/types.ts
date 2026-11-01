import type { AvailabilityState, EventPlatform, TripItemStatus } from './labels'

export type PlaceKind = 'activity' | 'hotel' | 'restaurant' | 'airport'

export interface Place {
  id: string
  kind: PlaceKind
  name: string
  served_city_id?: string | null
  city_slug?: string | null
  location_precision?: 'exact' | 'city'
  meta?: Record<string, unknown>
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
