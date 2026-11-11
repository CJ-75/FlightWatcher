import type { Itinerary, ItineraryItem, ItineraryOccasion } from './types'
import {
  ITINERARY_DURATION_LABELS,
  ITINERARY_OCCASION_LABELS,
  formatDurationMinutes,
} from './labels'
import {
  arrivalCodesForParcoursCitySlug,
  isParcoursCityWithoutFlightHub,
  parcoursCityLabelFr,
} from './parcoursCities'

export type ItineraryMarkerTile = {
  id: string
  label: string
  detail?: string
}

export type ItineraryStickyMode = 'local' | 'elsewhere_priced' | 'elsewhere'

export type ItineraryStickyView = {
  mode: ItineraryStickyMode
  leftLabel: string
  ctaLabel: string
  ctaAction: 'launch_maps' | 'make_trip'
}

function coordsFromMapsUrl(url: string): { lat: number; lng: number } | null {
  const u = String(url || '')
  const at = u.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (at) {
    const lat = Number(at[1])
    const lng = Number(at[2])
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  }
  const d3 = u.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  if (d3) {
    const lat = Number(d3[1])
    const lng = Number(d3[2])
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
  }
  return null
}

function placeCoords(item: ItineraryItem): { lat: number; lng: number } | null {
  const place = item.places as
    | {
        lat?: number
        lng?: number
        meta?: { lat?: number; lng?: number } | null
      }
    | null
    | undefined
  const stepMeta = item.meta
  const lat = place?.lat ?? place?.meta?.lat ?? stepMeta?.lat
  const lng = place?.lng ?? place?.meta?.lng ?? stepMeta?.lng
  if (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return { lat, lng }
  }
  const pasted = String(stepMeta?.maps_url || '').trim()
  if (pasted) return coordsFromMapsUrl(pasted)
  return null
}

function placeQuery(item: ItineraryItem): string | null {
  const coords = placeCoords(item)
  if (coords) return `${coords.lat},${coords.lng}`
  const name = item.places?.name || item.title
  return name ? String(name) : null
}

function isMapsStop(item: ItineraryItem): boolean {
  const kind = item.kind || 'free'
  if (kind !== 'place' && kind !== 'activity' && kind !== 'free') return false
  return !!(
    placeCoords(item) ||
    item.places?.name ||
    item.title ||
    String(item.meta?.maps_url || '').trim()
  )
}

const MOMENT_ORDER: Record<string, number> = {
  morning: 0,
  afternoon: 1,
  evening: 2,
}

function sortStepsForMaps(items: ItineraryItem[]): ItineraryItem[] {
  return [...items].sort((a, b) => {
    const d = (a.day_offset ?? 0) - (b.day_offset ?? 0)
    if (d) return d
    const ma = MOMENT_ORDER[String(a.moment || '')] ?? 9
    const mb = MOMENT_ORDER[String(b.moment || '')] ?? 9
    if (ma !== mb) return ma - mb
    return (a.position ?? 0) - (b.position ?? 0)
  })
}

/** Google Maps search for a single place/activity step (or pasted maps_url). */
export function buildItineraryStepMapsUrl(item: ItineraryItem): string | null {
  const pasted = String(item.meta?.maps_url || '').trim()
  if (pasted) return pasted
  if (item.kind !== 'place' && item.kind !== 'activity' && item.kind !== 'free') {
    return null
  }
  const q = placeQuery(item)
  if (!q) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

/**
 * Lien Google Maps du parcours.
 * 1 étape → lien Maps du lieu (ou recherche).
 * >1 étapes → itinéraire multi-stops (dir) dans l’ordre jour / moment / position.
 * Inclut les étapes libres (create mobile) avec maps_url / coords / titre.
 */
export function buildItineraryMapsUrl(items: ItineraryItem[]): string | null {
  const stopsItems = sortStepsForMaps(items).filter(isMapsStop)
  if (!stopsItems.length) return null

  if (stopsItems.length === 1) {
    const one = stopsItems[0]
    const pasted = String(one.meta?.maps_url || '').trim()
    if (pasted) return pasted
    const q = placeQuery(one)
    if (!q) return null
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
  }

  const stops = stopsItems
    .map(placeQuery)
    .filter((q): q is string => !!q)
  if (stops.length < 2) {
    // Fallback: au moins un stop utilisable
    if (stops.length === 1) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stops[0])}`
    }
    return null
  }

  // Google Maps URL API: origin + destination + waypoints (max ~9)
  const capped = stops.slice(0, 11)
  const origin = capped[0]
  const destination = capped[capped.length - 1]
  const waypoints = capped.slice(1, -1)
  const q = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'walking',
  })
  if (waypoints.length) q.set('waypoints', waypoints.join('|'))
  return `https://www.google.com/maps/dir/?${q.toString()}`
}

