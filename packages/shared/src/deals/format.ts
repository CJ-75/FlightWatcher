import type { TravelDeal, TravelDealHotel } from '../types'

export function dealAdults(deal: TravelDeal): number {
  return Math.max(1, deal.adults ?? 2)
}

/** YYYY-MM-DD from ISO flight timestamp. */
export function dateFromFlightIso(iso?: string | null): string | null {
  if (!iso) return null
  const m = String(iso).match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

/** LiteAPI cancel deadlines are GMT — show in user locale. */
export function formatCancelDeadlineLocal(
  iso?: string | null,
  locale = 'fr-FR',
): string | null {
  if (!iso) return null
  try {
    const raw = String(iso).trim()
    const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(raw)
    const d = new Date(hasTz ? raw : `${raw}Z`)
    if (Number.isNaN(d.getTime())) return raw
    return d.toLocaleString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(iso)
  }
}

/** Recompute price_pp when switching hotel from alt_hotels (cache only). */
export function pricePpWithHotel(
  deal: TravelDeal,
  hotelPublicTotal: number,
): number {
  const flightPp =
    deal.price_breakdown?.flight_pp ??
    deal.flight?.price_pp ??
    Math.max(0, deal.price_per_person - (deal.price_breakdown?.hotel_public_total ?? 0) / dealAdults(deal))
  return Math.round((flightPp + hotelPublicTotal / dealAdults(deal)) * 100) / 100
}

export function formatFetchedAt(iso?: string | null, locale = 'fr-FR'): string | null {
  if (!iso) return null
  try {
    const t = new Date(iso).getTime()
    if (Number.isNaN(t)) return null
    const mins = Math.max(0, Math.round((Date.now() - t) / 60000))
    if (mins < 60) return locale.startsWith('fr') ? `il y a ${Math.max(1, mins)} min` : `${Math.max(1, mins)} min ago`
    const hours = Math.round(mins / 60)
    if (hours < 48) return locale.startsWith('fr') ? `il y a ${hours} h` : `${hours} h ago`
    return new Date(iso).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  } catch {
    return null
  }
}

export function dealBadgeLabels(deal: TravelDeal): string[] {
  const badges: string[] = []
  if (deal.flight?.direct || deal.highlights?.some((h) => /direct/i.test(h))) {
    badges.push('Direct')
  }
  if (deal.flags?.breakfast || (deal.board && /petit|breakfast|BI/i.test(deal.board))) {
    badges.push('Petit-déj')
  }
  if (deal.hotel?.refundable || deal.highlights?.some((h) => /annulation/i.test(h))) {
    badges.push('Annul. gratuite')
  }
  if (deal.flags?.late_arrival) badges.push('Arrivée tardive')
  if (deal.flags?.late_departure) badges.push('Bagagerie')
  return badges.slice(0, 4)
}

export function hotelPublicTotal(hotel: TravelDealHotel & { public_hotel_price?: number }, deal: TravelDeal): number {
  const fromAlt = (hotel as { public_hotel_price?: number }).public_hotel_price
  if (typeof fromAlt === 'number') return fromAlt
  if (deal.hotel?.id === hotel.id && deal.price_breakdown) {
    return deal.price_breakdown.hotel_public_total
  }
  return 0
}
