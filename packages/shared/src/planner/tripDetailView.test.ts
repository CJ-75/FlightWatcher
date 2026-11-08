import { describe, expect, it } from 'vitest'
import {
  buildTripDetailView,
  resolveTripPrimaryAction,
} from './tripDetailView'

describe('resolveTripPrimaryAction', () => {
  it('orga planning without proposals → scan', () => {
    const a = resolveTripPrimaryAction({
      phase: 'planning',
      role: 'organizer',
      hasProposals: false,
    })
    expect(a.id).toBe('scan')
    expect(a.label).toMatch(/recherche/i)
  })

  it('member planning without proposals → waiting', () => {
    const a = resolveTripPrimaryAction({
      phase: 'planning',
      role: 'member',
      hasProposals: false,
      organizerFirstName: 'Chris',
    })
    expect(a.id).toBe('waiting_flight')
    expect(a.informational).toBe(true)
    expect(a.label).toContain('Chris')
  })

  it('orga flight_selected not booked → book with airline', () => {
    const a = resolveTripPrimaryAction({
      phase: 'flight_selected',
      role: 'organizer',
      flightBooked: false,
      airlineLabel: 'Ryanair',
    })
    expect(a.id).toBe('book_flight')
    expect(a.label).toBe('Réserver sur Ryanair')
  })

  it('orga flight_selected booked → choose hotel', () => {
    const a = resolveTripPrimaryAction({
      phase: 'flight_selected',
      role: 'organizer',
      flightBooked: true,
    })
    expect(a.id).toBe('choose_hotel')
  })

  it('composing orga includes price when provided', () => {
    const a = resolveTripPrimaryAction({
      phase: 'composing',
      role: 'organizer',
      hotelFinalizePriceLabel: '189 €',
    })
    expect(a.id).toBe('finalize_hotel')
    expect(a.label).toContain('189 €')
  })

  it('booked and past → view programme for both roles', () => {
    expect(
      resolveTripPrimaryAction({ phase: 'booked', role: 'organizer' }).id,
    ).toBe('view_programme')
    expect(
      resolveTripPrimaryAction({ phase: 'past', role: 'member' }).id,
    ).toBe('view_programme')
  })
})

describe('buildTripDetailView', () => {
  it('exposes two tabs only', () => {
    const v = buildTripDetailView({
      phase: 'planning',
      role: 'organizer',
      activitiesEnabled: false,
      restaurantsEnabled: false,
    })
    expect(v.tabs.map((t) => t.id)).toEqual([
      'apercu',
      'programme',
      'voyageurs',
    ])
    expect(v.showStepsActivities).toBe(false)
    expect(v.showStepsAddresses).toBe(false)
  })

  it('builds étapes tiles when pipeline inputs present', () => {
    const v = buildTripDetailView({
      phase: 'flight_selected',
      role: 'organizer',
      flight: 'selected_fw',
      hotel: 'none',
      activitiesEnabled: true,
      restaurantsEnabled: true,
    })
    expect(v.steps.map((s) => s.id)).toEqual([
      'flight',
      'hotel',
      'activities',
      'restaurants',
    ])
    expect(v.steps.find((s) => s.id === 'flight')?.state).toBe('done')
  })
})
