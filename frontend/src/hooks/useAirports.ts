import { useCallback, useEffect, useState } from 'react'
import type { Airport } from '../types'
import { isValidAirportSelection } from '@flightwatcher/shared'
import { getApiClient, normalizeAirports } from '../utils/apiClient'

/** One airports fetch shared across hooks/tabs. */
let airportsCache: Airport[] | null = null
let airportsPromise: Promise<Airport[]> | null = null

async function loadAirportsOnce(): Promise<Airport[]> {
  if (airportsCache) return airportsCache
  if (!airportsPromise) {
    airportsPromise = getApiClient()
      .getAirports()
      .then((raw) => {
        airportsCache = normalizeAirports(raw as Airport[] | { airports: Airport[] })
        return airportsCache
      })
      .catch((err) => {
        airportsPromise = null
        throw err
      })
  }
  return airportsPromise
}

export function useAirports(autoLoad = true) {
  const [airports, setAirports] = useState<Airport[]>(airportsCache || [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
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
