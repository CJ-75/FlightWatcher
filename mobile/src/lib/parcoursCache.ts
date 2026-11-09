import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Itinerary } from '@flightwatcher/shared'

const CATALOG_KEY = 'fw_parcours_catalog_v1'

let catalogMemory: Itinerary[] | null = null
const detailMemory = new Map<string, Itinerary>()

export function getParcoursCatalogMemory(): Itinerary[] | null {
  return catalogMemory
}

export function setParcoursCatalogMemory(items: Itinerary[]) {
  catalogMemory = items
  void AsyncStorage.setItem(CATALOG_KEY, JSON.stringify(items)).catch(() => {})
}

export async function hydrateParcoursCatalogMemory(): Promise<Itinerary[] | null> {
  if (catalogMemory) return catalogMemory
  try {
    const raw = await AsyncStorage.getItem(CATALOG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Itinerary[]
    if (!Array.isArray(parsed)) return null
    catalogMemory = parsed
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
