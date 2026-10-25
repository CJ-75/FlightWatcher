/**
 * Lot C — carrier booking URLs (mirrors DB table `carrier_booking_url`).
 * Prefer deep-link when route+dates known; else homepage + copy hint.
 */

import { buildRyanairBookingUrl, toRyanairDate } from '../dates/presets'
import { formatAirlineLabel } from '../airlines'

export type CarrierBookingKind = 'deeplink' | 'homepage' | 'fallback'

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
  compareUrl: string | null
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

/**
 * Resolve company booking URL — never empty.
 * Order: non-affiliate booking_url → carrier deep-link → carrier homepage → Ryanair home.
 */
export function resolveCarrierBooking(
  input: ResolveCarrierBookingInput,
): ResolvedCarrierBooking {
  const adults = Math.min(6, Math.max(1, Math.round(Number(input.adults) || 1)))
  const airlineRaw = input.airline || input.carrier || null
  const row = lookupCarrierBooking(airlineRaw)
  const airlineName =
    row?.carrier_name ||
    formatAirlineLabel({ airline: airlineRaw, provider: input.provider }) ||
    'Compagnie'
  const siteLabel = row?.site_label || 'la compagnie'
  const raw = String(input.bookingUrl || '').trim()
  const compareUrl = raw.startsWith('http') && isAffiliateUrl(raw) ? raw : null

  if (raw.startsWith('http') && !isAffiliateUrl(raw)) {
    return {
      url: raw,
      kind: 'deeplink',
      ctaLabel: `Réserver sur ${siteLabel}`,
      siteLabel,
      airlineName,
      copyHint: null,
      compareUrl,
    }
  }

  const origin = String(input.originIata || '').toUpperCase()
  const dest = String(input.destIata || '').toUpperCase()
  const out = String(input.outLocal || input.outDate || '')
  const ret = String(input.inLocal || input.retDate || '')

  if (row?.supports_deeplink === 'ryanair' && origin && dest && out && ret) {
    try {
      const url = buildRyanairBookingUrl(
        {
          aller: { origin, destination: dest, departureTime: out },
          retour: { departureTime: ret },
        },
        adults,
      )
      return {
        url,
        kind: 'deeplink',
        ctaLabel: `Réserver sur ${siteLabel}`,
        siteLabel,
        airlineName,
        copyHint: null,
        compareUrl,
      }
    } catch {
      /* homepage */
    }
  }

  if (row?.supports_deeplink === 'transavia' && origin && dest && out && ret) {
    try {
      const url = buildTransaviaBookingUrl(origin, dest, out, ret, adults)
      return {
        url,
        kind: 'deeplink',
        ctaLabel: `Réserver sur ${siteLabel}`,
        siteLabel,
        airlineName,
        copyHint: null,
        compareUrl,
      }
    } catch {
      /* homepage */
    }
  }

  // Ryanair deep-link even if airline unknown but provider hints Ryanair
  if (
    !row &&
    /ryanair/i.test(String(input.provider || airlineRaw || '')) &&
    origin &&
    dest &&
    out &&
    ret
  ) {
    try {
      const url = buildRyanairBookingUrl(
        {
          aller: { origin, destination: dest, departureTime: out },
          retour: { departureTime: ret },
        },
        adults,
      )
      return {
        url,
        kind: 'deeplink',
        ctaLabel: 'Réserver sur ryanair.com',
        siteLabel: 'ryanair.com',
        airlineName: airlineName || 'Ryanair',
        copyHint: null,
        compareUrl,
      }
    } catch {
      /* fall through */
    }
  }

  if (row?.homepage_url) {
    return {
      url: row.homepage_url,
      kind: 'homepage',
      ctaLabel: `Réserver sur ${siteLabel}`,
      siteLabel,
      airlineName,
      copyHint: formatCopyHint(input, adults),
      compareUrl,
    }
  }

  return {
    url: 'https://www.ryanair.com/fr/fr',
    kind: 'fallback',
    ctaLabel: airlineName ? `Réserver sur ${airlineName}` : 'Réserver mon vol',
    siteLabel: 'ryanair.com',
    airlineName,
    copyHint: formatCopyHint(input, adults),
    compareUrl,
  }
}
