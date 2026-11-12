/**
 * Admin data fetch — real API only (mocks / test mode removed).
 */
import { useState, useEffect } from 'react'
import { getAccessToken } from '../../lib/supabase'
import { resolveApiUrl } from '../../utils/apiBase'

interface UseAdminDataOptions {
  endpoint: string
  params?: Record<string, any>
  autoFetch?: boolean
}

export function useAdminData<T = any>(options: UseAdminDataOptions) {
  const { endpoint, params = {}, autoFetch = true } = options
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(autoFetch)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)

      const token = await getAccessToken()
      if (!token) {
        throw new Error("Token d'accès non disponible")
      }

      const url = resolveApiUrl(endpoint, params)
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error(`Erreur ${response.status}: ${response.statusText}`)
      }

      setData(await response.json())
    } catch (err: any) {
      setError(err.message)
      console.error('Erreur récupération données admin:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (autoFetch) {
      void fetchData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, JSON.stringify(params), autoFetch])

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  }
}
