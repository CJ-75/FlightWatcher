/** French labels for trip items / availability — shared web + Expo. */

import { cityDisplayNameFr, PREFERRED_CITY_NAMES } from '../cities'

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

/** Slug stable pour /activites/:city (aligné libellés vols FR). */
export function activityCitySlugFromLabel(label: string): string {
  return String(label || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Resolve catalogue city slug from trip draft / planner destination.
 * Prefers city_slug, then city label, then dest IATA → FR city name.
 */
export function resolveActivityCitySlug(opts: {
  citySlug?: string | null
  cityLabel?: string | null
  destIata?: string | null
}): string {
  const rawSlug = String(opts.citySlug || '').trim()
  if (rawSlug && rawSlug !== '—' && !/^[A-Za-z]{3}$/.test(rawSlug)) {
    const s = activityCitySlugFromLabel(rawSlug)
    if (s) return s
  }
  const label = String(opts.cityLabel || '').trim()
  if (label && label !== '—') {
    const s = activityCitySlugFromLabel(label)
    if (s) return s
  }
  const iata = String(opts.destIata || rawSlug || '')
    .trim()
    .toUpperCase()
  if (/^[A-Z]{3}$/.test(iata)) {
    const city = cityDisplayNameFr(iata)
    const s = activityCitySlugFromLabel(city || iata)
    if (s) return s
  }
  return 'paris'
}

/**
 * Seed / fallback villes Activités (avant chargement du catalogue vols).
 * L’UI utilise groupAirportsByCity(catalogue) pour la liste complète.
 */
const ACTIVITY_CITY_LABELS_FR = [
  'Paris',
  ...PREFERRED_CITY_NAMES,
  'Amsterdam',
  'Berlin',
  'Venise',
  'Florence',
  'Nice',
  'Lyon',
  'Bruxelles',
  'Athènes',
  'Cracovie',
  'Stockholm',
  'Copenhague',
  'Lisbonne',
] as const

export const ACTIVITY_CITY_OPTIONS_FR: ReadonlyArray<{
  slug: string
  label: string
}> = ACTIVITY_CITY_LABELS_FR.map((label) => ({
  slug: activityCitySlugFromLabel(label),
  label,
})).filter(
  (c, i, arr) => c.slug && arr.findIndex((x) => x.slug === c.slug) === i,
)

/** @deprecated alias */
export const ACTIVITY_QUICK_DESTINATIONS_FR = ACTIVITY_CITY_OPTIONS_FR
/** @deprecated alias */
export const ACTIVITY_DESTINATION_CITIES_FR = ACTIVITY_CITY_OPTIONS_FR

/**
 * Catégories Viator (multi-select Affiner).
 * tagIds = taxonomy Partner API v2 ; keywords = fallback titre/catégorie.
 * Pas de Food & Drink (21911) — réservé Restos.
 */
export const ACTIVITY_CATEGORY_TAGS_FR = [
  {
    id: 'tours',
    label: 'Visites guidées',
    emoji: '🗺️',
    tagIds: [21913],
    keywords: ['tour', 'sightseeing', 'visite guid', 'walking tour', 'city tour'],
  },
  {
    id: 'tickets',
    label: 'Musées et billets',
    emoji: '🎟️',
    tagIds: [],
    keywords: [
      'ticket',
      'museum',
      'musée',
      'pass',
      'entrée',
      'skip the line',
      'coupe-file',
      'attraction',
    ],
  },
  {
    id: 'day_trips',
    label: 'Excursions à la journée',
    emoji: '🚌',
    tagIds: [],
    keywords: ['day trip', 'excursion', 'journée', 'full-day', 'full day'],
  },
  {
    id: 'outdoor',
    label: 'Plein air',
    emoji: '🥾',
    tagIds: [21909],
    keywords: [
      'outdoor',
      'hiking',
      'bike',
      'vélo',
      'aventure',
      'plein air',
      'trekking',
      'kayak',
    ],
  },
  {
    id: 'water',
    label: 'Croisières et bateau',
    emoji: '🚢',
    tagIds: [21701, 21442],
    keywords: ['cruise', 'sailing', 'boat', 'croisière', 'bateau', 'seine', 'canal'],
  },
  {
    id: 'nightlife',
    label: 'Soirée et spectacles',
    emoji: '🎭',
    tagIds: [],
    keywords: [
      'nightlife',
      'show',
      'soirée',
      'cabaret',
      'concert',
      'spectacle',
      'evening',
    ],
  },
  {
    id: 'transfers',
    label: 'Transferts aéroport',
    emoji: '🚕',
    tagIds: [],
    keywords: [
      'transfer',
      'airport',
      'transfert',
      'navette',
      'aéroport',
      'shuttle',
      'private transfer',
    ],
  },
] as const

export type ActivityCategoryId = (typeof ACTIVITY_CATEGORY_TAGS_FR)[number]['id']

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

export function activityDestinationLabelFr(slug?: string | null): string {
  const s = String(slug || '').toLowerCase()
  if (!s) return 'Ville'
  const hit = ACTIVITY_CITY_OPTIONS_FR.find((c) => c.slug === s)
  if (hit) return hit.label
  // slug → Title Case soft
  const pretty = s
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
  return pretty || 'Ville'
}

export function toggleActivityCategory(
  selected: readonly string[],
  id: string,
): string[] {
  return selected.includes(id)
    ? selected.filter((x) => x !== id)
    : [...selected, id]
}

export function activityMatchesCategories(
  raw: Record<string, unknown>,
  selectedIds: readonly string[],
): boolean {
  if (!selectedIds.length) return true
  const tagsRaw = raw.tags
  const tagIds = Array.isArray(tagsRaw)
    ? tagsRaw
        .map((t) => {
          if (typeof t === 'number') return t
          if (typeof t === 'string' && /^\d+$/.test(t)) return Number(t)
          return NaN
        })
        .filter((n) => Number.isFinite(n))
    : []
  const blob = [
    raw.category,
    raw.title,
    raw.tag,
    raw.description,
  ]
    .map((x) => String(x || '').toLowerCase())
    .join(' ')

  return selectedIds.some((id) => {
    const cat = ACTIVITY_CATEGORY_TAGS_FR.find((t) => t.id === id)
    if (!cat) return false
    if (cat.tagIds.some((tid) => tagIds.includes(tid))) return true
    return cat.keywords.some((kw) => blob.includes(kw.toLowerCase()))
  })
}

export function activityCategoriesSummaryFr(selectedIds: readonly string[]): string {
  if (!selectedIds.length) return 'Toutes catégories'
  if (selectedIds.length === 1) {
    return (
      ACTIVITY_CATEGORY_TAGS_FR.find((t) => t.id === selectedIds[0])?.label ||
      '1 catégorie'
    )
  }
  return `${selectedIds.length} catégories`
}

/** Deep-link paths (web + Expo linking). */
export const ACTIVITIES_PATH = '/activites'
export function activitiesCityPath(
  citySlug: string,
  opts?: {
    draftToken?: string | null
    plannedTripId?: string | null
  },
): string {
  const base = `/activites/${encodeURIComponent(citySlug)}`
  const q = new URLSearchParams()
  const draft = String(opts?.draftToken || '').trim()
  const planned = String(opts?.plannedTripId || '').trim()
  if (draft) q.set('draft', draft)
  if (planned) q.set('planned', planned)
  const qs = q.toString()
  return qs ? `${base}?${qs}` : base
}

export function savedIdeasTitleFr(city: string): string {
  return `Idées sauvegardées · ${city}`
}

export const ACTIVITY_TRANSFER_CTA_FR =
  'Aéroport loin du centre ? Compare les transferts et navettes.'

export const ACTIVITY_OCCASIONS_CTA_FR =
  'Complète ton occasion avec des activités sur place.'
