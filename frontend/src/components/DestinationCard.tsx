import { useState } from 'react';
import { motion } from 'framer-motion';
import { resolveTripImageUrl } from '@flightwatcher/shared';
import { EnrichedTripResponse } from '../types';
import { useI18n } from '../contexts/I18nContext';

interface DestinationCardProps {
  trip: EnrichedTripResponse;
  onSaveFavorite: () => void;
  onBook?: () => void;
  isFavorite?: boolean;
}

const springConfig = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 20,
  mass: 0.5,
};

function HeartSvg({ filled }: { filled: boolean }) {
  return (
    <svg
      width="20"
      height="20"
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
  );
}

export function DestinationCard({
  trip,
  onSaveFavorite,
  onBook,
  isFavorite = false,
}: DestinationCardProps) {
  const { t } = useI18n();

  const getDayOfWeekMondayBased = (date: Date): number => {
    const jsDay = date.getDay();
    return jsDay === 0 ? 7 : jsDay;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
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
    ];
    const dayIndex = getDayOfWeekMondayBased(date) - 1;
    return `${days[dayIndex]} ${date.getDate()} ${months[date.getMonth()]}`;
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const cityName =
    trip.aller.destinationFull?.split(',')[0]?.trim() || trip.destination_code;
  const imageUrl = resolveTripImageUrl({
    city: cityName,
    imageUrl: trip.image_url,
  });

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <motion.div
      whileHover={{ y: -6, transition: springConfig }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springConfig}
      className="rounded-3xl overflow-hidden bg-white border border-line shadow-soft w-full h-full flex flex-col"
    >
      <div className="relative w-full aspect-[5/3] sm:aspect-[16/10] bg-line shrink-0">
        {!imageFailed ? (
          <>
            {!imageLoaded && (
              <div className="absolute inset-0 bg-gradient-to-r from-primary-100 via-primary-50 to-primary-100 bg-[length:200%_100%] animate-[shimmer_2s_infinite]" />
            )}
            <img
              src={imageUrl}
              alt={cityName}
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageFailed(true)}
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
            <span className="text-white text-2xl sm:text-3xl font-extrabold tracking-tight px-4 text-center">
              {cityName}
            </span>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />

        {trip.is_good_deal ? (
          <span className="absolute top-3 left-3 sm:top-3.5 sm:left-3.5 bg-accent-500 text-white text-xs font-bold px-3 py-1.5 rounded-full">
            Bon deal
          </span>
        ) : null}

        <motion.button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSaveFavorite();
          }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          className={`absolute top-3 right-3 sm:top-3.5 sm:right-3.5 w-11 h-11 rounded-full bg-white/95 shadow-soft flex items-center justify-center transition-colors ${
            isFavorite ? 'text-primary-500' : 'text-ink-soft hover:text-primary-500'
          }`}
          aria-label={isFavorite ? t('card.removeFavorite') : t('card.addFavorite')}
        >
          <HeartSvg filled={isFavorite} />
        </motion.button>

        <div className="absolute bottom-0 left-0 right-0 p-3.5 sm:p-4">
          <h3 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight truncate">
            {cityName}
          </h3>
          <p className="text-sm text-white/90 font-medium mt-0.5">
            {trip.aller.origin} → {trip.destination_code}
          </p>
        </div>
      </div>

      <div className="p-4 sm:p-5 bg-white flex flex-col flex-1">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-3xl sm:text-[2rem] font-extrabold text-primary-500 tracking-tight leading-none">
              {Math.round(trip.prix_total)} €
            </p>
            <p className="text-xs sm:text-sm text-muted font-medium mt-1">{t('card.total')}</p>
          </div>
          {typeof trip.discount_percent === 'number' && trip.discount_percent > 20 ? (
            <span className="bg-primary-50 text-primary-700 text-xs sm:text-sm font-bold px-2.5 py-1.5 rounded-full">
              -{Math.round(trip.discount_percent)}%
            </span>
          ) : null}
        </div>

        <div className="rounded-2xl bg-primary-50 mb-4 overflow-hidden">
          <div className="px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary-700 mb-1">
              {t('card.departure')}
            </p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">
                {formatDate(trip.aller.departureTime)} · {formatTime(trip.aller.departureTime)}
              </p>
              <p className="text-sm font-bold text-ink-soft">{Math.round(trip.aller.price)} €</p>
            </div>
          </div>
          <div className="h-px bg-primary-100 mx-4" />
          <div className="px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary-700 mb-1">
              {t('card.return')}
            </p>
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink">
                {formatDate(trip.retour.departureTime)} · {formatTime(trip.retour.departureTime)}
              </p>
              <p className="text-sm font-bold text-ink-soft">{Math.round(trip.retour.price)} €</p>
            </div>
          </div>
        </div>

        <motion.button
          type="button"
          onClick={onBook}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={springConfig}
          className="mt-auto w-full app-btn-primary min-h-[48px] sm:min-h-[52px] text-sm sm:text-base rounded-2xl"
        >
          {t('card.book')}
        </motion.button>
      </div>
    </motion.div>
  );
}
