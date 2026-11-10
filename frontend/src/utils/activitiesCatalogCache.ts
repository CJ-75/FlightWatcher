/**
 * Catalogue activités — fetch public (sans attendre le JWT) + mémoire + L2 durable.
 */
import { getApiBaseUrl } from './apiBase'
import { readDurableJson, writeDurableJson } from './durableStore'

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
const DISK_TTL_MS = 24 * 60 * 60 * 1000
const inflight = new Map<string, Promise<ActivitiesCatalogPayload>>()

function cacheKey(slug: string, adults: number) {
  return `${slug.trim().toLowerCase()}:${adults}`
}

function diskKey(slug: string, adults: number) {
  return `fw_activities_catalog_v1_${cacheKey(slug, adults)}`
}

function peekDisk(slug: string, adults: number): ActivitiesCatalogPayload | null {
  const packed = readDurableJson<{ at: number; data: ActivitiesCatalogPayload }>(
    diskKey(slug, adults),
  )
  if (!packed?.data?.ok) return null
  if (Date.now() - (packed.at || 0) > DISK_TTL_MS) return null
  return packed.data
}

export function peekActivitiesCatalog(
  slug: string,
  adults = 2,
): ActivitiesCatalogPayload | null {
  const key = cacheKey(slug, adults)
  const hit = mem.get(key)
  if (hit && Date.now() - hit.at <= TTL_MS) return hit.data
  const disk = peekDisk(slug, adults)
  if (disk) {
    mem.set(key, { at: Date.now(), data: disk })
    return disk
  }
  return null
}

export async function fetchActivitiesCatalog(
  slug: string,
  adults = 2,
): Promise<ActivitiesCatalogPayload> {
  const normalized = slug.trim().toLowerCase() || 'paris'
  const key = cacheKey(normalized, adults)
  // Skip network only on fresh memory — disk is for instant paint, not forever-fresh.
  const memHit = mem.get(key)
  if (memHit && Date.now() - memHit.at <= TTL_MS) return memHit.data

  const pending = inflight.get(key)
  if (pending) return pending

  const req = (async () => {
    const base = getApiBaseUrl()
    const url = `${base}/api/activities/cities/${encodeURIComponent(normalized)}?adults=${adults}`
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer =
      ctrl && typeof window !== 'undefined'
        ? window.setTimeout(() => ctrl.abort(), 25_000)
        : null
    try {
      const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
      const data = (await res.json().catch(() => null)) as ActivitiesCatalogPayload | null
      if (!res.ok || !data) {
        return {
          ok: false,
          items: [],
          error: data?.error || res.statusText || 'Chargement impossible',
        }
      }
      if (data.ok) {
        mem.set(key, { at: Date.now(), data })
        writeDurableJson(diskKey(normalized, adults), {
          at: Date.now(),
          data,
        })
      }
      return data
    } catch (e) {
      const aborted =
        (e instanceof DOMException && e.name === 'AbortError') ||
        (e instanceof Error && /abort/i.test(e.message))
      return {
        ok: false,
        items: [],
        error: aborted
          ? 'Délai dépassé — réessaie'
          : e instanceof Error
            ? e.message
            : 'Erreur',
      }
    } finally {
      if (timer != null) window.clearTimeout(timer)
      inflight.delete(key)
    }
  })()

  inflight.set(key, req)
  return req
}

export function prefetchActivitiesCatalog(slug = 'paris', adults = 2) {
  void fetchActivitiesCatalog(slug, adults)
}
