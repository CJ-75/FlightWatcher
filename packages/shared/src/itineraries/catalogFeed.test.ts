import { describe, expect, it } from 'vitest'
import {
  buildParcoursFeed,
  featuredRowTitle,
  itineraryDatedLabelFr,
} from './catalogFeed'
import type { Itinerary } from './types'

function sample(
  partial: Partial<Itinerary> & { id: string; title: string },
): Itinerary {
  return {
    status: 'published',
    author_kind: 'admin',
    occasions: [],
    ...partial,
  }
}

describe('buildParcoursFeed', () => {
  it('excludes À la une items from Près de toi', () => {
    const featured = sample({
      id: 'f1',
      title: 'Férié',
      city_slug: 'paris',
      occasions: ['ferie'],
      featured_from: '2026-11-01',
      featured_to: '2026-11-11',
      sort_weight: 20,
    })
    const near = sample({
      id: 'n1',
      title: 'Balade',
      city_slug: 'paris',
      occasions: ['romantique'],
      sort_weight: 10,
    })
    const rows = buildParcoursFeed([featured, near], {
      citySlug: 'paris',
      today: '2026-11-08',
    })
    const feat = rows.find((r) => r.kind === 'featured')
    const nearRow = rows.find((r) => r.kind === 'near')
    expect(feat?.items.map((x) => x.id)).toEqual(['f1'])
    expect(nearRow?.items.map((x) => x.id)).toEqual(['n1'])
  })

  it('titles férié row with weekday from featured_to', () => {
    const title = featuredRowTitle([
      sample({
        id: 'f1',
        title: 'F',
        occasions: ['ferie'],
        featured_from: '2026-11-01',
        featured_to: '2026-11-11', // mercredi
      }),
    ])
    expect(title).toBe('Pour le férié de mercredi')
  })

  it('formats dated label from featured_to for férié', () => {
    expect(
      itineraryDatedLabelFr({
        featured_from: '2026-11-01',
        featured_to: '2026-11-11',
        occasions: ['ferie'],
      }),
    ).toBe('Mercredi 11 novembre')
  })

  it('places parcours only under primary occasion (not secondary tags)', () => {
    const amis = sample({
      id: 'a1',
      title: 'Soirée amis',
      city_slug: 'paris',
      // Badge « Amis » = 1er tag ; saison en second ne doit pas le mettre dans De saison
      occasions: ['amis', 'saison'],
      sort_weight: 5,
    })
    const saison = sample({
      id: 's1',
      title: 'Automne',
      city_slug: 'paris',
      occasions: ['saison'],
      sort_weight: 5,
    })
    const rows = buildParcoursFeed([amis, saison], { citySlug: 'paris' })
    const saisonRow = rows.find(
      (r) => r.kind === 'occasion' && r.occasion === 'saison',
    )
    const amisRow = rows.find(
      (r) => r.kind === 'occasion' && r.occasion === 'amis',
    )
    expect(saisonRow?.items.map((x) => x.id)).toEqual(['s1'])
    expect(amisRow?.items.map((x) => x.id)).toEqual(['a1'])

    const filtered = buildParcoursFeed([amis, saison], {
      citySlug: 'paris',
      occasionFilter: 'saison',
    })
    expect(filtered[0]?.kind).toBe('occasion')
    if (filtered[0]?.kind === 'occasion') {
      expect(filtered[0].items.map((x) => x.id)).toEqual(['s1'])
    }
  })
})
