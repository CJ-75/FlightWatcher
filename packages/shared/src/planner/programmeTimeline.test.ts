import { describe, expect, it } from 'vitest'
import {
  buildProgrammeTimeline,
  isOvernightFlight,
  programmeDayLabelFr,
} from './programmeTimeline'

describe('isOvernightFlight', () => {
  it('detects next-day arrival', () => {
    expect(
      isOvernightFlight('2026-11-14T22:10:00', '2026-11-15T00:40:00'),
    ).toBe(true)
    expect(
      isOvernightFlight('2026-11-14T10:00:00', '2026-11-14T12:00:00'),
    ).toBe(false)
  })
})

describe('buildProgrammeTimeline', () => {
  it('needsDates when no dates and no flight/hotel', () => {
    const t = buildProgrammeTimeline({ hasFlight: false })
    expect(t.needsDates).toBe(true)
    expect(t.days).toHaveLength(0)
  })

  it('shows Vol à choisir when dates known but no flight', () => {
    const t = buildProgrammeTimeline({
      outDate: '2026-11-14',
      retDate: '2026-11-17',
      hasFlight: false,
    })
    expect(t.needsDates).toBe(false)
    expect(t.days[0].slots[0].items[0]?.title).toMatch(/vol à choisir/i)
    expect(t.days[0].slots[0].items[0]?.action).toBe('scan')
    expect(t.days[0].label).toMatch(/nov/i)
  })

  it('puts unplaced activities in unplaced bucket with hint', () => {
    const t = buildProgrammeTimeline({
      outDate: '2026-11-14',
      retDate: '2026-11-16',
      hasFlight: true,
      items: [
        {
          id: 'a1',
          item_type: 'activity',
          title: 'Tour',
          day_offset: null,
          moment: null,
        },
      ],
    })
    expect(t.unplaced.some((x) => x.title === 'Tour')).toBe(true)
    expect(t.unplacedHint).toMatch(/placement/i)
  })

  it('places activity without moment under Dans la journée', () => {
    const t = buildProgrammeTimeline({
      outDate: '2026-11-14',
      retDate: '2026-11-16',
      hasFlight: true,
      items: [
        {
          id: 'a2',
          item_type: 'activity',
          title: 'Musée',
          day_offset: 1,
          moment: null,
        },
      ],
    })
    const day1 = t.days.find((d) => d.dayOffset === 1)
    const daytime = day1?.slots.find((s) => s.moment === 'daytime')
    expect(daytime?.items.some((i) => i.title === 'Musée')).toBe(true)
  })

  it('overnight outbound shows arrival on next day', () => {
    const t = buildProgrammeTimeline({
      outDate: '2026-11-14',
      retDate: '2026-11-16',
      hasFlight: true,
      flightOutDepAt: '2026-11-14T22:00:00',
      flightOutArrAt: '2026-11-15T01:00:00',
      hasHotel: true,
      hotelLabel: 'Hotel Test',
    })
    const day1 = t.days.find((d) => d.dayOffset === 1)
    expect(day1?.slots.some((s) => s.items.some((i) => i.id === 'flight-out-arrival'))).toBe(
      true,
    )
    expect(
      day1?.slots.some((s) =>
        s.items.some((i) => i.title === 'Arrivée à l’hôtel'),
      ),
    ).toBe(true)
  })

  it('includes addresses when restaurantsEnabled', () => {
    const t = buildProgrammeTimeline({
      outDate: '2026-11-14',
      retDate: '2026-11-15',
      hasFlight: true,
      restaurantsEnabled: true,
      items: [
        {
          id: 'r1',
          item_type: 'restaurant',
          title: 'Resto',
          day_offset: 0,
          moment: 'evening',
        },
      ],
    })
    const placed = t.days.flatMap((d) => d.slots.flatMap((s) => s.items))
    expect(placed.some((i) => i.title === 'Resto' && i.kind === 'address')).toBe(
      true,
    )
  })

  it('skips skipped items and marks empty days', () => {
    const t = buildProgrammeTimeline({
      outDate: '2026-11-14',
      retDate: '2026-11-16',
      hasFlight: true,
      items: [
        {
          id: 'x',
          item_type: 'activity',
          title: 'Skip',
          day_offset: 1,
          moment: 'morning',
          status: 'skipped',
        },
      ],
    })
    const day1 = t.days.find((d) => d.dayOffset === 1)
    expect(day1?.empty).toBe(true)
  })

  it('formats day labels like short FR date', () => {
    expect(programmeDayLabelFr('2026-11-14')).toMatch(/14/)
  })
})
