import { ratingToHalfStars5, scoreToHalfStars5 } from '@flightwatcher/shared'

type Props = {
  /** Note déjà sur /5 (activités Viator). */
  rating?: number | null
  /** Note /10 (avis hôtel). */
  score?: number | null
  size?: number
  className?: string
}

/** Étoiles /5 avec demi-étoile — alignées sur une ligne. */
export function RatingStars({ rating, score, size = 13, className = '' }: Props) {
  const stars =
    rating != null ? ratingToHalfStars5(rating) : scoreToHalfStars5(score)
  if (stars == null) return null
  const full = Math.floor(stars)
  const half = stars - full >= 0.5
  const empty = 5 - full - (half ? 1 : 0)
  const glyph = {
    width: size,
    height: size,
    fontSize: size,
    lineHeight: 1,
  } as const

  return (
    <span
      className={`inline-flex items-center gap-px text-amber-500 shrink-0 ${className}`}
      aria-label={`${stars} sur 5`}
      title={
        rating != null
          ? `${Number(rating).toFixed(1)}/5`
          : score != null
            ? `${Number(score).toFixed(1)}/10`
            : undefined
      }
    >
      {Array.from({ length: full }, (_, i) => (
        <span key={`f${i}`} className="leading-none" style={glyph} aria-hidden>
          ★
        </span>
      ))}
      {half ? (
        <span
          className="relative inline-block leading-none"
          style={glyph}
          aria-hidden
        >
          <span className="absolute inset-0 text-slate-300">★</span>
          <span className="absolute inset-0 overflow-hidden w-[50%] text-amber-500">
            ★
          </span>
        </span>
      ) : null}
      {Array.from({ length: empty }, (_, i) => (
        <span
          key={`e${i}`}
          className="leading-none text-slate-300"
          style={glyph}
          aria-hidden
        >
          ★
        </span>
      ))}
    </span>
  )
}
