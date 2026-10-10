import { motion, AnimatePresence } from 'framer-motion'
import { resolveTripImageUrl } from '@flightwatcher/shared'
import type { TravelDeal } from '../types'

interface DealDetailModalProps {
  deal: TravelDeal | null
  onClose: () => void
  liked?: boolean
  onToggleLike?: () => void
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

const PROVIDER_LABEL: Record<string, string> = {
  mock: 'Offre partenaire',
  expedia: 'Expedia',
  lastminute: 'lastminute.com',
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

export function DealDetailModal({ deal, onClose, liked, onToggleLike }: DealDetailModalProps) {
  if (!deal) return null

  const partner = PROVIDER_LABEL[deal.provider] || 'Partenaire'

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <button
          type="button"
          aria-label="Fermer"
          className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
          onClick={onClose}
        />
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          className="relative z-10 w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-lift border border-line"
        >
          <div className="relative h-52 sm:h-64">
            <img
              src={resolveTripImageUrl({ city: deal.city, imageUrl: deal.image_url })}
              alt={deal.city}
              className="w-full h-full object-cover"
            />
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

          <div className="p-5 sm:p-6">
            <p className="text-3xl font-black text-primary-500">
              {Math.round(deal.price_per_person)} €
            </p>
            <p className="text-sm text-slate-500 mb-3">
              par personne · {deal.nights} nuit{deal.nights > 1 ? 's' : ''}
            </p>
            <h3 className="text-xl font-bold text-slate-900 mb-2">{deal.title}</h3>
            <p className="text-slate-600 text-sm leading-relaxed mb-5">{deal.description}</p>

            <div className="rounded-xl border border-slate-100 bg-slate-50 divide-y divide-slate-100 mb-5">
              <Row label="Départ" value={deal.departure_airport} />
              <Row
                label="Dates"
                value={`${formatDate(deal.dates.outbound)} → ${formatDate(deal.dates.inbound)}`}
              />
              {deal.hotel_name ? (
                <Row
                  label="Hôtel"
                  value={`${deal.hotel_name}${deal.hotel_stars ? ` · ${deal.hotel_stars}★` : ''}`}
                />
              ) : null}
              {deal.board ? <Row label="Pension" value={deal.board} /> : null}
            </div>

            {deal.highlights.length > 0 ? (
              <div className="mb-5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                  Inclus
                </p>
                <ul className="space-y-1.5">
                  {deal.highlights.map((h) => (
                    <li key={h} className="text-sm text-slate-800 flex gap-2">
                      <span className="text-primary-500 font-bold">·</span>
                      {h}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="text-xs text-slate-400 mb-4">
              Offre via {partner}. Les prix et disponibilités sont confirmés sur le site partenaire.
            </p>

            <a
              href={deal.booking_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center bg-primary-500 hover:bg-primary-600 text-white font-bold py-3.5 rounded-xl transition-colors"
            >
              Voir l’offre
            </a>
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
