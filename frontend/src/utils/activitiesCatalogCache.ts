/**
 * Catalogue activités — fetch public (sans attendre le JWT) + cache mémoire.
 */
import { getApiBaseUrl } from './apiBase'

export type ActivitiesCatalogPayload = {
  ok: boolean
  items: Record<string, unknown>[]
  city_slug?: string
  cached?: boolean
  error?: string
}

type CacheEntry = { at: number; data: ActivitiesCatalogPayload }

const mem = new Map<string, CacheEntry>()
const TTL_MS = 5 * 60 * 1000
const inflight = new Map<string, Promise<ActivitiesCatalogPayload>>()

function cacheKey(slug: string, adults: number) {
  return `${slug.trim().toLowerCase()}:${adults}`
}

export function peekActivitiesCatalog(
  slug: string,
  adults = 2,
): ActivitiesCatalogPayload | null {
  const key = cacheKey(slug, adults)
  const hit = mem.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > TTL_MS) return null
  return hit.data
}

export async function fetchActivitiesCatalog(
  slug: string,
  adults = 2,
): Promise<ActivitiesCatalogPayload> {
  const normalized = slug.trim().toLowerCase() || 'paris'
  const key = cacheKey(normalized, adults)
  const cached = peekActivitiesCatalog(normalized, adults)
  if (cached) return cached

  const pending = inflight.get(key)
  if (pending) return pending

  const req = (async () => {
    const base = getApiBaseUrl()
    const url = `${base}/api/activities/cities/${encodeURIComponent(normalized)}?adults=${adults}`
    try {
      const res = await fetch(url)
      const data = (await res.json().catch(() => null)) as ActivitiesCatalogPayload | null
      if (!res.ok || !data) {
        return {
          ok: false,
          items: [],
          error: data?.error || res.statusText || 'Chargement impossible',
        }
      }
      if (data.ok) mem.set(key, { at: Date.now(), data })
      return data
    } catch (e) {
      return {
        ok: false,
        items: [],
        error: e instanceof Error ? e.message : 'Erreur',
      }
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, req)
  return req
}

export function prefetchActivitiesCatalog(slug = 'paris', adults = 2) {
  void fetchActivitiesCatalog(slug, adults)
}
