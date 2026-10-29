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
    let raw = String(iso).trim()
    // LiteAPI often returns "2026-11-05 00:00:00" (space, no TZ)
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw)) {
      raw = raw.replace(' ', 'T')
    }
    const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(raw)
    const d = new Date(hasTz ? raw : `${raw}Z`)
    if (Number.isNaN(d.getTime())) return String(iso).trim()
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

export type HotelCancelFields = {
  refundable?: boolean | null
  cancel_deadline?: string | null
}

/**
 * Single source of truth for cancel copy (fiche, trip, checkout, bookings).
 * Prefer deadline when refundable; never invent a date.
 * Non remboursable is omitted by default (fiche) — pass includeNonRefundable for checkout/bookings.
 */
export function hotelCancelLabel(
  hotel: HotelCancelFields | null | undefined,
  opts?: { locale?: string; short?: boolean; includeNonRefundable?: boolean },
): string | null {
  if (!hotel) return null
  const locale = opts?.locale || 'fr-FR'
  const short = Boolean(opts?.short)
  if (hotel.refundable === false) {
    return opts?.includeNonRefundable ? 'Non remboursable' : null
  }
  if (hotel.refundable !== true) return null
  const when = formatCancelDeadlineLocal(hotel.cancel_deadline, locale)
  if (when) {
    return short
      ? `Annul. gratuite jusqu’au ${when}`
      : `Annulation gratuite jusqu’au ${when}`
  }
  return short ? 'Annul. gratuite' : 'Annulation gratuite'
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
  // Discount badge only when we have a real % — no empty pink shell
  if (pct != null) {
    const text = short || metaLabel || 'Moins cher'
    return {
      discountPct: pct,
      text,
      fullText: `${text} (−${pct} %)`,
      kind: 'discount',
    }
  }
  if (deal.badge && !/^nouveau$/i.test(String(deal.badge).trim())) {
    const text = String(deal.badge).trim()
    if (!text) return null
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
  if (occasion && occasion.trim()) {
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
  const cancelBadge = hotelCancelLabel(deal.hotel, { short: true })
  if (cancelBadge) {
    badges.push(cancelBadge)
  } else if (deal.highlights?.some((h) => /annulation/i.test(h))) {
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

/** Normalized hotel title for wall uniqueness (accents/case/spaces ignored). */
export function hotelTitleKey(deal: TravelDeal): string | null {
  const raw = (deal.hotel_name || deal.hotel?.name || '').trim()
  if (!raw) return null
  const key = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  if (!key || key === 'hotel') return null
  return key
}

/**
 * One card per hotel title on the wall. Keeps first occurrence (caller should
 * sort first). Same hotel + different flight → keep the better deal only.
 * Optional `occupied` shares keys across main grid + filler sections.
 */
export function dedupeDealsByHotelTitle<T extends TravelDeal>(
  deals: T[],
  occupied?: Set<string>,
): T[] {
  const seen = occupied ?? new Set<string>()
  const out: T[] = []
  for (const deal of deals) {
    const byTitle = hotelTitleKey(deal)
    const byId = (deal.hotel?.id || '').trim().toLowerCase()
    const keys = [byTitle, byId ? `id:${byId}` : null].filter(Boolean) as string[]
    if (keys.some((k) => seen.has(k))) continue
    for (const k of keys) seen.add(k)
    out.push(deal)
  }
  return out
}
