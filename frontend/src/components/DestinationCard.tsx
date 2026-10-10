import { useState } from 'react';
import { motion } from 'framer-motion';
import { EnrichedTripResponse } from '../types';
import { useI18n } from '../contexts/I18nContext';

interface DestinationCardProps {
  trip: EnrichedTripResponse;
  onSaveFavorite: () => void;
  onBook?: () => void;
  isFavorite?: boolean;
}

const springConfig = {
  type: "spring" as const,
  stiffness: 300,
  damping: 20,
  mass: 0.5
};

const cardHover = {
  y: -8,
  rotate: 1,
  transition: springConfig
};

export function DestinationCard({ trip, onSaveFavorite, onBook, isFavorite = false }: DestinationCardProps) {
  const { t } = useI18n()

  const getDayOfWeekMondayBased = (date: Date): number => {
    const jsDay = date.getDay()
    return jsDay === 0 ? 7 : jsDay
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
    const months = [
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
    const dayIndex = getDayOfWeekMondayBased(date) - 1
    return `${days[dayIndex]} ${date.getDate()} ${months[date.getMonth()]}`
  }

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const cityName = trip.aller.destinationFull.split(',')[0].trim()
  const imageUrl = trip.image_url || `https://source.unsplash.com/800x600/?${cityName}`

  const [imageLoaded, setImageLoaded] = useState(false)

  return (
    <motion.div
      whileHover={cardHover}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springConfig}
      className="rounded-3xl overflow-hidden bg-white border border-line shadow-soft max-w-sm w-full mx-auto"
    >
      <div className="relative w-full h-40 sm:h-48 md:h-56 lg:h-64">
        {!imageLoaded && (
          <div className="absolute inset-0 bg-gradient-to-r from-primary-100 via-primary-50 to-primary-100 bg-[length:200%_100%] animate-[shimmer_2s_infinite]" />
        )}
        <motion.img
          src={imageUrl}
          alt={cityName}
          className="w-full h-full object-cover"
          loading="lazy"
          initial={{ opacity: 0 }}
          animate={{ opacity: imageLoaded ? 1 : 0 }}
          transition={{ duration: 0.3 }}
          onLoad={() => setImageLoaded(true)}
          onError={(e) => {
            ;(e.target as HTMLImageElement).src =
              `https://via.placeholder.com/800x600/FF6B35/FFFFFF?text=${cityName}`
            setImageLoaded(true)
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/25 to-transparent" />

        <motion.button
          onClick={(e) => {
            e.stopPropagation()
            onSaveFavorite()
          }}
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          className={`absolute top-3 right-3 sm:top-4 sm:right-4 text-3xl sm:text-4xl cursor-pointer transition-all min-w-[44px] min-h-[44px] flex items-center justify-center ${
            isFavorite ? 'text-accent-500' : 'text-white/85 hover:text-accent-500'
          }`}
          aria-label={isFavorite ? t('card.removeFavorite') : t('card.addFavorite')}
        >
          {isFavorite ? '❤️' : '🤍'}
        </motion.button>

        <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 md:p-5 lg:p-6">
          <h3 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight mb-1">
            {cityName}
          </h3>
          <p className="text-sm sm:text-base text-white/85 font-medium">
            {trip.aller.destinationFull.split(',')[1]?.trim() || ''}
          </p>
        </div>
      </div>

      <div className="p-4 sm:p-5 md:p-6 bg-white">
        <div className="flex items-baseline gap-2 mb-1 flex-wrap">
          <span className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-primary-500 tracking-tight">
            {trip.prix_total.toFixed(0)}€
          </span>
          {trip.discount_percent && trip.discount_percent > 20 && (
            <motion.span
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              className="inline-block bg-emerald-500 text-white rounded-full px-3 py-1 text-sm font-bold ml-2"
            >
              -{trip.discount_percent.toFixed(0)}%
            </motion.span>
          )}
        </div>
        <p className="text-sm text-muted font-medium mb-4">{t('card.total')}</p>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center">
              <span className="text-primary-500 mr-2">✈️</span>
              <span className="text-muted font-medium">{t('card.departure')}</span>
            </div>
            <div className="text-right">
              <div className="text-ink font-bold">{formatTime(trip.aller.departureTime)}</div>
              <div className="text-xs text-faint">{formatDate(trip.aller.departureTime)}</div>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center">
              <span className="text-primary-500 mr-2">🔙</span>
              <span className="text-muted font-medium">{t('card.return')}</span>
            </div>
            <div className="text-right">
              <div className="text-ink font-bold">{formatTime(trip.retour.departureTime)}</div>
              <div className="text-xs text-faint">{formatDate(trip.retour.departureTime)}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 sm:mt-6">
          <motion.button
            onClick={onBook}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={springConfig}
            className="w-full app-btn-primary min-h-[48px] sm:min-h-[52px] text-sm sm:text-base rounded-full"
          >
            {t('card.book')}
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}

