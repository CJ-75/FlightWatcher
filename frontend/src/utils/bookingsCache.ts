import type { HotelBooking, HotelBookingStatus } from '@flightwatcher/shared'
import { getApiClient } from './apiClient'
import { getCurrentSession } from '../lib/supabase'

const BOOKINGS_CACHE_KEY = 'fw_hotel_bookings_v1'
const BOOKINGS_CACHE_TTL_MS = 10 * 60 * 1000

const STATUS_RANK: Record<string, number> = {
  confirmed: 70,
  booking_pending: 60,
  payment_succeeded: 50,
  payment_pending: 40,
  prebooked: 30,
  draft: 20,
  cancelled: 10,
  failed: 0,
}

function collapseKey(b: HotelBooking): string {
  const token = (b.draft_token || '').trim()
  if (token) return `draft:${token}`
  const lite = (b.liteapi_booking_id || '').trim()
  if (lite) return `lite:${lite}`
  const conf = (b.confirmation_code || '').trim()
  if (conf) return `conf:${conf}`
  return `id:${b.id}`
}

/** Drop sandbox / retry duplicates — one card per trip. */
export function dedupeHotelBookings(list: HotelBooking[]): HotelBooking[] {
  const best = new Map<string, HotelBooking>()
  for (const b of list) {
    if (!b?.id) continue
    const key = collapseKey(b)
    const prev = best.get(key)
    if (!prev) {
      best.set(key, b)
      continue
    }
    const rankB = STATUS_RANK[String(b.status as HotelBookingStatus)] ?? 0
    const rankP = STATUS_RANK[String(prev.status as HotelBookingStatus)] ?? 0
    if (rankB > rankP) best.set(key, b)
    else if (
      rankB === rankP &&
      String(b.created_at || '') > String(prev.created_at || '')
    ) {
      best.set(key, b)
    }
  }
  return [...best.values()].sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || '')),
  )
}

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
    return dedupeHotelBookings(parsed.bookings)
  } catch {
    return null
  }
}

export function writeBookingsCache(list: HotelBooking[]) {
  try {
    sessionStorage.setItem(
      BOOKINGS_CACHE_KEY,
      JSON.stringify({
        at: Date.now(),
        bookings: dedupeHotelBookings(list),
      }),
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
