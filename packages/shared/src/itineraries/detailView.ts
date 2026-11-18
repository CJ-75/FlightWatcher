import type { Itinerary, ItineraryItem, ItineraryOccasion } from './types'
import {
  ITINERARY_DURATION_LABELS,
  ITINERARY_OCCASION_LABELS,
  formatDurationMinutes,
  idealLabelFr,
  transportLabelFr,
} from './labels'
import { paceLabelFr } from './popContent'
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
  ctaAction: 'make_trip'
  secondaryLabel: string
  secondaryAction: 'launch_pop'
  /** Planner sheet nudge when origin city ≠ pop city. */
  nudge: string | null
}

/** Max stops inside one Google Maps walking `dir` URL (origin+dest+waypoints). */
export const MAPS_DIR_MAX_STOPS = 10
/** Reserved v2: skip transit leg if user nearer than this (meters). */
export const MAPS_NEAR_FIRST_STOP_M = 1500
/** Reserved v2: split walk if consecutive stops farther than this (meters). */
export const MAPS_MAX_WALK_BETWEEN_STOPS_M = 2000

export type LaunchPopLeg = {
  id: string
  kind: 'transit' | 'walk'
  title: string
  subtitle: string
  preview: string
  mapsUrl: string
  durationLabel?: string | null
  ctaLabel: string
}

export type LaunchPopSegment = {
  id: string
  label: string
  stopCount: number
  legs: LaunchPopLeg[]
}

export type LaunchPopDay = {
  dayOffset: number
  label: string
  stopCount: number
  durationMinutes: number | null
  previewTitles: string[]
  segments: LaunchPopSegment[]
  isToday?: boolean
}

export type LaunchPopPlan = {
  days: LaunchPopDay[]
  /** True when more than one day or any day needed walk split. */
  needsSheet: boolean
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
  const budget = itineraryBudgetLabel(it)
  if (budget) {
    chips.push(budget.replace(/\s+sur place$/, '').trim())
  }
  for (const o of it.occasions || []) {
    chips.push(
      ITINERARY_OCCASION_LABELS[o as ItineraryOccasion] || String(o),
    )
  }
  return chips
}

/**
 * Hero meta légère (Next-like) — pas de budget (réservé aux facts body).
 * durée · N stops · transport · idéal
 */
export function itineraryHeroMetaChips(it: Itinerary): string[] {
  const chips: string[] = []
  if (it.duration_kind) {
    chips.push(
      ITINERARY_DURATION_LABELS[
        it.duration_kind as keyof typeof ITINERARY_DURATION_LABELS
      ] || String(it.duration_kind),
    )
  }
  const items = it.itinerary_items || []
  if (items.length > 0) {
    chips.push(`${items.length} stop${items.length > 1 ? 's' : ''}`)
  }
  const transport = (it.transport_modes || [])[0]
  const transportLabel = transportLabelFr(transport)
  if (transportLabel) chips.push(transportLabel)
  const idealRaw =
    (it.ideal_for || []).length > 0
      ? it.ideal_for![0]
      : (it.occasions || [])[0]
  const ideal = idealLabelFr(idealRaw)
  if (ideal) chips.push(ideal)
  return chips
}

export type ItineraryPopFact = { label: string; value: string }

/**
 * Facts body Next-shaped (une seule fois) : Durée · Budget · Rythme · Idéal.
 */
export function buildItineraryPopFacts(it: Itinerary): ItineraryPopFact[] {
  const facts: ItineraryPopFact[] = []
  if (it.duration_kind) {
    facts.push({
      label: 'Durée',
      value:
        ITINERARY_DURATION_LABELS[
          it.duration_kind as keyof typeof ITINERARY_DURATION_LABELS
        ] || String(it.duration_kind),
    })
  }
  const n = normalizeItineraryBudgetEur(it.budget_estimate_eur)
  if (n > 0) {
    facts.push({
      label: 'Budget',
      value: `≈ ${Math.round(n)} € / jour (estimé)`,
    })
  } else if (it.budget_estimate_eur != null || it.budget_basis) {
    facts.push({ label: 'Budget', value: 'Gratuit' })
  }
  const pace = paceLabelFr(it.pace)
  if (pace) {
    facts.push({ label: 'Rythme', value: pace })
  }
  const idealRaw =
    (it.ideal_for || []).length > 0
      ? it.ideal_for![0]
      : (it.occasions || [])[0]
  const ideal = idealLabelFr(idealRaw)
  if (ideal) {
    facts.push({ label: 'Idéal', value: ideal })
  }
  return facts.slice(0, 4)
}

/** Budget parcours : vide / null → 0 (obligatoire côté front) = Gratuit. */
export function normalizeItineraryBudgetEur(
  value: unknown,
): number {
  if (value == null || value === '') return 0
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}

