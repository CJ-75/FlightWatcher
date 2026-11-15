import { describe, expect, it } from 'vitest'
import {
  buildPopDocumentTitle,
  buildPopMetaDescription,
  clipSeo,
  hasTravelTimesInItems,
  tipsPerDayOk,
} from './popSeo'
import { evaluatePopIndexability } from './popIndex'

describe('popSeo', () => {
  it('keeps document title ≤ 60', () => {
    const t = buildPopDocumentTitle({
      title:
        'Paris en deux jours itinéraire complet pour une première visite longue',
      target_query:
        'Paris en deux jours itinéraire complet pour une première visite longue',
    })
    expect(t.length).toBeLessThanOrEqual(60)
  })

  it('builds description in 140–160 band when possible', () => {
    const d = buildPopMetaDescription({
      intro:
        'Deux jours pour découvrir Paris sans courir entre rive droite et rive gauche avec pauses.',
      cityLabel: 'Paris',
      durationLabel: 'Week-end',
      stopCount: 6,
    })
    expect(d.length).toBeGreaterThanOrEqual(140)
    expect(d.length).toBeLessThanOrEqual(160)
  })

  it('clipSeo truncates cleanly', () => {
    expect(clipSeo('abc def ghi', 7).endsWith('…')).toBe(true)
  })

  it('tipsPerDayOk and travel times', () => {
    expect(tipsPerDayOk(['a', 'b'], 2)).toBe(true)
    expect(tipsPerDayOk(['a'], 2)).toBe(false)
    expect(
      hasTravelTimesInItems([{ meta: { travel_minutes: 10 } }, { meta: {} }]),
    ).toBe(true)
  })
})

describe('popIndex', () => {
  it('demo or closed city → not indexable', () => {
    const r = evaluatePopIndexability({
      status: 'published',
      is_demo: true,
      intro: 'x'.repeat(100),
      cover_image: 'https://x.test/a.jpg',
      photo_license: 'Unsplash',
      verified_at: '2026-01-01',
      city_indexable: true,
      stopCount: 4,
      stopsWithNote: 4,
      imageCount: 3,
      hasTravelTimes: true,
      tipsPerDayOk: true,
      hasLivePrice: true,
    })
    expect(r.indexable).toBe(false)
    expect(r.reasons).toContain('is_demo')
  })
})
