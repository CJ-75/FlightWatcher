/**
 * Lot C — carrier booking URLs (mirrors DB table `carrier_booking_url`).
 * Primary CTA = where the displayed price is bookable (Ryanair vs Aviasales).
 */

import {
  buildRyanairBookingUrl,
  localizeAviasalesBookingUrl,
  toRyanairDate,
} from '../dates/presets'
import { formatAirlineLabel } from '../airlines'
import { primaryAirportCode } from '../cities'

export type CarrierBookingKind = 'deeplink' | 'homepage' | 'fallback' | 'affiliate'

export type CarrierBookingRow = {
  carrier_code: string
  carrier_name: string
  homepage_url: string
  /** Domain used in CTA « Réserver sur {site} » */
  site_label: string
  supports_deeplink?: 'ryanair' | 'transavia' | null
}

/** Static seed — keep in sync with apply_mytrip_carrier_booking_url_migration.sql */
export const CARRIER_BOOKING_SEED: CarrierBookingRow[] = [
  {
    carrier_code: 'FR',
    carrier_name: 'Ryanair',
    homepage_url: 'https://www.ryanair.com/fr/fr',
    site_label: 'ryanair.com',
    supports_deeplink: 'ryanair',
  },
  {
    carrier_code: 'RK',
    carrier_name: 'Ryanair',
    homepage_url: 'https://www.ryanair.com/fr/fr',
    site_label: 'ryanair.com',
    supports_deeplink: 'ryanair',
  },
  {
    carrier_code: 'TO',
    carrier_name: 'Transavia',
    homepage_url: 'https://www.transavia.com/fr-FR/',
    site_label: 'transavia.com',
    supports_deeplink: 'transavia',
  },
  {
    carrier_code: 'HV',
    carrier_name: 'Transavia',
    homepage_url: 'https://www.transavia.com/fr-FR/',
    site_label: 'transavia.com',
    supports_deeplink: 'transavia',
  },
  {
    carrier_code: 'U2',
    carrier_name: 'easyJet',
    homepage_url: 'https://www.easyjet.com/fr',
    site_label: 'easyjet.com',
  },
  {
    carrier_code: 'EC',
    carrier_name: 'easyJet',
    homepage_url: 'https://www.easyjet.com/fr',
    site_label: 'easyjet.com',
  },
  {
    carrier_code: 'VY',
    carrier_name: 'Vueling',
    homepage_url: 'https://www.vueling.com/fr',
    site_label: 'vueling.com',
  },
  {
    carrier_code: 'V7',
    carrier_name: 'Volotea',
    homepage_url: 'https://www.volotea.com/fr/',
    site_label: 'volotea.com',
  },
  {
    carrier_code: 'W4',
    carrier_name: 'Wizz Air',
    homepage_url: 'https://www.wizzair.com/fr-fr',
    site_label: 'wizzair.com',
  },
  {
    carrier_code: 'W6',
    carrier_name: 'Wizz Air',
    homepage_url: 'https://www.wizzair.com/fr-fr',
    site_label: 'wizzair.com',
  },
  {
    carrier_code: 'AF',
    carrier_name: 'Air France',
    homepage_url: 'https://wwws.airfrance.fr/',
    site_label: 'airfrance.fr',
  },
]

const BY_CODE: Record<string, CarrierBookingRow> = Object.fromEntries(
  CARRIER_BOOKING_SEED.map((r) => [r.carrier_code.toUpperCase(), r]),
)

export function lookupCarrierBooking(
  airline?: string | null,
): CarrierBookingRow | null {
  const raw = String(airline || '').trim()
  if (!raw) return null
  const code = raw.toUpperCase()
  if (BY_CODE[code]) return BY_CODE[code]
  const byName = CARRIER_BOOKING_SEED.find(
    (r) => r.carrier_name.toLowerCase() === raw.toLowerCase(),
  )
  return byName || null
}

function buildTransaviaBookingUrl(
  origin: string,
  destination: string,
  outDate: string,
  retDate: string,
  adults: number,
): string {
  const params = new URLSearchParams({
    origin: origin.toUpperCase(),
    destination: destination.toUpperCase(),
    outboundDate: toRyanairDate(outDate),
    inboundDate: toRyanairDate(retDate),
    adults: String(Math.min(6, Math.max(1, adults))),
    children: '0',
    infants: '0',
  })
  return `https://www.transavia.com/fr-FR/book-a-flight/flights/search/?${params.toString()}`
}

function isAffiliateUrl(url: string): boolean {
  return /aviasales|travelpayouts/i.test(url)
}

export type ResolveCarrierBookingInput = {
  airline?: string | null
  carrier?: string | null
  provider?: string | null
  bookingUrl?: string | null
  originIata?: string | null
  destIata?: string | null
  outDate?: string | null
  retDate?: string | null
  outLocal?: string | null
  inLocal?: string | null
  adults?: number
  /** App language — FR → aviasales.fr */
  language?: string | null
  /** Human labels for copy hint */
  originLabel?: string | null
  arrivalLabel?: string | null
}

