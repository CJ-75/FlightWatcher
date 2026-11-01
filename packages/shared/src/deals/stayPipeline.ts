/**
 * Mon séjour pipeline: Vol → Hôtel → Activités (OFF) → Restos (OFF).
 */

export type StayStepId = 'flight' | 'hotel' | 'activities' | 'restaurants'

export type FlightStepStatus = 'none' | 'selected_fw' | 'booked_fw' | 'external'

export type HotelStepStatus = 'none' | 'selected' | 'booked'

export type PipelineStepState = 'done' | 'current' | 'upcoming' | 'off'

export type StayPipelineStep = {
  id: StayStepId
  label: string
  shortLabel: string
  state: PipelineStepState
  /** Subcopy under the step when current / done */
  hint?: string
}

export function resolveFlightStepStatus(opts: {
  hasFlightPayload?: boolean
  flightBooked?: boolean
  externalFlight?: boolean
  bookingUrl?: string | null
}): FlightStepStatus {
  if (opts.flightBooked) return 'booked_fw'
  if (opts.externalFlight) return 'external'
  if (opts.hasFlightPayload || opts.bookingUrl) return 'selected_fw'
  return 'none'
}

export function resolveHotelStepStatus(opts: {
  hasHotel?: boolean
  hotelBooked?: boolean
}): HotelStepStatus {
  if (opts.hotelBooked) return 'booked'
  if (opts.hasHotel) return 'selected'
  return 'none'
}

export function buildStayPipeline(opts: {
  flight: FlightStepStatus
  hotel: HotelStepStatus
  /** Which step the user is viewing / acting on */
  focus?: StayStepId
  /** PLANNER_ACTIVITIES_ENABLED / ACTIVITIES */
  activitiesEnabled?: boolean
  activitiesDone?: boolean
  activitiesPartial?: boolean
  activitiesHint?: string
  restaurantsEnabled?: boolean
}): StayPipelineStep[] {
  const flightDone = opts.flight === 'booked_fw' || opts.flight === 'external'
  const flightPartial = opts.flight === 'selected_fw'
  const hotelDone = opts.hotel === 'booked'
  const hotelPartial = opts.hotel === 'selected'
  const activitiesOn = Boolean(opts.activitiesEnabled)
  const restaurantsOn = Boolean(opts.restaurantsEnabled)
  const activitiesDone = Boolean(opts.activitiesDone)
  const activitiesPartial = Boolean(opts.activitiesPartial)

  const flightHint =
    opts.flight === 'booked_fw'
      ? 'Réservé'
      : opts.flight === 'external'
        ? 'Vol ailleurs'
        : opts.flight === 'selected_fw'
          ? 'À réserver'
          : 'Optionnel'

  const hotelHint =
    opts.hotel === 'booked'
      ? 'Réservé'
      : opts.hotel === 'selected'
        ? 'À payer'
        : 'Choisir'

  // Current = first incomplete active step, unless focus overrides
  let current: StayStepId = 'flight'
  if (flightDone || flightPartial) {
    current = hotelDone ? (activitiesOn ? 'activities' : 'hotel') : 'hotel'
  }
  if (hotelDone && (flightDone || flightPartial || opts.flight === 'none')) {
    current = activitiesOn ? 'activities' : 'hotel'
  }
  if (activitiesOn && activitiesDone && hotelDone) {
    current = restaurantsOn ? 'restaurants' : 'activities'
  }
  if (opts.focus === 'flight' || opts.focus === 'hotel') {
    current = opts.focus
  }
  if (opts.focus === 'activities' && activitiesOn) {
    current = 'activities'
  }
  if (opts.focus === 'restaurants' && restaurantsOn) {
    current = 'restaurants'
  }

  const step = (
    id: StayStepId,
    label: string,
    shortLabel: string,
    done: boolean,
    partial: boolean,
    off: boolean,
    hint?: string,
  ): StayPipelineStep => {
    if (off) {
      return { id, label, shortLabel, state: 'off', hint: 'Bientôt' }
    }
    if (done) return { id, label, shortLabel, state: 'done', hint }
    if (id === current || (partial && id === current)) {
      return { id, label, shortLabel, state: 'current', hint }
    }
    if (partial) return { id, label, shortLabel, state: 'current', hint }
    return { id, label, shortLabel, state: 'upcoming', hint }
  }

  return [
    step('flight', 'Vol', 'Vol', flightDone, flightPartial, false, flightHint),
    step('hotel', 'Hôtel', 'Hôtel', hotelDone, hotelPartial, false, hotelHint),
    step(
      'activities',
      'Activités',
      'Activités',
      activitiesDone,
      activitiesPartial,
      !activitiesOn,
      activitiesOn ? opts.activitiesHint || 'Choisir' : 'Bientôt',
    ),
    step(
      'restaurants',
      'Restos',
      'Restos',
      false,
      false,
      !restaurantsOn,
      restaurantsOn ? 'Choisir' : 'Bientôt',
    ),
  ]
}
