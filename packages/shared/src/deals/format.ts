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

/** Labels for occasion_badge slug (discount badge still wins in UI). Keep short for chips. */
const OCCASION_BADGE_LABELS: Record<string, string> = {
  'moins-200': '−200 €',
  'sans-conge': 'Sans congé',
  'un-jour-conge': '1 j. congé',
  'ambiance-noel': 'Noël',
  'pont-noel': 'Pont de Noël',
  'nouvel-an': 'Nouvel An',
  'hiver-soleil': 'Soleil d’hiver',
  'nuits-polaires': 'Nuits polaires',
  'hotel-plebiscite': 'Coup de cœur',
  'extras-offerts': 'Petit-déj',
  pepites: 'Pépite',
  'il-fera-beau': 'Beau temps',
}

export function occasionBadgeLabel(slug: string | null | undefined): string | null {
  if (!slug) return null
  return OCCASION_BADGE_LABELS[slug] || slug.replace(/-/g, ' ')
}

export type DealCornerBadgeParts = {
  /** −32 when known; null → show text-only / reserve slot in UI if desired */
  discountPct: number | null
  /** Short chip copy that fits on one line with the % */
  text: string
  /** Longer sentence for tooltip / detail */
  fullText: string
  kind: 'discount' | 'occasion'
}

/** Structured corner badge: text first, % when baseline math is ready. */
export function dealCornerBadgeParts(deal: TravelDeal): DealCornerBadgeParts | null {
  const meta = deal.badge_meta
  const discRaw = meta?.discount_pct
  let pct: number | null = null
  if (discRaw != null && Number.isFinite(Number(discRaw)) && Number(discRaw) >= 15) {
    pct = Math.round(Number(discRaw))
  }
  const metaLabel = (meta?.label || '').trim()
  const short = (meta?.short_label || '').trim()
  if (pct != null || (metaLabel && !/^nouveau$/i.test(metaLabel))) {
    const text = short || metaLabel || 'Moins cher'
    const full =
      pct != null
        ? `${text} (−${pct} %)`
        : metaLabel || text
    return {
      discountPct: pct,
      text,
      fullText: full,
      kind: 'discount',
    }
  }
  if (deal.badge && !/^nouveau$/i.test(String(deal.badge).trim())) {
    const text = String(deal.badge).trim()
    // Legacy long "Vol −N % …" → strip number into pct if present
    const m = text.match(/−\s*(\d+)\s*%/)
    if (m) {
      return {
        discountPct: Number(m[1]),
        text: 'Moins cher',
        fullText: text,
        kind: 'discount',
      }
    }
    return { discountPct: null, text, fullText: text, kind: 'discount' }
  }
  const occasion = occasionBadgeLabel(deal.occasion_badge)
  if (occasion) {
    return {
      discountPct: null,
      text: occasion,
      fullText: occasion,
      kind: 'occasion',
    }
  }
  return null
}

/** Card corner badge string (compat): prefers short + optional −N%. */
export function dealCornerBadge(deal: TravelDeal): string | null {
  const parts = dealCornerBadgeParts(deal)
  if (!parts) return null
  if (parts.discountPct != null) return `−${parts.discountPct}% · ${parts.text}`
  return parts.text
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
    return deal.price_breakdown.hotel_public_total ?? 0
  }
  return 0
}
