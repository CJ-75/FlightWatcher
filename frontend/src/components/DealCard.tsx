import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  dealBadgeLabels,
  dealAdults,
  formatFetchedAt,
  resolveTripImageUrl,
} from '@flightwatcher/shared'
import type { TravelDeal } from '../types'
import { useI18n } from '../contexts/I18nContext'

interface DealCardProps {
  deal: TravelDeal
  onClick: () => void
  liked?: boolean
  onToggleLike?: () => void
}

const springConfig = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 28,
  mass: 0.5,
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr + 'T12:00:00')
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
  const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc']
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`
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

export function DealCard({ deal, onClick, liked, onToggleLike }: DealCardProps) {
  const { t, language } = useI18n()
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const hotelPhoto = (deal.hotel?.photo || deal.image_url || '').trim()
  // Pas de fallback image ville : sans photo hôtel on n'affiche pas le deal
  if (!hotelPhoto) return null
  const imageUrl = resolveTripImageUrl({ city: deal.city, imageUrl: hotelPhoto })
  const badges = dealBadgeLabels(deal)
  const adults = dealAdults(deal)
  const fees = deal.price_breakdown?.excluded_fees ?? 0
  const age = formatFetchedAt(deal.fetched_at, language === 'en' ? 'en-GB' : 'fr-FR')
  const total2 = Math.round(deal.price_per_person * Math.min(2, adults))

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springConfig}
      whileHover={{ y: -4, transition: { duration: 0.18 } }}
      className="group flex flex-col h-full rounded-3xl overflow-hidden bg-white border border-line shadow-soft hover:shadow-lift hover:border-primary-200 transition-all duration-200"
    >
      <button
        type="button"
        onClick={onClick}
        className="relative w-full h-44 sm:h-48 bg-line shrink-0 overflow-hidden text-left"
      >
        {!imageFailed ? (
          <>
            {!imageLoaded && (
              <div className="absolute inset-0 bg-gradient-to-r from-primary-100 via-primary-50 to-primary-100 bg-[length:200%_100%] animate-[shimmer_2s_infinite]" />
            )}
            <img
              src={imageUrl}
              alt={deal.hotel?.name || deal.hotel_name || deal.city}
              className={`absolute inset-0 h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.04] ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageFailed(true)}
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
            <span className="text-white text-2xl font-extrabold tracking-tight px-4 text-center">
              {deal.city}
            </span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/15 to-transparent" />

        {deal.badge ? (
          <span className="absolute top-3 left-3 bg-accent-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-soft">
            {deal.badge}
          </span>
        ) : null}

        {onToggleLike ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onToggleLike()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                e.preventDefault()
                onToggleLike()
              }
            }}
            aria-label={liked ? t('card.removeFavorite') : t('card.addFavorite')}
            className={`absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center shadow-soft transition-colors ${
              liked
                ? 'bg-white text-primary-500'
                : 'bg-white/95 text-ink-soft hover:text-primary-500'
            }`}
          >
            <HeartSvg filled={!!liked} />
          </span>
        ) : null}

        <div className="absolute bottom-3 left-3 right-3">
          <p className="text-white text-xl font-extrabold tracking-tight truncate">{deal.city}</p>
          <p className="text-white/85 text-xs font-medium mt-0.5 truncate">
            {deal.country}
            {deal.origin_airport_label || deal.departure_airport
              ? ` · depuis ${deal.origin_airport_label || deal.departure_airport}`
              : ''}
          </p>
        </div>
      </button>

      <div className="flex flex-col flex-1 p-4 sm:p-5 gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-3xl font-extrabold text-primary-500 tracking-tight leading-none">
              {Math.round(deal.price_per_person)} €
            </p>
            <p className="text-xs text-muted font-medium mt-1">
              {t('deals.perPersonHint', { nights: deal.nights, adults })}
            </p>
            {deal.price_pax_note ? (
              <p className="text-[11px] text-muted mt-0.5">{deal.price_pax_note}</p>
            ) : adults >= 2 ? (
              <p className="text-[11px] text-muted mt-0.5">
                {t('deals.totalForTwo', { total: total2 })}
              </p>
            ) : null}
          </div>
          <span className="shrink-0 rounded-xl bg-primary-50 text-primary-700 text-[11px] font-bold px-2.5 py-2 text-right leading-snug">
            {formatDate(deal.dates.outbound)}
            <br />
            → {formatDate(deal.dates.inbound)}
          </span>
        </div>

        {badges.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {badges.map((b) => (
              <span
                key={b}
                className="rounded-full border border-line bg-canvas px-2.5 py-1 text-[11px] font-semibold text-ink-soft"
              >
                {b}
              </span>
            ))}
          </div>
        ) : null}

        {deal.baggage_line || deal.route_hint || deal.distance_label ? (
          <div className="flex flex-col gap-1 text-[11px] text-ink-soft leading-snug">
            {deal.baggage_line ? <p>{deal.baggage_line}</p> : null}
            {deal.route_hint ? <p className="text-muted">{deal.route_hint}</p> : null}
            {!deal.route_hint && deal.distance_label ? (
              <p className="text-muted">{deal.distance_label}</p>
            ) : null}
          </div>
        ) : null}

        <div className="min-w-0">
          <h3 className="font-bold text-ink text-sm sm:text-base leading-snug line-clamp-2">
            {deal.title}
          </h3>
          {deal.hotel_name || deal.hotel?.name ? (
            <p className="text-muted text-sm mt-1 truncate">
              {(deal.hotel_stars || deal.hotel?.stars)
                ? `${'★'.repeat(Math.min(5, Math.round(Number(deal.hotel_stars || deal.hotel?.stars))))} `
                : ''}
              {deal.hotel_name || deal.hotel?.name}
            </p>
          ) : null}
          {deal.hotel?.rating != null ? (
            <p className="text-[11px] text-muted mt-0.5">
              {t('deals.reviews', {
                rating: Number(deal.hotel.rating).toFixed(1),
                count: deal.hotel.review_count ?? '—',
              })}
              {deal.hotel.distance_m != null
                ? ` · ${t('deals.distance', { km: (deal.hotel.distance_m / 1000).toFixed(1) })}`
                : ''}
            </p>
          ) : null}
        </div>

        {fees > 0 ? (
          <p className="text-[11px] text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5 font-medium">
            {t('deals.taxOnSite', { fees: Math.round(fees) })}
          </p>
        ) : null}

        {age ? (
          <p className="text-[11px] text-muted">{t('deals.priceAge', { age })}</p>
        ) : null}

        <div className="mt-auto pt-1">
          <button
            type="button"
            onClick={onClick}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 text-white font-bold text-sm min-h-[44px] px-4 shadow-glow-orange hover:scale-[1.02] active:scale-[0.98] transition-transform"
          >
            {t('deals.viewOffer')}
          </button>
        </div>
      </div>
    </motion.article>
  )
}
