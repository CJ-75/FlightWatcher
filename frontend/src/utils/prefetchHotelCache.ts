/**
 * After flight results paint — warm hotel_rates_cache in background.
 * Lookup only (no LiteAPI fetch): never competes with /inspire latency.
 */
import type { EnrichedTripResponse } from '../types'
import { getApiClient } from './apiClient'

function dateFromIso(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

export function prefetchHotelCacheForTrips(
  trips: EnrichedTripResponse[],
  passengers = 1,
): void {
  if (!trips?.length) return
  try {
    const seen = new Set<string>()
    const items: {
      iata: string
      checkin: string
      checkout: string
      participants: number
      flight_pp: number
    }[] = []

    for (const t of trips) {
      if (items.length >= 6) break
      const iata = (t.destination_code || '').trim().toUpperCase()
      const checkin = dateFromIso(t.aller?.departureTime)
      const checkout = dateFromIso(t.retour?.departureTime)
      if (!iata || !checkin || !checkout || checkout <= checkin) continue
      const key = `${iata}|${checkin}|${checkout}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push({
        iata,
        checkin,
        checkout,
        participants: Math.max(1, passengers),
        flight_pp: Number(t.prix_total) || 0,
      })
    }
    if (!items.length) return
    void getApiClient().lookupHotelUpsell(items).catch(() => undefined)
  } catch {
    /* never block Search */
  }
}
