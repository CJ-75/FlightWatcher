/**
 * Pure display helpers for activity cards — no provider calls.
 */

export type ActivityCardModel = {
  productCode: string
  title: string
  photoUrl: string | null
  rating: number | null
  reviewCount: number | null
  durationLabel: string | null
  priceLabel: string | null
  productUrl: string | null
  freeCancellation: boolean
  instantConfirmation: boolean
  destinationLabel: string | null
  distanceLabel: string | null
}

export function formatDurationHours(hours?: number | null): string | null {
  if (hours == null || Number.isNaN(Number(hours))) return null
  const h = Number(hours)
  if (h < 1) return `${Math.round(h * 60)} min`
  if (Number.isInteger(h)) return `${h} h`
  const whole = Math.floor(h)
  const mins = Math.round((h - whole) * 60)
  return mins ? `${whole} h ${mins}` : `${whole} h`
}

export function formatActivityPrice(
  priceFrom: number | null | undefined,
  currency: string | undefined,
  adults: number,
): string | null {
  if (priceFrom == null || Number.isNaN(Number(priceFrom))) return null
  const n = Math.round(Number(priceFrom))
  const cur = currency === 'EUR' || !currency ? '€' : currency
  if (adults <= 1) return `${n} ${cur}`
  return `dès ${n} ${cur} / pers.`
}

export function formatDistanceKm(
  km: number | null | undefined,
  precision: 'exact' | 'city' | string | null | undefined,
  destinationLabel?: string | null,
): string | null {
  if (precision === 'exact' && km != null && Number.isFinite(Number(km))) {
    const v = Number(km)
    if (v < 1) return `${Math.round(v * 1000)} m`
    return `${v < 10 ? v.toFixed(1) : Math.round(v)} km`
  }
  if (destinationLabel) return `Vers ${destinationLabel}`
  return null
}

export function toActivityCardModel(
  raw: Record<string, unknown>,
  adults = 2,
): ActivityCardModel {
  const rating =
    raw.rating != null && !Number.isNaN(Number(raw.rating))
      ? Number(raw.rating)
      : null
  const reviewCount =
    raw.review_count != null && !Number.isNaN(Number(raw.review_count))
      ? Number(raw.review_count)
      : null
  const durationHours =
    raw.duration_hours != null ? Number(raw.duration_hours) : null
  const dist =
    raw.distance_km != null
      ? Number(raw.distance_km)
      : raw._dest_km != null
        ? Number(raw._dest_km)
        : null
  return {
    productCode: String(raw.product_code || raw.productCode || ''),
    title: String(raw.title || 'Activité'),
    photoUrl: raw.photo_url ? String(raw.photo_url) : null,
    rating,
    reviewCount,
    durationLabel: formatDurationHours(durationHours),
    priceLabel: formatActivityPrice(
      raw.price_from != null ? Number(raw.price_from) : null,
      String(raw.currency || 'EUR'),
      adults,
    ),
    productUrl: raw.product_url ? String(raw.product_url) : null,
    freeCancellation: Boolean(raw.free_cancellation),
    instantConfirmation: Boolean(raw.instant_confirmation),
    destinationLabel: raw.destination_label
      ? String(raw.destination_label)
      : null,
    distanceLabel: formatDistanceKm(
      dist,
      (raw.location_precision as string) || 'city',
      raw.destination_label ? String(raw.destination_label) : null,
    ),
  }
}
