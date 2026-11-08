import {
  citySlugDisplayNameFr,
  cityImageUrl,
  itineraryMetaLine,
  itineraryUnsplashUrl,
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
    ? citySlugDisplayNameFr(itinerary.city_slug)
    : ''
  const isLandscape = variant === 'landscape'
  const cover =
    itineraryUnsplashUrl({
      slug: itinerary.slug,
      citySlug: itinerary.city_slug,
      width: isLandscape ? 1600 : 1200,
    }) ||
    (itinerary.cover_image || '').trim() ||
    (itinerary.city_slug ? cityImageUrl(itinerary.city_slug) : null)
  const meta = itineraryMetaLine({
    cityLabel: city || null,
    durationKind: itinerary.duration_kind as ItineraryDurationKind | null,
  })

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`relative overflow-hidden text-left shadow-sm transition-transform active:scale-[0.98] lg:shadow-md ${
        isLandscape
          ? 'aspect-[16/10] w-full lg:aspect-[16/9]'
          : 'aspect-[3/4] w-full'
      } ${className}`}
      style={{ borderRadius: 'var(--fw-radius-card, 24px)' }}
    >
      {cover ? (
        <img
          src={cover}
          alt=""
          referrerPolicy="no-referrer"
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
      {/* Scrim half-bottom, denser at base — contraste AA titres blancs */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.55) 28%, rgba(0,0,0,0.22) 48%, transparent 58%)',
        }}
      />

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

      <div className="absolute inset-x-0 bottom-0 p-3.5">
        {!cover && city ? (
          <FwKicker className="mb-1 text-white/80">{city}</FwKicker>
        ) : null}
        <h3
          className={`m-0 line-clamp-2 font-extrabold tracking-tight text-white drop-shadow ${
            isLandscape
              ? 'text-[1.35rem] lg:text-[1.65rem] leading-snug'
              : 'text-[1.15rem] lg:text-[1.25rem] leading-snug'
          }`}
        >
          {itinerary.title || 'Sans titre'}
        </h3>
        {isLandscape && itinerary.subtitle ? (
          <p className="mt-1 line-clamp-1 text-[12px] font-medium text-white/92 drop-shadow">
            {itinerary.subtitle}
          </p>
        ) : null}
        {meta ? (
          <p className="mt-1 text-[12px] font-medium text-white/90 drop-shadow">
            {meta}
          </p>
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
