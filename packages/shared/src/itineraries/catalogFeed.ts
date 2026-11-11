import type { Itinerary, ItineraryOccasion } from './types'
import { ITINERARY_OCCASION_LABELS, ITINERARY_OCCASIONS } from './labels'

export type ParcoursFeedRow =
  | {
      id: 'featured'
      kind: 'featured'
      title: string
      items: Itinerary[]
    }
  | {
      id: 'near'
      kind: 'near'
      title: string
      items: Itinerary[]
    }
  | {
      id: 'envies'
      kind: 'envies'
      title: string
      chips: { occasion: ItineraryOccasion; label: string; count: number }[]
    }
  | {
      id: 'weekend'
      kind: 'weekend'
      title: string
      items: Itinerary[]
    }
  | {
      id: `occasion_${string}`
      kind: 'occasion'
      occasion: ItineraryOccasion
      title: string
      items: Itinerary[]
    }

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Tag principal (1er occasions[]) — une carte = une section Envies. */
export function primaryOccasion(
  it: Pick<Itinerary, 'occasions'> | null | undefined,
): ItineraryOccasion | null {
  const first = (it?.occasions || []).map(String).filter(Boolean)[0]
  if (!first) return null
  return (ITINERARY_OCCASIONS as string[]).includes(first)
    ? (first as ItineraryOccasion)
    : null
}

function matchesPrimaryOccasion(
  it: Itinerary,
  occasion: ItineraryOccasion,
): boolean {
  return primaryOccasion(it) === occasion
}

export function isFeaturedToday(it: Itinerary, today = todayIso()): boolean {
  if (!it.featured_from || !it.featured_to) return false
  return it.featured_from <= today && today <= it.featured_to
}

const WEEKDAY_FR = [
  'dimanche',
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
] as const

/** « Pour le férié de mercredi » when featured window is dated. */
export function featuredRowTitle(
  items: Itinerary[],
  today = todayIso(),
): string {
  if (!items.length) return 'À la une'
  const first = items[0]
  const occasions = first.occasions || []
  if (occasions.includes('ferie')) {
    // Prefer featured_to (jour du férié) so the window can open earlier.
    const dayName = weekdayFrFromIso(
      first.featured_to || first.featured_from || today,
    )
    return dayName ? `Pour le férié de ${dayName}` : 'Pour le férié'
  }
  if (first.duration_kind === 'weekend') return 'Ce week-end'
  return 'À la une'
}

export function weekdayFrFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return WEEKDAY_FR[d.getDay()] || null
}

/** « Mercredi 11 novembre » for a dated (featured) parcours. */
export function itineraryDatedLabelFr(
  it: Pick<Itinerary, 'featured_from' | 'featured_to' | 'occasions'>,
): string | null {
  const occasions = it.occasions || []
  const iso = occasions.includes('ferie')
    ? it.featured_to || it.featured_from
    : it.featured_from
  if (!iso) return null
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const weekday = WEEKDAY_FR[d.getDay()]
  const day = d.getDate()
  const months = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ]
  const month = months[d.getMonth()]
  const wd = weekday ? weekday.charAt(0).toUpperCase() + weekday.slice(1) : ''
  return `${wd} ${day} ${month}`.trim()
}

/** Primary occasion badge for detail hero (e.g. FÉRIÉ). */
export function itineraryOccasionPhaseLabel(
  it: Pick<Itinerary, 'occasions'>,
): string {
  const first = (it.occasions || [])[0]
  if (!first) return 'Parcours'
  return (
    ITINERARY_OCCASION_LABELS[first as ItineraryOccasion] || String(first)
  )
}

/** Compose catalogue rows §6.2 — empty rows omitted; featured excluded from later rows. */
export function buildParcoursFeed(
  itineraries: Itinerary[],
  opts: {
    citySlug: string
    occasionFilter?: ItineraryOccasion | null
    today?: string
  },
): ParcoursFeedRow[] {
  const city = (opts.citySlug || 'paris').trim().toLowerCase()
  const filter = opts.occasionFilter || null
  const today = opts.today || todayIso()
  // Filtre chip = tag principal uniquement (évite « Amis » dans « De saison »)
  const pool = filter
    ? itineraries.filter((it) => matchesPrimaryOccasion(it, filter))
    : itineraries

  if (filter) {
    return [
      {
        id: `occasion_${filter}`,
        kind: 'occasion',
        occasion: filter,
        title: ITINERARY_OCCASION_LABELS[filter] || filter,
        items: sortNearFirst(pool, city),
      },
    ]
  }

  const rows: ParcoursFeedRow[] = []
  const featured = pool.filter((it) => isFeaturedToday(it, today))
  const featuredIds = new Set(featured.map((it) => it.id))
  const rest = pool.filter((it) => !featuredIds.has(it.id))

  if (featured.length) {
    rows.push({
      id: 'featured',
      kind: 'featured',
      title: featuredRowTitle(featured, today),
      items: featured,
    })
  }

  const near = rest.filter((it) => (it.city_slug || '').toLowerCase() === city)
  if (near.length) {
    rows.push({
      id: 'near',
      kind: 'near',
      title: 'Près de toi',
      items: near,
    })
  }

  const chips = ITINERARY_OCCASIONS.map((occasion) => {
    const count = itineraries.filter((it) =>
      matchesPrimaryOccasion(it, occasion),
    ).length
    return {
      occasion,
      label: ITINERARY_OCCASION_LABELS[occasion],
      count,
    }
  }).filter((c) => c.count > 0)

  if (chips.length) {
    rows.push({
      id: 'envies',
      kind: 'envies',
      title: 'Envies',
      chips,
    })
  }

  const elsewhere = rest.filter(
    (it) => (it.city_slug || '').toLowerCase() !== city,
  )
  if (elsewhere.length) {
    rows.push({
      id: 'weekend',
      kind: 'weekend',
      title: 'Partir ce week-end',
      items: elsewhere,
    })
  }

  for (const occasion of ITINERARY_OCCASIONS) {
    const items = sortNearFirst(
      rest.filter((it) => matchesPrimaryOccasion(it, occasion)),
      city,
    )
    if (!items.length) continue
    rows.push({
      id: `occasion_${occasion}`,
      kind: 'occasion',
      occasion,
      title: ITINERARY_OCCASION_LABELS[occasion],
      items,
    })
  }

  return rows
}

function sortNearFirst(items: Itinerary[], city: string): Itinerary[] {
  return [...items].sort((a, b) => {
    const aNear = (a.city_slug || '').toLowerCase() === city ? 0 : 1
    const bNear = (b.city_slug || '').toLowerCase() === city ? 0 : 1
    if (aNear !== bNear) return aNear - bNear
    return (b.sort_weight || 0) - (a.sort_weight || 0)
  })
}
