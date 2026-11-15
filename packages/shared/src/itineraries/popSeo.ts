/**
 * Pop SEO copy helpers — titles/descriptions from real editorial data only.
 */

const TITLE_MAX = 60
const DESC_MIN = 140
const DESC_MAX = 160

export function clipSeo(text: string, max: number): string {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > 40 ? cut.slice(0, sp) : cut).trim()}…`
}

/**
 * `<title>` orienté recherche, ≤ 60 car.
 * Prefers target_query, else title, with light suffix if room.
 */
export function buildPopDocumentTitle(opts: {
  title: string
  target_query?: string | null
  cityLabel?: string | null
}): string {
  const core = String(opts.target_query || opts.title || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!core) return 'Itinéraire | Waypop'
  const withBrand = `${core} | Waypop`
  if (withBrand.length <= TITLE_MAX) return withBrand
  const suffix = ' | Waypop'
  if (core.length + suffix.length <= TITLE_MAX) return `${core}${suffix}`
  return clipSeo(core, TITLE_MAX)
}

/**
 * Meta description 140–160 from real fields (intro, durée, stops).
 * Never invents facts.
 */
export function buildPopMetaDescription(opts: {
  intro?: string | null
  title?: string | null
  cityLabel?: string | null
  durationLabel?: string | null
  stopCount?: number
}): string {
  const intro = String(opts.intro || '')
    .replace(/\s+/g, ' ')
    .trim()
  const bits: string[] = []
  if (intro) bits.push(intro)
  else if (opts.title) bits.push(String(opts.title).trim())

  const extras: string[] = []
  if (opts.durationLabel) extras.push(opts.durationLabel)
  if (opts.stopCount && opts.stopCount > 0) {
    extras.push(`${opts.stopCount} stops`)
  }
  if (opts.cityLabel) extras.push(opts.cityLabel)

  let base = bits[0] || 'Itinéraire Waypop'
  if (extras.length && base.length < DESC_MIN) {
    base = `${base} — ${extras.join(' · ')}.`
  }
  if (base.length < DESC_MIN && extras.length) {
    base = `${base} Programme, adresses et prix week-end.`
  }
  if (base.length > DESC_MAX) return clipSeo(base, DESC_MAX)
  if (base.length < DESC_MIN) {
    const pad = ' Programme détaillé, adresses et idée de prix.'
    const merged = `${base}${base.endsWith('.') ? '' : '.'}${pad}`
    return clipSeo(merged, DESC_MAX)
  }
  return base
}

/** H1: prefer target_query (search-shaped), else title. */
export function buildPopH1(opts: {
  title: string
  target_query?: string | null
}): string {
  const tq = String(opts.target_query || '').trim()
  if (tq) return tq
  return String(opts.title || '').trim() || 'Itinéraire'
}

export function tipsPerDayOk(
  tips: unknown,
  dayCount: number,
): boolean {
  if (dayCount <= 0) return false
  if (!tips) return false
  if (Array.isArray(tips)) {
    const n = tips.filter((t) => String(t || '').trim()).length
    return n >= dayCount
  }
  if (typeof tips === 'object') {
    const o = tips as Record<string, unknown>
    if (Array.isArray(o.items)) {
      return o.items.filter((t) => String(t || '').trim()).length >= dayCount
    }
    if (Array.isArray(o.per_day)) {
      return o.per_day.filter((t) => String(t || '').trim()).length >= dayCount
    }
    // { "0": "...", "1": "..." }
    const keys = Object.keys(o).filter((k) => /^\d+$/.test(k))
    if (keys.length >= dayCount) return true
  }
  return false
}

export function hasTravelTimesInItems(
  items: Array<{ meta?: Record<string, unknown> | null } | null | undefined>,
): boolean {
  let n = 0
  for (const it of items) {
    const m = it?.meta
    if (!m || typeof m !== 'object') continue
    const t =
      m.travel_minutes ??
      m.travel_time_min ??
      m.walk_minutes ??
      m.transit_minutes
    if (t != null && Number(t) >= 0) n += 1
  }
  return n > 0
}
