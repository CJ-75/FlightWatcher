import type { TravelDeal, TravelDealHotel } from '../types'

export function dealAdults(deal: TravelDeal): number {
  return Math.max(1, deal.adults ?? 2)
}

/** Hotel star rating as ★★★ (1–5). Empty if unknown. */
export function hotelStarsLabel(stars?: number | null): string {
  const n = Math.round(Number(stars))
  if (!Number.isFinite(n) || n <= 0) return ''
  return '★'.repeat(Math.min(5, n))
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
    // EN → 12h AM/PM ; FR (and others) → 24h (Windows often ignores locale alone)
    const hour12 = /^en\b/i.test(locale)
    return d.toLocaleString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12,
    })
  } catch {
    return String(iso)
  }
}

export type HotelCancelFields = {
  refundable?: boolean | null
  cancel_deadline?: string | null
}

/** Parse LiteAPI cancel deadline (often GMT / space-separated) to Date. */
export function parseCancelDeadline(iso?: string | null): Date | null {
  if (!iso) return null
  try {
    let raw = String(iso).trim()
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw)) {
      raw = raw.replace(' ', 'T')
    }
    const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(raw)
    const d = new Date(hasTz ? raw : `${raw}Z`)
    return Number.isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

export type HotelCancelGateReason =
  | 'ok'
  | 'non_refundable'
  | 'deadline_passed'
  | 'checked_in'
  | 'unknown_policy'

export type HotelCancelGate = {
  /** Free-cancel window still open → show Annuler CTA */
  canCancelFree: boolean
  reason: HotelCancelGateReason
  /** Short FR explanation under / instead of the CTA */
  blockedLabelFr: string | null
}

/**
 * Gate « Annuler la réservation » from hotel policy.
 * CTA only while free cancel is still available (before cancel_deadline).
 * NRFN / past deadline / check-in started → block CTA.
 */
export function resolveHotelCancelGate(
  hotel: HotelCancelFields | null | undefined,
  opts?: {
    checkIn?: string | null
    now?: Date | number
    /** True while LiteAPI retrieve is in flight */
    awaitingPolicy?: boolean
  },
): HotelCancelGate {
  const nowMs = opts?.now != null ? new Date(opts.now).getTime() : Date.now()
  const checkIn = String(opts?.checkIn || '').slice(0, 10)
  if (checkIn && /^\d{4}-\d{2}-\d{2}$/.test(checkIn)) {
    const today = new Date(nowMs).toISOString().slice(0, 10)
    if (checkIn <= today) {
      return {
        canCancelFree: false,
        reason: 'checked_in',
        blockedLabelFr: 'Séjour commencé — annulation via l’hôtel si besoin.',
      }
    }
  }

  if (!hotel) {
    return {
      canCancelFree: false,
      reason: 'unknown_policy',
      blockedLabelFr: opts?.awaitingPolicy
        ? 'Politique d’annulation en cours de récupération…'
        : 'Politique d’annulation indisponible pour le moment.',
    }
  }

  const deadline = parseCancelDeadline(hotel.cancel_deadline)
  const deadlinePassed = Boolean(deadline && deadline.getTime() <= nowMs)
  const when = formatCancelDeadlineLocal(hotel.cancel_deadline, 'fr-FR')

  // Prefer deadline data: past free-cancel window → "date passée, non remboursable"
  if (deadlinePassed) {
    return {
      canCancelFree: false,
      reason: 'deadline_passed',
      blockedLabelFr: when
        ? `Date d’annulation passée (${when}) — non remboursable.`
        : 'Date d’annulation passée — non remboursable.',
    }
  }

  if (hotel.refundable === false) {
    return {
      canCancelFree: false,
      reason: 'non_refundable',
      blockedLabelFr: 'Non remboursable.',
    }
  }

  if (hotel.refundable !== true) {
    return {
      canCancelFree: false,
      reason: 'unknown_policy',
      blockedLabelFr: opts?.awaitingPolicy
        ? 'Politique d’annulation en cours de récupération…'
        : 'Politique d’annulation indisponible pour le moment.',
    }
  }

  return { canCancelFree: true, reason: 'ok', blockedLabelFr: null }
}

/**
 * Single source of truth for cancel copy (fiche, trip, checkout, bookings).
 * Prefer deadline when refundable; never invent a date.
 * Non remboursable is omitted by default (fiche) — pass includeNonRefundable for checkout/bookings.
 */
export function hotelCancelLabel(
  hotel: HotelCancelFields | null | undefined,
  opts?: {
    locale?: string
    short?: boolean
    includeNonRefundable?: boolean
    now?: Date | number
  },
): string | null {
  if (!hotel) return null
  const locale = opts?.locale || 'fr-FR'
  const short = Boolean(opts?.short)
  const nowMs = opts?.now != null ? new Date(opts.now).getTime() : Date.now()
  const deadline = parseCancelDeadline(hotel.cancel_deadline)
  const deadlinePassed = Boolean(deadline && deadline.getTime() <= nowMs)
  const when = formatCancelDeadlineLocal(hotel.cancel_deadline, locale)

  if (deadlinePassed) {
    if (short) {
      return when
        ? `Date d’annul. passée (${when})`
        : 'Date d’annul. passée — non remboursable'
    }
    return when
      ? `Date d’annulation passée (${when}) — non remboursable`
      : 'Date d’annulation passée — non remboursable'
  }

  if (hotel.refundable === false) {
    return opts?.includeNonRefundable ? 'Non remboursable' : null
  }
  if (hotel.refundable !== true) return null
  if (when) {
    return short
      ? `Annul. gratuite jusqu’au ${when}`
      : `Annulation gratuite jusqu’au ${when}`
  }
  return short ? 'Annul. gratuite' : 'Annulation gratuite'
}

