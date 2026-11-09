import type { DealOccasionChip } from '../types'

/** Inspire-toi rail — labels/icons immediately; counts merge from API. */
export const DEAL_INSPIRE_SEED: DealOccasionChip[] = [
  { slug: 'sans-conge', label: 'Sans poser de congé', icon: 'briefcase-off' },
  { slug: 'hiver-soleil', label: 'Fuyez l’hiver', icon: 'sun' },
  { slug: 'moins-200', label: 'Moins de 200 €', icon: 'euro' },
]

export const DEAL_INSPIRE_HIDDEN = new Set([
  'max-sur-place',
  'hors-vacances',
  'pepites',
  'ambiance-noel',
  'pont-noel',
  'nouvel-an',
])

/** Prefer seed order, then remaining API chips. Keep seed chrome; take API counts. */
export function mergeDealOccasionChips(
  fromApi: DealOccasionChip[],
  seed: DealOccasionChip[] = DEAL_INSPIRE_SEED,
): DealOccasionChip[] {
  const bySlug = new Map(fromApi.map((c) => [c.slug, c]))
  const ordered: DealOccasionChip[] = []
  for (const s of seed) {
    const hit = bySlug.get(s.slug)
    if (hit) {
      ordered.push({
        ...s,
        ...hit,
        label: hit.label || s.label,
        icon: hit.icon || s.icon,
        count: hit.count ?? s.count,
      })
      bySlug.delete(s.slug)
    } else {
      ordered.push(s)
    }
  }
  for (const c of fromApi) {
    if (bySlug.has(c.slug)) ordered.push(c)
  }
  return ordered
}

/** Fill missing chip counts from the deals wall (occasion_tags). */
export function applyDealOccasionCountsFromWall(
  chips: DealOccasionChip[],
  deals: Array<{ occasion_tags?: string[] | null }>,
): DealOccasionChip[] {
  const counts: Record<string, number> = {}
  for (const d of deals || []) {
    for (const raw of d.occasion_tags || []) {
      const slug = String(raw || '')
        .trim()
        .toLowerCase()
      if (!slug) continue
      counts[slug] = (counts[slug] || 0) + 1
    }
  }
  if (!Object.keys(counts).length) return chips
  return chips.map((c) => {
    if (typeof c.count === 'number' && c.count > 0) return c
    const n = counts[c.slug]
    return n != null ? { ...c, count: n } : c
  })
}