export type ResolvedCarrierBooking = {
  url: string
  kind: CarrierBookingKind
  ctaLabel: string
  siteLabel: string
  airlineName: string
  /** Shown under CTA when kind !== deeplink */
  copyHint: string | null
  /** @deprecated use secondaryUrl — kept for older call sites */
  compareUrl: string | null
  secondaryUrl: string | null
  secondaryLabel: string | null
  partnerId: string
}

/** Search / MyTrip: primary CTA = where the displayed price is bookable. */
export type PriceSourceBooking = {
  primaryUrl: string
  primaryLabel: string
  secondaryUrl: string | null
  secondaryLabel: string | null
  partnerId: string
  partnerName: string
  airlineName: string
  siteLabel: string
  kind: CarrierBookingKind
  copyHint: string | null
}

function formatCopyHint(input: ResolveCarrierBookingInput, adults: number): string {
  const from = input.originLabel || input.originIata || 'Départ'
  const to = input.arrivalLabel || input.destIata || 'Arrivée'
  const out = String(input.outDate || '').slice(0, 10)
  const ret = String(input.retDate || '').slice(0, 10)
  let dates = ''
  if (out && ret) {
    try {
      const o = new Date(out + 'T12:00:00').toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
      })
      const r = new Date(ret + 'T12:00:00').toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
      })
      dates = ` · ${o} → ${r}`
    } catch {
      dates = ` · ${out} → ${ret}`
    }
  }
  const pax = adults === 1 ? '1 adulte' : `${adults} adultes`
  return `À saisir : ${from} → ${to}${dates} · ${pax}`
}

type AirlineResolved = {
  url: string
  kind: CarrierBookingKind
  siteLabel: string
  airlineName: string
  copyHint: string | null
}

/** True if Ryanair URL already carries a usable O/D + dates select. */
function isCompleteRyanairDeeplink(url: string): boolean {
  const raw = String(url || '').trim()
  if (!/ryanair\.com/i.test(raw)) return false
  try {
    const u = new URL(raw)
    const origin =
      u.searchParams.get('originIata') || u.searchParams.get('tpOriginIata') || ''
    const dest =
      u.searchParams.get('destinationIata') ||
      u.searchParams.get('tpDestinationIata') ||
      ''
    const out = u.searchParams.get('dateOut') || u.searchParams.get('tpStartDate') || ''
    const inn = u.searchParams.get('dateIn') || u.searchParams.get('tpEndDate') || ''
    return Boolean(
      /\/trip\/flights/i.test(u.pathname) &&
        origin.length === 3 &&
        dest.length === 3 &&
        toRyanairDate(out) &&
        toRyanairDate(inn),
    )
  } catch {
    return false
  }
}

