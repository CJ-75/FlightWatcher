import { useCallback, useEffect, useState } from 'react'
import type { Airport } from '../types'
import { getApiClient, normalizeAirports } from '../utils/apiClient'

export function useAirports(autoLoad = true) {
  const [airports, setAirports] = useState<Airport[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const raw = await getApiClient().getAirports()
      setAirports(normalizeAirports(raw as Airport[] | { airports: Airport[] }))
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
    (code: string): boolean => {
      if (!airports.length || !code?.trim()) return false
      const codeUpper = code.trim().toUpperCase()
      return /^[A-Z]{3}$/.test(codeUpper) && airports.some((a) => a.code === codeUpper)
    },
    [airports]
  )

  return { airports, loading, error, load, isValidAirportCode, setAirports }
}
