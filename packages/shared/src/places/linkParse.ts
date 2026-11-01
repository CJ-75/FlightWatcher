/**
 * Parse Instagram / TikTok / Google Maps share text & URLs (no network).
 * Trackers stripped; Maps !3d/!4d preferred over @ center.
 */

export type LinkSource = 'google_maps' | 'instagram' | 'tiktok' | 'unknown'

export type ParsedLink = {
  source: LinkSource
  urlClean: string
  name?: string | null
  lat?: number | null
  lng?: number | null
  mapCenterLat?: number | null
  mapCenterLng?: number | null
  googleCid?: string | null
  googlePlaceId?: string | null
  rawText?: string | null
  shortLink?: boolean
}

const TRACKER_KEYS = new Set([
  'entry',
  'g_ep',
  'skid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'gclid',
  'si',
  'feature',
])

const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'g.co'])

function stripTrackers(url: URL): string {
  const next = new URL(url.toString())
  for (const key of [...next.searchParams.keys()]) {
    if (TRACKER_KEYS.has(key) || key.startsWith('utm_')) {
      next.searchParams.delete(key)
    }
  }
  next.hash = ''
  return next.toString()
}

function decodePlaceName(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' ')).trim()
  } catch {
    return raw.replace(/\+/g, ' ').trim()
  }
}

function parseMapsDataCoords(data: string): { lat: number; lng: number } | null {
  const m = data.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

function parseAtCoords(pathOrUrl: string): { lat: number; lng: number } | null {
  const m = pathOrUrl.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

function hexPairToCid(data: string): string | null {
  const m = data.match(/!1s0x[0-9a-fA-F]+:0x([0-9a-fA-F]+)/)
  if (!m) return null
  try {
    return BigInt(`0x${m[1]}`).toString(10)
  } catch {
    return null
  }
}

function detectSource(host: string, href: string): LinkSource {
  const h = host.toLowerCase()
  if (
    h.includes('google.') ||
    h.includes('maps.app.goo.gl') ||
    h === 'goo.gl' ||
    h === 'g.co' ||
    href.includes('/maps/')
  ) {
    return 'google_maps'
  }
  if (h.includes('instagram.com') || h.includes('instagr.am')) return 'instagram'
  if (h.includes('tiktok.com') || h.includes('vm.tiktok.com')) return 'tiktok'
  return 'unknown'
}

/** Extract first URL-like token from pasted text. */
export function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s<>"')\]]+/gi
  const found = text.match(re) || []
  return [...new Set(found.map((u) => u.replace(/[.,;:!?)]+$/, '')))]
}

export function parseShareText(raw: string): ParsedLink[] {
  const text = String(raw || '').trim()
  if (!text) return []
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const urls = extractUrls(text)
  const out: ParsedLink[] = []

  if (!urls.length) {
    // Plain name lines — treated as unknown for manual clarify
    for (const line of lines.slice(0, 20)) {
      if (extractUrls(line).length) continue
      out.push({
        source: 'unknown',
        urlClean: '',
        name: line.slice(0, 200),
        rawText: line,
      })
    }
    return out
  }

  for (const href of urls.slice(0, 20)) {
    try {
      const u = new URL(href)
      const source = detectSource(u.hostname, href)
      const shortLink = SHORT_HOSTS.has(u.hostname.toLowerCase())
      const urlClean = shortLink ? href.split('?')[0] : stripTrackers(u)
      const parsed: ParsedLink = {
        source,
        urlClean,
        shortLink,
        rawText: text.slice(0, 2000),
      }

      if (source === 'google_maps' && !shortLink) {
        const placeMatch = u.pathname.match(/\/maps\/place\/([^/]+)/)
        if (placeMatch) parsed.name = decodePlaceName(placeMatch[1])
        const data = u.searchParams.get('data') || u.href
        const exact = parseMapsDataCoords(data)
        const center = parseAtCoords(u.href)
        if (exact) {
          parsed.lat = exact.lat
          parsed.lng = exact.lng
        }
        if (center) {
          parsed.mapCenterLat = center.lat
          parsed.mapCenterLng = center.lng
          if (!exact) {
            parsed.lat = center.lat
            parsed.lng = center.lng
          }
        }
        parsed.googleCid = hexPairToCid(data)
        const pid =
          u.searchParams.get('place_id') ||
          (u.href.match(/place_id[=:]([A-Za-z0-9_-]+)/)?.[1] ?? null)
        if (pid) parsed.googlePlaceId = pid
        // Shared text often has name on first line
        if (!parsed.name && lines[0] && !lines[0].startsWith('http')) {
          parsed.name = lines[0].slice(0, 200)
        }
      }

      if (source === 'instagram' || source === 'tiktok') {
        const mention = text.match(/@([A-Za-z0-9._]+)/)
        const pin = text.match(/📍\s*([^\n]+)/)
        if (pin) parsed.name = pin[1].trim().slice(0, 200)
        else if (mention) parsed.name = mention[0].slice(0, 200)
      }

      out.push(parsed)
    } catch {
      out.push({
        source: 'unknown',
        urlClean: href,
        rawText: href,
      })
    }
  }

  // Dedupe by urlClean
  const seen = new Set<string>()
  return out.filter((p) => {
    const key = p.urlClean || `name:${p.name || ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Classify place category → trip bucket. */
export type PlaceBucket = 'restaurant' | 'attraction' | 'unknown'

const RESTO_RE =
  /\b(restaurant|resto|bar|cafe|café|bakery|boulangerie|glacier|pizzeria|brasserie|pub|wine\s*bar|taberna|trattoria)\b/i
const ATTRACTION_RE =
  /\b(museum|musée|monument|viewpoint|point\s*de\s*vue|park|parc|beach|plage|market|marché|quartier|castle|château|cathedral|église|church|gallery|galerie)\b/i

export function classifyPlaceBucket(
  name?: string | null,
  category?: string | null,
): PlaceBucket {
  const s = `${name || ''} ${category || ''}`
  if (RESTO_RE.test(s)) return 'restaurant'
  if (ATTRACTION_RE.test(s)) return 'attraction'
  return 'unknown'
}