export function itineraryInfoChips(it: Itinerary): string[] {
  const chips: string[] = []
  if (it.duration_kind) {
    chips.push(
      ITINERARY_DURATION_LABELS[
        it.duration_kind as keyof typeof ITINERARY_DURATION_LABELS
      ] || String(it.duration_kind),
    )
  }
  for (const o of it.occasions || []) {
    chips.push(
      ITINERARY_OCCASION_LABELS[o as ItineraryOccasion] || String(o),
    )
  }
  return chips
}

export function itineraryBudgetLabel(it: Itinerary): string | null {
  if (it.budget_estimate_eur == null) return null
  if (it.budget_estimate_eur === 0) return 'Gratuit'
  const basis =
    it.budget_basis === 'for_two'
      ? 'pour deux'
      : it.budget_basis === 'per_person'
        ? 'par personne'
        : ''
  return `~${it.budget_estimate_eur} €${basis ? ` ${basis}` : ''} sur place`
}

export function buildItineraryMarkerTiles(it: Itinerary): ItineraryMarkerTile[] {
  const items = it.itinerary_items || []
  const tiles: ItineraryMarkerTile[] = []
  if (it.duration_kind) {
    tiles.push({
      id: 'duration',
      label: 'Durée',
      detail:
        ITINERARY_DURATION_LABELS[
          it.duration_kind as keyof typeof ITINERARY_DURATION_LABELS
        ] || String(it.duration_kind),
    })
  }
  tiles.push({
    id: 'steps',
    label: 'Étapes',
    detail: String(items.length),
  })
  const budget = itineraryBudgetLabel(it)
  if (budget) {
    tiles.push({ id: 'budget', label: 'Budget', detail: budget.replace(' sur place', '').trim() })
  }
  if ((it.occasions || []).includes('soleil')) {
    tiles.push({ id: 'weather', label: 'Idéal', detail: 'Beau temps' })
  } else if ((it.occasions || []).includes('pluie')) {
    tiles.push({ id: 'weather', label: 'Idéal', detail: 'Jour de pluie' })
  }
  return tiles.slice(0, 4)
}

export function buildItinerarySticky(opts: {
  itinerary: Itinerary
  userCitySlug?: string | null
  dealPriceLabel?: string | null
}): ItineraryStickyView {
  const city = (opts.itinerary.city_slug || '').toLowerCase()
  const user = (opts.userCitySlug || '').toLowerCase()
  const items = opts.itinerary.itinerary_items || []
  const stepsLabel = `${items.length} étape${items.length > 1 ? 's' : ''}`
  const dur =
    opts.itinerary.duration_kind &&
    ITINERARY_DURATION_LABELS[
      opts.itinerary.duration_kind as keyof typeof ITINERARY_DURATION_LABELS
    ]

  const isLocal = !!user && !!city && user === city
  if (isLocal) {
    return {
      mode: 'local',
      leftLabel: [dur, stepsLabel].filter(Boolean).join(' · '),
      ctaLabel: 'Lancer le parcours',
      ctaAction: 'launch_maps',
    }
  }
  if (opts.dealPriceLabel) {
    return {
      mode: 'elsewhere_priced',
      leftLabel: opts.dealPriceLabel,
      ctaLabel: 'En faire mon voyage',
      ctaAction: 'make_trip',
    }
  }
  const cityName = city || 'ailleurs'
  return {
    mode: 'elsewhere',
    leftLabel: dur ? `${dur} · ${cityName}` : `Week-end à ${cityName}`,
    ctaLabel: 'En faire mon voyage',
    ctaAction: 'make_trip',
  }
}

