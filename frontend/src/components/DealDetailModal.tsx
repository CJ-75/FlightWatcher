import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  dealAdults,
  formatFetchedAt,
  pricePpWithHotel,
  resolveTripImageUrl,
} from '@flightwatcher/shared'
import type { TravelDeal, TravelDealHotel } from '../types'
import { useI18n } from '../contexts/I18nContext'
import { DealCheckoutFlow } from './DealCheckoutFlow'

interface DealDetailModalProps {
  deal: TravelDeal | null
  onClose: () => void
  liked?: boolean
  onToggleLike?: () => void
  onNeedLogin?: () => void
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatTime(iso?: string) {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) {
      const m = iso.match(/T(\d{2}:\d{2})/)
      return m ? m[1] : null
    }
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return null
  }
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

export function DealDetailModal({
  deal,
  onClose,
  liked,
  onToggleLike,
  onNeedLogin,
}: DealDetailModalProps) {
  const { t, language } = useI18n()
  const [hotelId, setHotelId] = useState<string | null>(null)
  const [checkout, setCheckout] = useState(false)

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
  const fees =
    selected?.excluded_fees ?? deal.price_breakdown?.excluded_fees ?? 0
  const age = formatFetchedAt(deal.fetched_at, language === 'en' ? 'en-GB' : 'fr-FR')
  const imageUrl = resolveTripImageUrl({
    city: deal.city,
    imageUrl: selected?.photo || deal.image_url,
  })
  const flightUrl = deal.flight?.booking_url || ''
  const hasPartnerUrl = Boolean(deal.booking_url)

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
          className="app-dialog-panel app-dialog-xl max-h-[92vh] overflow-y-auto"
        >
          <div className="relative h-52 sm:h-64">
            <img src={imageUrl} alt={deal.city} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
            <div className="absolute top-3 right-3 flex gap-2">
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
            </div>
            <div className="absolute bottom-3 left-4 right-4">
              {deal.badge ? (
                <span className="inline-block bg-accent-500 text-white text-xs font-bold px-3 py-1 rounded-full mb-2">
                  {deal.badge}
                </span>
              ) : null}
              <h2 className="text-white text-2xl font-black">{deal.city}</h2>
              <p className="text-white/85 text-sm">{deal.country}</p>
            </div>
          </div>

          <div className="p-5 sm:p-6 space-y-5">
            <div>
              <p className="text-3xl font-black text-primary-500">
                {Math.round(pricePp)} €
              </p>
              <p className="text-sm text-slate-500">
                {t('deals.perPersonHint', { nights: deal.nights, adults })}
              </p>
              {adults >= 2 ? (
                <p className="text-xs text-slate-400 mt-0.5">
                  {t('deals.totalForTwo', { total: Math.round(pricePp * 2) })}
                </p>
              ) : null}
              {fees > 0 ? (
                <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5 font-medium mt-2 inline-block">
                  {t('deals.taxOnSite', { fees: Math.round(fees) })}
                </p>
              ) : null}
              {age ? (
                <p className="text-xs text-slate-400 mt-1">{t('deals.priceAge', { age })}</p>
              ) : null}
            </div>

            <h3 className="text-xl font-bold text-slate-900">{deal.title}</h3>
            <p className="text-slate-600 text-sm leading-relaxed">{deal.description}</p>

            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 leading-relaxed">
              {t('deals.twoBookings')}
            </p>

            {/* Flight */}
            <section>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                {t('deals.flight')}
              </p>
              <div className="rounded-xl border border-slate-100 bg-slate-50 divide-y divide-slate-100">
                <Row label="Départ" value={deal.departure_airport} />
                <Row
                  label="Dates"
                  value={`${formatDate(deal.dates.outbound)} → ${formatDate(deal.dates.inbound)}`}
                />
                {deal.flight ? (
                  <>
                    <Row
                      label="Aller"
                      value={[
                        formatTime(deal.flight.outbound_local),
                        deal.flight.direct ? 'Direct' : null,
                        deal.flight.airline,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    />
                    <Row
                      label="Retour"
                      value={formatTime(deal.flight.inbound_local) || '—'}
                    />
                    <Row
                      label="Vol / pers."
                      value={`${Math.round(deal.flight.price_pp)} €`}
                    />
                  </>
                ) : null}
              </div>
            </section>

            {/* Hotel + switcher */}
            <section>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  {t('deals.hotel')}
                </p>
                {hotelOptions.length > 1 ? (
                  <span className="text-[11px] font-semibold text-primary-600">
                    {t('deals.changeHotel')}
                  </span>
                ) : null}
              </div>

              {hotelOptions.length > 1 ? (
                <div className="grid gap-2 mb-3">
                  {hotelOptions.map((h) => {
                    const active = h.id === (selected?.id || '')
                    const hTotal = h.public_hotel_price ?? 0
                    const hPp = pricePpWithHotel(deal, hTotal || hotelTotal)
                    return (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => setHotelId(h.id)}
                        className={`text-left rounded-xl border px-3 py-3 transition-colors ${
                          active
                            ? 'border-primary-400 bg-primary-50'
                            : 'border-slate-100 bg-white hover:border-primary-200'
                        }`}
                      >
                        <div className="flex justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm text-slate-900 truncate">
                              {h.stars ? `${'★'.repeat(Math.min(5, Math.round(Number(h.stars))))} ` : ''}
                              {h.name || 'Hôtel'}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
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
                          <p className="text-sm font-bold text-primary-600 shrink-0">
                            {Math.round(hPp)} €
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : null}

              <div className="rounded-xl border border-slate-100 bg-slate-50 divide-y divide-slate-100">
                <Row
                  label={t('deals.selectedHotel')}
                  value={`${selected?.name || deal.hotel_name || '—'}${
                    selected?.stars || deal.hotel_stars
                      ? ` · ${selected?.stars || deal.hotel_stars}★`
                      : ''
                  }`}
                />
                {(selected?.board || deal.board) ? (
                  <Row label="Pension" value={String(selected?.board || deal.board)} />
                ) : null}
                {selected?.rating != null ? (
                  <Row
                    label="Note"
                    value={t('deals.reviews', {
                      rating: Number(selected.rating).toFixed(1),
                      count: selected.review_count ?? '—',
                    })}
                  />
                ) : null}
              </div>
            </section>

            {/* Breakdown */}
            <section>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                {t('deals.priceBreakdown')}
              </p>
              <div className="rounded-xl border border-slate-100 bg-white divide-y divide-slate-100">
                <Row
                  label={t('deals.flightPp')}
                  value={`${Math.round(deal.price_breakdown?.flight_pp ?? deal.flight?.price_pp ?? 0)} €`}
                />
                <Row
                  label={t('deals.hotelTotal')}
                  value={`${Math.round(hotelTotal)} €`}
                />
                <Row label="Total / pers." value={`${Math.round(pricePp)} €`} />
              </div>
            </section>

            {deal.highlights?.length ? (
              <ul className="space-y-1.5">
                {deal.highlights.map((h) => (
                  <li key={h} className="text-sm text-slate-800 flex gap-2">
                    <span className="text-primary-500 font-bold">·</span>
                    {h}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-col gap-2 pt-1">
              {deal.provider === 'liteapi' || deal.deal_key ? (
                <button
                  type="button"
                  onClick={() => setCheckout(true)}
                  className="w-full text-center bg-primary-500 hover:bg-primary-600 text-white font-bold py-3.5 rounded-xl transition-colors"
                >
                  Réserver l’hôtel
                </button>
              ) : hasPartnerUrl ? (
                <a
                  href={deal.booking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center bg-primary-500 hover:bg-primary-600 text-white font-bold py-3.5 rounded-xl transition-colors"
                >
                  {t('deals.viewOffer')}
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="w-full text-center bg-slate-200 text-slate-500 font-bold py-3.5 rounded-xl cursor-not-allowed"
                >
                  {t('deals.bookHotelSoon')}
                </button>
              )}
              {flightUrl ? (
                <a
                  href={flightUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center border border-line bg-white hover:bg-slate-50 text-ink font-bold py-3 rounded-xl transition-colors"
                >
                  {t('deals.bookFlight')}
                </a>
              ) : null}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}
