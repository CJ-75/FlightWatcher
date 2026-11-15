import type { MediaDisplayOpts, MediaProviderId } from './types'

/**
 * Supabase Image Transforms:
 * /storage/v1/object/public/{bucket}/{path}
 * → /storage/v1/render/image/public/{bucket}/{path}?width=&quality=
 *
 * No-op for non-Supabase URLs (Unsplash, Wikimedia, …).
 */
export function supabaseTransformUrl(
  url: string,
  opts: MediaDisplayOpts = {},
): string {
  const t = String(url || '').trim()
  if (!t || !/^https?:\/\//i.test(t)) return t
  if (!opts.transform && opts.width == null && opts.quality == null) return t

  try {
    const u = new URL(t)
    const marker = '/storage/v1/object/public/'
    const renderMarker = '/storage/v1/render/image/public/'
    let pathAfter = ''
    if (u.pathname.includes(renderMarker)) {
      pathAfter = u.pathname.split(renderMarker)[1] || ''
    } else if (u.pathname.includes(marker)) {
      pathAfter = u.pathname.split(marker)[1] || ''
    } else {
      return t
    }
    if (!pathAfter) return t

    const params = new URLSearchParams()
    if (opts.width != null && opts.width > 0) {
      params.set('width', String(Math.round(opts.width)))
    }
    if (opts.height != null && opts.height > 0) {
      params.set('height', String(Math.round(opts.height)))
    }
    if (opts.quality != null && opts.quality > 0) {
      params.set('quality', String(Math.min(100, Math.round(opts.quality))))
    }
    if (!params.has('width') && !params.has('height') && !params.has('quality')) {
      return t
    }
    // cover-ish default when resizing
    if ((opts.width || opts.height) && !params.has('resize')) {
      params.set('resize', 'contain')
    }

    u.pathname = `/storage/v1/render/image/public/${pathAfter}`
    u.search = params.toString()
    return u.toString()
  } catch {
    return t
  }
}

/**
 * Display helper. Image Transforms (render/image) are opt-in via opts.transform
 * — often requires Supabase Pro; public object URLs work on Free.
 */
export function mediaDisplayUrl(
  url: string,
  opts: MediaDisplayOpts = {},
  provider: MediaProviderId = 'supabase',
): string {
  if ((provider === 'supabase' || provider === 'api') && opts.transform) {
    return supabaseTransformUrl(url, opts)
  }
  return url
}
