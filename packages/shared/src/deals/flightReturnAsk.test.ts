import { describe, expect, it } from 'vitest'
import {
  parseFlightReturnAsk,
  serializeFlightReturnAsk,
  shouldShowFlightReturnAsk,
  type FlightReturnAsk,
} from './flightReturnAsk'

const base: FlightReturnAsk = {
  draftToken: 'tok-1',
  at: 1_000_000,
  promptOnReturn: true,
}

describe('flightReturnAsk', () => {
  it('round-trips serialize/parse', () => {
    const raw = serializeFlightReturnAsk(base)
    expect(parseFlightReturnAsk(raw)).toEqual(base)
    expect(parseFlightReturnAsk(null)).toBeNull()
    expect(parseFlightReturnAsk('{')).toBeNull()
  })

  it('prompts after min elapsed, not before', () => {
    expect(
      shouldShowFlightReturnAsk(base, { now: 1_000_500, minElapsedMs: 1200 }),
    ).toBe(false)
    expect(
      shouldShowFlightReturnAsk(base, { now: 1_001_300, minElapsedMs: 1200 }),
    ).toBe(true)
  })

  it('skips Travelpayouts / already booked / wrong token / expired', () => {
    expect(
      shouldShowFlightReturnAsk(
        { ...base, promptOnReturn: false },
        { now: 1_002_000 },
      ),
    ).toBe(false)
    expect(
      shouldShowFlightReturnAsk(base, { now: 1_002_000, alreadyBooked: true }),
    ).toBe(false)
    expect(
      shouldShowFlightReturnAsk(base, {
        now: 1_002_000,
        draftToken: 'other',
      }),
    ).toBe(false)
    expect(
      shouldShowFlightReturnAsk(base, {
        now: 1_000_000 + 3 * 60 * 60 * 1000,
      }),
    ).toBe(false)
  })
})
