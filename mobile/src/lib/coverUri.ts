import {
  itineraryUnsplashUrl,
  parcoursCoverCandidates,
  shouldReplaceParcoursCover,
} from '@flightwatcher/shared'
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

function upgradeUnsplash(url: string, width: number): string {
  try {
    const u = new URL(url)
    u.searchParams.set(
      'w',
      String(Math.max(640, Math.min(2400, Math.round(width)))),
    )
    u.searchParams.set('q', '90')
    u.searchParams.set('auto', 'format')
    u.searchParams.set('fit', 'crop')
    u.searchParams.set('fm', 'jpg')
    return u.toString()
  } catch {
    return url
  }
}

function toDeviceUri(raw: string, width: number): string {
  if (/images\.unsplash\.com/i.test(raw)) return upgradeUnsplash(raw, width)
  if (isWikimedia(raw)) {
    return `${apiBase}/api/media/proxy?url=${encodeURIComponent(withWikiWidth(raw, width))}`
  }
  return raw
}

/**
 * Resolve a cover for RN Image.
 * Curated Unsplash first when DB cover is empty/Wikimedia/dead (device-reliable).
 */
export function coverUri(
  url: string | null | undefined,
  opts?: {
    width?: number
    citySlug?: string | null
    slug?: string | null
  },
): string | null {
  const width = opts?.width ?? 1280
  const unsplash = itineraryUnsplashUrl({
    slug: opts?.slug,
    citySlug: opts?.citySlug,
    width,
  })

  if (shouldReplaceParcoursCover(url) && unsplash) {
    return unsplash
  }

  const candidates = parcoursCoverCandidates({
    coverImage: url,
    citySlug: opts?.citySlug,
    slug: opts?.slug,
    width,
  })

  for (const raw of candidates) {
    return toDeviceUri(raw, width)
  }

  if (unsplash) return unsplash
  const fallback = (url || '').trim()
  if (!fallback) return null
  return toDeviceUri(fallback, width)
}

/** Ordered remote URIs for Image onError fallback chain. */
export function coverUriCandidates(
  url: string | null | undefined,
  opts?: {
    width?: number
    citySlug?: string | null
    slug?: string | null
  },
): string[] {
  const width = opts?.width ?? 1280
  const out: string[] = []
  const push = (u: string | null | undefined) => {
    const t = (u || '').trim()
    if (!t || out.includes(t)) return
    out.push(t)
  }

  push(coverUri(url, { ...opts, width }))

  for (const c of parcoursCoverCandidates({
    coverImage: url,
    citySlug: opts?.citySlug,
    slug: opts?.slug,
    width,
  })) {
    push(toDeviceUri(c, width))
  }

  return out
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