export function itineraryBudgetLabel(it: Itinerary): string | null {
  const n = normalizeItineraryBudgetEur(it.budget_estimate_eur)
  // 0 € (ou vide) = gratuit
  if (n === 0) return 'Gratuit'
  const basis =
    it.budget_basis === 'for_two'
      ? 'pour deux'
      : it.budget_basis === 'per_person'
        ? 'par personne'
        : ''
  return `~${n} €${basis ? ` ${basis}` : ''} sur place`
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
  // Fill remaining slots with editorial ideal / pace (prefer over bare weather).
  const idealRaw =
    (it.ideal_for || []).length > 0
      ? it.ideal_for![0]
      : (it.occasions || []).includes('soleil')
        ? 'soleil'
        : (it.occasions || []).includes('pluie')
          ? 'pluie'
          : (it.occasions || [])[0]
  const ideal = idealLabelFr(idealRaw)
  if (ideal && tiles.length < 4) {
    tiles.push({ id: 'ideal', label: 'Idéal', detail: ideal })
  }
  const pace = paceLabelFr(it.pace)
  if (pace && tiles.length < 4) {
    tiles.push({ id: 'pace', label: 'Rythme', detail: pace })
  }

  return tiles.slice(0, 4)
}

export function buildItinerarySticky(opts: {
  itinerary: Itinerary
  userCitySlug?: string | null
  /** Display name of onboarding origin city (e.g. Lyon). */
  originCityLabel?: string | null
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
  const originLabel = String(opts.originCityLabel || '').trim()
  const nudge =
    !isLocal && originLabel
      ? `Tu viens de ${originLabel} ? Ajoute le vol et l’hôtel`
      : !isLocal
        ? 'Tu viens d’une autre ville ? Ajoute le vol et l’hôtel'
        : null

  const leftLabel = opts.dealPriceLabel
    ? opts.dealPriceLabel
    : [dur, stepsLabel].filter(Boolean).join(' · ') ||
      (city ? `Week-end à ${city}` : 'Programme')

  return {
    mode: isLocal
      ? 'local'
      : opts.dealPriceLabel
        ? 'elsewhere_priced'
        : 'elsewhere',
    leftLabel,
    ctaLabel: 'Ajouter au Planner',
    ctaAction: 'make_trip',
    secondaryLabel: 'Lancer le pop',
    secondaryAction: 'launch_pop',
    nudge,
  }
}

function stopTitle(item: ItineraryItem): string {
  return String(item.places?.name || item.title || 'Stop').trim() || 'Stop'
}

function formatMinutesLabel(mins: number | null | undefined): string | null {
  if (mins == null || !Number.isFinite(mins) || mins <= 0) return null
  const m = Math.round(mins)
  if (m < 60) return `≈ ${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `≈ ${h} h ${r}` : `≈ ${h} h`
}

function sumDurationMinutes(items: ItineraryItem[]): number | null {
  let total = 0
  let any = false
  for (const it of items) {
    const d = it.duration_minutes
    if (d != null && Number.isFinite(Number(d)) && Number(d) > 0) {
      total += Number(d)
      any = true
    }
    const travel = Number(
      (it.meta as { travel_minutes?: number } | null | undefined)
        ?.travel_minutes,
    )
    if (Number.isFinite(travel) && travel > 0) {
      total += travel
      any = true
    }
  }
  return any ? total : null
}

/** Transit: user → first stop (no waypoints). */
export function buildTransitToStopUrl(
  firstStop: ItineraryItem,
  opts?: { origin?: string | null },
): string | null {
  const dest = placeQuery(firstStop)
  if (!dest) return null
  const origin = String(opts?.origin || 'Current Location').trim() || 'Current Location'
  const q = new URLSearchParams({
    api: '1',
    origin,
    destination: dest,
    travelmode: 'transit',
  })
  return `https://www.google.com/maps/dir/?${q.toString()}`
}

/** `lat,lng` origin for Maps dir (more precise than `Current Location`). */
export function mapsOriginFromCoords(lat: number, lng: number): string {
  return `${Number(lat)},${Number(lng)}`
}

/** Replace / set `origin` on an existing Maps dir URL. */
export function withMapsDirOrigin(mapsUrl: string, origin: string): string {
  const next = String(origin || '').trim()
  if (!next || !mapsUrl) return mapsUrl
  try {
    const u = new URL(mapsUrl)
    u.searchParams.set('origin', next)
    return u.toString()
  } catch {
    return mapsUrl
  }
}

/** Walking multi-stop dir (first → last + waypoints). Caps at MAPS_DIR_MAX_STOPS. */
export function buildWalkingStopsUrl(items: ItineraryItem[]): string | null {
  const stops = sortStepsForMaps(items)
    .filter(isMapsStop)
    .map(placeQuery)
    .filter((q): q is string => !!q)
  if (!stops.length) return null
  if (stops.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stops[0])}`
  }
  const capped = stops.slice(0, MAPS_DIR_MAX_STOPS)
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

function chunkWalkItems(items: ItineraryItem[]): ItineraryItem[][] {
  const sorted = sortStepsForMaps(items).filter(isMapsStop)
  if (!sorted.length) return []
  if (sorted.length <= MAPS_DIR_MAX_STOPS) return [sorted]

  const byMoment = new Map<string, ItineraryItem[]>()
  for (const it of sorted) {
    const key = String(it.moment || 'daytime')
    if (!byMoment.has(key)) byMoment.set(key, [])
    byMoment.get(key)!.push(it)
  }
  const momentKeys = ['morning', 'afternoon', 'evening', 'daytime'].filter((k) =>
    byMoment.has(k),
  )
  const fromMoments = momentKeys.map((k) => byMoment.get(k)!)
  if (
    fromMoments.length > 1 &&
    fromMoments.every((g) => g.length <= MAPS_DIR_MAX_STOPS)
  ) {
    return fromMoments
  }

  const chunks: ItineraryItem[][] = []
  for (let i = 0; i < sorted.length; i += MAPS_DIR_MAX_STOPS) {
    chunks.push(sorted.slice(i, i + MAPS_DIR_MAX_STOPS))
  }
  return chunks
}

function momentSegmentLabel(items: ItineraryItem[], index: number, total: number): string {
  if (total === 1) return 'Parcours'
  const m = String(items[0]?.moment || '')
  if (m === 'morning') return 'Matin'
  if (m === 'afternoon') return 'Après-midi'
  if (m === 'evening') return 'Soir'
  return `Partie ${index + 1}`
}

function buildSegmentLegs(
  dayOffset: number,
  segIndex: number,
  walkItems: ItineraryItem[],
): LaunchPopLeg[] {
  const first = walkItems[0]
  const last = walkItems[walkItems.length - 1]
  const firstTitle = first ? stopTitle(first) : 'Stop'
  const lastTitle = last ? stopTitle(last) : firstTitle
  const preview = walkItems.map(stopTitle).join(' → ')
  const walkMins = sumDurationMinutes(walkItems)
  const transitUrl = first ? buildTransitToStopUrl(first) : null
  const walkUrl = buildWalkingStopsUrl(walkItems)
  const legs: LaunchPopLeg[] = []
  if (transitUrl && first) {
    legs.push({
      id: `d${dayOffset}-s${segIndex}-transit`,
      kind: 'transit',
      title: 'Rejoindre le 1er stop',
      subtitle: `Toi → ${firstTitle}`,
      preview: `Toi → ${firstTitle}`,
      mapsUrl: transitUrl,
      durationLabel: null,
      ctaLabel: 'Y aller',
    })
  }
  if (walkUrl) {
    legs.push({
      id: `d${dayOffset}-s${segIndex}-walk`,
      kind: 'walk',
      title: 'Les stops à pied',
      subtitle:
        walkItems.length > 1
          ? `${firstTitle} → ${lastTitle}`
          : firstTitle,
      preview,
      mapsUrl: walkUrl,
      durationLabel: formatMinutesLabel(walkMins),
      ctaLabel: 'Lancer',
    })
  }
  return legs
}

/**
 * Plan « Lancer le Pop » : jours → segments walk ; chaque segment = transit + marche.
 */
export function buildLaunchPopPlan(
  items: ItineraryItem[],
  opts?: { todayDayOffset?: number | null },
): LaunchPopPlan {
  const daysRaw = groupItemsByDay(items)
  const days: LaunchPopDay[] = []
  let needsSheet = daysRaw.length > 1

  for (const day of daysRaw) {
    const mapStops = sortStepsForMaps(day.items).filter(isMapsStop)
    const chunks = chunkWalkItems(day.items)
    if (chunks.length > 1) needsSheet = true
    if (mapStops.length > MAPS_DIR_MAX_STOPS) needsSheet = true

    const segments: LaunchPopSegment[] = chunks.map((chunk, i) => ({
      id: `d${day.dayOffset}-seg${i}`,
      label: momentSegmentLabel(chunk, i, chunks.length),
      stopCount: chunk.length,
      legs: buildSegmentLegs(day.dayOffset, i, chunk),
    }))

    days.push({
      dayOffset: day.dayOffset,
      label: day.label,
      stopCount: mapStops.length,
      durationMinutes: sumDurationMinutes(mapStops),
      previewTitles: mapStops.slice(0, 4).map(stopTitle),
      segments,
      isToday:
        opts?.todayDayOffset != null &&
        opts.todayDayOffset === day.dayOffset,
    })
  }

  // Always prefer sheet UI (2-leg UX); needsSheet flags multi-day / split.
  if (days.length === 0) needsSheet = false
  else needsSheet = true

  return { days, needsSheet }
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
