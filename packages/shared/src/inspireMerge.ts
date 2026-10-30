import type { EnrichedTripResponse } from './types'

function tripScheduleKey(t: EnrichedTripResponse): string {
  const origin = (t.aller?.origin || '').toUpperCase()
  const dest = (t.destination_code || t.aller?.destination || '').toUpperCase()
  const out = (t.aller?.departureTime || '').slice(0, 16)
  const back = (t.retour?.departureTime || '').slice(0, 16)
  return `${origin}|${dest}|${out}|${back}`
}

function providerRank(p?: string | null): number {
  const x = (p || '').toLowerCase()
  if (x === 'ryanair') return 0
  if (x === 'travelpayouts' || x === 'aviasales') return 2
  return 1
}

/** Merge stream batches — prefer Ryanair on same créneau, else cheaper. */
export function mergeStreamTrips(
  prev: EnrichedTripResponse[],
  next: EnrichedTripResponse[],
): EnrichedTripResponse[] {
  const map = new Map<string, EnrichedTripResponse>()
  for (const t of prev) map.set(tripScheduleKey(t), t)
  for (const t of next) {
    const k = tripScheduleKey(t)
    const cur = map.get(k)
    if (!cur) {
      map.set(k, t)
      continue
    }
    const ra = providerRank(cur.provider)
    const rb = providerRank(t.provider)
    if (rb < ra || (rb === ra && Number(t.prix_total) < Number(cur.prix_total))) {
      map.set(k, t)
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => Number(a.prix_total) - Number(b.prix_total),
  )
}
