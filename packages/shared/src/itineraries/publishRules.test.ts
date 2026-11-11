import { describe, expect, it } from 'vitest'
import {
  getPublishBlockers,
  getPublishWarnings,
  canPublish,
} from './publishRules'
import type { Itinerary, ItineraryItem } from './types'

const base: Partial<Itinerary> = {
  title: 'T',
  slug: 't',
  intro: 'Intro assez longue pour passer.',
  cover_image: 'https://example.com/c.jpg',
  city_slug: 'paris',
}

function step(
  partial: Partial<ItineraryItem> & { kind: ItineraryItem['kind'] },
): ItineraryItem {
  return {
    id: partial.id || 'x',
    itinerary_id: 'i',
    position: 0,
    ...partial,
  }
}

describe('publishRules steps', () => {
  it('blocks when no steps', () => {
    const blockers = getPublishBlockers(base, [])
    expect(blockers.some((b) => b.code === 'steps_min')).toBe(true)
    expect(canPublish(base, [])).toBe(false)
  })

  it('allows publish with free steps (no verified place, no notes)', () => {
    const items = [
      step({ kind: 'free', title: 'Tour Eiffel', meta: { maps_url: 'https://maps.app.goo.gl/x' } }),
      step({ kind: 'free', title: 'Café' }),
    ]
    expect(canPublish(base, items)).toBe(true)
  })

  it('allows publish with place/activity mix', () => {
    const items = [
      step({ kind: 'place', place_id: 'p1' }),
      step({ kind: 'activity', viator_product_code: 'V123' }),
    ]
    expect(canPublish(base, items)).toBe(true)
  })

  it('warns free steps without maps (non-blocking)', () => {
    const items = [step({ kind: 'free', title: 'Libre' })]
    const w = getPublishWarnings(base, items)
    expect(w[0]?.code).toMatch(/free_no_maps/)
    expect(canPublish(base, items)).toBe(true)
  })
})
