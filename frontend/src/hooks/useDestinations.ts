import { useCallback, useState } from 'react'
import type { Destination } from '../types'
import { getApiClient } from '../utils/apiClient'

export function useDestinations() {
  const [destinations, setDestinations] = useState<Record<string, Destination[]>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (airportCode: string) => {
    if (!airportCode) {
      setError('Veuillez sélectionner un aéroport de départ')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await getApiClient().getDestinations(airportCode)
      // Backend returns { destinations: Record<country, Destination[]> }
      let map: Record<string, Destination[]> = {}
      if (data && typeof data === 'object' && !Array.isArray(data) && 'destinations' in data) {
        const dest = (data as { destinations: unknown }).destinations
        if (dest && typeof dest === 'object' && !Array.isArray(dest)) {
          map = dest as Record<string, Destination[]>
        }
      }
      setDestinations(map || {})
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
