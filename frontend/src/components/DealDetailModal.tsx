import { motion, AnimatePresence } from 'framer-motion'
import type { TravelDeal } from '../types'

interface DealDetailModalProps {
  deal: TravelDeal | null
  onClose: () => void
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

export function DealDetailModal({ deal, onClose }: DealDetailModalProps) {
  if (!deal) return null

  const partner = PROVIDER_LABEL[deal.provider] || 'Partenaire'

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <button
          type="button"
          aria-label="Fermer"
          className="absolute inset-0 bg-black/50"
          onClick={onClose}
        />
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          className="relative z-10 w-full max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl"
        >
          <div className="relative h-48 sm:h-56">
            <img
              src={deal.image_url}
              alt={deal.city}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/95 text-slate-800 font-bold shadow"
            >
              ×
            </button>
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
