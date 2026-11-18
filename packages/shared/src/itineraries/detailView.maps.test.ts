import { describe, expect, it } from 'vitest'
import {
  buildItineraryMapsUrl,
  buildItinerarySticky,
  buildLaunchPopPlan,
  buildTransitToStopUrl,
  buildWalkingStopsUrl,
  mapsOriginFromCoords,
  withMapsDirOrigin,
  MAPS_DIR_MAX_STOPS,
} from './detailView'
import type { Itinerary, ItineraryItem } from './types'

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

const baseItin = {
  id: '1',
  slug: 'x',
  title: 'Pop',
  city_slug: 'paris',
  status: 'published',
  author_kind: 'admin',
  itinerary_items: [],
} as Itinerary

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

describe('buildItinerarySticky', () => {
  it('always uses make_trip + launch_pop secondary', () => {
    const local = buildItinerarySticky({
      itinerary: baseItin,
      userCitySlug: 'paris',
      originCityLabel: 'Paris',
    })
    expect(local.ctaAction).toBe('make_trip')
    expect(local.ctaLabel).toBe('Ajouter au Planner')
    expect(local.secondaryAction).toBe('launch_pop')
    expect(local.nudge).toBeNull()

    const elsew = buildItinerarySticky({
      itinerary: baseItin,
      userCitySlug: 'lyon',
      originCityLabel: 'Lyon',
    })
    expect(elsew.nudge).toContain('Lyon')
    expect(elsew.ctaAction).toBe('make_trip')
  })
})

describe('launch pop urls', () => {
  it('transit has no waypoints', () => {
    const url = buildTransitToStopUrl(step({ title: 'Louvre' }))
    expect(url).toContain('travelmode=transit')
    expect(url).toContain('destination=Louvre')
    expect(url).not.toContain('waypoints=')
  })

  it('withMapsDirOrigin injects lat,lng', () => {
    const base = buildTransitToStopUrl(step({ title: 'Louvre' }))!
    const next = withMapsDirOrigin(
      base,
      mapsOriginFromCoords(48.8738, 2.295),
    )
    expect(next).toContain('origin=48.8738%2C2.295')
    expect(next).toContain('destination=Louvre')
    expect(next).not.toContain('Current+Location')
  })

  it('walking uses waypoints under cap', () => {
    const url = buildWalkingStopsUrl([
      step({ title: 'A', position: 0 }),
      step({ title: 'B', position: 1 }),
      step({ title: 'C', position: 2 }),
    ])
    expect(url).toContain('travelmode=walking')
    expect(url).toContain('waypoints=B')
  })

  it('buildLaunchPopPlan exposes transit + walk legs', () => {
    const plan = buildLaunchPopPlan([
      step({ title: 'A', day_offset: 0, position: 0 }),
      step({ title: 'B', day_offset: 0, position: 1 }),
    ])
    expect(plan.days).toHaveLength(1)
    expect(plan.days[0].segments[0].legs.map((l) => l.kind)).toEqual([
      'transit',
      'walk',
    ])
    expect(plan.days[0].segments[0].legs[0].ctaLabel).toContain('Y aller')
    expect(plan.days[0].segments[0].legs[1].ctaLabel).toContain('Lancer')
  })

  it('splits when more than MAPS_DIR_MAX_STOPS', () => {
    const many = Array.from({ length: MAPS_DIR_MAX_STOPS + 3 }, (_, i) =>
      step({ id: `s${i}`, title: `S${i}`, position: i, day_offset: 0 }),
    )
    const plan = buildLaunchPopPlan(many)
    expect(plan.days[0].segments.length).toBeGreaterThan(1)
  })
})
