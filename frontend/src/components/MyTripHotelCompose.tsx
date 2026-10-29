import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  airportDisplayNameFr,
  boardLabelFr,
  hotelCancelLabel,
  resolveCarrierBooking,
  type HotelGalleryPhoto,
  type HotelGuestReview,
  type HotelUpsellOption,
  type MyTripDraft,
} from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'
import { PaymentCardMarks } from './PaymentCardMarks'

type Props = {
  draft: MyTripDraft
  token: string
  onUpdated: (row: MyTripDraft) => void
  /** Fermer sans réserver (Plus tard). */
  onDone: () => void
  /** Après choix d’hôtel → ouvrir le paiement. */
  onHotelChosen?: (row: MyTripDraft) => void
}

type SortKey = 'price' | 'rating' | 'distance'

function hotelKey(h: HotelUpsellOption, idx = 0) {
  return String(h.id || h.hotel_id || idx)
}

function hotelIdOf(h: HotelUpsellOption | Record<string, unknown> | null | undefined) {
  if (!h) return ''
  return String((h as HotelUpsellOption).id || (h as HotelUpsellOption).hotel_id || '')
}

/** Keep initial order; refresh prices from live; drop unavailable. */
function revalidateSnapshot(
  snapshot: HotelUpsellOption[],
  live: HotelUpsellOption[],
): HotelUpsellOption[] {
  if (!snapshot.length) return live
  const byId = new Map<string, HotelUpsellOption>()
  for (const h of live) {
    const id = hotelIdOf(h)
    if (id) byId.set(id, h)
  }
  const kept: HotelUpsellOption[] = []
  for (const h of snapshot) {
    const id = hotelIdOf(h)
    const fresh = id ? byId.get(id) : undefined
    if (fresh) kept.push({ ...h, ...fresh })
  }
  return kept
}

function readSnapshot(payload: Record<string, unknown>): HotelUpsellOption[] {
  const raw = payload.compose_options
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is HotelUpsellOption => Boolean(x && typeof x === 'object'))
    .filter((h) => hotelIdOf(h))
    .slice(0, 12)
}

function formatDistance(m?: number | null) {
  if (m == null || Number.isNaN(Number(m))) return null
  const n = Number(m)
  if (n < 1000) return `${Math.round(n)} m du centre`
  return `${(n / 1000).toFixed(1)} km du centre`
}

function formatStationDistance(h: HotelUpsellOption) {
  const m = h.station_distance_m
  const name = h.station_name
  if (m == null || Number.isNaN(Number(m)) || !name) return null
  const n = Number(m)
  const dist =
    n < 1000 ? `${Math.round(n)} m` : `${(n / 1000).toFixed(1)} km`
  return `${dist} de ${name}`
}

function formatStationDistOnly(m?: number | null) {
  if (m == null || Number.isNaN(Number(m))) return null
  const n = Number(m)
  return n < 1000 ? `${Math.round(n)} m` : `${(n / 1000).toFixed(1)} km`
}

/** Picto gare / train */
function StationIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="3" width="16" height="14" rx="2" />
      <path d="M4 11h16" />
      <path d="M12 3v8" />
      <circle cx="8" cy="17.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="17.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="M8 21h8" />
    </svg>
  )
}

/** Picto centre-ville */
function PinIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 21s-6-5.5-6-10a6 6 0 1 1 12 0c0 4.5-6 10-6 10z" />
      <circle cx="12" cy="11" r="2" />
    </svg>
  )
}

function CoffeeIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17 8h1a3 3 0 0 1 0 6h-1" />
      <path d="M3 8h14v7a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z" />
      <path d="M6 2v2M10 2v2M14 2v2" />
    </svg>
  )
}

function UtensilsIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6h5z" />
      <path d="M21 15v7" />
    </svg>
  )
}

function BedIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8" />
      <path d="M4 10V6a2 2 0 0 1 2-2h4v6" />
      <path d="M2 18h20" />
    </svg>
  )
}

function CheckFlexIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

type StayOfferChip = {
  key: string
  label: string
  tone: 'included' | 'available' | 'neutral'
  icon: 'coffee' | 'utensils' | 'bed' | 'check'
}

/** Board rate + équipements → chips repas / formule visibles. */
function stayOfferChips(
  h: HotelUpsellOption,
  facilities: string[],
): StayOfferChip[] {
  const out: StayOfferChip[] = []
  const boardFr = boardLabelFr(h.board)
  const raw = String(h.board || '').trim()
  const code = raw.toUpperCase()
  const facilityBreakfast = facilities.some((f) =>
    /petit|breakfast|café|cafe/i.test(f),
  )
  const facilityRestaurant = facilities.some((f) =>
    /restaurant|demi-pension|pension|half.?board|full.?board/i.test(f),
  )

  if (
    boardFr === 'Petit-déjeuner inclus' ||
    code === 'BI' ||
    code === 'BB' ||
    code === 'BDI' ||
    code === 'BLI'
  ) {
    out.push({
      key: 'bf-in',
      label: 'Petit-déjeuner inclus',
      tone: 'included',
      icon: 'coffee',
    })
  } else if (boardFr === 'Demi-pension' || code === 'HB') {
    out.push({
      key: 'hb',
      label: 'Demi-pension',
      tone: 'included',
      icon: 'utensils',
    })
  } else if (boardFr === 'Pension complète' || code === 'FB') {
    out.push({
      key: 'fb',
      label: 'Pension complète',
      tone: 'included',
      icon: 'utensils',
    })
  } else if (boardFr === 'All inclusive' || code === 'AI') {
    out.push({
      key: 'ai',
      label: 'All inclusive',
      tone: 'included',
      icon: 'utensils',
    })
  } else if (
    boardFr === 'Chambre seule' ||
    code === 'RO' ||
    /room.?only/i.test(raw)
  ) {
    out.push({
      key: 'ro',
      label: 'Chambre seule',
      tone: 'neutral',
      icon: 'bed',
    })
    if (facilityBreakfast) {
      out.push({
        key: 'bf-opt',
        label: 'Petit-déj. en option',
        tone: 'available',
        icon: 'coffee',
      })
    }
  } else if (boardFr) {
    out.push({
      key: 'board',
      label: boardFr,
      tone: 'included',
      icon: /petit|breakfast/i.test(boardFr) ? 'coffee' : 'utensils',
    })
  } else if (facilityBreakfast) {
    out.push({
      key: 'bf-hotel',
      label: 'Petit-déj. à l’hôtel',
      tone: 'available',
      icon: 'coffee',
    })
  }

  if (
    facilityRestaurant &&
    !out.some((c) => c.key === 'hb' || c.key === 'fb' || c.key === 'ai')
  ) {
    // already covered by demi/full if board; else hint restaurant exists
    if (!out.some((c) => c.icon === 'utensils')) {
      out.push({
        key: 'resto',
        label: 'Restaurant',
        tone: 'available',
        icon: 'utensils',
      })
    }
  }

  const flexLabel = hotelCancelLabel({
    refundable: h.refundable,
    cancel_deadline: h.cancel_deadline,
  })
  if (flexLabel) {
    out.push({
      key: 'flex',
      label: flexLabel,
      tone: 'included',
      icon: 'check',
    })
  }

  return out
}

function StayOfferIcon({
  kind,
  className,
}: {
  kind: StayOfferChip['icon']
  className?: string
}) {
  if (kind === 'coffee') return <CoffeeIcon className={className} />
  if (kind === 'utensils') return <UtensilsIcon className={className} />
  if (kind === 'bed') return <BedIcon className={className} />
  return <CheckFlexIcon className={className} />
}

