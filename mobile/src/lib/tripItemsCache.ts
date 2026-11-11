/**
 * Trip-items (activités) — memory + singleflight so TripDetail parent
 * and ActivityStepPanel share one HTTP and paint instantly on revisit.
 */
import { getApi } from './client'

type Owner = {
  draft_token?: string
  planned_trip_id?: string
}

type ListResult = { items: Record<string, unknown>[] }

const TTL_MS = 60_000

const cache = new Map<string, { at: number; data: ListResult }>()
const inflight = new Map<string, Promise<ListResult>>()

function ownerKey(owner: Owner): string {
  return `${owner.planned_trip_id || ''}|${owner.draft_token || ''}`
}

export function peekTripItems(owner: Owner): ListResult | null {
  const key = ownerKey(owner)
  if (!key || key === '|') return null
  return cache.get(key)?.data ?? null
}

export async function listTripItemsCached(
  owner: Owner,
  opts?: { force?: boolean },
): Promise<ListResult> {
  const key = ownerKey(owner)
  if (!key || key === '|') return { items: [] }
  const force = Boolean(opts?.force)
  const hit = cache.get(key)
  if (!force && hit && Date.now() - hit.at < TTL_MS) {
    return hit.data
  }
  const pending = inflight.get(key)
  if (!force && pending) return pending

  const promise = getApi()
    .listTripItems({
      draft_token: owner.draft_token || undefined,
      planned_trip_id: owner.planned_trip_id || undefined,
    })
    .then((res) => {
      const data: ListResult = {
        items: (res?.items || []) as Record<string, unknown>[],
      }
      cache.set(key, { at: Date.now(), data })
      return data
    })
    .catch(async (err) => {
      if (hit?.data?.items?.length) return hit.data
      throw err
    })
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, promise)
  return promise
}

export function invalidateTripItemsCache(owner?: Owner) {
  if (!owner) {
    cache.clear()
    inflight.clear()
    return
  }
  const key = ownerKey(owner)
  cache.delete(key)
  inflight.delete(key)
}

/** Keep enriched thumbs (photos) across soft reloads. */
export function setTripItemsCache(
  owner: Owner,
  items: Record<string, unknown>[],
) {
  const key = ownerKey(owner)
  if (!key || key === '|') return
  cache.set(key, { at: Date.now(), data: { items } })
}
