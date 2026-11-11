/**
 * MyTrip draft — memory + singleflight so TripDetail hotel hero
 * can paint without waiting on the workspaces round-trip.
 */
import type { MyTripDraft } from '@flightwatcher/shared'
import { getApi } from './client'

const TTL_MS = 60_000
const memory = new Map<string, { at: number; data: MyTripDraft }>()
const inflight = new Map<string, Promise<MyTripDraft>>()

function keyOf(token: string) {
  return String(token || '').trim()
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
  const pending = inflight.get(key)
  if (!force && pending) return pending

  const req = getApi()
    .getMyTrip(key)
    .then((draft) => {
      setMyTripMemory(draft)
      return draft
    })
    .catch((err) => {
      if (hit?.data) return hit.data
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