/** True if URL is a carrier homepage / incomplete shell — rebuild deeplink instead. */
function isCarrierHomepageUrl(url: string, row: CarrierBookingRow | null): boolean {
  const raw = String(url || '').trim().toLowerCase()
  if (!raw.startsWith('http')) return false
  // Incomplete Ryanair select (no O/D/dates) must be rebuilt
  if (/ryanair\.com/i.test(raw) && !isCompleteRyanairDeeplink(raw)) return true
  if (/[?&](originIata|tpOriginIata|dateOut)=/i.test(raw) && !/ryanair\.com/i.test(raw)) {
    return false
  }
  const home = String(row?.homepage_url || '').trim().toLowerCase().replace(/\/$/, '')
  const bare = raw.replace(/\/$/, '').split('?')[0] || ''
  if (home && (bare === home || bare.startsWith(home + '/'))) {
    if (!/\/trip\//i.test(bare)) return true
  }
  if (/^https?:\/\/(www\.)?ryanair\.com(\/[a-z]{2}\/[a-z]{2})?\/?$/i.test(bare)) {
    return true
  }
  return false
}

function tryRyanairDeeplink(
  origin: string,
  dest: string,
  out: string,
  ret: string,
  adults: number,
  siteLabel: string,
  airlineName: string,
): AirlineResolved | null {
  const o = primaryAirportCode(origin)
  const d = primaryAirportCode(dest)
  if (!(o && d && out && ret)) return null
  try {
    return {
      url: buildRyanairBookingUrl(
        {
          aller: { origin: o, destination: d, departureTime: out },
          retour: { departureTime: ret },
        },
        adults,
      ),
      kind: 'deeplink',
      siteLabel,
      airlineName,
      copyHint: null,
    }
  } catch {
    return null
  }
}

/** Resolve airline site only (never Aviasales). */
function resolveAirlineOnly(input: ResolveCarrierBookingInput): AirlineResolved {
  const adults = Math.min(6, Math.max(1, Math.round(Number(input.adults) || 1)))
  const airlineRaw = input.airline || input.carrier || null
  const row = lookupCarrierBooking(airlineRaw)
  const airlineName =
    row?.carrier_name ||
    formatAirlineLabel({ airline: airlineRaw, provider: input.provider }) ||
    'Compagnie'
  const siteLabel = row?.site_label || 'la compagnie'
  const raw = String(input.bookingUrl || '').trim()

  // One IATA per leg — multi-airport search criteria break carrier deeplinks.
  const origin = primaryAirportCode(input.originIata)
  const dest = primaryAirportCode(input.destIata)
  const out = String(input.outLocal || input.outDate || '')
  const ret = String(input.inLocal || input.retDate || '')

  const wantsRyanair =
    row?.supports_deeplink === 'ryanair' ||
    /ryanair/i.test(String(input.provider || airlineRaw || '')) ||
    /ryanair\.com/i.test(raw)

  // Prefer a freshly built deeplink whenever O/D + dates are known (Bookings drafts
  // often store homepage or an incomplete /trip/flights/select shell).
  if (wantsRyanair) {
    const built = tryRyanairDeeplink(
      origin,
      dest,
      out,
      ret,
      adults,
      siteLabel === 'la compagnie' ? 'ryanair.com' : siteLabel,
      airlineName || 'Ryanair',
    )
    if (built) return built
  }

  if (row?.supports_deeplink === 'transavia' && origin && dest && out && ret) {
    try {
      return {
        url: buildTransaviaBookingUrl(origin, dest, out, ret, adults),
        kind: 'deeplink',
        siteLabel,
        airlineName,
        copyHint: null,
      }
    } catch {
      /* homepage */
    }
  }

  // Keep only complete non-affiliate deeplinks when we cannot rebuild
  if (
    raw.startsWith('http') &&
    !isAffiliateUrl(raw) &&
    !isCarrierHomepageUrl(raw, row) &&
    (!/ryanair\.com/i.test(raw) || isCompleteRyanairDeeplink(raw))
  ) {
    return {
      url: raw,
      kind: 'deeplink',
      siteLabel,
      airlineName,
      copyHint: null,
    }
  }

  if (row?.homepage_url) {
    return {
      url: row.homepage_url,
      kind: 'homepage',
      siteLabel,
      airlineName,
      copyHint: formatCopyHint(input, adults),
    }
  }

  return {
    url: 'https://www.ryanair.com/fr/fr',
    kind: 'fallback',
    siteLabel: 'ryanair.com',
    airlineName,
    copyHint: formatCopyHint(input, adults),
  }
}

/**
 * Primary CTA = source of the displayed price.
 * Ryanair price → ryanair.com; Travelpayouts/Aviasales price → Aviasales (+ airline secondary).
 */
export function resolvePriceSourceBooking(
  input: ResolveCarrierBookingInput,
): PriceSourceBooking {
  const lang = input.language || 'fr'
  const raw = String(input.bookingUrl || '').trim()
  const provider = String(input.provider || '').toLowerCase()
  const airline = resolveAirlineOnly(input)
  const isTp =
    provider === 'travelpayouts' ||
    provider === 'aviasales' ||
    (raw.startsWith('http') && isAffiliateUrl(raw))

  if (isTp && raw.startsWith('http') && isAffiliateUrl(raw)) {
    const primaryUrl = localizeAviasalesBookingUrl(raw, lang)
    return {
      primaryUrl,
      primaryLabel: 'Réserver ce vol',
      secondaryUrl: null,
      secondaryLabel: null,
      partnerId: 'aviasales',
      partnerName: 'Aviasales',
      airlineName: airline.airlineName,
      siteLabel: 'aviasales.fr',
      kind: 'affiliate',
      copyHint: null,
    }
  }

  // Ryanair organic / other carrier where booking_url is the airline
  const isRyanair =
    provider === 'ryanair' ||
    /ryanair/i.test(airline.airlineName) ||
    airline.siteLabel === 'ryanair.com'

  return {
    primaryUrl: airline.url,
    primaryLabel: 'Réserver ce vol',
    secondaryUrl: null,
    secondaryLabel: null,
    partnerId: isRyanair ? 'ryanair' : airline.siteLabel.replace(/\./g, '_'),
    partnerName: airline.airlineName,
    airlineName: airline.airlineName,
    siteLabel: airline.siteLabel,
    kind: airline.kind,
    copyHint: airline.copyHint,
  }
}

/**
 * Resolve booking CTA — primary = price source (Aviasales when TP).
 */
export function resolveCarrierBooking(
  input: ResolveCarrierBookingInput,
): ResolvedCarrierBooking {
  const ps = resolvePriceSourceBooking(input)
  return {
    url: ps.primaryUrl,
    kind: ps.kind,
    ctaLabel: ps.primaryLabel,
    siteLabel: ps.siteLabel,
    airlineName: ps.airlineName,
    copyHint: ps.copyHint,
    compareUrl: ps.secondaryUrl,
    secondaryUrl: ps.secondaryUrl,
    secondaryLabel: ps.secondaryLabel,
    partnerId: ps.partnerId,
  }
}
