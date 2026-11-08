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

/** Prefer seed order, then remaining API chips. */
export function mergeDealOccasionChips(
  fromApi: DealOccasionChip[],
  seed: DealOccasionChip[] = DEAL_INSPIRE_SEED,
): DealOccasionChip[] {
  const bySlug = new Map(fromApi.map((c) => [c.slug, c]))
  const ordered: DealOccasionChip[] = []
  for (const s of seed) {
    const hit = bySlug.get(s.slug)
    if (hit) {
      ordered.push(hit)
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
