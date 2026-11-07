import { describe, expect, it } from 'vitest'
import { buildProgrammeTimeline } from './programmeTimeline'

describe('buildProgrammeTimeline', () => {
  it('builds skeleton flight when no flight chosen', () => {
    const t = buildProgrammeTimeline({
      outDate: '2026-11-14',
      retDate: '2026-11-17',
      hasFlight: false,
    })
    expect(t.days.length).toBeGreaterThan(1)
    expect(t.days[0].slots[0].items[0]?.title).toMatch(/à choisir/i)
  })

  it('puts unplaced activities in unplaced bucket', () => {
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
  })

  it('ignores restaurant items', () => {
    const t = buildProgrammeTimeline({
      hasFlight: true,
      nights: 2,
      items: [
        {
          id: 'r1',
          item_type: 'restaurant',
          title: 'Resto',
          day_offset: 1,
          moment: 'evening',
        },
      ],
    })
    expect(t.days.flatMap((d) => d.slots.flatMap((s) => s.items))).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'Resto' })]),
    )
  })
})
