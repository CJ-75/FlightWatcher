/** French labels for trip items / availability — shared web + Expo. */

export type TripItemStatus = 'idea' | 'validated' | 'booked' | 'skipped'
export type AvailabilityState = 'ok' | 'needs_check' | 'unavailable'
export type EventPlatform = 'web' | 'ios' | 'android'

export const TRIP_ITEM_STATUS_LABEL_FR: Record<TripItemStatus, string> = {
  idea: 'Idée',
  validated: 'Validée',
  booked: 'Réservée',
  skipped: 'Pas d’activité',
}

export const AVAILABILITY_STATE_LABEL_FR: Record<AvailabilityState, string> = {
  ok: 'Disponible',
  needs_check: 'À vérifier',
  unavailable: 'Indisponible',
}

export const ACTIVITY_CATEGORY_TAGS_FR = [
  { id: 'tours', label: 'Visites guidées' },
  { id: 'food', label: 'Gastronomie' },
  { id: 'tickets', label: 'Musées et billets' },
  { id: 'day_trips', label: 'Excursions à la journée' },
  { id: 'outdoor', label: 'Plein air' },
  { id: 'nightlife', label: 'Soirée' },
  { id: 'transfers', label: 'Transferts aéroport' },
] as const

export const ACTIVITY_SORT_LABEL_FR = {
  recommended: 'Recommandé',
  price: 'Prix',
  rating: 'Note',
} as const

export function tripItemStatusLabelFr(status?: string | null): string {
  const k = String(status || '') as TripItemStatus
  return TRIP_ITEM_STATUS_LABEL_FR[k] || 'Idée'
}

export function availabilityStateLabelFr(state?: string | null): string {
  const k = String(state || '') as AvailabilityState
  return AVAILABILITY_STATE_LABEL_FR[k] || 'Disponible'
}

/** Deep-link paths (web + Expo linking). */
export const ACTIVITIES_PATH = '/activites'
export function activitiesCityPath(citySlug: string): string {
  return `/activites/${encodeURIComponent(citySlug)}`
}

export function savedIdeasTitleFr(city: string): string {
  return `Idées sauvegardées · ${city}`
}

/** Transparence classement + affiliation (onglet Activités). */
export const ACTIVITY_TRANSPARENCY_FR =
  'Classement FlightWatcher (note bayésienne, annulation gratuite, durée) — indépendant du tri commercial Viator. En cliquant sur « Réserver sur Viator », tu quittes FlightWatcher ; une commission peut être versée si tu réserves.'

export const ACTIVITY_TRANSFER_CTA_FR =
  'Aéroport loin du centre ? Compare les transferts et navettes Viator.'

export const ACTIVITY_OCCASIONS_CTA_FR =
  'Complète ton occasion avec des activités sur place.'
