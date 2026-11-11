/**
 * Trip-items (activités) — memory + disk + singleflight so TripDetail parent
 * and ActivityStepPanel share one HTTP and paint instantly on reopen.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getApi } from './client'

type Owner = {
  draft_token?: string
  planned_trip_id?: string
}

type ListResult = { items: Record<string, unknown>[] }

const TTL_MS = 60_000
const DISK_PREFIX = 'fw_trip_items_v1_'

const cache = new Map<string, { at: number; data: ListResult }>()
const inflight = new Map<string, Promise<ListResult>>()

function ownerKey(owner: Owner): string {
  return `${owner.planned_trip_id || ''}|${owner.draft_token || ''}`
}

function diskKey(owner: Owner): string | null {
  const key = ownerKey(owner)
  if (!key || key === '|') return null
  return `${DISK_PREFIX}${key}`
}

function writeDisk(owner: Owner, data: ListResult) {
  const dk = diskKey(owner)
  if (!dk) return
  void AsyncStorage.setItem(dk, JSON.stringify(data)).catch(() => undefined)
}

export function peekTripItems(owner: Owner): ListResult | null {
  const key = ownerKey(owner)
  if (!key || key === '|') return null
  return cache.get(key)?.data ?? null
}

/** Load disk into memory (sync paint after await). */
export async function hydrateTripItems(owner: Owner): Promise<ListResult | null> {
  const key = ownerKey(owner)
  if (!key || key === '|') return null
  const mem = cache.get(key)?.data
  if (mem?.items?.length) return mem
  const dk = diskKey(owner)
  if (!dk) return null
  try {
    const raw = await AsyncStorage.getItem(dk)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ListResult
    if (!parsed || !Array.isArray(parsed.items)) return null
    cache.set(key, { at: Date.now(), data: parsed })
    return parsed
  } catch {
    return null
  }
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
  if (!force && !hit) {
    const disk = await hydrateTripItems(owner)
    if (disk?.items?.length) {
      // Soft-stale OK for instant paint; still refresh in background via caller.
      const pendingEarly = inflight.get(key)
      if (!pendingEarly) {
        const bg = getApi()
          .listTripItems({
            draft_token: owner.draft_token || undefined,
            planned_trip_id: owner.planned_trip_id || undefined,
          })
          .then((res) => {
            const data: ListResult = {
              items: (res?.items || []) as Record<string, unknown>[],
            }
            cache.set(key, { at: Date.now(), data })
            writeDisk(owner, data)
            return data
          })
          .catch(() => disk)
          .finally(() => {
            inflight.delete(key)
          })
        inflight.set(key, bg)
      }
      return disk
    }
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
      writeDisk(owner, data)
      return data
    })
    .catch(async (err) => {
      if (hit?.data?.items?.length) return hit.data
      const disk = await hydrateTripItems(owner)
      if (disk?.items?.length) return disk
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
  const dk = diskKey(owner)
  if (dk) void AsyncStorage.removeItem(dk).catch(() => undefined)
}

/** Keep enriched thumbs (photos) across soft reloads. */
export function setTripItemsCache(
  owner: Owner,
  items: Record<string, unknown>[],
) {
  const key = ownerKey(owner)
  if (!key || key === '|') return
  const data = { items }
  cache.set(key, { at: Date.now(), data })
  writeDisk(owner, data)
}
