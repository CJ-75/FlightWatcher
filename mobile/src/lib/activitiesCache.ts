/** In-memory city activity lists + singleflight (Activities tab / trip panel). */

export type CityActivitiesResult = {
  ok: boolean
  items: Record<string, unknown>[]
  city_slug?: string
  cached?: boolean
  error?: string
}

const memory = new Map<string, CityActivitiesResult>()
const inflight = new Map<string, Promise<CityActivitiesResult>>()

function cacheKey(citySlug: string, adults: number): string {
  return `${String(citySlug || '').trim().toLowerCase()}|${adults}`
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
}

/**
 * Memory hit → resolve sync-fast. Else one shared HTTP for concurrent callers.
 */
export function getCityActivitiesCached(
  citySlug: string,
  adults: number,
  fetch: () => Promise<CityActivitiesResult>,
): Promise<CityActivitiesResult> {
  const key = cacheKey(citySlug, adults)
  const mem = memory.get(key)
  if (mem?.ok && Array.isArray(mem.items)) return Promise.resolve(mem)

  const pending = inflight.get(key)
  if (pending) return pending

  const req = fetch()
    .then((res) => {
      if (res?.ok && Array.isArray(res.items)) memory.set(key, res)
      return res
    })
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, req)
  return req
}
