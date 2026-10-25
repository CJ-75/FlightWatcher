import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  dealAdults,
  formatFetchedAt,
  pricePpWithHotel,
} from '@flightwatcher/shared'
import type { TravelDeal, TravelDealHotel, TravelDealRelated } from '../types'
import { useI18n } from '../contexts/I18nContext'
import { getApiClient } from '../utils/apiClient'
import { DealCheckoutFlow } from './DealCheckoutFlow'
import { DealComplianceNotice } from './DealComplianceNotice'
import { HotelPhotoGallery } from './HotelPhotoGallery'

interface DealDetailModalProps {
  deal: TravelDeal | null
  onClose: () => void
  liked?: boolean
  onToggleLike?: () => void
  onNeedLogin?: () => void
  /** Lot E — open Search prefilled with origin / dest / pax. */
  onOtherDates?: () => void
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatDateShort(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  })
}

function formatTime(iso?: string | null) {
  if (!iso || typeof iso !== 'string') return null
  const raw = iso.trim()
  if (!raw || raw === '—' || raw === '--') return null
  try {
    // Prefer explicit clock from ISO-like strings (avoids TZ shift)
    const m = raw.match(/T(\d{2}):(\d{2})/)
    if (m) return `${m[1]}:${m[2]}`
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return null
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return null
  }
}

/** Community deals use out_dep_local / ret_dep_local; assembled deals use *_local. */
function flightLegTimes(flight?: TravelDeal['flight'] | null) {
  if (!flight) return { out: null as string | null, ret: null as string | null }
  const out = formatTime(flight.outbound_local || flight.out_dep_local)
  const ret = formatTime(flight.inbound_local || flight.ret_dep_local)
  return { out, ret }
}

