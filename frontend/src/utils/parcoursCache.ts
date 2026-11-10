/**
 * Parcours catalogue + detail — memory + durable L2 + singleflight (parity mobile).
 */
import type { Itinerary } from '@flightwatcher/shared'
import { getApiClient } from './apiClient'
import {
  migrateSessionToDurable,
  readDurableJson,
  writeDurableJson,
} from './durableStore'

const CATALOG_KEY = 'fw_parcours_catalog_v1'

let catalogMemory: Itinerary[] | null = null
const detailMemory = new Map<string, Itinerary>()
const detailInflight = new Map<string, Promise<Itinerary>>()

function hasSteps(it: Itinerary | null | undefined): boolean {
  return Array.isArray(it?.itinerary_items) && (it!.itinerary_items?.length ?? 0) > 0
}

function detailKeys(it: Itinerary): string[] {
  const keys = [it.id]
  if (it.slug) keys.push(it.slug)
  return keys.filter(Boolean) as string[]
}

export function hydrateDetailsFromCatalog(items: Itinerary[]) {
  for (const it of items) {
    if (hasSteps(it)) setParcoursDetailMemory(it)
  }
}

export function getParcoursCatalogMemory(): Itinerary[] | null {
  return catalogMemory
}

export function setParcoursCatalogMemory(items: Itinerary[]) {
  catalogMemory = items
  hydrateDetailsFromCatalog(items)
  writeDurableJson(CATALOG_KEY, items)
}

export function hydrateParcoursCatalogMemory(): Itinerary[] | null {
  if (catalogMemory) return catalogMemory
  const migrated = migrateSessionToDurable<Itinerary[]>(CATALOG_KEY)
  const parsed =
    migrated ||
    readDurableJson<Itinerary[]>(CATALOG_KEY)
  if (!Array.isArray(parsed) || !parsed.length) return null
  catalogMemory = parsed
  hydrateDetailsFromCatalog(parsed)
  return parsed
}

export function getParcoursDetailMemory(idOrSlug: string): Itinerary | null {
  return detailMemory.get(idOrSlug) || null
}

export function setParcoursDetailMemory(it: Itinerary) {
  for (const k of detailKeys(it)) detailMemory.set(k, it)
}

export function getParcoursCached(idOrSlug: string): Promise<Itinerary> {
  const key = String(idOrSlug || '').trim()
  if (!key) return Promise.reject(new Error('missing_id'))

  const mem = getParcoursDetailMemory(key)
  if (hasSteps(mem)) return Promise.resolve(mem!)

  const pending = detailInflight.get(key)
  if (pending) return pending

  const req = getApiClient()
    .getParcours(key)
    .then((res) => {
      const it = res?.itinerary as Itinerary | undefined
      if (!res?.ok || !it?.id) throw new Error('Parcours introuvable')
      setParcoursDetailMemory(it)
      return it
    })
    .finally(() => {
      detailInflight.delete(key)
    })

  detailInflight.set(key, req)
  return req
}

/** Prefetch detail rows from catalogue (cap to avoid stampede). */
export function prefetchParcoursDetails(
  items: Array<Itinerary | null | undefined>,
  opts?: { limit?: number },
) {
  const limit = Math.max(1, Math.min(12, opts?.limit ?? 8))
  let n = 0
  for (const it of items) {
    if (!it?.id) continue
    if (hasSteps(it)) {
      setParcoursDetailMemory(it)
      continue
    }
    if (hasSteps(getParcoursDetailMemory(it.id))) continue
    if (detailInflight.has(it.id)) continue
    void getParcoursCached(it.id).catch(() => undefined)
    n += 1
    if (n >= limit) break
  }
}

// Sync hydrate on module load
hydrateParcoursCatalogMemory()
