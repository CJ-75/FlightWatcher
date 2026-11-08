import { itineraryUnsplashUrl } from '@flightwatcher/shared'
import { apiBase } from './client'

const WIKIMEDIA_HOST =
  /(^|\.)(thumb|upload|commons)\.wikimedia\.org$/i

/** Wikimedia hotlink steps (https://w.wiki/GHai) — other widths → HTTP 400. */
const WIKI_STEPS = [20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840]

function snapWikiWidth(width: number): number {
  const w = Math.max(1, Math.round(width))
  for (const step of WIKI_STEPS) {
    if (step >= w) return step
  }
  return WIKI_STEPS[WIKI_STEPS.length - 1]
}

function withWikiWidth(url: string, width: number): string {
  if (!/thumb\.wikimedia\.org|upload\.wikimedia\.org/i.test(url)) return url
  const step = snapWikiWidth(width)
  return url.replace(/(\d+)px-/i, `${step}px-`)
}

function isWikimedia(url: string): boolean {
  try {
    return WIKIMEDIA_HOST.test(new URL(url).hostname)
  } catch {
    return /wikimedia\.org/i.test(url)
  }
}

/**
 * Resolve a cover for RN Image.
 * Prefer Unsplash (works on device). Wikimedia goes through API proxy.
 */
export function coverUri(
  url: string | null | undefined,
  opts?: {
    width?: number
    citySlug?: string | null
    slug?: string | null
    preferUnsplash?: boolean
  },
): string | null {
  const width = opts?.width ?? 1280
  const raw = (url || '').trim()
  const unsplash = itineraryUnsplashUrl({
    slug: opts?.slug,
    citySlug: opts?.citySlug,
    width,
  })

  // Prefer curated Unsplash (known good) over DB/API covers that may 404.
  // Always rebuild Unsplash URLs with the requested width (API often ships w=1280
  // which is fine; card callers pass retina widths).
  if (opts?.preferUnsplash !== false && unsplash) {
    if (!raw || isWikimedia(raw) || /images\.unsplash\.com/i.test(raw)) {
      return unsplash
    }
  }

  if (!raw) return unsplash
  if (/images\.unsplash\.com/i.test(raw)) {
    // Upgrade soft/low-w Unsplash query params to requested size + q=90
    try {
      const u = new URL(raw)
      u.searchParams.set('w', String(Math.max(640, Math.min(2400, Math.round(width)))))
      u.searchParams.set('q', '90')
      u.searchParams.set('auto', 'format')
      u.searchParams.set('fit', 'crop')
      u.searchParams.set('fm', 'jpg')
      return u.toString()
    } catch {
      return raw
    }
  }

  const next = withWikiWidth(raw, width)
  if (isWikimedia(next)) {
    return `${apiBase}/api/media/proxy?url=${encodeURIComponent(next)}`
  }
  return next
}

/** Backend Unsplash search / curated cover (optional API key). */
export function cityCoverApiUrl(opts: {
  city?: string | null
  slug?: string | null
  width?: number
}): string {
  const q = new URLSearchParams()
  if (opts.city) q.set('city', opts.city)
  if (opts.slug) q.set('slug', opts.slug)
  q.set('w', String(opts.width ?? 960))
  return `${apiBase}/api/media/city-cover?${q.toString()}`
}
