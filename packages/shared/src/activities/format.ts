/**
 * Pure display helpers for activity cards — no provider calls.
 */

const VIATOR_AFFILIATE_KEYS = new Set([
  'pid',
  'mcid',
  'medium',
  'api_version',
  'campaign',
  'campaign-value',
  'cjevent',
])

/**
 * Rewrite sandbox/RC shop or destination-only Viator links to the product PDP
 * on www.viator.com (city landings like /d538-ttd are rebuilt with the code).
 */
export function canonicalViatorProductUrl(
  rawUrl?: string | null,
  opts?: { productCode?: string | null; destinationId?: string | null },
): string | null {
  let code = String(opts?.productCode || '').trim()
  let dest = String(opts?.destinationId || '').trim()
  const url = String(rawUrl || '').trim()
  if (!url && !code) return null

  let path = ''
  let host = ''
  let isSandbox = false
  let isDestOnly = false
  const affiliate = new URLSearchParams()

  if (url) {
    try {
      const parsed = new URL(url)
      host = parsed.hostname.toLowerCase()
      path = parsed.pathname || ''
      isSandbox =
        /(^|\.)((live\.)?rc\.viator\.com|sandbox\.viator\.com)$/i.test(host) ||
        host.startsWith('shop.')
      parsed.searchParams.forEach((v, k) => {
        if (VIATOR_AFFILIATE_KEYS.has(k.toLowerCase())) affiliate.set(k, v)
      })
      const m = path.match(/\/d(\d+)-([A-Za-z0-9]+)\/?$/i)
      if (m) {
        const pathDest = m[1]
        const pathCode = m[2]
        if (pathCode.toLowerCase() === 'ttd') {
          isDestOnly = true
        } else {
          if (!code) code = pathCode
          if (!dest) dest = pathDest
        }
      }
      if (/\/d\d+-ttd\/?$/i.test(path)) isDestOnly = true
    } catch {
      /* keep raw */
    }
  }

  const needsRewrite =
    isSandbox ||
    isDestOnly ||
    (Boolean(url) && host.includes('viator.com') && !path.includes('/tours/') && Boolean(code))

  if (url && !needsRewrite) return url

  let newPath: string
  if (isDestOnly || !path.includes('/tours/')) {
    if (!code) return url || null
    newPath = dest ? `/tours/d${dest}-${code}` : `/tours/${code}`
  } else {
    newPath = path
  }
  const qs = affiliate.toString()
  return `https://www.viator.com${newPath}${qs ? `?${qs}` : ''}`
}

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

export type ActivityDetailPhoto = {
  url: string
  thumb?: string | null
}

/** Enriched fiche activité (lightbox) — extends card fields. */
export type ActivityDetailModel = ActivityCardModel & {
  photos: ActivityDetailPhoto[]
  description: string | null
  inclusions: string[]
  exclusions: string[]
  additionalInfo: string[]
  meetingPoint: string | null
  languages: string[]
  category: string | null
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
    productUrl: canonicalViatorProductUrl(
      raw.product_url ? String(raw.product_url) : null,
      {
        productCode: String(raw.product_code || raw.productCode || '') || null,
      },
    ),
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

function asStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((x) => String(x || '').trim())
    .filter(Boolean)
}

export function activityDetailFromCard(
  card: ActivityCardModel,
): ActivityDetailModel {
  return {
    ...card,
    photos: card.photoUrl ? [{ url: card.photoUrl, thumb: card.photoUrl }] : [],
    description: null,
    inclusions: [],
    exclusions: [],
    additionalInfo: [],
    meetingPoint: null,
    languages: [],
    category: null,
  }
}

export function toActivityDetailModel(
  raw: Record<string, unknown>,
  adults = 2,
  seed?: ActivityCardModel | null,
): ActivityDetailModel {
  const card = toActivityCardModel(raw, adults)
  const photosRaw = Array.isArray(raw.photos) ? raw.photos : []
  const photos: ActivityDetailPhoto[] = []
  const seen = new Set<string>()
  for (const p of photosRaw) {
    if (!p || typeof p !== 'object') continue
    const row = p as Record<string, unknown>
    const url = String(row.url || '').trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    photos.push({
      url,
      thumb: row.thumb ? String(row.thumb) : url,
    })
  }
  if (!photos.length && card.photoUrl) {
    photos.push({ url: card.photoUrl, thumb: card.photoUrl })
  } else if (!photos.length && seed?.photoUrl) {
    photos.push({ url: seed.photoUrl, thumb: seed.photoUrl })
  }

  return {
    ...card,
    title: card.title || seed?.title || 'Activité',
    photoUrl: card.photoUrl || seed?.photoUrl || photos[0]?.url || null,
    rating: card.rating ?? seed?.rating ?? null,
    reviewCount: card.reviewCount ?? seed?.reviewCount ?? null,
    durationLabel: card.durationLabel || seed?.durationLabel || null,
    priceLabel: card.priceLabel || seed?.priceLabel || null,
    productUrl: card.productUrl || seed?.productUrl || null,
    freeCancellation: card.freeCancellation || Boolean(seed?.freeCancellation),
    instantConfirmation:
      card.instantConfirmation || Boolean(seed?.instantConfirmation),
    destinationLabel: card.destinationLabel || seed?.destinationLabel || null,
    distanceLabel: card.distanceLabel || seed?.distanceLabel || null,
    photos,
    description: raw.description ? String(raw.description) : null,
    inclusions: asStringList(raw.inclusions),
    exclusions: asStringList(raw.exclusions),
    additionalInfo: asStringList(raw.additional_info),
    meetingPoint: raw.meeting_point ? String(raw.meeting_point) : null,
    languages: asStringList(raw.languages),
    category: raw.category ? String(raw.category) : null,
  }
}
