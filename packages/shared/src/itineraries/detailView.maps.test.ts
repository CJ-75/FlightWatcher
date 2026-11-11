import { describe, expect, it } from 'vitest'
import { buildItineraryMapsUrl } from './detailView'
import type { ItineraryItem } from './types'

function step(partial: Partial<ItineraryItem> & { kind?: ItineraryItem['kind'] }): ItineraryItem {
  return {
    id: partial.id || 'x',
    itinerary_id: 'i',
    position: partial.position ?? 0,
    kind: partial.kind || 'free',
    title: partial.title,
    day_offset: partial.day_offset ?? 0,
    moment: partial.moment ?? null,
    meta: partial.meta,
    places: partial.places,
    ...partial,
  }
}

describe('buildItineraryMapsUrl', () => {
  it('returns single pasted maps_url when one free step', () => {
    const url = buildItineraryMapsUrl([
      step({
        title: 'Tour Eiffel',
        meta: { maps_url: 'https://maps.app.goo.gl/abc' },
      }),
    ])
    expect(url).toBe('https://maps.app.goo.gl/abc')
  })

  it('composes multi-stop dir when >1 free steps with titles', () => {
    const url = buildItineraryMapsUrl([
      step({ title: 'Tour Eiffel', position: 0 }),
      step({ title: 'Louvre', position: 1 }),
      step({ title: 'Café', position: 2 }),
    ])
    expect(url).toContain('https://www.google.com/maps/dir/?')
    expect(url).toContain('origin=Tour+Eiffel')
    expect(url).toContain('destination=Caf')
    expect(url).toContain('waypoints=Louvre')
    expect(url).toContain('travelmode=walking')
  })

  it('prefers lat/lng from meta for waypoints', () => {
    const url = buildItineraryMapsUrl([
      step({ title: 'A', meta: { lat: 48.85, lng: 2.29 } }),
      step({ title: 'B', meta: { lat: 48.86, lng: 2.33 } }),
    ])
    expect(url).toContain('origin=48.85%2C2.29')
    expect(url).toContain('destination=48.86%2C2.33')
  })

  it('orders by day then moment', () => {
    const url = buildItineraryMapsUrl([
      step({ title: 'Soir', day_offset: 0, moment: 'evening', position: 0 }),
      step({ title: 'Matin', day_offset: 0, moment: 'morning', position: 1 }),
      step({ title: 'J2', day_offset: 1, moment: 'afternoon', position: 0 }),
    ])
    expect(url).toContain('origin=Matin')
    expect(url).toContain('waypoints=Soir')
    expect(url).toContain('destination=J2')
  })
})
