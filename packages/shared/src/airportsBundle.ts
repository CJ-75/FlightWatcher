import type { Airport } from './types'
import { normalizeAirports } from './api/client'
import raw from './data/airports.bundle.json'

/** Full catalog shipped with the app (same source as /api/airports). */
export function bundledAirports(): Airport[] {
  return normalizeAirports(raw as Airport[] | { airports: Airport[] })
}
