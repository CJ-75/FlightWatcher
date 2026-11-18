import { describe, expect, it } from 'vitest'
import { tripItemsToItineraryItems } from './tripItemsToItinerary'

describe('tripItemsToItineraryItems', () => {
  it('excludes skipped planner activities', () => {
    const items = tripItemsToItineraryItems(
      [
        {
          id: 'a1',
          item_type: 'activity',
          title: 'Keep',
          status: 'validated',
          day_offset: 0,
        },
        {
          id: 'a2',
          item_type: 'activity',
          title: 'Removed',
          status: 'skipped',
          day_offset: 0,
        },
        {
          id: 'a3',
          item_type: 'activity',
          title: 'Idea',
          status: 'idea',
          day_offset: 1,
        },
      ],
      { itineraryId: 'itin-1' },
    )
    expect(items.map((i) => i.id)).toEqual(['a1', 'a3'])
    expect(items.every((i) => i.title !== 'Removed')).toBe(true)
  })
})
