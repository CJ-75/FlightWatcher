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

const DAYS_SHORT = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam']
const MONTHS_SHORT = [
  'jan',
  'fév',
  'mar',
  'avr',
  'mai',
  'jun',
  'jul',
  'aoû',
  'sep',
  'oct',
  'nov',
  'déc',
]

function parseDealDate(dateStr: string) {
  const date = new Date(dateStr + 'T12:00:00')
  return {
    dow: DAYS_SHORT[date.getDay()],
    day: date.getDate(),
    month: MONTHS_SHORT[date.getMonth()],
  }
}

function formatClock(iso?: string | null) {
  if (!iso) return null
  const m = String(iso).match(/T(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : null
}

function boardLabel(board?: string | null) {
  if (!board) return null
  const b = board.toUpperCase()
  if (b.includes('BI') || /breakfast|petit/i.test(board)) return 'Petit-déj'
  if (b.includes('HB') || /half|demi/i.test(board)) return 'Demi-pension'
  if (b.includes('FB') || /full|pension compl/i.test(board)) return 'Pension complète'
  if (b.includes('AI') || /all.?inclusive/i.test(board)) return 'All inclusive'
  if (b.includes('RO') || /room only|chambre seule/i.test(board)) return null
  return board
}

function distanceLabel(deal: TravelDeal) {
  const m = deal.hotel?.distance_m
  if (m == null) return deal.distance_label || null
  if (m < 800) return 'Centre'
  if (m < 1000) return `${Math.round(m)} m du centre`
  return `${(m / 1000).toFixed(1)} km du centre`
}

function formatDateSpan(outbound: string, inbound: string) {
  const out = parseDealDate(outbound)
  const ret = parseDealDate(inbound)
  const sameMonth = out.month === ret.month
  if (sameMonth) {
    return `${out.dow}. ${out.day} → ${ret.dow}. ${ret.day} ${ret.month}`
  }
  return `${out.dow}. ${out.day} ${out.month} → ${ret.dow}. ${ret.day} ${ret.month}`
}

function isFreshDeal(fetchedAt?: string | null) {
  if (!fetchedAt) return false
  const t = Date.parse(fetchedAt)
  if (Number.isNaN(t)) return false
  return Date.now() - t < 24 * 60 * 60 * 1000
}

/** City / airport name only — never IATA trigrams on cards. */
function cardPlaceLabel(
  label?: string | null,
  fallback?: string | null,
): string {
  const raw = (label || '').trim()
  if (raw) {
    const noCode = raw.replace(/\s*\([A-Z]{3}\)\s*$/i, '').trim()
    const head = noCode.split(/[,–—]/)[0]?.trim() || noCode
    if (head && !/^[A-Z]{3}$/.test(head)) return head
    if (noCode && !/^[A-Z]{3}$/.test(noCode)) return noCode
  }
  const fb = (fallback || '').trim()
  if (fb && !/^[A-Z]{3}$/.test(fb)) return fb
  return ''
}

function SoftChip({ children, tone = 'neutral' }: { children: string; tone?: 'neutral' | 'good' }) {
  return (
    <span
      className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-bold leading-tight ${
        tone === 'good'
          ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
          : 'border-line bg-canvas text-ink-soft'
      }`}
    >
      {children}
    </span>
  )
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
  const origin = cardPlaceLabel(deal.origin_airport_label)
  const city = (deal.city || '').trim() || cardPlaceLabel(deal.arrival_airport_label) || 'Destination'

  const flightPp = Math.round(
    deal.price_breakdown?.flight_pp ?? deal.flight?.price_pp ?? 0,
  )
  const breakdown = deal.price_breakdown as
    | (typeof deal.price_breakdown & { hotel_pp?: number })
    | undefined
  const hotelPp = Math.round(
    breakdown?.hotel_pp ??
      (breakdown?.hotel_public_total != null && adults > 0
        ? breakdown.hotel_public_total / adults
        : Math.max(0, deal.price_per_person - flightPp)),
  )

  const outTime = formatClock(deal.flight?.outbound_local || deal.flight?.out_dep_local)
  const retTime = formatClock(deal.flight?.inbound_local || deal.flight?.ret_dep_local)
  const board = boardLabel(deal.board || deal.hotel?.board)
  const dist = distanceLabel(deal)
  const rating =
    deal.hotel?.rating != null ? Number(deal.hotel.rating).toFixed(1) : null
  const reviews = deal.hotel?.review_count
  const fresh = isFreshDeal(deal.fetched_at)
  const hook = (deal.hook || '').trim()

  const pills: { label: string; tone: 'neutral' | 'good' }[] = []
  if (deal.flight?.direct) pills.push({ label: 'Vol direct', tone: 'good' })
  if (board) pills.push({ label: board, tone: 'neutral' })
  if (deal.baggage_line) {
    pills.push({ label: deal.baggage_line, tone: 'neutral' })
  } else if (deal.hotel?.refundable || dealBadgeLabels(deal).includes('Annul. gratuite')) {
    pills.push({ label: 'Annul. gratuite', tone: 'good' })
  }
  const showPills = pills.slice(0, 3)

  const dateLine = formatDateSpan(deal.dates.outbound, deal.dates.inbound)
  const timesLine = [
    outTime ? `Aller ${outTime}` : null,
    retTime ? `Retour ${retTime}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const priceMeta = [
    `${deal.nights} nuit${deal.nights > 1 ? 's' : ''}`,
    flightPp > 0 || hotelPp > 0
      ? `vol ${flightPp || '—'} € + hôtel ${hotelPp || '—'} €`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const hotelMeta = [
    rating
      ? `${rating}/10${reviews != null ? ` (${reviews.toLocaleString('fr-FR')})` : ''}`
      : null,
    dist,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springConfig}
      whileHover={{ y: -4, transition: { duration: 0.18 } }}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      role="button"
      tabIndex={0}
      className="group flex flex-col h-full rounded-3xl overflow-hidden bg-white border border-line shadow-soft hover:shadow-lift hover:border-primary-200 transition-all duration-200 cursor-pointer text-left"
    >
      <div className="relative">
        <DealCardGallery
          hotelId={deal.hotel?.id}
          seedPhotos={seedPhotos}
          alt={hotelName}
          onOpen={onClick}
        />

        {fresh ? (
          <span className="absolute top-3 left-3 z-[3] text-[11px] font-bold px-2.5 py-1 rounded-full shadow-soft min-h-[24px] inline-flex items-center justify-center pointer-events-none bg-ink text-white">
            {t('deals.newBadge')}
          </span>
        ) : deal.badge ? (
          <span className="absolute top-3 left-3 z-[3] text-[11px] font-bold px-2.5 py-1 rounded-full shadow-soft min-h-[24px] inline-flex items-center justify-center pointer-events-none bg-accent-500 text-white">
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
            className={`absolute top-3 right-3 z-[3] w-10 h-10 rounded-full flex items-center justify-center shadow-soft transition-colors ${
              liked
                ? 'bg-white text-primary-500'
                : 'bg-white/95 text-ink-soft hover:text-primary-500'
            }`}
          >
            <HeartSvg filled={!!liked} />
          </span>
        ) : null}
      </div>

      <div className="flex flex-col flex-1 min-h-0 p-3.5 sm:p-4 space-y-2.5">
        <div className="min-w-0">
          <p className="text-lg sm:text-xl font-extrabold text-ink tracking-tight truncate">
            {city}
            {hook ? (
              <span className="font-semibold text-ink-soft"> · {hook}</span>
            ) : null}
          </p>
        </div>

        <div>
          <p className="text-2xl sm:text-[1.75rem] font-extrabold text-primary-500 tracking-tight leading-none tabular-nums">
            {Math.round(deal.price_per_person)} €{' '}
            <span className="text-sm font-bold text-ink-soft">/ pers.</span>
          </p>
          {priceMeta ? (
            <p className="text-[11px] text-muted font-medium mt-1.5 leading-snug whitespace-nowrap overflow-hidden text-ellipsis">
              {priceMeta}
            </p>
          ) : null}
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink truncate">{dateLine}</p>
          {timesLine ? (
            <p className="text-[11px] text-muted mt-0.5 truncate">{timesLine}</p>
          ) : null}
          {origin ? (
            <p className="text-[11px] text-muted mt-0.5 truncate">depuis {origin}</p>
          ) : null}
        </div>

        <div className="min-w-0">
          <p className="text-sm font-bold text-ink truncate">
            {stars > 0 ? `${'★'.repeat(Math.min(5, Math.round(stars)))} ` : ''}
            {hotelName}
          </p>
          {hotelMeta ? (
            <p className="text-[11px] text-muted mt-0.5 truncate">{hotelMeta}</p>
          ) : null}
        </div>

        {showPills.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {showPills.map((p) => (
              <SoftChip key={p.label} tone={p.tone}>
                {p.label}
              </SoftChip>
            ))}
          </div>
        ) : null}

        <p className="pt-0.5 text-xs font-semibold text-primary-600 group-hover:text-primary-700">
          {t('deals.viewOfferSoft')}
        </p>
      </div>
    </motion.article>
  )
}
