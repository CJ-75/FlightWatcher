/**
 * MyTrip draft — memory + disk + singleflight so TripDetail hotel hero
 * can paint without waiting on the workspaces round-trip.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { MyTripDraft } from '@flightwatcher/shared'
import { getApi } from './client'

const TTL_MS = 60_000
const DISK_PREFIX = 'fw_my_trip_v1_'
const memory = new Map<string, { at: number; data: MyTripDraft }>()
const inflight = new Map<string, Promise<MyTripDraft>>()

function keyOf(token: string) {
  return String(token || '').trim()
}

function diskKey(token: string) {
  return `${DISK_PREFIX}${keyOf(token)}`
}

function writeDisk(token: string, draft: MyTripDraft) {
  const key = keyOf(token)
  if (!key) return
  void AsyncStorage.setItem(diskKey(key), JSON.stringify(draft)).catch(
    () => undefined,
  )
}

export function peekMyTrip(draftToken: string): MyTripDraft | null {
  const key = keyOf(draftToken)
  if (!key) return null
  return memory.get(key)?.data ?? null
}

export function setMyTripMemory(draft: MyTripDraft) {
  const key = keyOf(draft?.draft_token || '')
  if (!key) return
  memory.set(key, { at: Date.now(), data: draft })
  writeDisk(key, draft)
}

/** Load disk into memory for instant hotel seed on reopen. */
export async function hydrateMyTrip(
  draftToken: string,
): Promise<MyTripDraft | null> {
  const key = keyOf(draftToken)
  if (!key) return null
  const mem = memory.get(key)?.data
  if (mem) return mem
  try {
    const raw = await AsyncStorage.getItem(diskKey(key))
    if (!raw) return null
    const parsed = JSON.parse(raw) as MyTripDraft
    if (!parsed?.draft_token && !key) return null
    const draft = {
      ...parsed,
      draft_token: parsed.draft_token || key,
    }
    memory.set(key, { at: Date.now(), data: draft })
    return draft
  } catch {
    return null
  }
}

export async function getMyTripCached(
  draftToken: string,
  opts?: { force?: boolean },
): Promise<MyTripDraft> {
  const key = keyOf(draftToken)
  if (!key) return Promise.reject(new Error('missing_draft_token'))
  const force = Boolean(opts?.force)
  const hit = memory.get(key)
  if (!force && hit && Date.now() - hit.at < TTL_MS) {
    return hit.data
  }
  if (!force && !hit) {
    const disk = await hydrateMyTrip(key)
    if (disk) {
      const pendingEarly = inflight.get(key)
      if (!pendingEarly) {
        const bg = getApi()
          .getMyTrip(key)
          .then((draft) => {
            setMyTripMemory(draft)
            return draft
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

  const req = getApi()
    .getMyTrip(key)
    .then((draft) => {
      setMyTripMemory(draft)
      return draft
    })
    .catch(async (err) => {
      if (hit?.data) return hit.data
      const disk = await hydrateMyTrip(key)
      if (disk) return disk
      throw err
    })
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, req)
  return req
}

export function invalidateMyTripCache(draftToken?: string) {
  if (!draftToken) {
    memory.clear()
    inflight.clear()
    return
  }
  const key = keyOf(draftToken)
  memory.delete(key)
  inflight.delete(key)
  void AsyncStorage.removeItem(diskKey(key)).catch(() => undefined)
}

/** Hotel id from draft payload for early gallery prefetch. */
export function hotelIdFromDraft(draft: MyTripDraft | null | undefined): string | null {
  if (!draft) return null
  const payload = (draft.payload || {}) as Record<string, unknown>
  const hotel =
    (draft.hotel as Record<string, unknown> | null | undefined) ||
    (payload.hotel as Record<string, unknown> | null | undefined) ||
    null
  const id = String(
    hotel?.id || hotel?.hotel_id || (hotel as { hotelId?: string } | null)?.hotelId || '',
  ).trim()
  if (!id || id === 'primary' || id === 'seed') return null
  return id
}
