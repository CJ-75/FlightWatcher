/** Editorial parcours catalogue (admin-published). */

export type ItineraryStatus = 'draft' | 'published' | 'retired'
export type ItineraryAuthorKind = 'admin' | 'user'
export type ItineraryDurationKind = '2h' | 'half_day' | 'day' | 'weekend'
export type ItineraryBudgetBasis = 'for_two' | 'per_person'
export type ItineraryItemKind = 'place' | 'activity' | 'free'

export type ItineraryOccasion =
  | 'romantique'
  | 'ferie'
  | 'soleil'
  | 'pluie'
  | 'amis'
  | 'petit_budget'
  | 'famille'
  | 'nuit'
  | 'saison'

export type ItineraryItem = {
  id: string
  itinerary_id: string
  kind: ItineraryItemKind
  position: number
  title?: string | null
  note?: string | null
  duration_minutes?: number | null
  photo?: string | null
  place_id?: string | null
  viator_product_code?: string | null
  day_offset?: number | null
  moment?: string | null
  places?: {
    id?: string
    name?: string
    city_slug?: string | null
    meta?: Record<string, unknown> | null
  } | null
}

export type Itinerary = {
  id: string
  slug?: string | null
  title: string
  subtitle?: string | null
  intro?: string | null
  cover_image?: string | null
  /** Optional cover focal 0–100 (x, y) for object-position */
  cover_focal?: { x: number; y: number } | null
  city_slug?: string | null
  served_city_id?: string | null
  status: ItineraryStatus
  author_kind: ItineraryAuthorKind
  duration_kind?: ItineraryDurationKind | null
  occasions: ItineraryOccasion[] | string[]
  featured_from?: string | null
  featured_to?: string | null
  budget_estimate_eur?: number | null
  budget_basis?: ItineraryBudgetBasis | null
  sort_weight?: number
  published_at?: string | null
  is_demo?: boolean
  itinerary_items?: ItineraryItem[]
}

export type ItineraryListParams = {
  city?: string
  occasion?: string
  featured?: boolean
  include_demo?: boolean
  limit?: number
}

export type ItineraryListResponse = {
  ok: boolean
  itineraries: Itinerary[]
}
