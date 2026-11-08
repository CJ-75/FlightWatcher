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

describe('publishRules anchored steps', () => {
  it('blocks when fewer than 3 place/activity steps', () => {
    const items = [
      step({ kind: 'place', place_id: 'p1' }),
      step({ kind: 'place', place_id: 'p2' }),
      step({ kind: 'free', title: 'Pause' }),
    ]
    const blockers = getPublishBlockers(base, items)
    expect(blockers.some((b) => b.code === 'steps_anchored_min')).toBe(true)
    expect(canPublish(base, items)).toBe(false)
  })

  it('allows publish with 3 anchored + free extras', () => {
    const items = [
      step({ kind: 'place', place_id: 'p1' }),
      step({ kind: 'place', place_id: 'p2' }),
      step({ kind: 'activity', viator_product_code: 'V123' }),
      step({ kind: 'free', title: 'Pause' }),
    ]
    expect(canPublish(base, items)).toBe(true)
  })

  it('warns free steps', () => {
    const items = [step({ kind: 'free', title: 'Libre' })]
    const w = getPublishWarnings(base, items)
    expect(w[0]?.message).toMatch(/n’apparaîtra pas dans l’itinéraire/)
  })
})
