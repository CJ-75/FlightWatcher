import { describe, expect, it } from 'vitest'
import {
  displayLegFlightNumber,
  flightTicketBadgeFr,
  flightTicketKickerFr,
} from './flightTicketCopy'

describe('flightTicketCopy', () => {
  it('kicker depends on booked state', () => {
    expect(flightTicketKickerFr(false)).toMatch(/à réserver/i)
    expect(flightTicketKickerFr(true)).toMatch(/embarquement/i)
    expect(flightTicketBadgeFr(false)).toBe('Vol choisi')
    expect(flightTicketBadgeFr(true)).toBe('Vol réservé')
  })

  it('hides duplicated retour flight number', () => {
    expect(displayLegFlightNumber('aller', 'J9122', 'J9122')).toBe('J9122')
    expect(displayLegFlightNumber('retour', 'J9122', 'J9122')).toBe('—')
    expect(displayLegFlightNumber('retour', 'J9122', 'J9456')).toBe('J9456')
  })
})
