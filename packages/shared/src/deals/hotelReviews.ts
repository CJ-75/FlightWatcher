import type { HotelGuestReview } from '../types'

/** Prefer FR-flagged reviews (LiteAPI may mix locales even with language=fr). */
export function preferFrenchReviews(list: HotelGuestReview[]): HotelGuestReview[] {
  return [...list].sort((a, b) => {
    const rank = (r: HotelGuestReview) => {
      const lang = String(r.language || '').toLowerCase()
      if (lang.startsWith('fr')) return 0
      if (!lang) return 1
      return 2
    }
    return rank(a) - rank(b)
  })
}

export function formatReviewDate(raw?: string | null): string | null {
  if (!raw) return null
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatReviewCountry(raw?: string | null): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (/^[a-z]{2}$/i.test(s)) {
    try {
      return new Intl.DisplayNames(['fr'], { type: 'region' }).of(s.toUpperCase()) || s.toUpperCase()
    } catch {
      return s.toUpperCase()
    }
  }
  return s
}

export function formatReviewType(raw?: string | null): string | null {
  if (!raw) return null
  const t = String(raw).trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!t) return null
  const map: Record<string, string> = {
    couple: 'En couple',
    family: 'En famille',
    family_with_children: 'En famille',
    family_with_kids: 'En famille',
    solo: 'Solo',
    solo_traveller: 'Solo',
    solo_traveler: 'Solo',
    business: 'Affaires',
    group: 'Entre amis',
    friends: 'Entre amis',
    other: 'Voyageur',
  }
  if (map[t]) return map[t]
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ')
}

export function reviewMetaLine(r: HotelGuestReview): string {
  return [
    r.name?.trim() || null,
    formatReviewCountry(r.country),
    formatReviewType(r.type),
    formatReviewDate(r.date),
  ]
    .filter(Boolean)
    .join(' · ')
}

export function reviewExcerpt(r: HotelGuestReview): string {
  return [r.headline, r.pros, r.text, r.cons].filter(Boolean).join('\n\n')
}

/** Real LiteAPI hotel ids only — skip soft-fill placeholders like "primary". */
export function isFetchableHotelId(id?: string | null): boolean {
  const s = String(id || '').trim()
  if (!s) return false
  if (s === 'primary' || s.startsWith('soft-') || s.startsWith('photo-')) return false
  return true
}