function mapsQuery(name: string, city?: string | null) {
  return [name, city].filter(Boolean).join(', ')
}

function mapsSearchUrl(name: string, city?: string | null) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    mapsQuery(name, city),
  )}`
}

function mapsEmbedUrl(name: string, city?: string | null) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(
    mapsQuery(name, city),
  )}&z=15&output=embed`
}

function StarRow({ stars }: { stars?: number | null }) {
  const n = Math.min(5, Math.max(0, Math.round(Number(stars) || 0)))
  if (!n) return null
  return (
    <span className="text-amber-500 tracking-tight" aria-label={`${n} étoiles`}>
      {'★'.repeat(n)}
    </span>
  )
}

/** Note /10 → étoiles /5, arrondi au 0,5 le plus proche. */
function scoreToHalfStars5(scoreOutOf10?: number | null): number | null {
  if (scoreOutOf10 == null || Number.isNaN(Number(scoreOutOf10))) return null
  const n = Math.min(10, Math.max(0, Number(scoreOutOf10)))
  return Math.round((n / 10) * 5 * 2) / 2
}

function ReviewStars({ score }: { score?: number | null }) {
  const stars = scoreToHalfStars5(score)
  if (stars == null) return null
  const full = Math.floor(stars)
  const half = stars - full >= 0.5
  const empty = 5 - full - (half ? 1 : 0)
  return (
    <span
      className="inline-flex items-center gap-0.5 text-amber-500"
      aria-label={`${stars} sur 5`}
      title={`${Number(score).toFixed(1)}/10 → ${stars}/5`}
    >
      {Array.from({ length: full }, (_, i) => (
        <span key={`f${i}`} className="text-[13px] leading-none" aria-hidden>
          ★
        </span>
      ))}
      {half ? (
        <span className="relative inline-block w-[13px] h-[13px] text-[13px] leading-none" aria-hidden>
          <span className="absolute inset-0 text-slate-300">★</span>
          <span className="absolute inset-0 overflow-hidden w-[50%] text-amber-500">★</span>
        </span>
      ) : null}
      {Array.from({ length: empty }, (_, i) => (
        <span key={`e${i}`} className="text-[13px] leading-none text-slate-300" aria-hidden>
          ★
        </span>
      ))}
    </span>
  )
}

function formatReviewDate(raw?: string | null): string | null {
  if (!raw) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) {
    const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(raw).slice(0, 10)
  }
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatReviewCountry(raw?: string | null): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s) return null
  if (/^[a-z]{2}$/i.test(s)) {
    try {
      const name = new Intl.DisplayNames(['fr'], { type: 'region' }).of(
        s.toUpperCase(),
      )
      if (name) return name
    } catch {
      /* ignore */
    }
    return s.toUpperCase()
  }
  return s
}

function formatReviewType(raw?: string | null): string | null {
  if (!raw) return null
  const t = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!t) return null
  const map: Record<string, string> = {
    couple: 'En couple',
    family: 'En famille',
    family_with_children: 'En famille',
    family_with_kids: 'En famille',
    solo: 'Solo',
    solo_traveller: 'Solo',
    solo_traveler: 'Solo',
    business: 'Affaires',
    group: 'Entre amis',
    friends: 'Entre amis',
    other: 'Voyageur',
  }
  if (map[t]) return map[t]
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ')
}

/** Ex. « Graeme · Royaume-Uni · En couple · 17 oct. 2026 » */
function reviewMeta(r: HotelGuestReview) {
  return [
    r.name?.trim() || null,
    formatReviewCountry(r.country),
    formatReviewType(r.type),
    formatReviewDate(r.date),
  ]
    .filter(Boolean)
    .join(' · ')
}

function ratingLabel(rating?: number | null) {
  if (rating == null || Number.isNaN(Number(rating))) return null
  const r = Number(rating)
  if (r >= 9) return 'Exceptionnel'
  if (r >= 8.5) return 'Excellent'
  if (r >= 8) return 'Très bien'
  if (r >= 7) return 'Bien'
  return 'Correct'
}

/** Selling chips only — rating / stars live in the identity block. */
function hotelAdvantages(h: HotelUpsellOption): string[] {
  const out: string[] = []
  const board = boardLabelFr(h.board)
  if (board) out.push(board)
  // Cancel already in stayOfferChips — keep advantages location-only.
  const dist = formatDistance(h.distance_m)
  if (dist) out.push(dist)
  const station = formatStationDistance(h)
  if (station) out.push(station)
  return out
}

/** Hotel-only price (never pack with flight). */
function hotelOnlyPrice(h: HotelUpsellOption): {
  amount: number
  label: string
} | null {
  if (h.hotel_pp != null && !Number.isNaN(Number(h.hotel_pp))) {
    return {
      amount: Math.round(Number(h.hotel_pp)),
      label: '/ pers. · hôtel',
    }
  }
  if (
    h.public_hotel_price != null &&
    !Number.isNaN(Number(h.public_hotel_price))
  ) {
    return {
      amount: Math.round(Number(h.public_hotel_price)),
      label: 'hôtel · séjour',
    }
  }
  return null
}

function formatShortDate(dateStr?: string | null) {
  if (!dateStr) return null
  try {
    return new Date(dateStr.slice(0, 10) + 'T12:00:00').toLocaleDateString(
      'fr-FR',
      { weekday: 'short', day: 'numeric', month: 'short' },
    )
  } catch {
    return dateStr.slice(0, 10)
  }
}

/** Strip LiteAPI/Nuitee HTML descriptions for clean UI text. */
function htmlToPlainText(raw: string): string {
  let s = String(raw || '').trim()
  if (!s) return ''
  s = s.replace(/<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|section|article)[^>]*>/gi, '\n')
  s = s.replace(/<[^>]+>/g, '')
  if (typeof document !== 'undefined') {
    const el = document.createElement('textarea')
    el.innerHTML = s
    s = el.value
  } else {
    s = s
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
  }
  return s
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n')
}

