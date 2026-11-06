import { describe, expect, it } from 'vitest'
import { computeTripPartyPrice } from './tripPartyPrice'

describe('computeTripPartyPrice', () => {
  it('keeps duo math euro-exact when hotel total is odd', () => {
    const p = computeTripPartyPrice({
      adults: 2,
      flightPp: 50,
      hotelTotal: 101,
    })
    expect(p.hotelPp).toBe(51)
    expect(p.hotelTotal).toBe(102)
    expect(p.perPerson).toBe(101)
    expect(p.total).toBe(202)
    expect(p.flightPp + p.hotelPp).toBe(p.perPerson)
    expect(p.perPerson * p.adults).toBe(p.total)
  })

  it('sums rounded components for four pax', () => {
    const p = computeTripPartyPrice({
      adults: 4,
      flightPp: 50.4,
      hotelTotal: 199.6,
    })
    expect(p.flightPp).toBe(50)
    expect(p.hotelPp).toBe(50)
    expect(p.total).toBe(400)
    expect(p.perPerson * 4).toBe(p.total)
  })
})