function HeartSvg({ filled }: { filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

function FactChip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' }) {
  const toneClass =
    tone === 'good'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
      : tone === 'warn'
        ? 'bg-amber-50 text-amber-900 border-amber-100'
        : 'bg-slate-50 text-slate-700 border-slate-100'
  return (
    <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${toneClass}`}>
      {children}
    </span>
  )
}

function whatsappShareUrl(deal: TravelDeal) {
  const price = Math.round(deal.price_per_person)
  const city = deal.city || 'ce séjour'
  const origin =
    deal.origin_airport_label || deal.departure_airport || deal.origin_iata || ''
  const link =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?deal=${encodeURIComponent(deal.deal_key || deal.id)}`
      : ''
  const text = [
    `Bon plan ${city} : ${price} € / pers. vol + hôtel`,
    origin ? `depuis ${origin}` : null,
    deal.hook || null,
    link,
  ]
    .filter(Boolean)
    .join(' — ')
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

export function DealDetailModal({
  deal: dealProp,
  onClose,
  liked,
  onToggleLike,
  onNeedLogin,
  onOtherDates,
}: DealDetailModalProps) {
  const { t, language } = useI18n()
  const navigate = useNavigate()
  const [deal, setDeal] = useState<TravelDeal | null>(dealProp)
  const [startingTrip, setStartingTrip] = useState(false)
  const [composingHotel, setComposingHotel] = useState(false)
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [checkout, setCheckout] = useState(false)
  const [bookingEnabled, setBookingEnabled] = useState(true)

  useEffect(() => {
    setDeal(dealProp)
    setHotelId(null)
    setCheckout(false)
  }, [dealProp])

  useEffect(() => {
    if (!dealProp) return
    const key = dealProp.deal_key || dealProp.id
    if (!key) return
    let cancelled = false
    void getApiClient()
      .getDeal(key)
      .then((full) => {
        if (cancelled || !full) return
        setDeal((prev) => ({
          ...(prev || dealProp),
          ...full,
          why_good: full.why_good || prev?.why_good || dealProp.why_good,
          related_deals: full.related_deals || prev?.related_deals,
          hook: full.hook || prev?.hook || dealProp.hook,
        }))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [dealProp])

  useEffect(() => {
    void fetch('/api/config')
      .then((r) => r.json())
      .then((cfg) => setBookingEnabled(cfg?.booking_enabled !== false))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!deal) return
    try {
      const raw = sessionStorage.getItem('fw_book_hotel')
      if (!raw) return
      const data = JSON.parse(raw) as { deal_key?: string }
      const key = deal.deal_key || deal.id
      if (data.deal_key && data.deal_key === key) {
        sessionStorage.removeItem('fw_book_hotel')
        setCheckout(true)
      }
    } catch {
      /* ignore */
    }
  }, [deal])

  const hotelOptions = useMemo(() => {
    if (!deal) return [] as TravelDealHotel[]
    const primary = deal.hotel
      ? [deal.hotel]
      : deal.hotel_name
        ? [
            {
              id: 'primary',
              name: deal.hotel_name,
              stars: deal.hotel_stars,
              board: deal.board,
              public_hotel_price: deal.price_breakdown?.hotel_public_total,
              excluded_fees: deal.price_breakdown?.excluded_fees,
              photo: deal.image_url,
            } as TravelDealHotel,
          ]
        : []
    const alts = deal.alt_hotels || []
    const seen = new Set<string>()
    const out: TravelDealHotel[] = []
    for (const h of [...primary, ...alts]) {
      if (!h?.id || seen.has(h.id)) continue
      seen.add(h.id)
      out.push(h)
    }
    return out
  }, [deal])

  if (!deal) return null

  if (checkout) {
    return (
      <DealCheckoutFlow
        deal={deal}
        hotelId={hotelId || deal.hotel?.id}
        onClose={() => {
          setCheckout(false)
          onClose()
        }}
        onNeedLogin={() => onNeedLogin?.()}
      />
    )
  }

  const selected =
    hotelOptions.find((h) => h.id === (hotelId || hotelOptions[0]?.id)) || hotelOptions[0]
  const adults = dealAdults(deal)
  const hotelTotal =
    selected?.public_hotel_price ??
    deal.price_breakdown?.hotel_public_total ??
    0
  const pricePp = selected
    ? pricePpWithHotel(deal, hotelTotal)
    : deal.price_per_person
  const flightPp = Math.round(deal.price_breakdown?.flight_pp ?? deal.flight?.price_pp ?? 0)
  const fees =
    selected?.excluded_fees ?? deal.price_breakdown?.excluded_fees ?? 0
  const verifiedLabel = deal.flags?.verified_label
  const age = verifiedLabel
    ? null
    : formatFetchedAt(deal.fetched_at, language === 'en' ? 'en-GB' : 'fr-FR')
  const hotelPhoto = (
    selected?.photo ||
    deal.hotel?.photo ||
    deal.image_url ||
    ''
  ).trim()
  if (!hotelPhoto) return null
  const seedPhotos = [
    ...(selected?.photos || deal.hotel?.photos || []),
    hotelPhoto,
  ].filter((u, i, arr) => u && arr.indexOf(u) === i)
  const flightUrl = deal.flight?.booking_url || ''
  const hasPartnerUrl = Boolean(deal.booking_url)

  const hotelName = selected?.name || deal.hotel_name || 'Hôtel'
  const stars = Number(selected?.stars || deal.hotel_stars || 0)
  const distanceM = selected?.distance_m ?? deal.hotel?.distance_m
  const rating = selected?.rating
  const board = selected?.board || deal.board
  const { out: outTime, ret: inTime } = flightLegTimes(deal.flight)
  const totalForParty = Math.round(pricePp * adults)

  const buildDraftPayload = async (opts?: { composeHotel?: boolean }) => {
    let booking = flightUrl || deal.booking_url
    let flightPpLive = deal.flight?.price_pp
    let priceNote: string | null = deal.price_pax_note || null
    const key = deal.deal_key || deal.id
    if (adults > 2 && key) {
      try {
        const rv = await getApiClient().revalidateDealFlight(key, adults)
        if (rv.booking_url) booking = rv.booking_url
        if (rv.checked_pp != null) flightPpLive = rv.checked_pp
        if (rv.price_note) priceNote = rv.price_note
        else if (rv.available === false) priceNote = 'Vol à confirmer pour ce nombre de voyageurs'
        else if (rv.delta_pct != null && Math.abs(rv.delta_pct) >= 3) {
          priceNote = `Prix vérifié pour ${adults} voyageurs`
        }
      } catch {
        /* keep displayed */
      }
    }
    return {
      deal_key: key,
      origin_iata: deal.origin_iata || deal.departure_airport,
      departure_airport: deal.origin_airport_label || deal.departure_airport,
      destination: deal.destination || deal.flight?.destination_iata,
      city: deal.city,
      dates: deal.dates,
      adults,
      flight: {
        ...deal.flight,
        price_pp: flightPpLive ?? deal.flight?.price_pp,
        booking_url: booking,
        destination_iata:
          deal.flight?.destination_iata || deal.destination || undefined,
      },
      hotel: selected || deal.hotel,
      price_per_person: pricePp,
      booking_url: booking,
      price_pax_note: priceNote,
      baggage_line: deal.baggage_line,
      route_hint: deal.route_hint,
      compose_hotel: Boolean(opts?.composeHotel),
    }
  }

  const startMyTrip = async () => {
    setStartingTrip(true)
    try {
      const draft = await getApiClient().createMyTrip(await buildDraftPayload())
      onClose()
      navigate(`/trip/${draft.draft_token}`)
    } catch {
      if (flightUrl) window.open(flightUrl, '_blank', 'noopener,noreferrer')
    } finally {
      setStartingTrip(false)
    }
  }

  /** Create draft with locked flight → Mon voyage compose (switch hotel). */
  const startComposeHotel = async () => {
    setComposingHotel(true)
    try {
      const draft = await getApiClient().createMyTrip(
        await buildDraftPayload({ composeHotel: true }),
      )
      onClose()
      navigate(`/trip/${draft.draft_token}?compose=1`)
    } catch {
      /* stay on modal — user can retry */
    } finally {
      setComposingHotel(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="app-dialog-root"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <button
          type="button"
          aria-label="Fermer"
          className="app-dialog-backdrop"
          onClick={onClose}
        />
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          className="app-dialog-panel app-dialog-2xl max-h-[94vh] overflow-y-auto overscroll-contain"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <HotelPhotoGallery
            hotelId={selected?.id || deal.hotel?.id}
            seedPhoto={hotelPhoto}
            seedPhotos={seedPhotos}
            alt={hotelName}
            hotelName={hotelName}
            cityLabel={[deal.city, deal.country].filter(Boolean).join(' · ')}
            language={language === 'en' ? 'en' : 'fr'}
            topRight={
              <>
              {onToggleLike ? (
                <button
                  type="button"
                  onClick={onToggleLike}
                  aria-label={liked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  className={`w-9 h-9 rounded-full shadow flex items-center justify-center ${
                    liked ? 'bg-white text-primary-500' : 'bg-white/95 text-slate-600'
                  }`}
                >
                  <HeartSvg filled={!!liked} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-white/95 text-slate-800 font-bold shadow"
              >
                ×
              </button>
              </>
            }
            bottomLeft={
              <div className="sm:hidden">
                {deal.badge ? (
                  <span className="inline-block bg-accent-500 text-white text-xs font-bold px-3 py-1 rounded-full mb-2">
                    {deal.badge}
                  </span>
                ) : null}
                <h2 className="text-white text-2xl font-black drop-shadow">{deal.city}</h2>
                <p className="text-white/85 text-sm drop-shadow">{deal.country}</p>
            </div>
            }
          />

          <div className="p-5 sm:p-6 space-y-6">
            {/* 1. Decision header */}
            <header className="space-y-3">
              <div className="hidden sm:block">
              {deal.badge ? (
                <span className="inline-block bg-accent-500 text-white text-xs font-bold px-3 py-1 rounded-full mb-2">
                  {deal.badge}
                </span>
              ) : null}
                <h2 className="text-2xl sm:text-[1.75rem] font-black text-ink tracking-tight leading-tight">
                  {(deal.title || '').trim() && !(deal.title || '').startsWith('Week-end')
                    ? deal.title
                    : deal.city}
                  {deal.country ? (
                    <span className="text-slate-400 font-bold text-lg sm:text-xl">
                      {' '}
                      · {deal.country}
                    </span>
                  ) : null}
                </h2>
                {deal.hook ? (
                  <p className="text-sm font-semibold text-ink-soft mt-1">{deal.hook}</p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Prix du pack
                  </p>
                  <p className="text-4xl font-black text-primary-500 tracking-tight leading-none tabular-nums">
                    {Math.round(pricePp)} €
                    <span className="text-base font-bold text-slate-500 ml-1.5">/ pers.</span>
                  </p>
                  <p className="text-sm text-slate-600 mt-2 font-medium">
                    {deal.nights} nuit{deal.nights > 1 ? 's' : ''} · {adults} voyageur
                    {adults > 1 ? 's' : ''}
                    {adults >= 2 ? (
                      <span className="text-slate-400"> · soit {totalForParty} € à {adults}</span>
                    ) : null}
                  </p>
                </div>
                <div className="rounded-2xl bg-primary-50 border border-primary-100 px-4 py-3 text-right min-w-[9.5rem]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary-700/70 mb-1">
                    Week-end
                  </p>
                  <p className="text-sm font-black text-primary-800 leading-snug">
                    {formatDateShort(deal.dates.outbound)}
                    <span className="text-primary-400 mx-1">→</span>
                    {formatDateShort(deal.dates.inbound)}
                  </p>
                  <p className="text-[11px] text-primary-700/80 mt-1 font-medium line-clamp-2 max-w-[9rem] sm:max-w-none">
                    depuis {deal.origin_airport_label || deal.departure_airport || '—'}
                  </p>
            </div>
          </div>

              {/* Quick decision facts */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {deal.flight?.direct ? <FactChip tone="good">Vol direct</FactChip> : null}
                {deal.flight?.airline ? <FactChip>{deal.flight.airline}</FactChip> : null}
                {board ? <FactChip>{board}</FactChip> : null}
                {selected?.refundable ? <FactChip tone="good">Annulation gratuite</FactChip> : null}
                {stars > 0 ? <FactChip>{Math.round(stars)}★</FactChip> : null}
                {rating != null ? (
                  <FactChip tone={Number(rating) >= 8 ? 'good' : 'neutral'}>
                    {Number(rating).toFixed(1)}/10
                    {selected?.review_count != null ? ` · ${selected.review_count} avis` : ''}
                  </FactChip>
                ) : null}
                {distanceM != null ? (
                  <FactChip>
                    {distanceM < 1000
                      ? `${Math.round(distanceM)} m du centre`
                      : `${(distanceM / 1000).toFixed(1)} km du centre`}
                  </FactChip>
                ) : null}
                {verifiedLabel ? (
                  <FactChip tone="good">{verifiedLabel}</FactChip>
                ) : age ? (
                  <FactChip>Prix {age}</FactChip>
                ) : null}
                {fees > 0 ? (
                  <FactChip tone="warn">+{Math.round(fees)} € taxe sur place</FactChip>
                ) : null}
              </div>

              {deal.price_pax_note ? (
                <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 font-medium">
                  {deal.price_pax_note}
                </p>
              ) : null}

              {(deal.why_good?.length || deal.hook) ? (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800/70 mb-2">
                    {t('deals.whyGood')}
                  </p>
                  <ul className="space-y-1.5">
                    {(deal.why_good?.length
                      ? deal.why_good
                      : deal.hook
                        ? [deal.hook]
                        : []
                    ).map((b) => (
                      <li
                        key={b}
                        className="text-sm text-emerald-950 font-medium flex gap-2 items-start"
                      >
                        <span className="text-emerald-600 font-black shrink-0">✓</span>
                        <span className="leading-snug">{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </header>

            {/* 2. Pack at a glance — Vol | Hôtel */}
            <section className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-line bg-white p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {t('deals.flight')}
                  </p>
                  <p className="text-sm font-black text-ink tabular-nums">{flightPp} €</p>
                </div>
                {/* Mobile: stacked full names; desktop: one line */}
                <div className="sm:hidden space-y-0.5">
                  <p className="text-sm font-bold text-ink leading-snug">
                    {deal.origin_airport_label || deal.departure_airport || '—'}
                  </p>
                  <p className="text-[10px] text-slate-300 leading-none">↓</p>
                  <p className="text-sm font-bold text-ink leading-snug">
                    {deal.arrival_airport_label || deal.city}
                  </p>
                </div>
                <p className="hidden sm:block text-sm font-bold text-ink leading-snug">
                  {deal.origin_airport_label || deal.departure_airport || '—'}
                  <span className="text-slate-300 mx-1.5">→</span>
                  {deal.arrival_airport_label || deal.city}
                </p>
                <div className="mt-2 space-y-1.5 text-xs text-slate-600">
                  <p className="flex justify-between gap-3">
                    <span className="text-slate-400 font-semibold">Aller</span>
                    <span className="font-semibold text-ink text-right">
                      {formatDate(deal.dates.outbound)}
                      {outTime ? ` · ${outTime}` : ''}
                    </span>
                  </p>
                  <p className="flex justify-between gap-3">
                    <span className="text-slate-400 font-semibold">Retour</span>
                    <span className="font-semibold text-ink text-right">
                      {formatDate(deal.dates.inbound)}
                      {inTime ? ` · ${inTime}` : ''}
                    </span>
                  </p>
                  {deal.flight?.direct ? (
                    <p className="text-emerald-700 font-semibold pt-0.5">Vol direct</p>
                  ) : null}
                </div>
                {deal.baggage_line ? (
                  <p className="text-xs text-slate-600 mt-2 pt-2 border-t border-slate-100">
                    {deal.baggage_line}
                  </p>
                ) : null}
                {deal.route_hint ? (
                  <p className="text-[11px] text-slate-400 mt-1">{deal.route_hint}</p>
                ) : null}
            </div>

              <div className="rounded-2xl border border-line bg-white p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {t('deals.hotel')}
                  </p>
                  <p className="text-sm font-black text-ink tabular-nums">
                    {Math.round(hotelTotal)} €
                    <span className="text-[10px] font-semibold text-slate-400 ml-1">total</span>
                  </p>
                </div>
                <p className="text-sm font-bold text-ink leading-snug line-clamp-2">
                  {stars > 0 ? `${'★'.repeat(Math.min(5, Math.round(stars)))} ` : ''}
                  {hotelName}
                </p>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  {[
                    board,
                    rating != null ? `${Number(rating).toFixed(1)}/10` : null,
                    distanceM != null
                      ? distanceM < 1000
                        ? `${Math.round(distanceM)} m centre`
                        : `${(distanceM / 1000).toFixed(1)} km centre`
                      : null,
                    selected?.refundable ? 'Annul. gratuite' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || `${deal.nights} nuit${deal.nights > 1 ? 's' : ''}`}
                </p>
                {selected?.cancel_deadline ? (
                  <p className="text-[11px] text-emerald-700 mt-2 pt-2 border-t border-slate-100 font-medium">
                    Annul. avant {formatDate(selected.cancel_deadline.slice(0, 10))}
                  </p>
                ) : null}
              </div>
            </section>

            {/* 3. Price transparency */}
            <section className="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
                {t('deals.priceBreakdown')}
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">{t('deals.flightPp')}</span>
                  <span className="font-semibold text-ink tabular-nums">{flightPp} €</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">
                    {t('deals.hotelTotal')}
                    <span className="text-slate-400"> / {adults}</span>
                  </span>
                  <span className="font-semibold text-ink tabular-nums">
                    {adults > 0 ? Math.round(hotelTotal / adults) : Math.round(hotelTotal)} €
                  </span>
                </div>
                {fees > 0 ? (
                  <div className="flex justify-between gap-3 text-amber-800">
                    <span>Taxe sur place</span>
                    <span className="font-semibold tabular-nums">+{Math.round(fees)} €</span>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3 pt-2 border-t border-slate-200/80">
                  <span className="font-bold text-ink">Total / pers.</span>
                  <span className="font-black text-primary-600 tabular-nums text-base">
                    {Math.round(pricePp)} €
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
                {t('deals.twoBookings')}
              </p>
            </section>

            {/* 4. Hotel alternatives — decision switcher */}
            {hotelOptions.length > 1 ? (
              <section>
                <div className="flex items-baseline justify-between gap-2 mb-3">
                  <h3 className="text-sm font-bold text-ink">
                    {deal.city
                      ? `Hôtels à ${deal.city}`
                      : 'Choisir l’hôtel'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {hotelOptions.length} option{hotelOptions.length > 1 ? 's' : ''}
                  </p>
                </div>
                <div className="grid gap-2">
                  {hotelOptions.map((h) => {
                    const active = h.id === (selected?.id || '')
                    const hTotal = h.public_hotel_price ?? 0
                    const hPp = pricePpWithHotel(deal, hTotal || hotelTotal)
                    const thumb = h.photo || h.photos?.[0]
                    const delta = Math.round(hPp - pricePp)
                    return (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => setHotelId(h.id)}
                        className={`text-left rounded-2xl border px-3 py-3 transition-colors ${
                          active
                            ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-200'
                            : 'border-line bg-white hover:border-primary-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt=""
                              className="w-14 h-14 rounded-xl object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-xl bg-slate-100 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm text-ink truncate">
                              {h.stars
                                ? `${'★'.repeat(Math.min(5, Math.round(Number(h.stars))))} `
                                : ''}
                              {h.name || 'Hôtel'}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                              {[
                                h.board,
                                h.refundable ? 'Annul. gratuite' : null,
                                h.rating != null ? `${Number(h.rating).toFixed(1)}/10` : null,
                                h.distance_m != null
                                  ? `${(h.distance_m / 1000).toFixed(1)} km`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-black text-primary-600 tabular-nums">
                              {Math.round(hPp)} €
                            </p>
                            {!active && delta !== 0 ? (
                              <p
                                className={`text-[10px] font-bold ${
                                  delta > 0 ? 'text-slate-400' : 'text-emerald-600'
                                }`}
                              >
                                {delta > 0 ? `+${delta}` : delta} €
                              </p>
                            ) : active ? (
                              <p className="text-[10px] font-bold text-primary-500">Sélectionné</p>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            ) : null}

            {deal.highlights?.length ? (
              <ul className="grid sm:grid-cols-2 gap-2">
                {deal.highlights.slice(0, 4).map((h) => (
                  <li
                    key={h}
                    className="text-sm text-slate-700 flex gap-2 items-start rounded-xl bg-slate-50 px-3 py-2"
                  >
                    <span className="text-primary-500 font-black shrink-0">✓</span>
                    <span className="leading-snug">{h}</span>
                    </li>
                  ))}
                </ul>
            ) : null}

            {(deal.related_deals?.length ?? 0) > 0 ? (
              <section>
                <h3 className="text-sm font-bold text-ink mb-3">
                  {t('deals.relatedOptions')}
                </h3>
                <div className="grid gap-2">
                  {(deal.related_deals as TravelDealRelated[]).slice(0, 5).map((r) => {
                    const from =
                      r.origin_airport_label ||
                      r.departure_airport ||
                      r.origin_iata ||
                      '—'
                    const dates =
                      r.dates?.outbound && r.dates?.inbound
                        ? `${formatDateShort(r.dates.outbound)} → ${formatDateShort(r.dates.inbound)}`
                        : null
                    return (
                      <button
                        key={r.deal_key || r.id}
                        type="button"
                        onClick={() => {
                          if (r.deal_key || r.id) {
                            void getApiClient()
                              .getDeal(String(r.deal_key || r.id))
                              .then((full) => {
                                if (full) {
                                  setDeal(full)
                                  setHotelId(null)
                                }
                              })
                              .catch(() => undefined)
                          }
                        }}
                        className="text-left rounded-2xl border border-line bg-white hover:border-primary-200 px-3 py-3 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-ink truncate">
                              depuis {from}
                            </p>
                            <p className="text-[11px] text-muted mt-0.5 truncate">
                              {[dates, r.nights != null ? `${r.nights} nuits` : null, r.hook]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                          <p className="text-sm font-black text-primary-500 tabular-nums shrink-0">
                            {Math.round(r.price_per_person || 0)} €
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            ) : null}

            <p className="text-[11px] text-slate-400 leading-relaxed">
              {verifiedLabel || t('deals.methodLine')}
            </p>

            <DealComplianceNotice
              cancelDeadline={selected?.cancel_deadline || deal.hotel?.cancel_deadline}
            />

            <div className="flex flex-col gap-2 pb-20 sm:pb-2">
              <a
                href={whatsappShareUrl(deal)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full text-center border border-line bg-white hover:bg-slate-50 text-ink font-semibold py-3 rounded-xl transition-colors"
              >
                {t('deals.shareWhatsApp')}
              </a>
              <button
                type="button"
                onClick={() => void startComposeHotel()}
                disabled={composingHotel || startingTrip}
                className="w-full text-center border-2 border-primary-200 bg-primary-50 hover:bg-primary-100 text-primary-800 font-bold py-3 rounded-xl transition-colors disabled:opacity-60"
              >
                {composingHotel
                  ? '…'
                  : (
                    <>
                      <span className="sm:hidden">Modifier l’hôtel</span>
                      <span className="hidden sm:inline">Modifier l’hôtel · composer le voyage</span>
                    </>
                  )}
              </button>
              {onOtherDates ? (
                <button
                  type="button"
                  onClick={onOtherDates}
                  className="w-full text-center border border-line bg-white hover:bg-slate-50 text-ink font-semibold py-3 rounded-xl transition-colors"
                >
                  {t('deals.otherDates')}
                </button>
              ) : null}
              {deal.provider === 'liteapi' || (deal.deal_key && deal.hotel) ? (
                bookingEnabled ? (
                  <button
                    type="button"
                    onClick={() => setCheckout(true)}
                    className="w-full text-center border border-line bg-white hover:bg-slate-50 text-ink font-semibold py-3 rounded-xl transition-colors text-sm"
                  >
                    Réserver l’hôtel seul
                  </button>
                ) : null
              ) : hasPartnerUrl ? (
            <a
              href={deal.booking_url}
              target="_blank"
              rel="noopener noreferrer"
                  className="block w-full text-center border border-line bg-white hover:bg-slate-50 text-ink font-bold py-3 rounded-xl transition-colors"
                >
                  {t('deals.viewOffer')}
                </a>
              ) : null}
            </div>
          </div>

          <div
            className="sticky bottom-0 z-20 border-t border-line bg-white/95 backdrop-blur-md px-4 py-3 sm:px-6 flex items-center gap-3"
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-lg font-black text-primary-500 leading-none tabular-nums">
                {Math.round(pricePp)} €
                <span className="text-xs font-semibold text-slate-500 ml-1">/ pers.</span>
              </p>
              <p className="text-[11px] text-slate-500 truncate mt-0.5">
                {formatDateShort(deal.dates.outbound)} → {formatDateShort(deal.dates.inbound)}
                {' · '}
                {deal.nights}n
                {adults >= 2 ? ` · ${totalForParty} € à ${adults}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void startMyTrip()}
              disabled={startingTrip}
              className="shrink-0 bg-primary-500 hover:bg-primary-600 text-white font-bold px-5 py-3 rounded-xl transition-colors disabled:opacity-60 shadow-sm"
            >
              {startingTrip ? '…' : 'Continuer'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
