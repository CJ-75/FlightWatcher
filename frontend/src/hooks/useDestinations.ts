import { useCallback, useState } from 'react'
import type { Destination } from '../types'
import { parseAirportCodes } from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'

function normalizeDestMap(data: unknown): Record<string, Destination[]> {
  let map: Record<string, Destination[]> = {}
  if (data && typeof data === 'object' && !Array.isArray(data) && 'destinations' in data) {
    const dest = (data as { destinations: unknown }).destinations
    if (dest && typeof dest === 'object' && !Array.isArray(dest)) {
      map = dest as Record<string, Destination[]>
    }
  }
  return map || {}
}

function mergeDestMaps(
  maps: Record<string, Destination[]>[],
): Record<string, Destination[]> {
  const out: Record<string, Destination[]> = {}
  const seenByCountry = new Map<string, Set<string>>()
  for (const map of maps) {
    for (const [country, list] of Object.entries(map)) {
      if (!out[country]) out[country] = []
      if (!seenByCountry.has(country)) seenByCountry.set(country, new Set())
      const seen = seenByCountry.get(country)!
      for (const d of list) {
        if (seen.has(d.code)) continue
        seen.add(d.code)
        out[country].push(d)
      }
    }
  }
  return out
}

export function useDestinations() {
  const [destinations, setDestinations] = useState<Record<string, Destination[]>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (airportCode: string) => {
    const codes = parseAirportCodes(airportCode)
    if (!codes.length) {
      setError('Veuillez sélectionner un aéroport de départ')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const maps = await Promise.all(
        codes.map(async (code) => {
          try {
            const data = await getApiClient().getDestinations(code)
            return normalizeDestMap(data)
          } catch {
            return {} as Record<string, Destination[]>
          }
        }),
      )
      const map = mergeDestMaps(maps)
      setDestinations(map)
      if (!map || Object.keys(map).length === 0) {
        setError('Aucune destination trouvée pour cet aéroport')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur destinations')
    } finally {
      setLoading(false)
    }
  }, [])

  return { destinations, loading, error, load, setDestinations, setError }
}
