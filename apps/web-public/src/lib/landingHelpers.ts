import type { PublicItinerary } from '@/lib/parcoursApi'

const MONTHS_FR: Record<string, number> = {
  janvier: 0,
  février: 1,
  fevrier: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  août: 7,
  aout: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  décembre: 11,
  decembre: 11,
}

/** Hide pops whose title embeds a calendar date already past (e.g. « 11 novembre »). */
export function isPastDatedPopTitle(
  title: string,
  now = new Date(),
): boolean {
  const t = String(title || '')
  const m = t.match(
    /(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)(?:\s+(\d{4}))?/i,
  )
  if (!m) return false
  const day = Number(m[1])
  const month = MONTHS_FR[m[2]!.toLowerCase()]
  if (month == null || !day) return false
  const year = m[3] ? Number(m[3]) : now.getFullYear()
  const d = new Date(year, month, day, 23, 59, 59)
  // If date without year is > 60 days in the future, assume previous year
  if (!m[3] && d.getTime() - now.getTime() > 60 * 86400000) {
    d.setFullYear(year - 1)
  }
  return d.getTime() < now.getTime()
}

/** Light FR title polish for cards. */
export function polishPopTitle(title: string): string {
  let t = String(title || '').trim()
  t = t.replace(/\bnoël\b/gi, 'Noël')
  t = t.replace(/\bno[eë]l\s+paris\b/gi, 'Noël à Paris')
  t = t.replace(/\bparis\b/gi, (s, i) =>
    i === 0 || /\s/.test(t[i - 1] || '') ? 'Paris' : s,
  )
  if (t.length) t = t.charAt(0).toUpperCase() + t.slice(1)
  return t
}

export function filterLandingPops(list: PublicItinerary[]): PublicItinerary[] {
  return list.filter((p) => {
    if (p.status && p.status !== 'published') return false
    if (p.is_demo) return false
    const title = String(p.title || '')
    if (isPastDatedPopTitle(title)) return false
    return true
  })
}
