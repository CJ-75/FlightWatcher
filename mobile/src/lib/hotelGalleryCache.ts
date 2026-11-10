/**
 * Hotel gallery — memory singleflight so TripDetail / DealCard / compose
 * share one HTTP and paint 1/X from cache on revisit.
 */
import type { HotelGalleryPhoto } from '@flightwatcher/shared'
import { getApi } from './client'

export type HotelGalleryPayload = {
  hotel_id: string
  photos: HotelGalleryPhoto[]
  name?: string | null
  count?: number
  /** Pool-first response; full LiteAPI gallery may follow shortly. */
  partial?: boolean
}

const memory = new Map<string, HotelGalleryPayload>()
const inflight = new Map<string, Promise<HotelGalleryPayload>>()

function cacheKey(hotelId: string, language: string) {
  return `${String(hotelId || '').trim()}|${language || 'fr'}`
}

export function peekHotelGallery(
  hotelId: string,
  language = 'fr',
): HotelGalleryPayload | null {
  return memory.get(cacheKey(hotelId, language)) || null
}

export function getHotelGalleryCached(
  hotelId: string,
  opts?: { language?: string; fallback?: string; force?: boolean },
): Promise<HotelGalleryPayload> {
  const hid = String(hotelId || '').trim()
  if (!hid) return Promise.reject(new Error('missing_hotel_id'))
  const language = opts?.language || 'fr'
  const key = cacheKey(hid, language)
  const force = Boolean(opts?.force)

  if (!force) {
    const hit = memory.get(key)
    // Prefer complete galleries; allow partial only as instant paint seed.
    if (hit?.photos?.length && !hit.partial) return Promise.resolve(hit)
  }

  const pending = inflight.get(key)
  if (pending && !force) return pending

  const req = getApi()
    .getHotelGallery(hid, {
      language,
      fallback: opts?.fallback,
    })
    .then((res) => {
      const payload: HotelGalleryPayload = {
        hotel_id: String(res.hotel_id || hid),
        photos: Array.isArray(res.photos) ? res.photos.filter((p) => p?.url) : [],
        name: res.name,
        count: res.count,
        partial: Boolean((res as { partial?: boolean }).partial),
      }
      const prev = memory.get(key)
      // Don't shrink a richer gallery already in memory.
      if (
        payload.photos.length &&
        (!prev?.photos?.length ||
          payload.photos.length >= prev.photos.length ||
          !payload.partial)
      ) {
        memory.set(key, payload)
      }
      return payload
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, req)
  return req
}
