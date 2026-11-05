/**
 * Smoke E2E logique sticky par surface (sans navigateur).
 * Run: node packages/shared/src/deals/surfaceWorkflow.smoke.mjs
 *
 * Mirror of resolveNextStayAction — keep in sync with stayPipeline.ts.
 */
function resolveNextStayAction(opts) {
  const flightBooked = Boolean(opts.flightBooked)
  const hotelBooked = Boolean(opts.hotelBooked)
  const hasHotel = Boolean(opts.hasHotelSelected)
  if (!flightBooked) return { id: 'flight' }
  if (!hotelBooked) {
    if (hasHotel) return { id: 'hotel_pay' }
    return { id: 'hotel_pick' }
  }
  if (opts.activitiesEnabled && !opts.activitiesDone) return { id: 'activities' }
  if (opts.restaurantsEnabled && !opts.restaurantsDone) return { id: 'restaurants' }
  if (opts.hasPlanner) return { id: 'planner' }
  return { id: 'bookings' }
}

function shouldShowFlightReturnAsk(ask, opts = {}) {
  if (!ask || opts.alreadyBooked) return false
  if (!ask.promptOnReturn) return false
  const want = (opts.draftToken || '').trim()
  if (want && ask.draftToken !== want) return false
  const now = opts.now ?? Date.now()
  const elapsed = now - ask.at
  if (elapsed < (opts.minElapsedMs ?? 1200)) return false
  if (elapsed > (opts.maxAgeMs ?? 2 * 60 * 60 * 1000)) return false
  return true
}

let failed = 0
function assert(cond, msg) {
  if (!cond) {
    failed += 1
    console.error('FAIL', msg)
  } else {
    console.log('ok ', msg)
  }
}

assert(
  resolveNextStayAction({ flightBooked: false }).id === 'flight',
  'Vols sticky → flight',
)
assert(
  resolveNextStayAction({
    flightBooked: true,
    hasHotelSelected: false,
  }).id === 'hotel_pick',
  'Séjours sticky → hotel_pick',
)
assert(
  resolveNextStayAction({
    flightBooked: true,
    hasHotelSelected: true,
  }).id === 'hotel_pay',
  'Séjours sticky → hotel_pay',
)
assert(
  resolveNextStayAction({
    flightBooked: true,
    hotelBooked: true,
    activitiesEnabled: true,
  }).id === 'activities',
  'Activités sticky → activities',
)
assert(
  resolveNextStayAction({
    flightBooked: true,
    hotelBooked: true,
    activitiesEnabled: true,
    activitiesDone: true,
    hasPlanner: true,
  }).id === 'planner',
  'Planner sticky → planner',
)
assert(
  resolveNextStayAction({
    flightBooked: true,
    hotelBooked: true,
    hasPlanner: false,
  }).id === 'bookings',
  'Compte sticky → bookings',
)
assert(
  resolveNextStayAction({
    flightBooked: true,
    hotelBooked: true,
    activitiesDone: true,
    restaurantsEnabled: false,
    hasPlanner: true,
  }).id === 'planner',
  'Adresses off → not restaurants',
)

const ask = { draftToken: 't1', at: 1_000_000, promptOnReturn: true }
assert(
  !shouldShowFlightReturnAsk(ask, { now: 1_000_500 }),
  'ask-booked ignores focus blip',
)
assert(
  shouldShowFlightReturnAsk(ask, { now: 1_002_000 }),
  'ask-booked after return',
)
assert(
  !shouldShowFlightReturnAsk(
    { ...ask, promptOnReturn: false },
    { now: 1_002_000 },
  ),
  'Travelpayouts skips prompt',
)

if (failed) {
  console.error(`\n${failed} smoke assertion(s) failed`)
  process.exit(1)
}
console.log('\nSurface workflow smoke OK')
