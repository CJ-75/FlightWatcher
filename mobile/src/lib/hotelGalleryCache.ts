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

function cacheKey(hotelId: string, language: string, limit?: number) {
  const lim = limit != null && limit > 0 ? String(limit) : 'all'
  return `${String(hotelId || '').trim()}|${language || 'fr'}|${lim}`
}

export function peekHotelGallery(
  hotelId: string,
  language = 'fr',
  limit?: number,
): HotelGalleryPayload | null {
  const hid = String(hotelId || '').trim()
  if (!hid) return null
  const exact = memory.get(cacheKey(hid, language, limit))
  if (exact) return exact
  // Hero (limit=3) can seed from a fuller cache already in memory.
  if (limit != null && limit > 0) {
    const full = memory.get(cacheKey(hid, language))
    if (full?.photos?.length) {
      return {
        ...full,
        photos: full.photos.slice(0, limit),
        count: Math.min(full.count || full.photos.length, limit),
        partial: false,
      }
    }
  }
  return null
}

export function getHotelGalleryCached(
  hotelId: string,
  opts?: {
    language?: string
    fallback?: string
    force?: boolean
    /** Planner hero: fetch at most N photos (default uncapped). */
    limit?: number
  },
): Promise<HotelGalleryPayload> {
  const hid = String(hotelId || '').trim()
  if (!hid) return Promise.reject(new Error('missing_hotel_id'))
  const language = opts?.language || 'fr'
  const limit =
    opts?.limit != null && opts.limit > 0 ? Math.min(40, opts.limit) : undefined
  const key = cacheKey(hid, language, limit)
  const force = Boolean(opts?.force)

  if (!force) {
    const hit = peekHotelGallery(hid, language, limit)
    // Prefer complete galleries; allow partial only as instant paint seed.
    if (hit?.photos?.length && !hit.partial) return Promise.resolve(hit)
  }

  const pending = inflight.get(key)
  if (pending && !force) return pending

  const req = getApi()
    .getHotelGallery(hid, {
      language,
      fallback: opts?.fallback,
      limit,
    })
    .then((res) => {
      let photos = Array.isArray(res.photos)
        ? res.photos.filter((p) => p?.url)
        : []
      if (limit != null) photos = photos.slice(0, limit)
      const payload: HotelGalleryPayload = {
        hotel_id: String(res.hotel_id || hid),
        photos,
        name: res.name,
        count: photos.length,
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
