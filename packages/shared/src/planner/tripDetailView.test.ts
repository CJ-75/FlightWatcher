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

  it('orga flight_selected not booked → book flight', () => {
    const a = resolveTripPrimaryAction({
      phase: 'flight_selected',
      role: 'organizer',
      flightBooked: false,
    })
    expect(a.id).toBe('book_flight')
  })

  it('orga flight_selected booked → choose hotel', () => {
    const a = resolveTripPrimaryAction({
      phase: 'flight_selected',
      role: 'organizer',
      flightBooked: true,
    })
    expect(a.id).toBe('choose_hotel')
  })

  it('past member → leave review', () => {
    const a = resolveTripPrimaryAction({
      phase: 'past',
      role: 'member',
    })
    expect(a.id).toBe('leave_review')
  })
})

describe('buildTripDetailView', () => {
  it('exposes three tabs and hides activities step when flag off', () => {
    const v = buildTripDetailView({
      phase: 'planning',
      role: 'organizer',
      activitiesEnabled: false,
    })
    expect(v.tabs.map((t) => t.id)).toEqual([
      'apercu',
      'programme',
      'carnet',
    ])
    expect(v.showStepsActivities).toBe(false)
  })
})
