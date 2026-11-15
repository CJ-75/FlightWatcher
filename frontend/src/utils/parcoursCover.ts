import {
  parcoursCoverCandidates,
  resolveParcoursCoverUrl,
  supabaseTransformUrl,
} from '@waypop/shared'
import { apiUrl } from './apiBase'

function isWikimedia(url: string): boolean {
  return /wikimedia\.org/i.test(url)
}

/** Route Wikimedia through backend proxy (hotlink / UA fragile otherwise). */
export function webCoverSrc(
  url: string | null | undefined,
  width?: number,
): string | null {
  const raw = (url || '').trim()
  if (!raw) return null
  if (isWikimedia(raw)) {
    return apiUrl(`/api/media/proxy?url=${encodeURIComponent(raw)}`)
  }
  // Opt-in: VITE_MEDIA_TRANSFORMS=1 (Supabase Image Transforms / often Pro)
  const transformsOn = import.meta.env.VITE_MEDIA_TRANSFORMS === '1'
  if (
    transformsOn &&
    /\/storage\/v1\/(?:object|render\/image)\/public\//i.test(raw)
  ) {
    return supabaseTransformUrl(raw, {
      width: width ?? 1200,
      quality: 80,
      transform: true,
    })
  }
  return raw
}

export function parcoursWebCoverCandidates(opts: {
  coverImage?: string | null
  citySlug?: string | null
  slug?: string | null
  width?: number
}): string[] {
  return parcoursCoverCandidates(opts)
    .map((u) => webCoverSrc(u, opts.width))
    .filter((u): u is string => Boolean(u))
}

export function parcoursWebCoverUrl(opts: {
  coverImage?: string | null
  citySlug?: string | null
  slug?: string | null
  width?: number
}): string | null {
  const first = resolveParcoursCoverUrl(opts)
  return webCoverSrc(first, opts.width)
}