export function groupItemsByDay(items: ItineraryItem[]): {
  dayOffset: number
  label: string
  items: ItineraryItem[]
}[] {
  const map = new Map<number, ItineraryItem[]>()
  for (const it of items) {
    const d = it.day_offset ?? 0
    if (!map.has(d)) map.set(d, [])
    map.get(d)!.push(it)
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dayOffset, dayItems]) => ({
      dayOffset,
      label: dayOffset === 0 ? 'Jour 1' : `Jour ${dayOffset + 1}`,
      items: dayItems,
    }))
}

export function stepKindLabel(kind: string): string {
  if (kind === 'activity') return 'Activité'
  if (kind === 'place') return 'Lieu'
  return 'À pied'
}

/** Rough city_slug → arrival airport codes for Planner create (EU hubs + FR). */
export const PARCOURS_CITY_ARRIVAL: Record<string, string> = {
  lisbon: 'LIS',
  lisbonne: 'LIS',
  porto: 'OPO',
  barcelona: 'BCN',
  barcelone: 'BCN',
  rome: 'FCO,CIA',
  madrid: 'MAD',
  milan: 'MXP,LIN',
  amsterdam: 'AMS',
  berlin: 'BER',
  bruxelles: 'BRU',
  brussels: 'BRU',
  londres: 'STN,LTN,LGW',
  london: 'STN,LTN,LGW',
}

export function arrivalCodesForCitySlug(slug?: string | null): string | null {
  if (!slug) return null
  const key = slug.trim().toLowerCase()
  // Parcours FR (top 30) — peut être null si pas de hub
  const fromFr = arrivalCodesForParcoursCitySlug(key)
  if (fromFr) return fromFr
  if (isParcoursCityWithoutFlightHub(key)) return null
  return PARCOURS_CITY_ARRIVAL[key] || null
}

/** Affichage city_slug parcours — FR top 30 puis fallback générique. */
export function resolveParcoursCityDisplayName(
  slug?: string | null,
  fallbackFn?: (s: string) => string,
): string {
  const key = String(slug || '')
    .trim()
    .toLowerCase()
  if (!key) return ''
  return (
    parcoursCityLabelFr(key) ||
    (fallbackFn ? fallbackFn(key) : '') ||
    key.charAt(0).toUpperCase() + key.slice(1)
  )
}

/** Next weekend ISO dates, or featured window start if present. */
export function suggestedParcoursDates(it: Itinerary): {
  outbound: string
  inbound: string
} {
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  if (it.featured_from && it.featured_to) {
    return { outbound: it.featured_from, inbound: it.featured_to }
  }
  const day = today.getDay() // 0 Sun
  const daysUntilFri = (5 - day + 7) % 7 || 7
  const fri = new Date(today)
  fri.setDate(today.getDate() + daysUntilFri)
  const sun = new Date(fri)
  sun.setDate(fri.getDate() + 2)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { outbound: iso(fri), inbound: iso(sun) }
}

export function buildItineraryAppleMapsUrl(items: ItineraryItem[]): string | null {
  const stops = items
    .filter((it) => it.kind === 'place' || it.kind === 'activity')
    .map((it) => {
      const place = it.places as
        | { lat?: number; lng?: number; name?: string; meta?: { lat?: number; lng?: number } }
        | null
        | undefined
      const lat = place?.lat ?? place?.meta?.lat
      const lng = place?.lng ?? place?.meta?.lng
      if (typeof lat === 'number' && typeof lng === 'number') return `${lat},${lng}`
      return place?.name || it.title || null
    })
    .filter((q): q is string => !!q)
  if (!stops.length) return null
  if (stops.length === 1) {
    return `https://maps.apple.com/?q=${encodeURIComponent(stops[0])}`
  }
  const daddr = stops
    .slice(1)
    .map((s) => encodeURIComponent(s))
    .join('+to:')
  return `https://maps.apple.com/?saddr=${encodeURIComponent(stops[0])}&daddr=${daddr}&dirflg=w`
}

export { formatDurationMinutes }
