/**
 * Catalogue activités — même idée que le web (8831a49) :
 * cache mémoire + disque + singleflight, sans attendre le JWT/planner.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

export type CityActivitiesResult = {
  ok: boolean
  items: Record<string, unknown>[]
  city_slug?: string
  cached?: boolean
  error?: string
}

const LAST_CITY_KEY = 'fw_act_last_city_v1'
const DISK_PREFIX = 'fw_act_city_v1_'

const memory = new Map<string, CityActivitiesResult>()
const inflight = new Map<string, Promise<CityActivitiesResult>>()
let lastCitySlug: string | null = null
let lastCityHydrate: Promise<string | null> | null = null

function cacheKey(citySlug: string, adults: number): string {
  return `${String(citySlug || '').trim().toLowerCase()}|${adults}`
}

function diskKey(citySlug: string, adults: number): string {
  return `${DISK_PREFIX}${cacheKey(citySlug, adults)}`
}

/** Sync — set after hydrate or a successful fetch. */
export function peekLastCitySlug(): string | null {
  return lastCitySlug
}

export function setLastCitySlug(slug: string) {
  const s = String(slug || '').trim().toLowerCase()
  if (!s) return
  lastCitySlug = s
  void AsyncStorage.setItem(LAST_CITY_KEY, s).catch(() => {})
}

export async function hydrateLastCitySlug(): Promise<string | null> {
  if (lastCitySlug) return lastCitySlug
  if (!lastCityHydrate) {
    lastCityHydrate = AsyncStorage.getItem(LAST_CITY_KEY)
      .then((raw) => {
        const s = String(raw || '').trim().toLowerCase()
        if (s) lastCitySlug = s
        return lastCitySlug
      })
      .catch(() => null)
      .finally(() => {
        lastCityHydrate = null
      })
  }
  return lastCityHydrate
}

export function peekCityActivities(
  citySlug: string,
  adults = 2,
): CityActivitiesResult | null {
  return memory.get(cacheKey(citySlug, adults)) || null
}

export function setCityActivitiesMemory(
  citySlug: string,
  adults: number,
  result: CityActivitiesResult,
) {
  if (!result?.ok || !Array.isArray(result.items)) return
  memory.set(cacheKey(citySlug, adults), result)
  setLastCitySlug(citySlug)
  void AsyncStorage.setItem(
    diskKey(citySlug, adults),
    JSON.stringify(result),
  ).catch(() => {})
}

/** Instant paint from disk when memory is cold (app restart). */
export async function hydrateCityActivities(
  citySlug: string,
  adults = 2,
): Promise<CityActivitiesResult | null> {
  const key = cacheKey(citySlug, adults)
  const mem = memory.get(key)
  if (mem?.ok) return mem
  try {
    const raw = await AsyncStorage.getItem(diskKey(citySlug, adults))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CityActivitiesResult
    if (!parsed?.ok || !Array.isArray(parsed.items)) return null
    memory.set(key, parsed)
    return parsed
  } catch {
    return null
  }
}

/**
 * Memory hit → sync-fast. Else one shared HTTP for concurrent callers.
 * Default fetch is public (no JWT) — pass `fetchFn` only to override.
 */
export function getCityActivitiesCached(
  citySlug: string,
  adults: number,
  fetchFn?: () => Promise<CityActivitiesResult>,
): Promise<CityActivitiesResult> {
  const key = cacheKey(citySlug, adults)
  const mem = memory.get(key)
  if (mem?.ok && Array.isArray(mem.items)) return Promise.resolve(mem)

  const pending = inflight.get(key)
  if (pending) return pending

  const run =
    fetchFn ||
    (() =>
      import('./activitiesCatalogFetch').then((m) =>
        m.fetchCityActivitiesPublic(citySlug, adults),
      ))

  const req = run()
    .then((res) => {
      if (res?.ok && Array.isArray(res.items)) {
        setCityActivitiesMemory(citySlug, adults, res)
      }
      return res
    })
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, req)
  return req
}
