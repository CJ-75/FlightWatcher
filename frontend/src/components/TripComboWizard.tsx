import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  buildBookingUrl,
  cityDisplayNameFr,
  dateFromFlightIso,
} from '@flightwatcher/shared'
import type { EnrichedTripResponse } from '../types'
import { getApiClient } from '../utils/apiClient'

interface Props {
  trip: EnrichedTripResponse
  passengers?: number
  /** Budget saisi à la recherche — reserved for MyTrip compose. */
  searchBudget?: number | null
  onClose: () => void
  onSaveFavorite?: () => void
  onNeedLogin?: () => void
}

const spring = { type: 'spring' as const, stiffness: 320, damping: 28, mass: 0.55 }

function formatShort(iso?: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/**
 * Search → Mon voyage. Hotel choice lives only in MyTrip compose
 * (no duplicate hotel picker here).
 */
export function TripComboWizard({
  trip,
  passengers = 1,
  onClose,
  onSaveFavorite,
}: Props) {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const city = cityDisplayNameFr(
    trip.destination_code,
    trip.aller?.destinationFull?.split(',')[0]?.trim(),
  )
  const flightPp = Number(trip.prix_total) || 0
  const pax = Math.min(6, Math.max(1, passengers || 1))
  const checkin = dateFromFlightIso(trip.aller?.departureTime)
  const checkout = dateFromFlightIso(trip.retour?.departureTime)
  const flightUrl = buildBookingUrl(trip, pax)

  const createAndGo = async (composeHotel: boolean) => {
    if (!checkin || !checkout || !trip.destination_code) {
      setCreateError('Dates ou destination manquantes')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const draft = await getApiClient().createMyTrip({
        origin_iata: trip.aller?.origin,
        departure_airport: trip.aller?.origin,
        destination: trip.destination_code,
        city,
        dates: {
          outbound: checkin,
          inbound: checkout,
        },
        adults: pax,
        compose_hotel: composeHotel,
        flight: {
          price_pp: flightPp,
          provider: trip.provider,
          airline: trip.airline,
          booking_url: flightUrl,
          direct: (trip.transfers ?? 0) === 0,
          origin_iata: trip.aller?.origin,
          destination_iata: trip.destination_code,
        },
        price_per_person: Math.round(flightPp),
        booking_url: flightUrl,
      })
      onClose()
      navigate(
        composeHotel
          ? `/trip/${draft.draft_token}?compose=1`
          : `/trip/${draft.draft_token}`,
      )
    } catch {
      setCreateError('Impossible de créer le voyage — réessaie')
    } finally {
      setCreating(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-ink/50 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={spring}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-3xl sm:rounded-3xl border border-line shadow-lift w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Composer ton voyage"
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">
            Ton vol
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 font-bold text-slate-700"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-6">
          <h2 className="text-2xl font-black text-ink tracking-tight mt-1">
            {city}
          </h2>
          <p className="text-muted text-sm mt-1">
            {formatShort(trip.aller?.departureTime)} →{' '}
            {formatShort(trip.retour?.departureTime)}
            {pax > 1 ? ` · ${pax} voyageurs` : ''}
          </p>
          <p className="text-4xl font-extrabold text-primary-500 mt-5 tracking-tight">
            {Math.round(flightPp)} €
            <span className="text-base font-semibold text-muted ml-2">
              / pers. vol A/R
            </span>
          </p>
          <p className="text-sm text-muted mt-3 leading-relaxed">
            Enregistre le vol, puis ajoute un hôtel dans Mon voyage si tu veux.
          </p>

          <div className="mt-8 space-y-3">
            <button
              type="button"
              disabled={creating}
              onClick={() => void createAndGo(false)}
              className="w-full rounded-2xl bg-primary-500 text-white font-bold py-3.5 hover:bg-primary-600 transition-colors disabled:opacity-50"
            >
              {creating ? 'Création…' : 'Créer mon voyage'}
            </button>
            <button
              type="button"
              disabled={creating}
              onClick={() => void createAndGo(true)}
              className="w-full rounded-2xl bg-slate-100 text-slate-800 font-semibold py-3 hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              Créer et ajouter un hôtel
            </button>
            <a
              href={flightUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center text-sm font-medium text-muted py-2"
            >
              Réserver le vol seulement
            </a>
            {onSaveFavorite && (
              <button
                type="button"
                onClick={onSaveFavorite}
                className="block w-full text-sm font-medium text-muted py-1"
              >
                Sauvegarder en favori
              </button>
            )}
          </div>
          {createError && (
            <p className="text-sm text-red-600 mt-3 text-center">{createError}</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
