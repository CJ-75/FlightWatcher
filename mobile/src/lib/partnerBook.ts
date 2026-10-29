/**
 * Mobile Search: sync partner open + hotel upsell pending (AsyncStorage).
 */
import { Linking } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  cityDisplayNameFr,
  dateFromFlightIso,
  resolvePriceSourceBooking,
  type EnrichedTripResponse,
  type PriceSourceBooking,
} from '@flightwatcher/shared'
import { getApi, getWebOrigin } from './client'
import * as WebBrowser from 'expo-web-browser'

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
 * Open partner URL immediately, then store pending hotel upsell.
 */
export async function openPartnerBookSync(opts: {
  trip: EnrichedTripResponse
  passengers: number
  searchEventId?: string | null
  skipReturnBanner?: boolean
}): Promise<PriceSourceBooking> {
  const { trip, passengers, searchEventId, skipReturnBanner } = opts
  const ps = resolveTripPriceSource(trip, passengers, 'fr')
  await Linking.openURL(ps.primaryUrl)

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
  return draft
}

export async function openMyTripCompose(draftToken: string): Promise<void> {
  const url = `${getWebOrigin()}/trip/${draftToken}?compose=1`
  await WebBrowser.openBrowserAsync(url)
}

export function bookCtaLabel(_ps?: PriceSourceBooking): string {
  return 'Réserver ce vol'
}
