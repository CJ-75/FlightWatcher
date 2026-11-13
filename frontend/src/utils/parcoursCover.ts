import {
  parcoursCoverCandidates,
  resolveParcoursCoverUrl,
} from '@flightwatcher/shared'
import { apiUrl } from './apiBase'

function isWikimedia(url: string): boolean {
  return /wikimedia\.org/i.test(url)
}

/** Route Wikimedia through backend proxy (hotlink / UA fragile otherwise). */
export function webCoverSrc(url: string | null | undefined): string | null {
  const raw = (url || '').trim()
  if (!raw) return null
  if (isWikimedia(raw)) {
    return apiUrl(`/api/media/proxy?url=${encodeURIComponent(raw)}`)
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
    .map((u) => webCoverSrc(u))
    .filter((u): u is string => Boolean(u))
}

export function parcoursWebCoverUrl(opts: {
  coverImage?: string | null
  citySlug?: string | null
  slug?: string | null
  width?: number
}): string | null {
  const first = resolveParcoursCoverUrl(opts)
  return webCoverSrc(first)
}