/** Confirm copy before cancelling a paid hotel (Mon voyage). */
export function hotelCancelConfirmBodyFr(opts: {
  paidTotal?: number | null
  policyLabel?: string | null
}): string {
  const lines: string[] = []
  const paid = opts.paidTotal != null && Number(opts.paidTotal) > 0
    ? Math.round(Number(opts.paidTotal))
    : null
  if (paid != null) lines.push(`Montant payé : ${paid} €`)
  lines.push(
    opts.policyLabel?.trim() ||
      'Selon les conditions de l’hôtel, des frais peuvent s’appliquer.',
  )
  lines.push('Tu pourras choisir un autre hôtel ensuite.')
  return lines.join('\n\n')
}

/** Success copy after LiteAPI cancel. */
export function hotelCancelSuccessBodyFr(opts: {
  refundAmount?: number | null
  cancellationFee?: number | null
}): string {
  const refund =
    opts.refundAmount != null && Number(opts.refundAmount) > 0
      ? Math.round(Number(opts.refundAmount) * 100) / 100
      : null
  const fee =
    opts.cancellationFee != null && Number(opts.cancellationFee) > 0
      ? Math.round(Number(opts.cancellationFee) * 100) / 100
      : null
  if (refund != null && fee != null) {
    return `Réservation annulée.\nRemboursement : ${refund} € · Frais : ${fee} €`
  }
  if (refund != null) return `Réservation annulée.\nRemboursement : ${refund} €`
  if (fee != null) return `Réservation annulée.\nFrais d’annulation : ${fee} €`
  return 'Réservation annulée. Le remboursement suit les conditions de l’hôtel.'
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
    const raw = String(deal.badge).trim()
    if (!raw) return null
    // Legacy long "Vol −N % …" → strip number into pct if present
    const m = raw.match(/[−\-–—]\s*(\d+)\s*%/)
    if (m && Number(m[1]) >= 15) {
      return {
        discountPct: Number(m[1]),
        text: 'Moins cher',
        fullText: raw,
        kind: 'discount',
      }
    }
    // Drop inactive % placeholders ("__%", "−%", "–%") — keep label only.
    const text = raw
      .replace(/[−\-–—_]{1,2}\s*%/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    if (!text) return null
    return { discountPct: null, text, fullText: text, kind: 'occasion' }
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

/** Format block time: 2h, 2h15, 45 min. */
export function formatFlightDuration(minutes?: number | null): string | null {
  if (minutes == null || !Number.isFinite(Number(minutes))) return null
  const m = Math.max(0, Math.round(Number(minutes)))
  if (m <= 0) return null
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h <= 0) return `${min} min`
  if (min === 0) return `${h}h`
  return `${h}h${String(min).padStart(2, '0')}`
}

/** Approx airport coords for short-haul duration (same idea as backend). */
const FLIGHT_DURATION_COORDS: Record<string, [number, number]> = {
  BVA: [49.4544, 2.1128],
  ORY: [48.7233, 2.3794],
  CDG: [49.0097, 2.5479],
  XCR: [48.7733, 4.2061],
  MRS: [43.4393, 5.2214],
  NCE: [43.6584, 7.2159],
  LYS: [45.7256, 5.0811],
  TLS: [43.6291, 1.3638],
  BOD: [44.8283, -0.7156],
  NTE: [47.1532, -1.6107],
  LIS: [38.7742, -9.1342],
  OPO: [41.2481, -8.6814],
  BCN: [41.2971, 2.0785],
  MAD: [40.4983, -3.5676],
  AGP: [36.6749, -4.4991],
  PMI: [39.5517, 2.7388],
  FCO: [41.8003, 12.2389],
  CIA: [41.7994, 12.5949],
  MXP: [45.6306, 8.7281],
  BGY: [45.6739, 9.7042],
  VCE: [45.5053, 12.3519],
  NAP: [40.886, 14.2908],
  PMO: [38.1759, 13.091],
  CAG: [39.2515, 9.0543],
  ATH: [37.9364, 23.9445],
  HER: [35.3397, 25.1803],
  RHO: [36.4054, 28.0862],
  CFU: [39.6019, 19.9117],
  BUD: [47.4298, 19.2611],
  PRG: [50.1008, 14.26],
  KRK: [50.0777, 19.7848],
  WAW: [52.1657, 20.9671],
  WRO: [51.1027, 16.8858],
  GDN: [54.3776, 18.4662],
  VIE: [48.1103, 16.5697],
  DUB: [53.4213, -6.2701],
  STN: [51.885, 0.235],
  LTN: [51.8747, -0.3683],
  LGW: [51.1537, -0.1821],
  MAN: [53.3537, -2.275],
  EDI: [55.95, -3.3725],
  AMS: [52.3086, 4.7639],
  EIN: [51.4501, 5.3745],
  BRU: [50.9014, 4.4844],
  CRL: [50.4592, 4.4538],
  FAO: [37.0144, -7.9659],
  ALC: [38.2822, -0.5582],
  VLC: [39.4893, -0.4816],
  SVQ: [37.418, -5.8931],
  BIO: [43.3011, -2.9106],
  RAK: [31.6069, -8.0363],
  TFS: [28.0445, -16.5725],
  LPA: [27.9319, -15.3866],
  ACE: [28.9455, -13.6052],
  FUE: [28.4527, -13.8638],
  AJA: [41.9236, 8.8029],
  BIA: [42.5527, 9.4837],
  CLY: [42.5308, 8.793],
  FSC: [41.5006, 9.0978],
  ZAG: [45.7429, 16.0688],
  SPU: [43.5389, 16.298],
  DBV: [42.5614, 18.2682],
  TIA: [41.4147, 19.7206],
  SOF: [42.6952, 23.4062],
  OTP: [44.5711, 26.085],
  BUH: [44.5032, 26.102],
  IST: [41.2753, 28.7519],
  SAW: [40.8986, 29.3092],
  AYT: [36.8987, 30.8005],
  CPH: [55.618, 12.656],
  ARN: [59.6519, 17.9186],
  OSL: [60.1939, 11.1004],
  HEL: [60.3172, 24.9633],
  RIX: [56.9236, 23.9711],
  TLL: [59.4133, 24.8328],
  VNO: [54.6341, 25.2858],
  SKG: [40.5197, 22.9709],
  JTR: [36.3992, 25.4793],
  JMK: [36.6969, 25.1472],
  KGS: [36.7933, 27.0917],
  PSA: [43.6839, 10.3927],
  BLQ: [44.5354, 11.2887],
  TRN: [45.2008, 7.6498],
  BRI: [41.1389, 16.7606],
  CTA: [37.4668, 15.0664],
  OLB: [40.8987, 9.5176],
  SUF: [38.9072, 16.2423],
}

function _haversineKm(a: [number, number], b: [number, number]): number {
  const r = 6371
  const p1 = (a[0] * Math.PI) / 180
  const p2 = (b[0] * Math.PI) / 180
  const dp = ((b[0] - a[0]) * Math.PI) / 180
  const dl = ((b[1] - a[1]) * Math.PI) / 180
  const x =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(x)))
}

