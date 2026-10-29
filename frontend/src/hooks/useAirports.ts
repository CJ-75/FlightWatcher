import { useCallback, useEffect, useState } from 'react'
import type { Airport } from '../types'
import { isValidAirportSelection } from '@flightwatcher/shared'
import { getApiClient, normalizeAirports } from '../utils/apiClient'

const LS_KEY = 'fw_airports_v1'
const LS_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** One airports fetch shared across hooks/tabs. */
let airportsCache: Airport[] | null = null
let airportsPromise: Promise<Airport[]> | null = null
let fromLocalStorage = false
let quietRefreshStarted = false

function readLocalAirports(): Airport[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: number; airports?: Airport[] }
    if (!Array.isArray(parsed.airports) || parsed.airports.length === 0) return null
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > LS_TTL_MS) return null
    return parsed.airports
  } catch {
    return null
  }
}

function writeLocalAirports(list: Airport[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ at: Date.now(), airports: list }))
  } catch {
    /* quota / private mode */
  }
}

// Hydrate memory from localStorage synchronously — first paint can be instant
if (!airportsCache) {
  const fromLs = readLocalAirports()
  if (fromLs) {
    airportsCache = fromLs
    fromLocalStorage = true
  }
}

export function peekAirports(): Airport[] {
  return airportsCache || []
}

function fetchAirportsNetwork(): Promise<Airport[]> {
  return getApiClient()
    .getAirports()
    .then((raw) => {
      airportsCache = normalizeAirports(raw as Airport[] | { airports: Airport[] })
      fromLocalStorage = false
      writeLocalAirports(airportsCache)
      return airportsCache
    })
}

function refreshAirportsQuiet() {
  if (quietRefreshStarted || !fromLocalStorage) return
  quietRefreshStarted = true
  fetchAirportsNetwork()
    .catch(() => {
      /* keep stale */
    })
    .finally(() => {
      quietRefreshStarted = false
    })
}

export async function loadAirportsOnce(opts?: {
  force?: boolean
}): Promise<Airport[]> {
  const force = Boolean(opts?.force)
  if (force) {
    airportsCache = null
    fromLocalStorage = false
    airportsPromise = null
  }
  if (airportsCache && airportsCache.length > 0) {
    refreshAirportsQuiet()
    return airportsCache
  }
  if (!airportsPromise) {
    airportsPromise = fetchAirportsNetwork()
      .catch((err) => {
        throw err
      })
      .finally(() => {
        airportsPromise = null
      })
  }
  return airportsPromise
}

/** Fire-and-forget at app boot so CityAirportSelect opens warm. */
export function prefetchAirports(): void {
  void loadAirportsOnce().catch(() => {})
}

export function useAirports(autoLoad = true) {
  const [airports, setAirports] = useState<Airport[]>(airportsCache || [])
  const [loading, setLoading] = useState(!(airportsCache && airportsCache.length > 0))
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (airportsCache?.length) {
      setAirports(airportsCache)
      setLoading(false)
    } else {
      setLoading(true)
    }
    setError(null)
    try {
      const list = await loadAirportsOnce()
      setAirports(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur aéroports')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (autoLoad) void load()
  }, [autoLoad, load])

  const isValidAirportCode = useCallback(
    (code: string): boolean => isValidAirportSelection(code, airports),
    [airports],
  )

  return { airports, loading, error, load, isValidAirportCode, setAirports }
}
