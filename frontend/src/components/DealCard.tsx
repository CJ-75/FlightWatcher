import { useState } from 'react'
import { motion } from 'framer-motion'
import type { TravelDeal } from '../types'

interface DealCardProps {
  deal: TravelDeal
  onClick: () => void
  liked?: boolean
  onToggleLike?: () => void
}

const springConfig = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 20,
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
  const [imageLoaded, setImageLoaded] = useState(false)
  const imageUrl =
    deal.image_url ||
    'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=900&q=80&auto=format&fit=crop'

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -8, rotate: 1, transition: springConfig }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springConfig}
      className="rounded-xl sm:rounded-2xl overflow-hidden bg-white shadow-lg sm:shadow-xl max-w-sm w-full mx-auto text-left cursor-pointer relative"
    >
      <div className="relative w-full h-40 sm:h-48 md:h-56">
        {!imageLoaded && (
          <div className="absolute inset-0 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 bg-[length:200%_100%] animate-[shimmer_2s_infinite]" />
        )}
        <img
          src={imageUrl}
          alt={deal.city}
          className="w-full h-full object-cover"
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        {deal.badge ? (
          <span className="absolute top-3 left-3 bg-accent-500 text-white text-xs font-bold px-3 py-1 rounded-full">
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
            aria-label={liked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            className={`absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center shadow ${
              liked ? 'bg-white text-primary-500' : 'bg-white/95 text-slate-500'
            }`}
          >
            <HeartSvg filled={!!liked} />
          </span>
        ) : null}
        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="text-white text-xl sm:text-2xl font-black tracking-tight">{deal.city}</h3>
          <p className="text-white/85 text-sm font-medium mt-0.5">
            {deal.departure_airport} → {deal.city} · {deal.nights} nuit{deal.nights > 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-2xl sm:text-3xl font-black text-primary-500">
              {Math.round(deal.price_per_person)} €
            </p>
            <p className="text-xs sm:text-sm text-slate-500 font-medium">par personne · pack</p>
          </div>
          <span className="bg-primary-50 text-primary-700 text-[11px] sm:text-xs font-bold px-2.5 py-1.5 rounded-full whitespace-nowrap">
            {formatDate(deal.dates.outbound)} → {formatDate(deal.dates.inbound)}
          </span>
        </div>
        <p className="font-bold text-slate-900 text-sm sm:text-base">{deal.title}</p>
        {deal.hotel_name ? (
          <p className="text-slate-500 text-sm mt-1 truncate">
            {deal.hotel_stars ? `${'★'.repeat(Math.min(5, deal.hotel_stars))} ` : ''}
            {deal.hotel_name}
          </p>
        ) : null}
      </div>
    </motion.button>
  )
}
