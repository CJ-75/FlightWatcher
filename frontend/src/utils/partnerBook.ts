/**
 * Search: sync partner open + hotel upsell pending (sessionStorage).
 */
import {
  cityDisplayNameFr,
  dateFromFlightIso,
  FLIGHT_RETURN_ASK_KEY,
  parseFlightReturnAsk,
  primaryAirportCode,
  resolvePriceSourceBooking,
  serializeFlightReturnAsk,
  shouldShowFlightReturnAsk,
  type FlightReturnAsk,
  type MyTripDraft,
  type PriceSourceBooking,
} from '@flightwatcher/shared'
import type { EnrichedTripResponse } from '../types'
import { getSessionId } from './session'
import { getApiClient } from './apiClient'
import { rememberTrip } from './tripRecovery'

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
  /** MyTrip / Vols draft — spine for ask-booked restore */
  draftToken?: string | null
  /** Show PostBook lightbox when user returns from airline tab */
  awaitingReturnPrompt?: boolean
  /** Search owns PostBook; Planner uses its own return ask. */
  source?: 'search' | 'planner'
}

export function markFlightReturnAsk(opts: {
  draftToken: string
  promptOnReturn?: boolean
}): void {
  const draftToken = String(opts.draftToken || '').trim()
  if (!draftToken) return
  const payload: FlightReturnAsk = {
    draftToken,
    at: Date.now(),
    promptOnReturn: opts.promptOnReturn !== false,
  }
  try {
    sessionStorage.setItem(FLIGHT_RETURN_ASK_KEY, serializeFlightReturnAsk(payload))
  } catch {
    /* ignore quota */
  }
}

export function readFlightReturnAsk(): FlightReturnAsk | null {
  try {
    return parseFlightReturnAsk(sessionStorage.getItem(FLIGHT_RETURN_ASK_KEY))
  } catch {
    return null
  }
}

export function clearFlightReturnAsk(draftToken?: string | null): void {
  try {
    if (draftToken) {
      const cur = readFlightReturnAsk()
      if (cur && cur.draftToken !== draftToken) return
    }
    sessionStorage.removeItem(FLIGHT_RETURN_ASK_KEY)
  } catch {
    /* ignore */
  }
}

export function consumeFlightReturnAsk(opts?: {
  draftToken?: string | null
  alreadyBooked?: boolean
}): FlightReturnAsk | null {
  const ask = readFlightReturnAsk()
  if (
    !shouldShowFlightReturnAsk(ask, {
      draftToken: opts?.draftToken,
      alreadyBooked: opts?.alreadyBooked,
    })
  ) {
    return null
  }
  // One-shot — avoid re-prompting on every focus/visibility while ask UI is open.
  clearFlightReturnAsk(ask.draftToken)
  return ask
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
  const originIata = primaryAirportCode(trip.aller?.origin)
  const destIata = primaryAirportCode(
    trip.destination_code || trip.aller?.destination,
  )
  return resolvePriceSourceBooking({
    airline: trip.airline,
    provider: trip.provider,
    bookingUrl: trip.booking_url,
    originIata,
    destIata,
    outDate: dateFromFlightIso(trip.aller?.departureTime),
    retDate: dateFromFlightIso(trip.retour?.departureTime),
    outLocal: trip.aller?.departureTime,
    inLocal: trip.retour?.departureTime,
    adults: passengers,
    language,
    originLabel: cityDisplayNameFr(originIata, trip.aller?.originFull),
    arrivalLabel: cityDisplayNameFr(destIata, trip.aller?.destinationFull),
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
  /** Stable draft id used as Travelpayouts SubID for postback attribution. */
  draftId?: string | null
  draftToken?: string | null
  /** Pre-opened tab, useful when draft creation must finish before redirect. */
  targetWindow?: Window | null
  /** If true, do not show return banner (e.g. after « Ajouter un hôtel ») */
  skipReturnBanner?: boolean
  /** Prompt PostBook / ask-booked when user returns (airline direct). */
  awaitingReturnPrompt?: boolean
  /** Defaults to search — Planner must pass 'planner' so App PostBook stays out. */
  source?: 'search' | 'planner'
}): PriceSourceBooking {
  const {
    trip,
    passengers,
    language,
    searchEventId,
    draftId,
    draftToken,
    targetWindow,
    skipReturnBanner,
    awaitingReturnPrompt,
    source = 'search',
  } = opts
  const resolved = resolveTripPriceSource(trip, passengers, language)
  let primaryUrl = String(resolved.primaryUrl || '').trim()
  if (resolved.partnerId === 'aviasales' && draftId && primaryUrl) {
    try {
      const url = new URL(primaryUrl)
      url.searchParams.set('subid', `fw_${draftId.replace(/-/g, '_')}`)
      primaryUrl = url.toString()
    } catch {
      /* Keep partner URL unchanged if it cannot be parsed. */
    }
  }
  if (!/^https?:\/\//i.test(primaryUrl)) {
    if (targetWindow && !targetWindow.closed) {
      try {
        targetWindow.close()
      } catch {
        /* ignore */
      }
    }
    throw new Error('Lien de réservation indisponible pour ce vol')
  }
  const ps = { ...resolved, primaryUrl }
  if (targetWindow && !targetWindow.closed) {
    targetWindow.location.href = primaryUrl
  } else {
    window.open(primaryUrl, '_blank', 'noopener,noreferrer')
  }

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

  const token = String(draftToken || '').trim() || null
  // Planner owns its own « Ton vol est réservé ? » — never bait Search PostBook.
  const forSearchPostBook =
    source === 'search' && Boolean(awaitingReturnPrompt) && !skipReturnBanner
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
    skippedBanner: Boolean(skipReturnBanner) || source === 'planner',
    draftToken: token,
    awaitingReturnPrompt: forSearchPostBook,
    source,
  })
  if (token && awaitingReturnPrompt && source !== 'planner') {
    markFlightReturnAsk({ draftToken: token, promptOnReturn: true })
  }

  return ps
}

export async function createMyTripComposeFromTrip(opts: {
  trip: EnrichedTripResponse
  passengers: number
  language: string
  markFlightBooked?: boolean
}): Promise<MyTripDraft> {
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
      transfers: trip.transfers ?? 0,
      origin_iata: trip.aller?.origin,
      destination_iata: trip.destination_code,
      outbound_local: trip.aller?.departureTime || checkin,
      inbound_local: trip.retour?.departureTime || checkout,
      out_dep_local: trip.aller?.departureTime || checkin,
      ret_dep_local: trip.retour?.departureTime || checkout,
      outbound_flight_number: trip.aller?.flightNumber || null,
      inbound_flight_number: trip.retour?.flightNumber || null,
      flight_number: trip.aller?.flightNumber || null,
      return_flight_number: trip.retour?.flightNumber || null,
      aller: {
        flightNumber: trip.aller?.flightNumber,
        origin: trip.aller?.origin,
        destination: trip.destination_code,
        departureTime: trip.aller?.departureTime || checkin,
      },
      retour: {
        flightNumber: trip.retour?.flightNumber,
        origin: trip.destination_code,
        destination: trip.aller?.origin,
        departureTime: trip.retour?.departureTime || checkout,
      },
    },
    price_per_person: Math.round(flightPp),
    booking_url: ps.primaryUrl,
  })
  if (draft.draft_token) {
    rememberTrip({ draft_token: draft.draft_token, city })
  }
  if (markFlightBooked && draft.draft_token) {
    try {
      await getApiClient().markMyTripFlightBooked(draft.draft_token)
    } catch {
      /* non-blocking */
    }
  }
  return draft
}
