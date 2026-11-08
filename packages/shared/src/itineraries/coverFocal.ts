/** Point focal couverture (0–100) — object-position CSS / RN. */
export type CoverFocal = { x: number; y: number }

const DEFAULT_FOCAL: CoverFocal = { x: 50, y: 42 }

/**
 * Curated focals by itinerary slug (and optional city fallback).
 * y plus bas = plus de ciel / haut de photo ; y plus haut = sujets bas.
 */
const BY_SLUG: Record<string, CoverFocal> = {
  // 2e carte « Près de toi » — Tour Eiffel Unsplash, sujet trop haut sinon
  'balade-romantique-paris': { x: 50, y: 62 },
  'ferie-11-novembre-paris': { x: 48, y: 40 },
  'marseille-au-soleil': { x: 50, y: 40 },
  'marseille-en-amoureux': { x: 55, y: 45 },
  'lisbonne-week-end': { x: 50, y: 35 },
  'porto-tout-doux': { x: 50, y: 40 },
}

const BY_CITY: Record<string, CoverFocal> = {
  paris: { x: 50, y: 35 },
  marseille: { x: 50, y: 42 },
  lisbon: { x: 50, y: 36 },
  lisbonne: { x: 50, y: 36 },
  porto: { x: 50, y: 40 },
}

export function coverFocalFor(opts: {
  slug?: string | null
  citySlug?: string | null
  /** Override from itinerary.cover_focal if present */
  focal?: CoverFocal | null
}): CoverFocal {
  if (
    opts.focal &&
    Number.isFinite(opts.focal.x) &&
    Number.isFinite(opts.focal.y)
  ) {
    return {
      x: Math.min(100, Math.max(0, opts.focal.x)),
      y: Math.min(100, Math.max(0, opts.focal.y)),
    }
  }
  const slug = String(opts.slug || '')
    .trim()
    .toLowerCase()
  if (slug && BY_SLUG[slug]) return BY_SLUG[slug]
  const city = String(opts.citySlug || '')
    .trim()
    .toLowerCase()
  if (city && BY_CITY[city]) return BY_CITY[city]
  return DEFAULT_FOCAL
}

export function coverFocalCss(focal: CoverFocal): string {
  return `${focal.x}% ${focal.y}%`
}