/** Estimate block time when API duration is missing (cruise 780 km/h + 45 min pad). */
export function estimateFlightDurationMinutes(
  originIata?: string | null,
  destIata?: string | null,
): number | null {
  const o = String(originIata || '').trim().toUpperCase()
  const d = String(destIata || '').trim().toUpperCase()
  if (!o || !d) return null
  const a = FLIGHT_DURATION_COORDS[o]
  const b = FLIGHT_DURATION_COORDS[d]
  if (!a || !b) return 150
  const minutes = Math.round((_haversineKm(a, b) / 780) * 60 + 45)
  return Math.max(75, Math.min(420, minutes))
}

/** Prefer API duration, else estimate from IATA pair. */
export function resolveFlightDurationMinutes(deal: {
  departure_airport?: string | null
  arrival_airport?: string | null
  flight?: {
    duration_minutes?: number | null
    origin_iata?: string | null
    destination_iata?: string | null
  } | null
  /** occasional fields on related payloads */
  origin_iata?: string | null
  dest_iata?: string | null
  destination?: string | null
}): number | null {
  const raw = deal.flight?.duration_minutes
  if (raw != null && Number.isFinite(Number(raw)) && Number(raw) > 0) {
    return Math.round(Number(raw))
  }
  const origin =
    deal.flight?.origin_iata || deal.departure_airport || deal.origin_iata || null
  const dest =
    deal.flight?.destination_iata ||
    deal.arrival_airport ||
    deal.dest_iata ||
    deal.destination ||
    null
  return estimateFlightDurationMinutes(origin, dest)
}

/**
 * Card/list chip: « Vol direct » only.
 * Pass `withDuration: true` for detail copy (« Vol direct · 2h15 »).
 */
export function directFlightLabel(
  flight?: { direct?: boolean; duration_minutes?: number | null } | null,
  opts?: {
    originIata?: string | null
    destIata?: string | null
    withDuration?: boolean
  },
): string | null {
  if (!flight?.direct) return null
  if (!opts?.withDuration) return 'Vol direct'
  const mins =
    flight.duration_minutes != null && Number(flight.duration_minutes) > 0
      ? Math.round(Number(flight.duration_minutes))
      : estimateFlightDurationMinutes(opts?.originIata, opts?.destIata)
  const dur = formatFlightDuration(mins)
  return dur ? `Vol direct · ${dur}` : 'Vol direct'
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
