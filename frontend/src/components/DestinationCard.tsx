import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  cityDisplayNameFr,
  countryIsoForAirport,
  formatAirlineLabel,
  resolveTripImageUrl,
} from '@flightwatcher/shared';
import { EnrichedTripResponse } from '../types';
import { useI18n } from '../contexts/I18nContext';
import { CountryFlag } from './CountryFlag';
import { resolveTripPriceSource } from '../utils/partnerBook';

type CardAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

interface DestinationCardProps {
  trip: EnrichedTripResponse;
  onSaveFavorite: () => void;
  onBook?: () => void;
  /** Secondary text link — create MyTrip hotel compose (no partner popup). */
  onAddHotel?: () => void;
  /** Replaces book CTA (e.g. Accept on a planner proposal) */
  primaryAction?: CardAction;
  secondaryAction?: CardAction;
  isFavorite?: boolean;
  /** Passengers / planner members — drives hotel occupancy (rooms of 2). */
  passengers?: number;
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
  onAddHotel,
  primaryAction,
  secondaryAction,
  isFavorite = false,
  passengers = 1,
}: DestinationCardProps) {
  const { t, language } = useI18n();
  const priceSource = resolveTripPriceSource(trip, passengers, language);
  const bookLabel =
    priceSource.partnerId === 'aviasales'
      ? t('card.bookAviasales')
      : priceSource.partnerId === 'ryanair'
        ? t('card.bookRyanair')
        : t('card.bookOnSite', { site: priceSource.siteLabel });

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

  const destCode = trip.aller.destination || trip.destination_code;
  const cityName = cityDisplayNameFr(destCode, trip.aller.destinationFull);
  const originCity = cityDisplayNameFr(trip.aller.origin, trip.aller.originFull);
  const destIso = countryIsoForAirport(destCode, trip.aller.destinationFull);
  const originIso = countryIsoForAirport(trip.aller.origin, trip.aller.originFull);
  const imageUrl = resolveTripImageUrl({
    city: cityName,
    iata: trip.destination_code,
    imageUrl: trip.image_url,
  });

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const airlineLabel = formatAirlineLabel(trip);
  const legPricesOk = trip.leg_prices_reliable !== false;
  const transfersKnown = trip.transfers != null;

  return (
    <motion.div
      whileHover={{ y: -6, transition: springConfig }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springConfig}
      className="rounded-3xl overflow-hidden bg-white border border-line shadow-soft w-full h-full flex flex-col"
    >
      {/* Fixed hero height on every card — image never changes layout */}
      <div className="relative w-full h-44 sm:h-48 bg-line shrink-0 overflow-hidden">
        {!imageFailed ? (
          <>
            {!imageLoaded && (
              <div className="absolute inset-0 bg-gradient-to-r from-primary-100 via-primary-50 to-primary-100 bg-[length:200%_100%] animate-[shimmer_2s_infinite]" />
            )}
            <img
              src={imageUrl}
              alt={cityName}
              className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-300 ${
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

        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent pointer-events-none" />

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
          <h3 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2 min-w-0">
            <CountryFlag iso={destIso} className="w-6 h-4 sm:w-7 sm:h-[18px]" title={cityName} />
            <span className="truncate">{cityName}</span>
          </h3>
          <p className="text-sm text-white/95 font-bold tracking-wide mt-0.5 flex items-center gap-1.5 min-w-0">
            <CountryFlag iso={originIso} className="w-[18px] h-3" title={originCity} />
            <span className="truncate">{originCity}</span>
            <span className="opacity-80 shrink-0" aria-hidden>
              →
            </span>
            <CountryFlag iso={destIso} className="w-[18px] h-3" title={cityName} />
            <span className="truncate">{cityName}</span>
          </p>
          <div className="mt-2 flex flex-nowrap items-center gap-1.5 h-6 overflow-hidden">
            <span className="text-[11px] font-bold tracking-wide bg-white/25 text-white px-2.5 py-1 rounded-full truncate max-w-[55%]">
              {airlineLabel}
            </span>
            {transfersKnown && (trip.transfers ?? 0) > 0 ? (
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide bg-white/20 text-white px-2 py-0.5 rounded-full">
                {trip.transfers} escale{(trip.transfers || 0) > 1 ? 's' : ''}
              </span>
            ) : transfersKnown ? (
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide bg-emerald-400/90 text-white px-2 py-0.5 rounded-full">
                Direct
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5 bg-white flex flex-col flex-1 min-h-0">
        <div className="flex items-start justify-between gap-3 mb-4 min-h-[3.25rem]">
          <div className="min-w-0">
            <p className="text-3xl sm:text-[2rem] font-extrabold text-primary-500 tracking-tight leading-none">
              {Math.round(trip.prix_total)} €
            </p>
            <p className="text-xs sm:text-sm text-muted font-medium mt-1">{t('card.total')}</p>
          </div>
          {typeof trip.discount_percent === 'number' && trip.discount_percent > 20 ? (
            <span className="shrink-0 bg-primary-50 text-primary-700 text-xs sm:text-sm font-bold px-2.5 py-1.5 rounded-full">
              -{Math.round(trip.discount_percent)}%
            </span>
          ) : (
            <span className="shrink-0 invisible text-xs sm:text-sm font-bold px-2.5 py-1.5 rounded-full" aria-hidden>
              -00%
            </span>
          )}
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
              {legPricesOk && trip.aller.price > 0 ? (
                <p className="text-sm font-bold text-ink-soft">{Math.round(trip.aller.price)} €</p>
              ) : null}
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
              {legPricesOk && trip.retour.price > 0 ? (
                <p className="text-sm font-bold text-ink-soft">{Math.round(trip.retour.price)} €</p>
              ) : null}
            </div>
          </div>
        </div>

        {primaryAction || secondaryAction || onBook || onAddHotel ? (
          <div className="mt-auto flex flex-col gap-2">
            {primaryAction ? (
              <motion.button
                type="button"
                disabled={primaryAction.disabled}
                onClick={primaryAction.onClick}
                whileHover={{ scale: primaryAction.disabled ? 1 : 1.02 }}
                whileTap={{ scale: primaryAction.disabled ? 1 : 0.98 }}
                transition={springConfig}
                className="w-full app-btn-primary min-h-[48px] sm:min-h-[52px] text-sm sm:text-base rounded-2xl disabled:opacity-50"
              >
                {primaryAction.label}
              </motion.button>
            ) : onBook ? (
              <motion.button
                type="button"
                onClick={onBook}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={springConfig}
                className="w-full app-btn-primary min-h-[48px] sm:min-h-[52px] text-sm sm:text-base rounded-2xl"
              >
                {bookLabel}
              </motion.button>
            ) : null}
            {secondaryAction ? (
              <button
                type="button"
                disabled={secondaryAction.disabled}
                onClick={secondaryAction.onClick}
                className="w-full border border-line rounded-2xl min-h-[44px] font-bold text-ink-soft hover:bg-canvas disabled:opacity-50"
              >
                {secondaryAction.label}
              </button>
            ) : onAddHotel ? (
              <button
                type="button"
                onClick={onAddHotel}
                className="w-full text-center text-sm font-semibold text-primary-600 hover:text-primary-700 underline-offset-2 hover:underline min-h-[40px]"
              >
                {t('card.addHotel')}
              </button>
            ) : null}
            {priceSource.secondaryUrl && !primaryAction ? (
              <a
                href={priceSource.secondaryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-xs font-semibold text-slate-500 underline-offset-2 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {t('card.airlineSite', { airline: priceSource.airlineName })}
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
