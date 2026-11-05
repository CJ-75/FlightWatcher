import { describe, expect, it } from 'vitest'
import { resolveNextStayAction } from './stayPipeline'

/** Sticky CTA matrix per product surface state (Vols handoff → Séjours → Activités → Planner). */
describe('resolveNextStayAction surface matrix', () => {
  it('Vols / early Mon voyage: push flight book', () => {
    expect(
      resolveNextStayAction({
        flightBooked: false,
        hotelBooked: false,
        hasHotelSelected: false,
      }).id,
    ).toBe('flight')
  })

  it('Séjours: pick then pay hotel', () => {
    expect(
      resolveNextStayAction({
        flightBooked: true,
        hotelBooked: false,
        hasHotelSelected: false,
      }).id,
    ).toBe('hotel_pick')
    expect(
      resolveNextStayAction({
        flightBooked: true,
        hotelBooked: false,
        hasHotelSelected: true,
      }).id,
    ).toBe('hotel_pay')
  })

  it('Activités after hotel booked when enabled', () => {
    expect(
      resolveNextStayAction({
        flightBooked: true,
        hotelBooked: true,
        activitiesEnabled: true,
        activitiesDone: false,
      }).id,
    ).toBe('activities')
    expect(
      resolveNextStayAction({
        flightBooked: true,
        hotelBooked: true,
        activitiesEnabled: false,
        hasPlanner: true,
      }).id,
    ).toBe('planner')
  })

  it('Planner / Compte bookings fallback', () => {
    expect(
      resolveNextStayAction({
        flightBooked: true,
        hotelBooked: true,
        activitiesEnabled: true,
        activitiesDone: true,
        hasPlanner: true,
      }).id,
    ).toBe('planner')
    expect(
      resolveNextStayAction({
        flightBooked: true,
        hotelBooked: true,
        activitiesDone: true,
      }).id,
    ).toBe('bookings')
  })

  it('Adresses never primary when restaurants off', () => {
    expect(
      resolveNextStayAction({
        flightBooked: true,
        hotelBooked: true,
        activitiesEnabled: true,
        activitiesDone: true,
        restaurantsEnabled: false,
        hasPlanner: true,
      }).id,
    ).toBe('planner')
  })
})
