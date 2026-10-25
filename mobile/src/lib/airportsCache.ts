import type { Airport } from '@flightwatcher/shared'
import { normalizeAirports } from '@flightwatcher/shared'
import { getApi } from './client'

let cached: Airport[] | null = null
let inflight: Promise<Airport[]> | null = null

/** Shared in-memory airports — one network hop for Search / Deals / Planner. */
export function getCachedAirports(): Promise<Airport[]> {
  if (cached && cached.length > 0) return Promise.resolve(cached)
  if (inflight) return inflight
  const t0 = Date.now()
  inflight = getApi()
    .getAirports()
    .then((raw) => {
      const list = normalizeAirports(raw as Airport[] | { airports: Airport[] })
      cached = list
      if (__DEV__) console.log('[airports] loaded', list.length, 'in', Date.now() - t0, 'ms')
      return list
    })
    .catch((err) => {
      cached = null
      if (__DEV__) console.warn('[airports] failed', err)
      throw err
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function peekCachedAirports(): Airport[] {
  return cached || []
}
