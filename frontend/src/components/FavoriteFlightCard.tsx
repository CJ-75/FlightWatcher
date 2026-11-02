/**
 * Favoris vol — même forme que DestinationCard, + statut / archive / n° de vol.
 */
import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  cityDisplayNameFr,
  countryIsoForAirport,
  formatAirlineLabel,
  resolveTripImageUrl,
  type SavedFavorite,
} from '@flightwatcher/shared'
import { CountryFlag } from './CountryFlag'

const springConfig = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 20,
  mass: 0.5,
}

function formatDate(dateStr: string) {
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
  const jsDay = date.getDay()
  const dayIndex = (jsDay === 0 ? 7 : jsDay) - 1
  return `${days[dayIndex]} ${date.getDate()} ${months[date.getMonth()]}`
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

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
  )
}

export function FavoriteFlightCard({
  favorite,
  faded = false,
  bookLabel,
  onBook,
  onRemove,
  onToggleArchive,
}: {
  favorite: SavedFavorite
  faded?: boolean
  bookLabel: string
  onBook: () => void
  onRemove: () => void
  onToggleArchive: () => void
}) {
  const trip = favorite.trip
  const destCode = trip.aller.destination || trip.destination_code
  const cityName = cityDisplayNameFr(destCode, trip.aller.destinationFull)
  const originCity = cityDisplayNameFr(trip.aller.origin, trip.aller.originFull)
  const destIso = countryIsoForAirport(destCode, trip.aller.destinationFull)
  const airlineLabel = formatAirlineLabel(trip)
  const imageUrl = resolveTripImageUrl({
    city: cityName,
    iata: trip.destination_code,
    imageUrl: trip.image_url,
  })
  const [imageLoaded, setImageLoaded] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const legPricesOk = trip.leg_prices_reliable !== false
  const transfersKnown = trip.transfers != null
  const transfers = trip.transfers ?? 0

  return (
    <motion.article
      whileHover={{ y: -6, transition: springConfig }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springConfig}
      className={`rounded-3xl overflow-hidden bg-white border shadow-soft w-full h-full flex flex-col ${
        faded
          ? 'border-slate-200 opacity-55'
          : 'border-line hover:border-orange-200'
      }`}
    >
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

        {favorite.isStillValid !== undefined ? (
          <span
            className={`absolute top-3 left-3 z-[1] inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide backdrop-blur-md ${
              favorite.isStillValid
                ? 'bg-emerald-400/25 text-emerald-50 border border-emerald-300/35'
                : 'bg-red-400/25 text-red-50 border border-red-300/35'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                favorite.isStillValid ? 'bg-emerald-300' : 'bg-red-300'
              }`}
            />
            {favorite.isStillValid ? 'Dispo' : 'Indispo'}
          </span>
        ) : null}

        <motion.button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          className="absolute top-3 right-3 sm:top-3.5 sm:right-3.5 w-11 h-11 rounded-full bg-white/95 shadow-soft flex items-center justify-center text-primary-500"
          aria-label="Retirer des favoris"
          title="Retirer des favoris"
        >
          <HeartSvg filled />
        </motion.button>

        <div className="absolute bottom-0 left-0 right-0 p-3.5 sm:p-4">
          <h3 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2 min-w-0">
            <CountryFlag iso={destIso} className="w-6 h-4 sm:w-7 sm:h-[18px]" title={cityName} />
            <span className="truncate">{cityName}</span>
          </h3>
          <p className="text-sm text-white/95 font-bold tracking-wide mt-0.5 flex items-center gap-1.5 min-w-0">
            <span className="truncate">{originCity}</span>
            <span className="opacity-80 shrink-0" aria-hidden>
              →
            </span>
            <span className="truncate">{cityName}</span>
          </p>
          <div className="mt-2 flex flex-nowrap items-center gap-1.5 h-6 overflow-hidden">
            <span className="text-[11px] font-bold tracking-wide bg-white/25 text-white px-2.5 py-1 rounded-full truncate max-w-[55%]">
              {airlineLabel}
            </span>
            {transfersKnown ? (
              transfers > 0 ? (
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide bg-white/20 text-white px-2 py-0.5 rounded-full">
                  {transfers} escale{transfers > 1 ? 's' : ''}
                </span>
              ) : (
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide bg-emerald-400/90 text-white px-2 py-0.5 rounded-full">
                  Direct
                </span>
              )
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
            <p className="text-xs sm:text-sm text-muted font-medium mt-1">
              par personne · A/R
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-primary-50 mb-4 overflow-hidden">
          {[
            { label: 'Aller', leg: trip.aller },
            { label: 'Retour', leg: trip.retour },
          ].map(({ label, leg }, i) => (
            <div key={label}>
              {i > 0 ? <div className="h-px bg-primary-100 mx-4" /> : null}
              <div className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-primary-700">
                    {label}
                  </p>
                  {leg.flightNumber ? (
                    <p className="font-mono text-[11px] font-bold text-primary-600/80">
                      {leg.flightNumber}
                    </p>
                  ) : null}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink">
                    {formatDate(leg.departureTime)} · {formatTime(leg.departureTime)}
                  </p>
                  {legPricesOk && leg.price > 0 ? (
                    <p className="text-sm font-bold text-ink-soft">
                      {Math.round(leg.price)} €
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-auto flex flex-col gap-2">
          <motion.button
            type="button"
            onClick={onBook}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="w-full min-h-[44px] rounded-2xl bg-primary-500 px-4 text-sm font-bold text-white hover:bg-primary-600"
          >
            {bookLabel}
          </motion.button>
          <button
            type="button"
            onClick={onToggleArchive}
            className="w-full min-h-[40px] rounded-2xl border border-line bg-white px-3.5 text-sm font-bold text-ink-soft hover:bg-canvas"
          >
            {favorite.archived ? 'Désarchiver' : 'Archiver'}
          </button>
        </div>
      </div>
    </motion.article>
  )
}
