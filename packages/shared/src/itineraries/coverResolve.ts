import { cityImageUrl, upscaleCityHeroUrl } from '../cities'
import { itineraryUnsplashUrl } from '../cityUnsplash'

/** Known-dead Unsplash photo ids historically stored in DB. */
const DEAD_UNSPLASH = [
  'photo-1499853387-4b3839150cba',
]

function isDeadOrPlaceholder(url: string): boolean {
  const t = url.trim()
  if (!t) return true
  if (!/^https?:\/\//i.test(t)) return true
  if (/source\.unsplash\.com/i.test(t)) return true
  if (/placehold/i.test(t)) return true
  if (DEAD_UNSPLASH.some((id) => t.includes(id))) return true
  return false
}

function isWikimedia(url: string): boolean {
  return /wikimedia\.org/i.test(url)
}

/**
 * Ordered cover candidates for a parcours card/hero.
 * Prefer curated Unsplash when DB cover is empty / dead / Wikimedia.
 * Wikimedia stays in the list last so clients can proxy it.
 */
export function parcoursCoverCandidates(opts: {
  coverImage?: string | null
  citySlug?: string | null
  slug?: string | null
  width?: number
}): string[] {
  const width = opts.width ?? 1280
  const out: string[] = []

  const push = (raw?: string | null) => {
    const t = (raw || '').trim()
    if (!t || isDeadOrPlaceholder(t)) return
    const next = upscaleCityHeroUrl(t, width)
    if (next && !out.includes(next)) out.push(next)
  }

  const curated = itineraryUnsplashUrl({
    slug: opts.slug,
    citySlug: opts.citySlug,
    width,
  })
  const cover = (opts.coverImage || '').trim()
  const cityFallback = opts.citySlug ? cityImageUrl(opts.citySlug) : null
  const coverBad =
    !cover || isDeadOrPlaceholder(cover) || isWikimedia(cover)

  if (coverBad) {
    push(curated)
    push(cover)
    push(cityFallback)
  } else {
    push(cover)
    push(curated)
    push(cityFallback)
  }

  return out
}

/** First usable cover URL (no network check). */
export function resolveParcoursCoverUrl(opts: {
  coverImage?: string | null
  citySlug?: string | null
  slug?: string | null
  width?: number
}): string | null {
  return parcoursCoverCandidates(opts)[0] || null
}

/** True when a stored cover should be replaced by curated Unsplash. */
export function shouldReplaceParcoursCover(cover?: string | null): boolean {
  const t = (cover || '').trim()
  return !t || isDeadOrPlaceholder(t) || isWikimedia(t)
}
