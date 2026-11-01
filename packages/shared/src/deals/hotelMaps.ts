/** Build a Google Maps search / pin URL for a hotel. */
export function hotelMapsSearchUrl(opts: {
  name?: string | null
  city?: string | null
  address?: string | null
  lat?: number | null
  lng?: number | null
}): string | null {
  const lat = opts.lat != null ? Number(opts.lat) : NaN
  const lng = opts.lng != null ? Number(opts.lng) : NaN
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat}%2C${lng}`
  }
  const q = [opts.address || opts.name, opts.city].filter(Boolean).join(', ').trim()
  if (!q) return null
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

/** Embeddable Google Maps iframe src (web only). */
export function hotelMapsEmbedUrl(opts: {
  name?: string | null
  city?: string | null
  address?: string | null
  lat?: number | null
  lng?: number | null
}): string | null {
  const lat = opts.lat != null ? Number(opts.lat) : NaN
  const lng = opts.lng != null ? Number(opts.lng) : NaN
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`
  }
  const q = [opts.address || opts.name, opts.city].filter(Boolean).join(', ').trim()
  if (!q) return null
  return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&output=embed`
}
