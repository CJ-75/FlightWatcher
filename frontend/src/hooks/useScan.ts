import { useCallback, useState } from 'react'
import type { ScanRequest, ScanResponse } from '../types'
import { getApiClient } from '../utils/apiClient'

export function useScan() {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ScanResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const scan = useCallback(async (req: ScanRequest): Promise<ScanResponse | null> => {
    setLoading(true)
    setError(null)
    try {
      const result = await getApiClient().scan(req)
      setData(result)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Une erreur est survenue'
      setError(message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => {
    setData(null)
    setError(null)
  }, [])

  return { loading, data, error, scan, setData, setError, clear }
}
