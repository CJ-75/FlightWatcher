/**
 * Public Pop URLs — SPA stays on /parcours until POP_PAGE_V2 is on.
 * En local Vite (:5173) → Next web-public (:3001) pour /pop/{ville}/{slug}.
 */
import { peekConfigFlag } from './configFlags'

export function publicPopPath(opts: {
  citySlug?: string | null
  slug?: string | null
  id?: string | null
}): string {
  const city = String(opts.citySlug || '')
    .trim()
    .toLowerCase()
  const slug = String(opts.slug || opts.id || '')
    .trim()
    .toLowerCase()
  if (peekConfigFlag('pop_page_v2_enabled') && city && slug) {
    return `/pop/${encodeURIComponent(city)}/${encodeURIComponent(slug)}`
  }
  return `/parcours/${encodeURIComponent(opts.slug || opts.id || '')}`
}

/** Next origin when SPA runs on Vite :5173 ; empty = same-origin (prod). */
export function popPageV2Origin(): string {
  try {
    const { port, protocol, hostname } = window.location
    if (port === '5173') return `${protocol}//${hostname}:3001`
  } catch {
    /* ignore */
  }
  return ''
}

/** Path or absolute URL for navigation / redirect. */
export function publicPopHref(opts: {
  citySlug?: string | null
  slug?: string | null
  id?: string | null
}): string {
  const path = publicPopPath(opts)
  if (!peekConfigFlag('pop_page_v2_enabled')) return path
  const origin = popPageV2Origin()
  return origin ? `${origin}${path}` : path
}

/** SPA navigate or hard jump to Next Pop v2. */
export function openPublicPop(
  opts: {
    citySlug?: string | null
    slug?: string | null
    id?: string | null
  },
  navigate: (to: string) => void,
): void {
  const href = publicPopHref(opts)
  if (/^https?:\/\//i.test(href)) {
    window.location.assign(href)
    return
  }
  navigate(href)
}