function formatTimeLocal(iso?: string | null): string {
  if (!iso) return ''
  const m = String(iso).match(/(\d{2}):(\d{2})/)
  if (m) return `${m[1]}:${m[2]}`
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function airportLabel(
  iata: string,
  fallbackCity?: string | null,
  payloadLabel?: string | null,
) {
  if (payloadLabel && String(payloadLabel).trim()) return String(payloadLabel).trim()
  if (!iata) return fallbackCity || '—'
  const name = airportDisplayNameFr(iata, fallbackCity || null)
  if (name && name.toUpperCase() !== iata) return `${name} (${iata})`
  return iata
}

export function MyTripHotelCompose({
  draft,
  token,
  onUpdated,
  onDone,
  onHotelChosen,
}: Props) {
  const payload = (draft.payload || {}) as Record<string, unknown>
  const flight = (payload.flight || {}) as Record<string, unknown>
  const currentHotel = (payload.hotel || draft.hotel) as Record<string, unknown> | null

  const destIata = String(
    draft.dest_iata || payload.destination || flight.destination_iata || '',
  ).toUpperCase()
  const checkin = String(draft.out_date || (payload.dates as any)?.outbound || '').slice(0, 10)
  const checkout = String(draft.ret_date || (payload.dates as any)?.inbound || '').slice(0, 10)
  const adults = Number(draft.adults || payload.adults || 2)
  const flightPp = Number(flight.price_pp || 0)
  const originIata = String(
    draft.origin_iata ||
      payload.origin_iata ||
      payload.departure_airport ||
      flight.origin_iata ||
      flight.origin ||
      '',
  ).toUpperCase()
  const flightBooked = Boolean(
    draft.flight_booked_at ||
      payload.flight_booked ||
      payload.flight_booked_at,
  )
  const cityHint = String(
    draft.city_name ||
      payload.compose_city ||
      (payload as { city?: string }).city ||
      '',
  ).trim()
  const originLabel = airportLabel(
    originIata,
    null,
    payload.origin_airport_label != null
      ? String(payload.origin_airport_label)
      : null,
  )
  const arrivalLabel = airportLabel(
    destIata,
    cityHint || null,
    payload.arrival_airport_label != null
      ? String(payload.arrival_airport_label)
      : null,
  )
  const outDep =
    flight.outbound_local || flight.out_dep_local || payload.out_dep_local
  const retDep =
    flight.inbound_local || flight.ret_dep_local || payload.ret_dep_local
  const outTime = formatTimeLocal(
    outDep != null ? String(outDep) : null,
  )
  const retTime = formatTimeLocal(
    retDep != null ? String(retDep) : null,
  )
  const outArrTime = formatTimeLocal(
    String(
      flight.outbound_arrival_local ||
        flight.out_arr_local ||
        flight.outbound_arr_local ||
        payload.out_arr_local ||
        '',
    ) || null,
  )
  const retArrTime = formatTimeLocal(
    String(
      flight.inbound_arrival_local ||
        flight.ret_arr_local ||
        flight.in_arr_local ||
        payload.ret_arr_local ||
        '',
    ) || null,
  )
  const stopsLabel =
    flight.direct === true
      ? 'vol direct'
      : flight.transfers === 1 || flight.stops === 1
        ? '1 escale'
        : flight.direct === false ||
            (flight.transfers != null && Number(flight.transfers) > 0)
          ? `${Number(flight.transfers || flight.stops || 1)} escale${
              Number(flight.transfers || flight.stops || 1) > 1 ? 's' : ''
            }`
          : null

  const carrier = useMemo(
    () =>
      resolveCarrierBooking({
        airline: flight.airline || flight.carrier || payload.airline,
        carrier: flight.carrier,
        provider: flight.provider || payload.provider,
        bookingUrl: flight.booking_url || payload.booking_url,
        originIata: originIata || undefined,
        destIata: destIata || undefined,
        outDate: checkin || undefined,
        retDate: checkout || undefined,
        outLocal: outDep != null ? String(outDep) : undefined,
        inLocal: retDep != null ? String(retDep) : undefined,
        adults,
        language: 'fr',
        originLabel,
        arrivalLabel,
      }),
    [
      adults,
      arrivalLabel,
      checkin,
      checkout,
      destIata,
      flight,
      originIata,
      originLabel,
      outDep,
      payload.airline,
      payload.booking_url,
      payload.provider,
      retDep,
    ],
  )

  const [options, setOptions] = useState<HotelUpsellOption[]>([])
  const [selected, setSelected] = useState<HotelUpsellOption | null>(null)
  const [sort, setSort] = useState<SortKey>('price')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nightCap, setNightCap] = useState<number | null>(null)
  const [cityLabel, setCityLabel] = useState<string | null>(null)
  const [description, setDescription] = useState<string | null>(null)
  const [galleryPhotos, setGalleryPhotos] = useState<HotelGalleryPhoto[]>([])
  const [facilities, setFacilities] = useState<string[]>([])
  const [hotelAddress, setHotelAddress] = useState<string | null>(null)
  const [checkinTime, setCheckinTime] = useState<string | null>(null)
  const [checkoutTime, setCheckoutTime] = useState<string | null>(null)
  const [guestReviews, setGuestReviews] = useState<HotelGuestReview[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [reviewsExpanded, setReviewsExpanded] = useState(false)
  const [descExpanded, setDescExpanded] = useState(false)
  const [bodyLightbox, setBodyLightbox] = useState<number | null>(null)
  const [mobileSheet, setMobileSheet] = useState(false)
  const [flightExpanded, setFlightExpanded] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const detailRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(min-width: 1024px)')
    const apply = () => {
      setIsDesktop(mq.matches)
      if (mq.matches) setMobileSheet(false)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!destIata || !checkin || !checkout) {
        setError('Destination ou dates manquantes')
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)

      const cityHint =
        String(
          draft.city_name ||
            payload.compose_city ||
            (payload as { city?: string }).city ||
            '',
        ).trim() || undefined
      const snapshot = readSnapshot(payload)
      const lookupItem = {
        iata: destIata,
        checkin,
        checkout,
        participants: adults,
        flight_pp: flightPp || undefined,
        city: cityHint,
      }
      const liveItem = { ...lookupItem, live: true }

      const pickOpts = (r: {
        options?: HotelUpsellOption[] | null
        hotel?: HotelUpsellOption | null
      }) =>
        r?.options?.length ? r.options : r?.hotel ? [r.hotel] : []

      const applyOpts = (
        opts: HotelUpsellOption[],
        meta?: { night_cap?: number | null; city?: string | null },
      ) => {
        setOptions(opts)
        if (meta?.night_cap != null) setNightCap(Number(meta.night_cap))
        if (meta?.city) setCityLabel(String(meta.city))
        else if (cityHint) setCityLabel(cityHint)
        const curId = hotelIdOf(currentHotel)
        const match = opts.find((h) => hotelIdOf(h) === curId)
        setSelected(match || opts[0] || null)
      }

      const persistSnapshot = async (
        opts: HotelUpsellOption[],
        meta?: { night_cap?: number | null; city?: string | null },
      ) => {
        if (!opts.length || !token) return
        try {
          const row = await getApiClient().saveMyTripComposeOptions(token, {
            options: opts,
            night_cap: meta?.night_cap ?? nightCap,
            city: meta?.city ?? cityHint ?? null,
          })
          if (!cancelled) onUpdated(row)
        } catch (e) {
          console.warn('[MyTripHotelCompose] persist snapshot failed', e)
        }
      }

      const reasonError = (reason: string, status?: string) =>
        reason === 'not_in_catalogue'
          ? 'Cette destination n’a pas encore d’hôtels — réessaie dans un instant'
          : reason === 'bad_dates'
            ? 'Dates invalides pour l’hôtel'
            : reason === 'empty_pool' ||
                reason === 'no_rates' ||
                status === 'no_rates'
              ? 'Pas de dispo hôtel pour ces dates'
              : reason === 'rate_limited' || reason === 'too_many_fetches'
                ? 'Trop de recherches hôtel — réessaie dans un moment'
                : 'Aucun hôtel disponible pour cette ville / ces dates'

      const loadCached = async () => {
        try {
          const cached = (
            await getApiClient().lookupHotelUpsell([lookupItem])
          ).results?.[0]
          const opts = pickOpts(cached || {})
          return {
            opts,
            night_cap: cached?.night_cap ?? null,
            city: cached?.city ?? null,
            status: cached?.status,
            reason: cached?.reason,
          }
        } catch {
          return {
            opts: [] as HotelUpsellOption[],
            night_cap: null,
            city: null,
            status: undefined,
            reason: undefined,
          }
        }
      }

      const pollJob = async (jobId: string) => {
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 1200))
          if (cancelled) return null
          try {
            const job = await getApiClient().getHotelUpsellJob(jobId)
            if (
              job.status === 'ready' ||
              job.status === 'error' ||
              job.status === 'no_rates'
            ) {
              return job
            }
          } catch {
            return null
          }
        }
        return null
      }

      const fetchLive = async () => {
        let result = await getApiClient().fetchHotelUpsell(liveItem)
        if (result?.status === 'pending' && result.job_id) {
          const job = await pollJob(result.job_id)
          if (job) {
            result = {
              ...result,
              status: job.status,
              options: job.options,
              night_cap: job.night_cap ?? result.night_cap,
              reason: (job as { error?: string }).error || result.reason,
            }
          } else if (!cancelled) {
            try {
              result = await getApiClient().fetchHotelUpsell(liveItem)
              if (result?.status === 'pending' && result.job_id) {
                const job2 = await pollJob(result.job_id)
                if (job2) {
                  result = {
                    ...result,
                    status: job2.status,
                    options: job2.options,
                    night_cap: job2.night_cap ?? result.night_cap,
                    reason:
                      (job2 as { error?: string }).error || result.reason,
                  }
                }
              }
            } catch {
              /* keep prior */
            }
          }
        }
        return result
      }

      try {
        const snapCap =
          payload.compose_night_cap != null
            ? Number(payload.compose_night_cap)
            : null
        // Prefill from snapshot/cache but keep loading until live rates
        // so refundable/price don't flip after first paint.
        if (snapshot.length) {
          applyOpts(snapshot, { night_cap: snapCap, city: cityHint })
        } else {
          const cached = await loadCached()
          if (cancelled) return
          if (cached.opts.length) {
            applyOpts(cached.opts, cached)
          }
        }

        let result: Awaited<
          ReturnType<ReturnType<typeof getApiClient>['fetchHotelUpsell']>
        > | null = null
        try {
          result = await fetchLive()
        } catch (e) {
          if (snapshot.length) {
            if (!cancelled) setLoading(false)
            return
          }
          const cached = await loadCached()
          if (cached.opts.length) {
            applyOpts(cached.opts, cached)
            await persistSnapshot(cached.opts, cached)
            return
          }
          throw e
        }

        if (cancelled) return
        const liveOpts = pickOpts(result || {})
        let opts: HotelUpsellOption[] = []

        if (snapshot.length && liveOpts.length) {
          opts = revalidateSnapshot(snapshot, liveOpts)
          if (!opts.length) opts = liveOpts
        } else if (liveOpts.length) {
          opts = liveOpts
        } else if (snapshot.length) {
          opts = snapshot
        } else {
          const again = await loadCached()
          opts = again.opts
          if (again.night_cap != null && result) {
            result = { ...result, night_cap: again.night_cap, city: again.city }
          }
        }

        if (opts.length) {
          const meta = {
            night_cap: result?.night_cap ?? snapCap,
            city: result?.city ?? cityHint,
          }
          applyOpts(opts, meta)
          setError(null)
          await persistSnapshot(opts, meta)
        } else {
          setError(
            reasonError(
              String(result?.reason || result?.status || ''),
              result?.status,
            ),
          )
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('[MyTripHotelCompose] hotel load failed', e)
          if (snapshot.length) {
            applyOpts(snapshot, {
              night_cap:
                payload.compose_night_cap != null
                  ? Number(payload.compose_night_cap)
                  : null,
              city: cityHint,
            })
            setError(null)
          } else {
            const again = await loadCached()
            if (again.opts.length) {
              applyOpts(again.opts, again)
              await persistSnapshot(again.opts, again)
              setError(null)
            } else {
              setError('Impossible de charger les hôtels')
            }
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destIata, checkin, checkout, adults, flightPp, token])

  useEffect(() => {
    const id = hotelIdOf(selected)
    if (!id) {
      setDescription(null)
      setGalleryPhotos([])
      setFacilities([])
      setHotelAddress(null)
      setCheckinTime(null)
      setCheckoutTime(null)
      setGuestReviews([])
      setReviewsLoading(false)
      setReviewsExpanded(false)
      setDescExpanded(false)
      setBodyLightbox(null)
      return
    }
    let cancelled = false
    setDescription(null)
    setGalleryPhotos([])
    setFacilities([])
    setHotelAddress(null)
    setCheckinTime(null)
    setCheckoutTime(null)
    setGuestReviews([])
    setReviewsLoading(true)
    setReviewsExpanded(false)
    setDescExpanded(false)
    setBodyLightbox(null)
    const seed = selected?.photo || selected?.thumbnail
    if (seed) {
      setGalleryPhotos([{ url: String(seed), thumb: String(seed), order: 0 }])
    }
    const api = getApiClient()
    void api
      .getHotelGallery(id, { language: 'fr' })
      .then((g) => {
        if (cancelled) return
        const d =
          typeof g.description === 'string'
            ? htmlToPlainText(g.description)
            : ''
        setDescription(d || null)
        setFacilities(
          Array.isArray(g.facilities)
            ? g.facilities.filter((x): x is string => Boolean(x && String(x).trim()))
            : [],
        )
        setHotelAddress(
          typeof g.address === 'string' && g.address.trim() ? g.address.trim() : null,
        )
        setCheckinTime(
          typeof g.checkin_time === 'string' && g.checkin_time.trim()
            ? g.checkin_time.trim()
            : null,
        )
        setCheckoutTime(
          typeof g.checkout_time === 'string' && g.checkout_time.trim()
            ? g.checkout_time.trim()
            : null,
        )
        const photos = Array.isArray(g.photos)
          ? g.photos.filter((p) => p?.url)
          : []
        if (photos.length) setGalleryPhotos(photos)
      })
      .catch(() => {
        if (!cancelled) setDescription(null)
      })
    void api
      .getHotelReviews(id, { language: 'fr', limit: 10 })
      .then((r) => {
        if (cancelled) return
        setGuestReviews(Array.isArray(r.reviews) ? r.reviews.slice(0, 10) : [])
      })
      .catch(() => {
        if (!cancelled) setGuestReviews([])
      })
      .finally(() => {
        if (!cancelled) setReviewsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected])

  useEffect(() => {
    if (bodyLightbox == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBodyLightbox(null)
      if (e.key === 'ArrowRight') {
        setBodyLightbox((i) =>
          i == null ? i : Math.min(i + 1, Math.max(0, galleryPhotos.length - 1)),
        )
      }
      if (e.key === 'ArrowLeft') {
        setBodyLightbox((i) => (i == null ? i : Math.max(0, i - 1)))
      }
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [bodyLightbox, galleryPhotos.length])

  /** Cover = gallery[0]. Body mosaic = next photos (never the cover). */
  const coverPhoto = galleryPhotos[0] || null
  const mosaicAll = useMemo(
    () => (galleryPhotos.length > 1 ? galleryPhotos.slice(1) : []),
    [galleryPhotos],
  )
  const bodyPhotos = useMemo(() => mosaicAll.slice(0, 5), [mosaicAll])
  const mosaicExtra = Math.max(0, mosaicAll.length - bodyPhotos.length)
  const bodyPhotoGlobalIndex = (localIdx: number) => 1 + localIdx

  const sorted = useMemo(() => {
    const list = [...options]
    list.sort((a, b) => {
      if (sort === 'rating') {
        return (Number(b.rating) || 0) - (Number(a.rating) || 0)
      }
      if (sort === 'distance') {
        const da = a.distance_m == null ? 1e9 : Number(a.distance_m)
        const db = b.distance_m == null ? 1e9 : Number(b.distance_m)
        return da - db
      }
      return (Number(a.hotel_pp) || 0) - (Number(b.hotel_pp) || 0)
    })
    return list
  }, [options, sort])

  const confirm = async (hotel?: HotelUpsellOption | null) => {
    const pick = hotel || selected
    if (!pick) return
    setSaving(true)
    setError(null)
    try {
      const hotelPp = Number(pick.hotel_pp || 0)
      const totalPp = Math.round(flightPp + hotelPp)
      const row = await getApiClient().updateMyTripHotel(token, {
        hotel: {
          id: pick.id || pick.hotel_id,
          hotel_id: pick.hotel_id || pick.id,
          name: pick.name,
          stars: pick.stars,
          rating: pick.rating,
          photo: pick.photo || pick.thumbnail,
          board: pick.board,
          public_hotel_price: pick.public_hotel_price,
          hotel_pp: pick.hotel_pp,
          distance_m: pick.distance_m,
          refundable: pick.refundable,
          cancel_deadline: pick.cancel_deadline ?? null,
        },
        price_per_person: totalPp,
      })
      setMobileSheet(false)
      onUpdated(row)
      if (onHotelChosen) onHotelChosen(row)
      else onDone()
    } catch {
      setError('Impossible d’enregistrer l’hôtel')
    } finally {
      setSaving(false)
    }
  }

  const selectHotel = (h: HotelUpsellOption) => {
    setSelected(h)
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      setMobileSheet(true)
    }
  }

  useEffect(() => {
    if (!mobileSheet) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && bodyLightbox == null) setMobileSheet(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [mobileSheet, bodyLightbox])

  const advantages = selected ? hotelAdvantages(selected) : []
  const rLabel = selected ? ratingLabel(selected.rating) : null
  const selectedPrice = selected ? hotelOnlyPrice(selected) : null
  const nights = useMemo(() => {
    if (!checkin || !checkout) return null
    try {
      const a = new Date(checkin + 'T12:00:00').getTime()
      const b = new Date(checkout + 'T12:00:00').getTime()
      const n = Math.round((b - a) / 86400000)
      return n > 0 ? n : null
    } catch {
      return null
    }
  }, [checkin, checkout])
  const offerChips = useMemo(
    () => (selected ? stayOfferChips(selected, facilities) : []),
    [selected, facilities],
  )
  const amenityChips = useMemo(() => {
    // Meal / cancel already in offerChips — keep location + other facilities.
    const skip = new Set<string>([
      ...offerChips.map((c) => c.label),
      'Petit-déjeuner',
      'Petit-déjeuner inclus',
      'Petit-déj. en option',
      'Petit-déj. à l’hôtel',
      'Restaurant',
      'Chambre seule',
      'Demi-pension',
      'Pension complète',
      'All inclusive',
    ])
    const boardFr = boardLabelFr(selected?.board)
    if (boardFr) skip.add(boardFr)
    const seen = new Set<string>()
    const out: string[] = []
    for (const a of [...advantages, ...facilities]) {
      const t = String(a || '').trim()
      if (!t || seen.has(t) || skip.has(t)) continue
      if (/petit|breakfast|annul|pension|inclusive|chambre seule|non remboursable/i.test(t))
        continue
      seen.add(t)
      out.push(t)
      if (out.length >= 7) break
    }
    return out
  }, [advantages, facilities, offerChips, selected?.board])
  const visibleReviews = reviewsExpanded
    ? guestReviews
    : guestReviews.slice(0, 5)

  const outLabel = formatShortDate(checkin)
  const retLabel = formatShortDate(checkout)
  const flightPriceLabel =
    flightPp > 0 ? `${Math.round(flightPp)} € / pers.` : null

  const renderHotelDetail = (variant: 'aside' | 'sheet') => {
    if (!selected) return null
    const sheet = variant === 'sheet'
    return (
      <div
        className={
          sheet
            ? 'h-full flex flex-col bg-white'
            : 'rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden h-full flex flex-col'
        }
      >
        {sheet ? (
          <div
            className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-slate-100 bg-white/95 backdrop-blur-sm"
            style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}
          >
            <button
              type="button"
              onClick={() => setMobileSheet(false)}
              className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2 min-h-[44px] text-sm font-bold text-slate-800 hover:bg-slate-50"
              aria-label="Retour à la liste"
            >
              <span aria-hidden>‹</span> Liste
            </button>
            <p className="min-w-0 flex-1 text-sm font-extrabold text-slate-900 truncate text-center pr-12">
              {selected.name || 'Hôtel'}
            </p>
          </div>
        ) : null}

        <div
          className={`shrink-0 ${sheet ? 'px-0' : 'px-3.5 pt-3.5 sm:px-4 sm:pt-4'}`}
        >
          <button
            type="button"
            onClick={() => setBodyLightbox(0)}
            className={`relative w-full overflow-hidden bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
              sheet
                ? 'aspect-[4/3] max-h-[42vh]'
                : 'rounded-2xl h-[190px] sm:h-[210px]'
            }`}
            aria-label="Voir la photo de couverture"
          >
            {coverPhoto?.url || selected.photo || selected.thumbnail ? (
              <img
                src={coverPhoto?.url || selected.photo || selected.thumbnail || ''}
                alt={selected.name || 'Hôtel'}
                className="absolute inset-0 w-full h-full object-cover"
                loading="eager"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-300 to-slate-500" />
            )}
            {galleryPhotos.length > 1 ? (
              <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-white/95 text-slate-900 text-[11px] font-bold px-2.5 py-1 shadow-sm">
                {galleryPhotos.length} photos
              </span>
            ) : null}
          </button>
        </div>

        <div
          className={`flex-1 min-h-0 overflow-y-auto overscroll-contain px-3.5 sm:px-4 py-3.5 space-y-4 ${
            sheet ? 'pb-5' : ''
          }`}
        >
          {/* 1 · Identité + prix */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3
                className={`font-extrabold text-slate-900 tracking-tight leading-snug line-clamp-2 ${
                  sheet ? 'text-xl' : 'text-lg sm:text-xl'
                }`}
              >
                {selected.name || 'Hôtel'}
              </h3>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                <StarRow stars={selected.stars} />
                {selected.rating != null ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                    <span className="rounded-md bg-slate-900 text-white text-[10px] font-black tabular-nums px-1.5 py-0.5">
                      {Number(selected.rating).toFixed(1)}
                    </span>
                    {rLabel || 'Note'}
                    {selected.review_count != null && selected.review_count > 0
                      ? ` · ${Number(selected.review_count).toLocaleString('fr-FR')} avis`
                      : ''}
                  </span>
                ) : null}
              </div>
              {(formatDistance(selected.distance_m) ||
                selected.station_name ||
                cityLabel) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-500">
                  {formatDistance(selected.distance_m) ? (
                    <span className="inline-flex items-center gap-1">
                      <PinIcon className="w-3 h-3 text-slate-400 shrink-0" />
                      {formatDistance(selected.distance_m)}
                    </span>
                  ) : cityLabel ? (
                    <span className="inline-flex items-center gap-1">
                      <PinIcon className="w-3 h-3 text-slate-400 shrink-0" />
                      {cityLabel}
                    </span>
                  ) : null}
                  {selected.station_name &&
                  formatStationDistOnly(selected.station_distance_m) ? (
                    <span className="inline-flex items-center gap-1 min-w-0">
                      <StationIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">
                        <span className="font-semibold text-slate-700">
                          {formatStationDistOnly(selected.station_distance_m)}
                        </span>
                        {' · '}
                        {selected.station_name}
                      </span>
                    </span>
                  ) : null}
                </div>
              )}
            </div>
            {selectedPrice ? (
              <div className="text-right shrink-0 pt-0.5">
                <p className="text-2xl font-black text-slate-900 tabular-nums leading-none">
                  {selectedPrice.amount}€
                </p>
                <p className="text-[10px] font-semibold text-slate-400 mt-1">
                  / pers. hôtel
                </p>
              </div>
            ) : null}
          </div>

          {/* 2 · Séjour + formule (petit-déj. / pension) */}
          <div className="rounded-2xl bg-slate-50 px-3 py-2.5 space-y-2.5">
            {(outLabel || retLabel || nights) && (
              <p className="text-[12px] text-slate-800 font-semibold">
                {[outLabel, retLabel].filter(Boolean).join(' → ')}
                {nights != null
                  ? ` · ${nights} nuit${nights > 1 ? 's' : ''}`
                  : ''}
                {adults > 0
                  ? ` · ${adults} voy.`
                  : ''}
              </p>
            )}
            {offerChips.length > 0 ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">
                  Formule
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {offerChips.map((c) => (
                    <span
                      key={c.key}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold ${
                        c.tone === 'included'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-100'
                          : c.tone === 'available'
                            ? 'bg-amber-50 text-amber-900 border border-amber-100'
                            : 'bg-white text-slate-700 border border-slate-200'
                      }`}
                    >
                      <StayOfferIcon
                        kind={c.icon}
                        className="w-3.5 h-3.5 shrink-0 opacity-90"
                      />
                      {c.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {(checkinTime || checkoutTime) && (
              <div className="flex flex-wrap gap-1.5">
                {checkinTime ? (
                  <span className="rounded-lg bg-white border border-slate-200 text-slate-600 text-[10px] font-semibold px-2 py-1">
                    Arrivée {checkinTime}
                  </span>
                ) : null}
                {checkoutTime ? (
                  <span className="rounded-lg bg-white border border-slate-200 text-slate-600 text-[10px] font-semibold px-2 py-1">
                    Départ {checkoutTime}
                  </span>
                ) : null}
              </div>
            )}
          </div>

          {/* 3 · Atouts (scan rapide) */}
          {amenityChips.length ? (
            <div className="flex flex-wrap gap-1.5">
              {amenityChips.map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1 rounded-full bg-white border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                >
                  <span className="text-[#FF385C]" aria-hidden>
                    ✓
                  </span>
                  {a}
                </span>
              ))}
            </div>
          ) : null}

          {/* 4 · Mosaïque (preuve visuelle) */}
          {bodyPhotos.length > 0 ? (
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h4 className="text-xs font-extrabold text-slate-900 tracking-wide uppercase">
                  Photos
                </h4>
                <button
                  type="button"
                  onClick={() => setBodyLightbox(1)}
                  className="text-[11px] font-bold text-[#FF385C] hover:underline underline-offset-2 min-h-[36px]"
                >
                  Voir plus
                </button>
              </div>
              <div
                className={`grid gap-1 overflow-hidden rounded-2xl ${
                  bodyPhotos.length >= 5
                    ? 'grid-cols-4 grid-rows-2 h-[160px] sm:h-[188px]'
                    : bodyPhotos.length === 4
                      ? 'grid-cols-2 grid-rows-2 h-[160px] sm:h-[188px]'
                      : bodyPhotos.length === 3
                        ? 'grid-cols-3 h-[110px] sm:h-[128px]'
                        : bodyPhotos.length === 2
                          ? 'grid-cols-2 h-[128px] sm:h-[148px]'
                          : 'grid-cols-1 h-[128px]'
                }`}
              >
                {bodyPhotos.map((p, i) => {
                  const isHero = bodyPhotos.length >= 5 && i === 0
                  const isLast =
                    i === bodyPhotos.length - 1 && mosaicExtra > 0
                  return (
                    <button
                      key={`${p.url}-mosaic-${i}`}
                      type="button"
                      onClick={() => setBodyLightbox(bodyPhotoGlobalIndex(i))}
                      className={`relative overflow-hidden bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
                        isHero ? 'col-span-2 row-span-2' : ''
                      }`}
                    >
                      <img
                        src={p.thumb || p.url}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                      />
                      {isLast ? (
                        <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-ink/55 text-white">
                          <span className="text-sm font-black tabular-nums">
                            +{mosaicExtra}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wide">
                            Voir plus
                          </span>
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {/* 5 · Présentation courte */}
          {description ? (
            <div>
              <h4 className="text-xs font-extrabold text-slate-900 tracking-wide uppercase mb-1.5">
                À propos
              </h4>
              <p
                className={`text-[12px] text-slate-600 leading-relaxed whitespace-pre-line ${
                  descExpanded ? '' : 'line-clamp-3'
                }`}
              >
                {description}
              </p>
              {description.length > 160 ? (
                <button
                  type="button"
                  onClick={() => setDescExpanded((v) => !v)}
                  className="mt-1 text-[11px] font-bold text-[#FF385C] hover:underline underline-offset-2 min-h-[36px]"
                >
                  {descExpanded ? 'Réduire' : 'Lire la suite'}
                </button>
              ) : null}
            </div>
          ) : null}

          {/* 6 · Emplacement */}
          {selected.name ? (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <h4 className="text-xs font-extrabold text-slate-900 tracking-wide uppercase">
                  Emplacement
                </h4>
                <a
                  href={mapsSearchUrl(selected.name, cityLabel)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-bold text-[#FF385C] hover:underline underline-offset-2 min-h-[36px] inline-flex items-center"
                >
                  Ouvrir Maps
                </a>
              </div>
              {hotelAddress ? (
                <p className="text-[11px] text-slate-600 mb-1.5 leading-snug">
                  {hotelAddress}
                  {cityLabel ? `, ${cityLabel}` : ''}
                </p>
              ) : null}
              {selected.stations && selected.stations.length > 0 ? (
                <ul className="space-y-1.5 mb-2.5">
                  {selected.stations.slice(0, 2).map((s, idx) => {
                    const dist = formatStationDistOnly(s.distance_m)
                    return (
                      <li
                        key={s.name}
                        className="flex items-center gap-2 text-[11px] text-slate-600"
                      >
                        <span
                          className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg ${
                            idx === 0
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                          title="Gare"
                        >
                          <StationIcon className="w-3.5 h-3.5" />
                        </span>
                        <span className="min-w-0">
                          {dist ? (
                            <span className="font-bold text-slate-900 tabular-nums">
                              {dist}
                            </span>
                          ) : null}
                          {dist ? ' · ' : null}
                          <span className="font-medium text-slate-700">
                            {s.name}
                          </span>
                          {idx === 0 ? (
                            <span className="text-slate-400"> · gare principale</span>
                          ) : null}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              ) : selected.station_name &&
                formatStationDistOnly(selected.station_distance_m) ? (
                <div className="flex items-center gap-2 text-[11px] text-slate-600 mb-2.5">
                  <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-900 text-white">
                    <StationIcon className="w-3.5 h-3.5" />
                  </span>
                  <span>
                    <span className="font-bold text-slate-900 tabular-nums">
                      {formatStationDistOnly(selected.station_distance_m)}
                    </span>
                    {' · '}
                    <span className="font-medium text-slate-700">
                      {selected.station_name}
                    </span>
                    <span className="text-slate-400"> · gare principale</span>
                  </span>
                </div>
              ) : null}
              <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 h-[120px]">
                <iframe
                  title={`Carte — ${selected.name}`}
                  src={mapsEmbedUrl(selected.name, cityLabel)}
                  className="w-full h-full border-0"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </div>
          ) : null}

          {/* 7 · Avis (bas) */}
          {reviewsLoading || guestReviews.length > 0 ? (
            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-baseline justify-between gap-2 mb-2.5">
                <h4 className="text-xs font-extrabold text-slate-900 tracking-wide uppercase">
                  Avis
                </h4>
                {selected.review_count != null && selected.review_count > 0 ? (
                  <p className="text-[10px] font-semibold text-slate-400 tabular-nums">
                    {Number(selected.review_count).toLocaleString('fr-FR')} avis
                  </p>
                ) : null}
              </div>
              {reviewsLoading && guestReviews.length === 0 ? (
                <p className="text-[11px] text-slate-400">Chargement…</p>
              ) : (
                <>
                  <ul className="space-y-2">
                    {visibleReviews.map((r, i) => {
                      const meta = reviewMeta(r)
                      const excerpt =
                        r.pros || r.text || r.headline || r.cons || ''
                      return (
                        <li
                          key={`${r.name || 'avis'}-${r.date || i}`}
                          className="rounded-2xl bg-slate-50 px-3 py-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <ReviewStars score={r.score} />
                            {meta ? (
                              <p className="text-[10px] text-slate-400 truncate min-w-0">
                                {meta}
                              </p>
                            ) : null}
                          </div>
                          {excerpt ? (
                            <p
                              className={`text-[11px] text-slate-700 leading-relaxed mt-1.5 ${
                                reviewsExpanded ? '' : 'line-clamp-2'
                              }`}
                            >
                              {r.headline && r.headline !== excerpt ? (
                                <span className="font-bold text-slate-900">
                                  {r.headline}
                                  {' · '}
                                </span>
                              ) : null}
                              {excerpt}
                            </p>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                  {guestReviews.length > 5 ||
                  guestReviews.some(
                    (r) => String(r.pros || r.text || '').length > 120,
                  ) ? (
                    <button
                      type="button"
                      onClick={() => setReviewsExpanded((v) => !v)}
                      className="mt-2.5 w-full rounded-xl border border-slate-200 bg-white py-2.5 min-h-[44px] text-[12px] font-bold text-slate-800 active:scale-[0.99] transition"
                    >
                      {reviewsExpanded
                        ? 'Voir moins'
                        : guestReviews.length > 5
                          ? `Voir plus · ${guestReviews.length - 5} avis`
                          : 'Voir plus'}
                    </button>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>

        <div
          className="shrink-0 border-t border-slate-100 bg-white/95 backdrop-blur-sm px-3.5 sm:px-4 py-3"
          style={
            sheet
              ? { paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }
              : undefined
          }
        >
          {nights != null || selectedPrice ? (
            <p className="text-[11px] text-center text-slate-500 mb-2 tabular-nums">
              {[
                nights != null
                  ? `${nights} nuit${nights > 1 ? 's' : ''}`
                  : null,
                selectedPrice
                  ? `hôtel ${selectedPrice.amount} €/pers.`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => void confirm(selected)}
            className="w-full rounded-2xl bg-[#FF385C] hover:bg-[#E31C5F] text-white font-bold py-3.5 min-h-[52px] disabled:opacity-50 shadow-sm transition-colors text-[15px]"
          >
            {saving
              ? '…'
              : selectedPrice
                ? `Réserver · ${selectedPrice.amount} € / pers.`
                : 'Réserver cet hôtel'}
          </button>
          <PaymentCardMarks className="mt-2.5" />
        </div>
      </div>
    )
  }

  return (
    <section className="w-full">
      <div className="flex items-start justify-between gap-3 mb-3 sm:mb-5">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#FF385C]">
            Composer le voyage
          </p>
          <h2 className="text-xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 sm:mt-1 leading-tight">
            {cityLabel ? `Hôtel à ${cityLabel}` : 'Choisis ton hôtel'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl">
            Prix hôtel seulement
            {nightCap != null ? ` · ≤ ~${Math.round(nightCap)} €/nuit` : ''}.
          </p>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="shrink-0 text-sm font-semibold text-slate-500 hover:text-slate-900 min-h-[44px] px-1"
        >
          Plus tard
        </button>
      </div>

      {/* Vol — compact mobile / détail expandable */}
      <div className="mb-3 sm:mb-5 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setFlightExpanded((v) => !v)}
          className="w-full flex items-center gap-2 px-3.5 py-3 text-left min-h-[52px] lg:hidden"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Ton vol
              {flightBooked ? ' · réservé' : ' · à part'}
            </p>
            <p className="text-sm font-extrabold text-slate-900 truncate mt-0.5">
              {[outLabel, retLabel].filter(Boolean).join(' → ') || 'Dates'}
              {flightPriceLabel ? ` · ${flightPriceLabel}` : ''}
            </p>
            <p className="text-[11px] text-slate-500 truncate">
              {originLabel} → {arrivalLabel}
              {carrier.airlineName ? ` · ${carrier.airlineName}` : ''}
            </p>
          </div>
          <span className="text-slate-400 text-lg font-bold shrink-0" aria-hidden>
            {flightExpanded ? '▴' : '▾'}
          </span>
        </button>

        <div
          className={`${
            flightExpanded ? 'block' : 'hidden'
          } lg:flex lg:flex-row lg:items-stretch border-t border-slate-100 lg:border-0 px-3.5 py-3 lg:px-4 lg:py-3.5 gap-3 lg:gap-5`}
        >
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="hidden lg:flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Ton vol
              </p>
              {flightBooked ? (
                <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                  Réservé
                </span>
              ) : (
                <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full">
                  À réserver à part
                </span>
              )}
              {carrier.airlineName ? (
                <span className="text-[11px] font-semibold text-slate-600">
                  {carrier.airlineName}
                  {stopsLabel ? ` · ${stopsLabel}` : ''}
                </span>
              ) : stopsLabel ? (
                <span className="text-[11px] font-semibold text-slate-600">
                  {stopsLabel}
                </span>
              ) : null}
              {flightPriceLabel ? (
                <span className="text-[11px] font-bold text-slate-800 tabular-nums">
                  {flightPriceLabel}
                </span>
              ) : null}
            </div>

            <div className="grid sm:grid-cols-2 gap-2.5">
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Aller
                </p>
                <p className="text-sm font-extrabold text-slate-900 mt-0.5">
                  {outLabel || '—'}
                  {outTime ? (
                    <span className="tabular-nums">
                      {' '}
                      · {outTime}
                      {outArrTime ? ` → ${outArrTime}` : ''}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-600 mt-1 leading-snug">
                  <span className="font-semibold text-slate-800">{originLabel}</span>
                  <span className="text-slate-400"> → </span>
                  <span className="font-semibold text-slate-800">{arrivalLabel}</span>
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Retour
                </p>
                <p className="text-sm font-extrabold text-slate-900 mt-0.5">
                  {retLabel || '—'}
                  {retTime ? (
                    <span className="tabular-nums">
                      {' '}
                      · {retTime}
                      {retArrTime ? ` → ${retArrTime}` : ''}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-600 mt-1 leading-snug">
                  <span className="font-semibold text-slate-800">{arrivalLabel}</span>
                  <span className="text-slate-400"> → </span>
                  <span className="font-semibold text-slate-800">{originLabel}</span>
                </p>
              </div>
            </div>
          </div>
          {carrier.url ? (
            <div className="shrink-0 flex lg:flex-col lg:justify-center">
              <a
                href={carrier.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full lg:w-[11.5rem] items-center justify-center rounded-xl border border-slate-900 bg-slate-900 text-white text-sm font-bold px-4 py-2.5 min-h-[48px] hover:bg-slate-800 text-center"
              >
                {flightBooked
                  ? 'Voir / gérer le vol'
                  : carrier.ctaLabel || 'Réserver le vol'}
              </a>
            </div>
          ) : null}
        </div>
      </div>

      {!loading && options.length > 0 ? (
        <div className="sticky top-14 z-10 -mx-3 px-3 sm:mx-0 sm:px-0 mb-3 sm:mb-5 bg-[#F7F7F7]/95 backdrop-blur-sm py-2">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none touch-pan-x pb-0.5 -mb-0.5">
            {(
              [
                ['price', 'Prix'],
                ['rating', 'Notes'],
                ['distance', 'Proches'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSort(key)}
                className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-bold min-h-[40px] transition-colors ${
                  sort === key
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-700 border border-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
            <span className="shrink-0 text-xs font-semibold text-slate-400 pl-1">
              {options.length} logement{options.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mb-4 text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
          {error}
        </p>
      ) : null}

      <div className="lg:grid lg:grid-cols-[minmax(300px,0.88fr)_minmax(0,1.42fr)] lg:gap-6 lg:items-start">
        {/* Liste */}
        <div className="min-w-0">
          {loading ? (
            <ul className="space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <li
                  key={i}
                  className="h-[108px] rounded-2xl bg-gradient-to-r from-slate-100 via-white to-slate-100 bg-[length:200%_100%] animate-[shimmer_2s_infinite] border border-slate-100"
                />
              ))}
            </ul>
          ) : null}

          {!loading && sorted.length > 0 ? (
            <ul className="space-y-2.5">
              {sorted.map((h, idx) => {
                const id = hotelKey(h, idx)
                const active = hotelIdOf(selected) === hotelIdOf(h)
                const dist = formatDistance(h.distance_m)
                const station = formatStationDistance(h)
                const board = boardLabelFr(h.board)
                const price = hotelOnlyPrice(h)
                const photo = h.photo || h.thumbnail

                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => selectHotel(h)}
                      className={`w-full text-left flex gap-3 rounded-2xl border bg-white p-2.5 sm:p-3 transition-all active:scale-[0.99] ${
                        active
                          ? 'border-slate-900 shadow-[0_0_0_1px_#111827]'
                          : 'border-slate-200 hover:border-slate-400 hover:shadow-sm'
                      }`}
                    >
                      <div className="relative w-[96px] sm:w-[120px] aspect-[4/5] sm:aspect-auto sm:h-[96px] shrink-0 rounded-xl overflow-hidden bg-slate-100 self-stretch min-h-[104px]">
                        {photo ? (
                          <img
                            src={photo}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-slate-300 to-slate-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 flex flex-col py-0.5 min-h-[104px]">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-bold text-slate-900 text-[15px] leading-snug line-clamp-2">
                            {h.name || 'Hôtel'}
                          </p>
                          {price ? (
                            <p className="shrink-0 text-base font-extrabold text-slate-900 tabular-nums">
                              {price.amount} €
                            </p>
                          ) : null}
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <StarRow stars={h.stars} />
                          {h.rating != null ? (
                            <span>
                              {Number(h.rating).toFixed(1)}/10
                              {h.review_count != null && h.review_count > 0
                                ? ` · ${Number(h.review_count).toLocaleString('fr-FR')} avis`
                                : ''}
                            </span>
                          ) : null}
                        </p>
                        <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
                          {(board || dist) && (
                            <p className="line-clamp-1">
                              {[board, dist].filter(Boolean).join(' · ')}
                            </p>
                          )}
                          {station ? (
                            <p className="inline-flex items-center gap-1 line-clamp-1 text-slate-600">
                              <StationIcon className="w-3 h-3 shrink-0 text-slate-500" />
                              <span className="truncate">{station}</span>
                            </p>
                          ) : !board && !dist ? (
                            <p>—</p>
                          ) : null}
                        </div>
                        <p className="mt-auto pt-1 text-[10px] font-semibold text-slate-400 flex items-center justify-between gap-2">
                          <span>{price?.label || 'prix hôtel'}</span>
                          <span className="lg:hidden text-[#FF385C] font-bold">Voir →</span>
                        </p>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}

          {!loading && !sorted.length && !error ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              Aucun hôtel pour ces dates.
            </p>
          ) : null}
        </div>

        {/* Fiche détail — desktop sticky only */}
        <aside
          ref={detailRef}
          className="hidden lg:block min-w-0 lg:sticky lg:top-[4.25rem] lg:h-[calc(100vh-4.75rem)] lg:max-h-[calc(100vh-4.75rem)]"
        >
          {isDesktop && selected ? (
            <motion.div
              key={hotelIdOf(selected)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="h-full"
            >
              {renderHotelDetail('aside')}
            </motion.div>
          ) : isDesktop ? (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-16 text-center text-sm text-slate-500 h-full flex items-center justify-center">
              {loading
                ? 'Chargement des hôtels…'
                : 'Sélectionne un hôtel dans la liste'}
            </div>
          ) : null}
        </aside>
      </div>

      {/* Fiche plein écran — mobile */}
      {typeof document !== 'undefined' && !isDesktop && mobileSheet && selected
        ? createPortal(
            <AnimatePresence>
              <motion.div
                key={`sheet-${hotelIdOf(selected)}`}
                className="fixed inset-0 z-[100] flex flex-col bg-white"
                role="dialog"
                aria-modal="true"
                aria-label={selected.name || 'Détail hôtel'}
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              >
                {renderHotelDetail('sheet')}
              </motion.div>
            </AnimatePresence>,
            document.body,
          )
        : null}

      {typeof document !== 'undefined' && bodyLightbox != null && galleryPhotos[bodyLightbox]
        ? createPortal(
            <AnimatePresence>
              <motion.div
                key="body-lightbox"
                className="fixed inset-0 z-[210] flex flex-col bg-ink"
                role="dialog"
                aria-modal="true"
                aria-label="Photos de l’hôtel"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  paddingTop: 'env(safe-area-inset-top)',
                  paddingBottom: 'env(safe-area-inset-bottom)',
                }}
              >
                <div className="flex items-center justify-between gap-3 px-3 sm:px-6 py-2.5 text-white shrink-0">
                  <p className="font-bold truncate text-sm sm:text-base min-w-0">
                    {selected?.name || 'Hôtel'}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold tabular-nums text-white/90">
                      {bodyLightbox + 1} / {galleryPhotos.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setBodyLightbox(null)}
                      className="w-11 h-11 rounded-full bg-white/15 text-white text-2xl font-bold"
                      aria-label="Fermer"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="relative flex-1 flex items-center justify-center min-h-0 px-2 sm:px-16">
                  {galleryPhotos.length > 1 ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setBodyLightbox((i) =>
                            i == null ? i : Math.max(0, i - 1),
                          )
                        }
                        className="hidden sm:flex absolute left-4 z-10 w-11 h-11 rounded-full bg-white/15 text-white items-center justify-center"
                        aria-label="Photo précédente"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setBodyLightbox((i) =>
                            i == null
                              ? i
                              : Math.min(galleryPhotos.length - 1, i + 1),
                          )
                        }
                        className="hidden sm:flex absolute right-4 z-10 w-11 h-11 rounded-full bg-white/15 text-white items-center justify-center"
                        aria-label="Photo suivante"
                      >
                        ›
                      </button>
                    </>
                  ) : null}
                  <img
                    src={galleryPhotos[bodyLightbox].url}
                    alt=""
                    className="max-h-full max-w-full object-contain select-none"
                    draggable={false}
                  />
                </div>
              </motion.div>
            </AnimatePresence>,
            document.body,
          )
        : null}
    </section>
  )
}
