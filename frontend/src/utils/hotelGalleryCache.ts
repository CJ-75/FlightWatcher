/**
 * Hotel gallery — memory singleflight (parity mobile).
 */
import type { HotelGalleryPhoto, HotelGalleryResponse } from '@flightwatcher/shared'
import { getApiClient } from './apiClient'

export type HotelGalleryPayload = {
  hotel_id: string
  photos: HotelGalleryPhoto[]
  name?: string | null
  count?: number
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
    if (hit?.photos?.length && !hit.partial) return Promise.resolve(hit)
  }

  const pending = inflight.get(key)
  if (pending && !force) return pending

  const req = getApiClient()
    .getHotelGallery(hid, {
      language,
      fallback: opts?.fallback,
    })
    .then((res: HotelGalleryResponse) => {
      const payload: HotelGalleryPayload = {
        hotel_id: String(res.hotel_id || hid),
        photos: Array.isArray(res.photos) ? res.photos.filter((p) => p?.url) : [],
        name: res.name,
        count: res.count,
        partial: Boolean(res.partial),
      }
      const prev = memory.get(key)
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
