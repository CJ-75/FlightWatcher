import {
  cityDisplayNameFr,
  cityImageUrl,
  itineraryMetaLine,
  type Itinerary,
  type ItineraryDurationKind,
} from '@flightwatcher/shared'
import { FwKicker } from '../ui/FwKicker'

type Props = {
  itinerary: Partial<Itinerary> & { title?: string }
  variant?: 'portrait' | 'landscape'
  dealPriceLabel?: string | null
  badge?: string | null
  liked?: boolean
  onOpen?: () => void
  onToggleLike?: () => void
  className?: string
}

/** Carte parcours §6.3 — portrait ou paysage. */
export function ItineraryCard({
  itinerary,
  variant = 'portrait',
  dealPriceLabel,
  badge,
  liked,
  onOpen,
  onToggleLike,
  className = '',
}: Props) {
  const city = itinerary.city_slug
    ? cityDisplayNameFr(null, itinerary.city_slug)
    : ''
  const cover =
    itinerary.cover_image ||
    (itinerary.city_slug ? cityImageUrl(itinerary.city_slug) : null)
  const meta = itineraryMetaLine({
    cityLabel: city || null,
    durationKind: itinerary.duration_kind as ItineraryDurationKind | null,
  })
  const isLandscape = variant === 'landscape'

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`relative overflow-hidden text-left shadow-sm transition-transform active:scale-[0.98] ${
        isLandscape ? 'aspect-[16/10] w-full' : 'aspect-[3/4] w-full'
      } ${className}`}
      style={{ borderRadius: 'var(--fw-radius-card, 24px)' }}
    >
      {cover ? (
        <img
          src={cover}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(160deg, var(--fw-bg-from, #FFF9F5), var(--fw-bg-to, #FFE9DD))',
          }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

      {badge ? (
        <span className="absolute left-3 top-3 rounded-md bg-black px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
          {badge}
        </span>
      ) : null}

      {onToggleLike ? (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            onToggleLike()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              onToggleLike()
            }
          }}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-sm"
          aria-label={liked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        >
          {liked ? '♥' : '♡'}
        </span>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 p-4">
        {!cover && city ? (
          <FwKicker className="mb-1 text-white/80">{city}</FwKicker>
        ) : null}
        <h3
          className={`m-0 line-clamp-2 font-normal italic text-white ${
            isLandscape ? 'text-[34px] leading-tight' : 'text-[26px] leading-snug'
          }`}
          style={{
            fontFamily: '"Instrument Serif", Georgia, serif',
          }}
        >
          {itinerary.title || 'Sans titre'}
        </h3>
        {isLandscape && itinerary.subtitle ? (
          <p className="mt-1 line-clamp-1 text-[13px] text-white/85">
            {itinerary.subtitle}
          </p>
        ) : null}
        {meta ? (
          <p className="mt-1 text-[13px] font-medium text-white/80">{meta}</p>
        ) : null}
        {dealPriceLabel ? (
          <span className="mt-2 inline-block rounded-full bg-white/95 px-2.5 py-1 text-[12px] font-semibold text-[color:var(--fw-ink,#1D1B19)]">
            {dealPriceLabel}
          </span>
        ) : null}
      </div>
    </button>
  )
}
