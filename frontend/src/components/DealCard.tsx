import { useEffect, useRef, useState } from 'react'
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

function DealDateRange({
  outbound,
  inbound,
  outTime,
  retTime,
}: {
  outbound: string
  inbound: string
  outTime?: string | null
  retTime?: string | null
}) {
  const out = parseDealDate(outbound)
  const ret = parseDealDate(inbound)
  const label = [
    `${out.dow} ${out.day} ${out.month}${outTime ? ` ${outTime}` : ''}`,
    `${ret.dow} ${ret.day} ${ret.month}${retTime ? ` ${retTime}` : ''}`,
  ].join(' → ')
  return (
    <div
      className="shrink-0 inline-flex items-stretch rounded-xl bg-primary-50 border border-primary-100 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
      aria-label={label}
    >
      <DateCell {...out} time={outTime} />
      <div className="w-px self-stretch bg-primary-200/80" aria-hidden />
      <DateCell {...ret} time={retTime} />
    </div>
  )
}

function DateCell({
  dow,
  day,
  month,
  time,
}: {
  dow: string
  day: number
  month: string
  time?: string | null
}) {
  return (
    <div className="w-[3.35rem] px-1 py-1 text-center">
      <p className="text-[8px] font-bold uppercase tracking-[0.05em] text-primary-700/70 leading-none">
        {dow}
      </p>
      <p className="text-[1.05rem] font-black text-primary-900 tabular-nums leading-none mt-0.5 tracking-tight">
        {day}
      </p>
      <p className="text-[9px] font-semibold text-primary-600/85 leading-none mt-0.5">
        {month}
      </p>
      {time ? (
        <p className="text-[9px] font-bold text-primary-800 tabular-nums leading-none mt-1 pt-1 border-t border-primary-100/90">
          {time}
        </p>
      ) : null}
    </div>
  )
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

function BagSvg() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
      <rect x="4" y="8" width="16" height="13" rx="2" />
      <path d="M10 12h4" />
    </svg>
  )
}

/** Icon-only baggage; full policy on click (mobile-friendly). */
function BaggageTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={text}
        aria-expanded={open}
        title={text}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          setOpen((v) => !v)
        }}
        className="inline-flex items-center justify-center rounded-lg border border-line bg-canvas text-ink-soft w-7 h-7 hover:border-primary-200 hover:text-primary-700"
      >
        <BagSvg />
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 max-w-[70vw] rounded-xl border border-line bg-white px-3 py-2 text-[11px] font-medium text-ink shadow-lift leading-snug"
          onClick={(e) => e.stopPropagation()}
        >
          {text}
        </span>
      ) : null}
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

  const baggageLine = (deal.baggage_line || '').trim()
  const pills: { label: string; tone: 'neutral' | 'good' }[] = []
  if (deal.flight?.direct) pills.push({ label: 'Vol direct', tone: 'good' })
  if (board) pills.push({ label: board, tone: 'neutral' })
  if (deal.hotel?.refundable || dealBadgeLabels(deal).includes('Annul. gratuite')) {
    pills.push({ label: 'Annul. gratuite', tone: 'good' })
  }
  const showPills = pills.slice(0, 3)

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

      <div className="flex flex-col flex-1 min-h-0 p-3.5 sm:p-4 gap-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-lg sm:text-xl font-extrabold text-ink tracking-tight leading-snug line-clamp-2">
              {(deal.title || '').trim() &&
              !(deal.title || '').startsWith('Week-end')
                ? deal.title
                : city}
            </p>
            {hook ? (
              <p className="text-sm font-semibold text-ink-soft leading-snug line-clamp-2">
                {hook}
              </p>
            ) : null}
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
              {origin ? (
                <p className="text-[11px] text-muted mt-1 truncate">depuis {origin}</p>
              ) : null}
            </div>
          </div>
          <DealDateRange
            outbound={deal.dates.outbound}
            inbound={deal.dates.inbound}
            outTime={outTime}
            retTime={retTime}
          />
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

        {showPills.length > 0 || baggageLine ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {showPills.map((p) => (
              <SoftChip key={p.label} tone={p.tone}>
                {p.label}
              </SoftChip>
            ))}
            {baggageLine ? <BaggageTip text={baggageLine} /> : null}
          </div>
        ) : null}

        <div className="mt-auto pt-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClick()
            }}
            className="w-full inline-flex items-center justify-center rounded-2xl bg-primary-500 hover:bg-primary-600 text-white font-bold text-sm min-h-[44px] px-4 shadow-sm active:scale-[0.98] transition-all"
          >
            {t('deals.viewOffer')}
          </button>
        </div>
      </div>
    </motion.article>
  )
}
