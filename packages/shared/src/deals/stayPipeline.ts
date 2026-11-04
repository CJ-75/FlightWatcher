/**
 * Mon séjour pipeline: Vol → Hôtel → Activités (OFF) → Restos (OFF).
 */

export type StayStepId = 'flight' | 'hotel' | 'activities' | 'restaurants'

export type FlightStepStatus = 'none' | 'selected_fw' | 'booked_fw' | 'external'

export type HotelStepStatus = 'none' | 'selected' | 'booked' | 'external'

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
  externalHotel?: boolean
}): HotelStepStatus {
  if (opts.hotelBooked) return 'booked'
  if (opts.externalHotel) return 'external'
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
  restaurantsDone?: boolean
  restaurantsPartial?: boolean
  restaurantsHint?: string
  /** Organizer chose « Pas de restaurant prévu » */
  restaurantsSkipped?: boolean
}): StayPipelineStep[] {
  // Choosing a flight (Planner accept / draft payload) completes Vol in green;
  // booked_fw / external keep a stronger "Réservé" / "ailleurs" hint.
  const flightDone =
    opts.flight === 'booked_fw' ||
    opts.flight === 'external' ||
    opts.flight === 'selected_fw'
  const flightPartial = false
  const hotelDone = opts.hotel === 'booked' || opts.hotel === 'external'
  const hotelPartial = opts.hotel === 'selected'
  const activitiesOn = Boolean(opts.activitiesEnabled)
  const restaurantsOn = Boolean(opts.restaurantsEnabled)
  const activitiesDone = Boolean(opts.activitiesDone)
  const activitiesPartial = Boolean(opts.activitiesPartial)
  const restaurantsDone =
    Boolean(opts.restaurantsDone) || Boolean(opts.restaurantsSkipped)
  const restaurantsPartial = Boolean(opts.restaurantsPartial)

  const flightHint =
    opts.flight === 'booked_fw'
      ? 'Réservé'
      : opts.flight === 'external'
        ? 'Vol ailleurs'
        : opts.flight === 'selected_fw'
          ? 'Choisi'
          : 'Choisir'

  const hotelHint =
    opts.hotel === 'booked'
      ? 'Réservé'
      : opts.hotel === 'external'
        ? 'Hôtel ailleurs'
        : opts.hotel === 'selected'
          ? 'À payer'
          : 'Choisir'

  // Current = first incomplete active step, unless focus overrides
  let current: StayStepId = 'flight'
  if (flightDone) {
    current = hotelDone ? (activitiesOn ? 'activities' : 'hotel') : 'hotel'
  }
  if (hotelDone && (flightDone || opts.flight === 'none')) {
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
  if (opts.focus === 'restaurants' && restaurantsOn && hotelDone) {
    current = 'restaurants'
  }

  const restaurantsUnlocked = restaurantsOn && hotelDone

  const step = (
    id: StayStepId,
    label: string,
    shortLabel: string,
    done: boolean,
    _partial: boolean,
    off: boolean,
    hint?: string,
  ): StayPipelineStep => {
    if (off) {
      return { id, label, shortLabel, state: 'off', hint: hint || 'Bientôt' }
    }
    if (done) return { id, label, shortLabel, state: 'done', hint }
    // Exactly one lit step — partial progress stays "upcoming" unless it is current.
    if (id === current) {
      return { id, label, shortLabel, state: 'current', hint }
    }
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
      'Adresses',
      'Adresses',
      restaurantsDone,
      restaurantsPartial,
      !restaurantsUnlocked,
      !restaurantsOn
        ? 'Bientôt'
        : !hotelDone
          ? 'Après l’hôtel'
          : opts.restaurantsSkipped
            ? 'Passé'
            : opts.restaurantsHint || 'Choisir',
    ),
  ]
}

/** Next primary CTA after progress (vol → hôtel → activités → restos → planner). */
export type StayNextActionId =
  | 'flight'
  | 'hotel_pay'
  | 'hotel_pick'
  | 'activities'
  | 'restaurants'
  | 'planner'
  | 'bookings'

export type StayNextAction = {
  id: StayNextActionId
  label: string
}

export function resolveNextStayAction(opts: {
  flightBooked?: boolean
  hotelBooked?: boolean
  hasHotelSelected?: boolean
  activitiesEnabled?: boolean
  activitiesDone?: boolean
  restaurantsEnabled?: boolean
  restaurantsDone?: boolean
  hasPlanner?: boolean
}): StayNextAction {
  const flightBooked = Boolean(opts.flightBooked)
  const hotelBooked = Boolean(opts.hotelBooked)
  const hasHotel = Boolean(opts.hasHotelSelected)

  if (!flightBooked) {
    return { id: 'flight', label: 'Réserver mon vol maintenant' }
  }
  if (!hotelBooked) {
    if (hasHotel) {
      return { id: 'hotel_pay', label: 'Payer ma chambre' }
    }
    return { id: 'hotel_pick', label: 'Choisir mon hôtel' }
  }
  if (opts.activitiesEnabled && !opts.activitiesDone) {
    return { id: 'activities', label: 'Planifier des activités' }
  }
  if (opts.restaurantsEnabled && !opts.restaurantsDone) {
    return { id: 'restaurants', label: 'Restaurants autour de ton hôtel' }
  }
  if (opts.hasPlanner) {
    return { id: 'planner', label: 'Retour au planner' }
  }
  return { id: 'bookings', label: 'Voir mes réservations' }
}
