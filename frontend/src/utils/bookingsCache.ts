import type { HotelBooking } from '@flightwatcher/shared'
import { getApiClient } from './apiClient'
import { getCurrentSession } from '../lib/supabase'

const BOOKINGS_CACHE_KEY = 'fw_hotel_bookings_v1'
const BOOKINGS_CACHE_TTL_MS = 10 * 60 * 1000

export function readBookingsCache(): HotelBooking[] | null {
  try {
    const raw = sessionStorage.getItem(BOOKINGS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: number; bookings?: HotelBooking[] }
    if (!Array.isArray(parsed.bookings)) return null
    if (
      typeof parsed.at !== 'number' ||
      Date.now() - parsed.at > BOOKINGS_CACHE_TTL_MS
    ) {
      return null
    }
    return parsed.bookings
  } catch {
    return null
  }
}

export function writeBookingsCache(list: HotelBooking[]) {
  try {
    sessionStorage.setItem(
      BOOKINGS_CACHE_KEY,
      JSON.stringify({ at: Date.now(), bookings: list }),
    )
  } catch {
    /* quota */
  }
}

/** Warm session cache so /bookings paints without waiting on the network. */
export function prefetchHotelBookings(): void {
  void (async () => {
    try {
      const session = await getCurrentSession()
      if (!session?.user) return
      const list = await getApiClient().listHotelBookings()
      writeBookingsCache(Array.isArray(list) ? list : [])
    } catch {
      /* ignore */
    }
  })()
}
