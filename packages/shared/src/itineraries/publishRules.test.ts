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

const tagged = { ...base, occasions: ['week_end'] as Itinerary['occasions'] }

function freeReady(
  partial: Partial<ItineraryItem> = {},
): ItineraryItem {
  const { meta: metaPartial, ...rest } = partial
  return step({
    kind: 'free',
    title: 'Tour Eiffel',
    day_offset: 0,
    moment: 'afternoon',
    photo: 'https://example.com/p.jpg',
    ...rest,
    meta: {
      maps_url: 'https://maps.app.goo.gl/x',
      photos: ['https://example.com/p.jpg'],
      budget_eur: 0,
      ...(metaPartial || {}),
    },
  })
}

describe('publishRules steps', () => {
  it('blocks when no steps', () => {
    const blockers = getPublishBlockers(tagged, [])
    expect(blockers.some((b) => b.code === 'steps_min')).toBe(true)
    expect(canPublish(tagged, [])).toBe(false)
  })

  it('blocks when tag missing', () => {
    const blockers = getPublishBlockers(base, [freeReady()])
    expect(blockers.some((b) => b.code === 'tag')).toBe(true)
  })

  it('allows publish with complete free steps', () => {
    const items = [freeReady(), freeReady({ title: 'Café', id: 'y' })]
    expect(canPublish(tagged, items)).toBe(true)
  })

  it('blocks free steps missing maps / photos / moment / budget', () => {
    const items = [step({ kind: 'free', title: 'Libre' })]
    const blockers = getPublishBlockers(tagged, items)
    expect(blockers.some((b) => b.code.startsWith('maps_'))).toBe(true)
    expect(blockers.some((b) => b.code.startsWith('photos_'))).toBe(true)
    expect(blockers.some((b) => b.code.startsWith('moment_'))).toBe(true)
    expect(blockers.some((b) => b.code.startsWith('budget_'))).toBe(true)
    expect(canPublish(tagged, items)).toBe(false)
  })

  it('allows publish with place/activity mix', () => {
    const items = [
      step({ kind: 'place', place_id: 'p1' }),
      step({ kind: 'activity', viator_product_code: 'V123' }),
    ]
    expect(canPublish(tagged, items)).toBe(true)
  })

  it('has no soft maps warnings (now blockers)', () => {
    expect(getPublishWarnings(tagged, [step({ kind: 'free', title: 'Libre' })])).toEqual(
      [],
    )
  })
})
