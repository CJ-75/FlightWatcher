import { motion } from 'framer-motion'
import { cityDisplayNameFr } from '@flightwatcher/shared'
import type { EnrichedTripResponse } from '../types'
import { useI18n } from '../contexts/I18nContext'

type Props = {
  trip: EnrichedTripResponse
  busy?: boolean
  onOpenTrip: () => void
  onClose: () => void
}

const spring = { type: 'spring' as const, stiffness: 320, damping: 28, mass: 0.55 }

/**
 * Shown right after partner tab opens — CTA launches Mon voyage compose.
 */
export function PostBookLightbox({ trip, busy, onOpenTrip, onClose }: Props) {
  const { t } = useI18n()
  const city = cityDisplayNameFr(
    trip.destination_code,
    trip.aller?.destinationFull?.split(',')[0]?.trim(),
  )

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-ink/50 backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 24, opacity: 0 }}
        transition={spring}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-3xl sm:rounded-3xl border border-line shadow-lift w-full max-w-md overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-book-title"
      >
        <div className="p-5 sm:p-6 space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-primary-600">
              FlightWatcher
            </p>
            <h2
              id="post-book-title"
              className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight"
            >
              {t('upsell.flightBooked', { city })}
            </h2>
            <p className="text-sm text-muted leading-relaxed">
              {t('upsell.lightboxHint')}
            </p>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={onOpenTrip}
            className="w-full app-btn-primary min-h-[48px] sm:min-h-[52px] text-sm sm:text-base rounded-2xl disabled:opacity-60"
          >
            {busy ? '…' : t('upsell.yesHotel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="w-full text-center text-sm font-semibold text-ink-soft hover:text-ink min-h-[40px]"
          >
            {t('upsell.notYet')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
