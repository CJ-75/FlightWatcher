import { motion } from 'framer-motion'
import { dealAdults, dealBadgeLabels } from '@flightwatcher/shared'
import type { TravelDeal } from '../types'
import { useI18n } from '../contexts/I18nContext'
import { DealCardGallery } from './DealCardGallery'

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

function formatDateShort(dateStr: string) {
  const date = new Date(dateStr + 'T12:00:00')
  const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc']
  return `${date.getDate()} ${months[date.getMonth()]}`
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
  const { t } = useI18n()
  const hotelPhoto = (deal.hotel?.photo || deal.image_url || '').trim()
  if (!hotelPhoto) return null
  const seedPhotos = [
    ...(deal.hotel?.photos || []),
    hotelPhoto,
  ].filter((u, i, arr) => u && arr.indexOf(u) === i)

  const adults = dealAdults(deal)
  const stars = Number(deal.hotel_stars || deal.hotel?.stars || 0)
  const hotelName = deal.hotel_name || deal.hotel?.name || 'Hôtel'
  // Card: short route (IATA / city). Full airport names live in detail.
  const origin =
    deal.origin_iata ||
    deal.departure_airport ||
    (deal.origin_airport_label || '').split(/[,(]/)[0]?.trim() ||
    ''
  const dest = deal.city
  const chip =
    deal.flight?.direct
      ? 'Direct'
      : deal.flags?.verified_label
        ? 'Vérifié'
        : dealBadgeLabels(deal)[0] || null

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springConfig}
      whileHover={{ y: -4, transition: { duration: 0.18 } }}
      className="group flex flex-col h-full rounded-3xl overflow-hidden bg-white border border-line shadow-soft hover:shadow-lift hover:border-primary-200 transition-all duration-200"
    >
      <div className="relative">
        <DealCardGallery
          hotelId={deal.hotel?.id}
          seedPhotos={seedPhotos}
          alt={hotelName}
          onOpen={onClick}
        />

        <span
          className={`absolute top-3 left-3 z-[3] text-[11px] font-bold px-2.5 py-1 rounded-full shadow-soft min-h-[24px] inline-flex items-center justify-center pointer-events-none ${
            deal.badge ? 'bg-accent-500 text-white' : 'invisible'
          }`}
        >
          {deal.badge || '—'}
        </span>

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
            className={`absolute top-3 right-3 z-[3] w-10 h-10 rounded-full flex items-center justify-center shadow-soft transition-colors ${
              liked
                ? 'bg-white text-primary-500'
                : 'bg-white/95 text-ink-soft hover:text-primary-500'
            }`}
          >
            <HeartSvg filled={!!liked} />
          </span>
        ) : null}

        <div className="absolute bottom-3 left-3 right-14 z-[2] pointer-events-none">
          <p className="text-white text-xl sm:text-2xl font-extrabold tracking-tight truncate drop-shadow">
            {deal.city}
          </p>
          {deal.country ? (
            <p className="text-white/85 text-xs font-medium mt-0.5 truncate drop-shadow">
              {deal.country}
            </p>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={onClick}
        className="text-left w-full flex flex-col flex-1 gap-2 p-3.5 sm:p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-2xl sm:text-[1.75rem] font-extrabold text-primary-500 tracking-tight leading-none tabular-nums">
              {Math.round(deal.price_per_person)} €
            </p>
            <p className="text-[11px] text-muted font-medium mt-1 truncate">
              / pers. · {deal.nights}n · {adults} ad.
            </p>
          </div>
          <div className="shrink-0 rounded-xl bg-primary-50 border border-primary-100 px-2.5 py-1.5 text-right">
            <p className="text-[11px] font-bold text-primary-800 leading-tight tabular-nums">
              {formatDateShort(deal.dates.outbound)}
            </p>
            <p className="text-[10px] font-semibold text-primary-500 leading-none my-0.5">↓</p>
            <p className="text-[11px] font-bold text-primary-800 leading-tight tabular-nums">
              {formatDateShort(deal.dates.inbound)}
            </p>
          </div>
        </div>

        <p className="text-xs font-semibold text-ink truncate">
          {origin || '—'}
          <span className="text-slate-300 mx-1">→</span>
          {dest}
          {chip ? (
            <span className="ml-1.5 font-bold text-emerald-700">· {chip}</span>
          ) : null}
        </p>

        <p className="text-sm font-bold text-ink truncate">
          {stars > 0 ? `${'★'.repeat(Math.min(5, Math.round(stars)))} ` : ''}
          {hotelName}
        </p>
      </button>
    </motion.article>
  )
}
