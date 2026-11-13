import { useCallback, useEffect, useRef, useState } from 'react'
import { adminCacheKey, adminSwr, peekAdminCache } from '../lib/adminCache'

type Opts<T> = {
  key: Array<string | number | boolean | null | undefined>
  fetcher: () => Promise<T>
  ttlMs?: number
  staleMs?: number
  enabled?: boolean
}

/**
 * SWR-style hook: paint from cache instantly, refresh in background.
 */
export function useAdminQuery<T>(opts: Opts<T>) {
  const key = adminCacheKey(opts.key)
  const enabled = opts.enabled !== false
  const [data, setData] = useState<T | null>(() =>
    enabled ? peekAdminCache<T>(key) : null,
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(() => enabled && !peekAdminCache(key))
  const [stale, setStale] = useState(false)
  const [fromCache, setFromCache] = useState(() => Boolean(peekAdminCache(key)))
  const fetcherRef = useRef(opts.fetcher)
  fetcherRef.current = opts.fetcher

  const load = useCallback(
    async (force = false) => {
      if (!enabled) return
      const cached = peekAdminCache<T>(key)
      if (!cached) setLoading(true)
      setError(null)
      try {
        const res = await adminSwr({
          key,
          fetcher: () => fetcherRef.current(),
          ttlMs: opts.ttlMs,
          staleMs: opts.staleMs,
          force,
        })
        setData(res.data)
        setFromCache(res.fromCache)
        setStale(res.stale)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur chargement')
      } finally {
        setLoading(false)
      }
    },
    [enabled, key, opts.ttlMs, opts.staleMs],
  )

  useEffect(() => {
    if (!enabled) return
    void load(false)
  }, [enabled, key, load])

  return {
    data,
    error,
    loading,
    stale,
    fromCache,
    refresh: () => load(true),
  }
}
