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

export function isFeaturedToday(it: Itinerary, today = todayIso()): boolean {
  if (!it.featured_from || !it.featured_to) return false
  return it.featured_from <= today && today <= it.featured_to
}

export function featuredRowTitle(items: Itinerary[]): string {
  if (!items.length) return 'À la une'
  const first = items[0]
  const occasions = first.occasions || []
  if (occasions.includes('ferie')) return 'Pour le férié'
  if (first.duration_kind === 'weekend') return 'Ce week-end'
  return 'À la une'
}

/** Compose catalogue rows §6.2 — empty rows omitted. */
export function buildParcoursFeed(
  itineraries: Itinerary[],
  opts: { citySlug: string; occasionFilter?: ItineraryOccasion | null },
): ParcoursFeedRow[] {
  const city = (opts.citySlug || 'paris').trim().toLowerCase()
  const filter = opts.occasionFilter || null
  const pool = filter
    ? itineraries.filter((it) => (it.occasions || []).includes(filter))
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
  const featured = pool.filter((it) => isFeaturedToday(it))
  if (featured.length) {
    rows.push({
      id: 'featured',
      kind: 'featured',
      title: featuredRowTitle(featured),
      items: featured,
    })
  }

  const near = pool.filter((it) => (it.city_slug || '').toLowerCase() === city)
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
      (it.occasions || []).includes(occasion),
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

  const elsewhere = pool.filter(
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
      pool.filter((it) => (it.occasions || []).includes(occasion)),
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
