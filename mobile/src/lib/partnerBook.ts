/**
 * Mobile Search: partner book prep + hotel upsell pending (AsyncStorage).
 * Partner URLs open via InAppBrowser — never system browser tabs.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  cityDisplayNameFr,
  dateFromFlightIso,
  resolvePriceSourceBooking,
  type EnrichedTripResponse,
  type PriceSourceBooking,
} from '@flightwatcher/shared'
import { getApi } from './client'

export const PENDING_HOTEL_UPSELL_KEY = 'fw_pending_hotel_upsell'

export type PendingHotelUpsell = {
  tripKey: string
  city: string
  destination_code: string
  passengers: number
  primaryUrl: string
  partnerId: string
  partnerName: string
  searchEventId?: string | null
  trip: EnrichedTripResponse
  createdAt: number
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
  language = 'fr',
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

export async function readPendingHotelUpsell(): Promise<PendingHotelUpsell | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_HOTEL_UPSELL_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PendingHotelUpsell
  } catch {
    return null
  }
}

export async function writePendingHotelUpsell(
  pending: PendingHotelUpsell,
): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_HOTEL_UPSELL_KEY, JSON.stringify(pending))
  } catch {
    /* ignore */
  }
}

export async function clearPendingHotelUpsell(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_HOTEL_UPSELL_KEY)
  } catch {
    /* ignore */
  }
}

export function trackPartnerEvent(body: Record<string, unknown>): void {
  void getApi()
    .trackBookingSasEvent({
      ...body,
      source: 'mobile',
    })
    .catch(() => undefined)
}

/**
 * Resolve partner URL + store pending hotel upsell (no browser open).
 * Caller opens `ps.primaryUrl` via InAppBrowser.
 */
export async function preparePartnerBook(opts: {
  trip: EnrichedTripResponse
  passengers: number
  searchEventId?: string | null
  skipReturnBanner?: boolean
}): Promise<PriceSourceBooking> {
  const { trip, passengers, searchEventId, skipReturnBanner } = opts
  const ps = resolveTripPriceSource(trip, passengers, 'fr')

  trackPartnerEvent({
    trip,
    partner_id: ps.partnerId,
    partner_name: ps.partnerName,
    redirect_url: ps.primaryUrl,
    action_type: 'partner_click',
    search_event_id: searchEventId || null,
  })

  const city = cityDisplayNameFr(
    trip.destination_code,
    trip.aller?.destinationFull?.split(',')[0]?.trim(),
  )
  await writePendingHotelUpsell({
    tripKey: tripBookKey(trip),
    city,
    destination_code: trip.destination_code,
    passengers,
    primaryUrl: ps.primaryUrl,
    partnerId: ps.partnerId,
    partnerName: ps.partnerName,
    searchEventId: searchEventId || null,
    trip,
    createdAt: Date.now(),
    skippedBanner: Boolean(skipReturnBanner),
  })
  return ps
}

/** @deprecated use preparePartnerBook + InAppBrowser */
export const openPartnerBookSync = preparePartnerBook

export async function createMyTripComposeFromTrip(opts: {
  trip: EnrichedTripResponse
  passengers: number
  markFlightBooked?: boolean
}): Promise<{ draft_token: string }> {
  const { trip, passengers, markFlightBooked } = opts
  const ps = resolveTripPriceSource(trip, passengers, 'fr')
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
  const draft = await getApi().createMyTrip({
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
      await getApi().markMyTripFlightBooked(draft.draft_token)
    } catch {
      /* non-blocking */
    }
  }
  // Warm hotel compose job before HotelCompose mounts
  void getApi()
    .fetchHotelUpsell({
      iata: trip.destination_code,
      checkin,
      checkout,
      participants: pax,
      flight_pp: flightPp,
      live: true,
    })
    .catch(() => undefined)
  return draft
}

/** Fire-and-forget warm fetch when dest/dates known after createMyTrip. */
export function warmHotelUpsell(opts: {
  iata?: string | null
  checkin?: string | null
  checkout?: string | null
  participants?: number
  flight_pp?: number
}) {
  const iata = String(opts.iata || '')
    .trim()
    .toUpperCase()
  const checkin = String(opts.checkin || '').slice(0, 10)
  const checkout = String(opts.checkout || '').slice(0, 10)
  if (!iata || !checkin || !checkout || checkout <= checkin) return
  void getApi()
    .fetchHotelUpsell({
      iata,
      checkin,
      checkout,
      participants: Math.max(1, opts.participants || 2),
      flight_pp: Number(opts.flight_pp) || 0,
      live: true,
    })
    .catch(() => undefined)
}

export function bookCtaLabel(_ps?: PriceSourceBooking): string {
  return 'Réserver ce vol'
}
