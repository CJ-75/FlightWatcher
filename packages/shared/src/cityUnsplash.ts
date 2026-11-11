/**
 * Curated Unsplash photo IDs for city heroes.
 * Prefer these on mobile — Wikimedia often 403/400 via RN Image / okhttp.
 * Hotlink format (no API key): images.unsplash.com/{id}?…
 */

export const CITY_UNSPLASH_IDS: Record<string, string> = {
  paris: 'photo-1603378995290-8d4ce0495ddd',
  marseille: 'photo-1507525428034-b723cf961d3e',
  lyon: 'photo-1523531294919-4ddd7d7296e3',
  nice: 'sm4-fRm9uiM',
  bordeaux: 'photo-1467269204594-9661b134dd2b',
  lisbon: 'photo-1555881400-74d7acaacd8b',
  lisbonne: 'photo-1555881400-74d7acaacd8b',
  porto: 'photo-1516483638261-f4dbaf036963',
  barcelona: 'photo-1583422409516-2895a77efded',
  barcelone: 'photo-1583422409516-2895a77efded',
  rome: 'photo-1555992828-ca4dbe41d294',
  madrid: 'photo-1539037116277-4db20889f2d4',
  amsterdam: 'photo-1534351590666-13e1e96fc3c7',
  london: 'photo-1513635269975-59663e0ac1ad',
  londres: 'photo-1513635269975-59663e0ac1ad',
  berlin: 'photo-1560969184-10fe8719e047',
  prague: 'photo-1541849546-2108b4cea6a3',
  praguee: 'photo-1541849546-2108b4cea6a3',
  budapest: 'photo-1541343672885-9be56236302a',
  marrakech: 'photo-1653323792487-6ecc6217040b',
  marrakesh: 'photo-1653323792487-6ecc6217040b',
}

/** Per-parcours variety (demo) — falls back to city. */
export const ITINERARY_UNSPLASH_IDS: Record<string, string> = {
  'balade-romantique-paris': 'photo-1502602898657-3e91760cbb34',
  'ferie-11-novembre-paris': 'photo-1522093007474-d86e9bf7ba6f',
  'marseille-au-soleil': 'photo-1507525428034-b723cf961d3e',
  'marseille-en-amoureux': 'photo-1516483638261-f4dbaf036963',
  'lisbonne-week-end': 'photo-1555881400-74d7acaacd8b',
  'porto-tout-doux': 'photo-1555881400-74d7acaacd8b',
}

function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function unsplashPhotoUrl(
  photoId: string,
  width = 1280,
): string {
  const id = photoId.replace(/^https?:\/\/images\.unsplash\.com\//i, '').split('?')[0]
  // Cap high enough for retina portrait cards (3× ~ 220pt → ~1200–1600px).
  const w = Math.max(640, Math.min(2400, Math.round(width)))
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=90&fm=jpg`
}

export function cityUnsplashUrl(
  city: string | null | undefined,
  width = 960,
): string | null {
  if (!city) return null
  const key = normalizeKey(city)
  const id = CITY_UNSPLASH_IDS[key]
  return id ? unsplashPhotoUrl(id, width) : null
}

export function itineraryUnsplashUrl(
  opts: {
    slug?: string | null
    citySlug?: string | null
    width?: number
  },
): string | null {
  const w = opts.width ?? 960
  const slug = opts.slug ? normalizeKey(opts.slug) : ''
  if (slug && ITINERARY_UNSPLASH_IDS[slug]) {
    return unsplashPhotoUrl(ITINERARY_UNSPLASH_IDS[slug], w)
  }
  return cityUnsplashUrl(opts.citySlug, w)
}
