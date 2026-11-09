import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Itinerary } from '@flightwatcher/shared'
import { getApi } from './client'

const CATALOG_KEY = 'fw_parcours_catalog_v1'

let catalogMemory: Itinerary[] | null = null
const detailMemory = new Map<string, Itinerary>()
/** In-flight detail fetches — catalog prefetch + detail screen share one HTTP. */
const detailInflight = new Map<string, Promise<Itinerary>>()
/** Liked parcours ids for the current session (optimistic heart). */
let likedParcoursIds: Set<string> | null = null
let likedParcoursIdsInflight: Promise<Set<string>> | null = null
const catalogReadyListeners = new Set<() => void>()

function hasSteps(it: Itinerary | null | undefined): boolean {
  return Array.isArray(it?.itinerary_items) && (it!.itinerary_items?.length ?? 0) > 0
}

function notifyParcoursCatalogReady() {
  if (!catalogMemory?.length) return
  for (const fn of catalogReadyListeners) {
    try {
      fn()
    } catch {
      /* listener best-effort */
    }
  }
}

/** Fires now if catalogue already loaded, then on each non-empty set/hydrate. */
export function subscribeParcoursCatalogReady(fn: () => void): () => void {
  catalogReadyListeners.add(fn)
  if (catalogMemory?.length) {
    queueMicrotask(fn)
  }
  return () => {
    catalogReadyListeners.delete(fn)
  }
}

export function getParcoursCatalogMemory(): Itinerary[] | null {
  return catalogMemory
}

/** Seed detail Map from catalogue rows that already embed steps. */
export function hydrateDetailsFromCatalog(items: Itinerary[]) {
  for (const it of items) {
    if (hasSteps(it)) setParcoursDetailMemory(it)
  }
}

export function setParcoursCatalogMemory(items: Itinerary[]) {
  catalogMemory = items
  hydrateDetailsFromCatalog(items)
  void AsyncStorage.setItem(CATALOG_KEY, JSON.stringify(items)).catch(() => {})
  notifyParcoursCatalogReady()
}

export async function hydrateParcoursCatalogMemory(): Promise<Itinerary[] | null> {
  if (catalogMemory) return catalogMemory
  try {
    const raw = await AsyncStorage.getItem(CATALOG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Itinerary[]
    if (!Array.isArray(parsed)) return null
    catalogMemory = parsed
    hydrateDetailsFromCatalog(parsed)
    notifyParcoursCatalogReady()
    return parsed
  } catch {
    return null
  }
}

function detailKeys(it: Itinerary): string[] {
  const keys = [it.id]
  if (it.slug) keys.push(it.slug)
  return keys.filter(Boolean) as string[]
}

export function getParcoursDetailMemory(idOrSlug: string): Itinerary | null {
  return detailMemory.get(idOrSlug) || null
}

export function setParcoursDetailMemory(it: Itinerary) {
  for (const k of detailKeys(it)) detailMemory.set(k, it)
}

export function rememberParcoursPreview(it: Partial<Itinerary> & { id: string }) {
  // Catalogue rows may already embed steps — keep them for instant detail.
  if (hasSteps(it as Itinerary)) {
    setParcoursDetailMemory(it as Itinerary)
    return
  }
  const existing = detailMemory.get(it.id) || (it.slug ? detailMemory.get(it.slug) : null)
  if (existing?.itinerary_items?.length) return
  // Never persist an empty steps array from a chrome-only preview.
  const { itinerary_items: _drop, ...rest } = it as Partial<Itinerary> & {
    id: string
    itinerary_items?: unknown
  }
  const row = { ...existing, ...rest } as Itinerary
  if (!row.itinerary_items?.length) {
    delete row.itinerary_items
  }
  setParcoursDetailMemory(row)
}

/**
 * Memory + singleflight getParcours — catalog open and detail screen share one request.
 */
export function getParcoursCached(idOrSlug: string): Promise<Itinerary> {
  const key = String(idOrSlug || '').trim()
  if (!key) return Promise.reject(new Error('missing_id'))

  const mem = getParcoursDetailMemory(key)
  if (hasSteps(mem)) return Promise.resolve(mem!)

  const pending = detailInflight.get(key)
  if (pending) return pending

  const req = getApi()
    .getParcours(key)
    .then((r) => {
      if (!r.ok || !r.itinerary) throw new Error('not_found')
      const row = r.itinerary as unknown as Itinerary
      if (hasSteps(row)) setParcoursDetailMemory(row)
      return row
    })
    .finally(() => {
      detailInflight.delete(key)
    })

  detailInflight.set(key, req)
  // Same promise under id+slug once resolved is handled via detailMemory keys.
  return req
}

/** null = unknown (not loaded yet). */
export function peekLikedParcoursId(itineraryId: string): boolean | null {
  if (!likedParcoursIds) return null
  return likedParcoursIds.has(itineraryId)
}

export function setLikedParcoursIdLocal(itineraryId: string, liked: boolean) {
  if (!likedParcoursIds) likedParcoursIds = new Set()
  if (liked) likedParcoursIds.add(itineraryId)
  else likedParcoursIds.delete(itineraryId)
}

export function clearLikedParcoursIdsLocal() {
  likedParcoursIds = null
  likedParcoursIdsInflight = null
}

export async function ensureLikedParcoursIds(
  fetchIds: () => Promise<string[]>,
): Promise<Set<string>> {
  if (likedParcoursIds) return likedParcoursIds
  if (likedParcoursIdsInflight) return likedParcoursIdsInflight
  likedParcoursIdsInflight = fetchIds()
    .then((ids) => {
      likedParcoursIds = new Set(ids.filter(Boolean))
      return likedParcoursIds
    })
    .finally(() => {
      likedParcoursIdsInflight = null
    })
  return likedParcoursIdsInflight
}

/** Warm detail cache for visible/featured catalogue cards (staggered). */
export function prefetchParcoursDetails(
  idOrSlugs: Array<string | null | undefined>,
  opts?: { limit?: number },
): void {
  const lim = Math.max(1, Math.min(opts?.limit ?? 10, 20))
  const seen = new Set<string>()
  const keys: string[] = []
  for (const raw of idOrSlugs) {
    const key = String(raw || '').trim()
    if (!key || seen.has(key)) continue
    if (hasSteps(getParcoursDetailMemory(key))) continue
    seen.add(key)
    keys.push(key)
    if (keys.length >= lim) break
  }
  keys.forEach((key, i) => {
    setTimeout(() => {
      void getParcoursCached(key).catch(() => {})
    }, i * 80)
  })
}
