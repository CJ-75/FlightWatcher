/**
 * Search: sync partner open + hotel upsell pending (sessionStorage).
 */
import {
  cityDisplayNameFr,
  dateFromFlightIso,
  resolvePriceSourceBooking,
  type PriceSourceBooking,
} from '@flightwatcher/shared'
import type { EnrichedTripResponse } from '../types'
import { getSessionId } from './session'
import { getApiClient } from './apiClient'

export const PENDING_HOTEL_UPSELL_KEY = 'fw_pending_hotel_upsell'

export type PendingHotelUpsell = {
  tripKey: string
  city: string
  destination_code: string
  origin_iata?: string
  outDate: string
  retDate: string
  passengers: number
  primaryUrl: string
  partnerId: string
  partnerName: string
  provider?: string | null
  airline?: string | null
  price_pp: number
  booking_url: string
  searchEventId?: string | null
  trip: EnrichedTripResponse
  createdAt: number
  /** User already chose « Ajouter un hôtel » — no return banner */
  skippedBanner?: boolean
}

export function tripBookKey(trip: EnrichedTripResponse): string {
  return [
    trip.aller?.origin || '',
    trip.destination_code || '',
    trip.aller?.departureTime || '',
    trip.retour?.departureTime || '',
  ].join('|')
}

export function resolveTripPriceSource(
  trip: EnrichedTripResponse,
  passengers: number,
  language: string,
): PriceSourceBooking {
  return resolvePriceSourceBooking({
    airline: trip.airline,
    provider: trip.provider,
    bookingUrl: trip.booking_url,
    originIata: trip.aller?.origin,
    destIata: trip.destination_code || trip.aller?.destination,
    outDate: dateFromFlightIso(trip.aller?.departureTime),
    retDate: dateFromFlightIso(trip.retour?.departureTime),
    outLocal: trip.aller?.departureTime,
    inLocal: trip.retour?.departureTime,
    adults: passengers,
    language,
    originLabel: cityDisplayNameFr(trip.aller?.origin, trip.aller?.originFull),
    arrivalLabel: cityDisplayNameFr(
      trip.destination_code || trip.aller?.destination,
      trip.aller?.destinationFull,
    ),
  })
}

export function readPendingHotelUpsell(): PendingHotelUpsell | null {
  try {
    const raw = sessionStorage.getItem(PENDING_HOTEL_UPSELL_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PendingHotelUpsell
  } catch {
    return null
  }
}

export function writePendingHotelUpsell(pending: PendingHotelUpsell): void {
  try {
    sessionStorage.setItem(PENDING_HOTEL_UPSELL_KEY, JSON.stringify(pending))
  } catch {
    /* ignore quota */
  }
}

export function clearPendingHotelUpsell(): void {
  try {
    sessionStorage.removeItem(PENDING_HOTEL_UPSELL_KEY)
  } catch {
    /* ignore */
  }
}

export function trackPartnerAnalytics(body: Record<string, unknown>): void {
  const payload = JSON.stringify({
    ...body,
    source: 'web',
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    session_id: getSessionId(),
  })
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' })
      if (navigator.sendBeacon('/api/analytics/booking-sas-event', blob)) return
    }
  } catch {
    /* fall through */
  }
  void fetch('/api/analytics/booking-sas-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => undefined)
}

/**
 * Sync window.open first (popup blockers), then analytics + pending upsell.
 */
export function openPartnerBookSync(opts: {
  trip: EnrichedTripResponse
  passengers: number
  language: string
  searchEventId?: string | null
  /** If true, do not show return banner (e.g. after « Ajouter un hôtel ») */
  skipReturnBanner?: boolean
}): PriceSourceBooking {
  const { trip, passengers, language, searchEventId, skipReturnBanner } = opts
  const ps = resolveTripPriceSource(trip, passengers, language)
  window.open(ps.primaryUrl, '_blank', 'noopener,noreferrer')

  trackPartnerAnalytics({
    trip,
    partner_id: ps.partnerId,
    partner_name: ps.partnerName,
    redirect_url: ps.primaryUrl,
    action_type: 'partner_click',
    countdown_seconds: 0,
    search_event_id: searchEventId || null,
  })

  const outDate = dateFromFlightIso(trip.aller?.departureTime) || ''
  const retDate = dateFromFlightIso(trip.retour?.departureTime) || ''
  const city = cityDisplayNameFr(
    trip.destination_code,
    trip.aller?.destinationFull?.split(',')[0]?.trim(),
  )

  writePendingHotelUpsell({
    tripKey: tripBookKey(trip),
    city,
    destination_code: trip.destination_code,
    origin_iata: trip.aller?.origin,
    outDate,
    retDate,
    passengers,
    primaryUrl: ps.primaryUrl,
    partnerId: ps.partnerId,
    partnerName: ps.partnerName,
    provider: trip.provider,
    airline: trip.airline,
    price_pp: Number(trip.prix_total) || 0,
    booking_url: ps.primaryUrl,
    searchEventId: searchEventId || null,
    trip,
    createdAt: Date.now(),
    skippedBanner: Boolean(skipReturnBanner),
  })

  return ps
}

export async function createMyTripComposeFromTrip(opts: {
  trip: EnrichedTripResponse
  passengers: number
  language: string
  markFlightBooked?: boolean
}): Promise<{ draft_token: string }> {
  const { trip, passengers, language, markFlightBooked } = opts
  const ps = resolveTripPriceSource(trip, passengers, language)
  const pax = Math.min(6, Math.max(1, passengers || 1))
  const city = cityDisplayNameFr(
    trip.destination_code,
    trip.aller?.destinationFull?.split(',')[0]?.trim(),
  )
  const checkin = dateFromFlightIso(trip.aller?.departureTime)
  const checkout = dateFromFlightIso(trip.retour?.departureTime)
  if (!checkin || !checkout || !trip.destination_code) {
    throw new Error('Dates ou destination manquantes')
  }
  const flightPp = Number(trip.prix_total) || 0
  const draft = await getApiClient().createMyTrip({
    origin_iata: trip.aller?.origin,
    departure_airport: trip.aller?.origin,
    destination: trip.destination_code,
    city,
    dates: { outbound: checkin, inbound: checkout },
    adults: pax,
    compose_hotel: true,
    flight: {
      price_pp: flightPp,
      provider: trip.provider,
      airline: trip.airline,
      booking_url: ps.primaryUrl,
      direct: (trip.transfers ?? 0) === 0,
      origin_iata: trip.aller?.origin,
      destination_iata: trip.destination_code,
    },
    price_per_person: Math.round(flightPp),
    booking_url: ps.primaryUrl,
  })
  if (markFlightBooked && draft.draft_token) {
    try {
      await getApiClient().markMyTripFlightBooked(draft.draft_token)
    } catch {
      /* non-blocking */
    }
  }
  return draft
}
