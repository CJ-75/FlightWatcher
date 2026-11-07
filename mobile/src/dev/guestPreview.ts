import type {
  ActivityCardModel,
  CreatePlannedTripRequest,
  EnrichedTripResponse,
  InvitePreview,
  LikedActivity,
  LikedDeal,
  MyTripDraft,
  PlannedTrip,
  PlannedTripDetail,
  SavedFavorite,
  TravelDeal,
  TripMember,
  TripProposal,
  User,
} from '@flightwatcher/shared'

/** Token local pour tester l’onboarding invitation en Expo. */
export const DEV_INVITE_TOKEN = 'dev-invite-preview'

/** Fake user so Planner / Favoris / Compte show logged-in UI in Expo __DEV__. */
export const DEV_GUEST_USER = {
  id: 'dev-guest',
  email: 'expo-preview@local',
  user_metadata: { full_name: 'Aperçu Expo' },
  app_metadata: {},
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00.000Z',
} as User

function nextWeekend(): { out: string; back: string } {
  const today = new Date()
  const untilSat = (6 - today.getDay() + 7) % 7 || 7
  const sat = new Date(today)
  sat.setDate(today.getDate() + untilSat)
  const sun = new Date(sat)
  sun.setDate(sat.getDate() + 1)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { out: iso(sat), back: iso(sun) }
}

const { out, back } = nextWeekend()

function mockTrip(
  dest: string,
  destFull: string,
  price: number,
  goodDeal = false,
  dateOut?: string,
  dateBack?: string,
  origin = 'BVA',
  originFull = 'Beauvais',
): EnrichedTripResponse {
  const outDate = dateOut || out
  const backDate = dateBack || back
  return {
    aller: {
      flightNumber: `FR${1000 + Math.floor(Math.random() * 8000)}`,
      origin,
      originFull,
      destination: dest,
      destinationFull: destFull,
      departureTime: `${outDate}T07:40:00`,
      price: Math.round(price * 0.5),
      currency: 'EUR',
    },
    retour: {
      flightNumber: `FR${1000 + Math.floor(Math.random() * 8000)}`,
      origin: dest,
      originFull: destFull,
      destination: origin,
      destinationFull: originFull,
      departureTime: `${backDate}T21:15:00`,
      price: Math.round(price * 0.5),
      currency: 'EUR',
    },
    prix_total: price,
    destination_code: dest,
    airline: 'FR',
    provider: 'ryanair',
    is_good_deal: goodDeal,
  }
}

const INSPIRE_POOL: { code: string; name: string; price: number }[] = [
  { code: 'LIS', name: 'Lisbonne', price: 48 },
  { code: 'BCN', name: 'Barcelone', price: 62 },
  { code: 'FCO', name: 'Rome', price: 71 },
  { code: 'OPO', name: 'Porto', price: 55 },
  { code: 'BUD', name: 'Budapest', price: 59 },
  { code: 'PRG', name: 'Prague', price: 64 },
  { code: 'MAD', name: 'Madrid', price: 68 },
  { code: 'MLA', name: 'Malte', price: 74 },
]

function tripScanDates(trip: PlannedTripDetail): { out: string; back: string } {
  const outDate = trip.dates_depart?.[0]?.date?.slice(0, 10)
  const backDate =
    trip.dates_retour?.[trip.dates_retour.length - 1]?.date?.slice(0, 10) ||
    trip.dates_retour?.[0]?.date?.slice(0, 10)
  return {
    out: outDate || out,
    back: backDate || back,
  }
}

function buildScanProposals(trip: PlannedTripDetail): TripProposal[] {
  const codes = (trip.arrival_airport || '')
    .split(/[,;|]/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{3}$/.test(c))

  const targets =
    codes.length > 0
      ? codes.slice(0, 4).map((code, i) => {
          const known = INSPIRE_POOL.find((p) => p.code === code)
          return {
            code,
            name: known?.name || code,
            price: known?.price ?? 55 + i * 8,
          }
        })
      : INSPIRE_POOL.slice(0, 4)

  const { out: dateOut, back: dateBack } = tripScanDates(trip)
  const origin = (trip.departure_airport || 'BVA').trim().toUpperCase() || 'BVA'
  const now = Date.now()
  return targets.map((t, i) => ({
    id: `dev-proposal-${trip.id}-${now}-${i}`,
    trip_id: trip.id,
    trip_data: mockTrip(
      t.code,
      t.name,
      t.price + i * 5,
      i === 0,
      dateOut,
      dateBack,
      origin,
      origin,
    ),
    status: 'pending' as const,
    created_at: new Date().toISOString(),
  }))
}

function cloneTrip(t: PlannedTripDetail): PlannedTripDetail {
  return {
    ...t,
    dates_depart: [...(t.dates_depart || [])],
    dates_retour: [...(t.dates_retour || [])],
    proposals: (t.proposals || []).map((p) => ({ ...p, trip_data: { ...p.trip_data } })),
    members: (t.members || []).map((m) => ({ ...m })),
  }
}

function seedTrip(): PlannedTripDetail {
  const id = 'dev-trip-lisbonne'
  return {
    id,
    organizer_id: DEV_GUEST_USER.id,
    name: 'Weekend Lisbonne',
    departure_airport: 'BVA',
    arrival_airport: 'LIS',
    passengers: 2,
    dates_depart: [{ date: out, heure_min: '00:00', heure_max: '23:59' }],
    dates_retour: [{ date: back, heure_min: '00:00', heure_max: '23:59' }],
    budget_max: 150,
    invite_token: 'dev-invite-preview',
    status: 'planning',
    created_at: new Date().toISOString(),
    proposals_count: 0,
    proposals: [],
    members: [
      {
        id: 'dev-member-1',
        trip_id: id,
        user_id: DEV_GUEST_USER.id,
        display_name: 'Aperçu Expo',
        role: 'organizer',
        status: 'joined',
        joined_at: new Date().toISOString(),
      },
      {
        id: 'dev-member-2',
        trip_id: id,
        user_id: null,
        display_name: 'Camille',
        role: 'traveler',
        status: 'guest',
        joined_at: new Date().toISOString(),
      },
    ],
  }
}

const sampleDeal: TravelDeal = {
  id: 'mock-lisbonne-w1',
  title: 'Weekend à Lisbonne',
  city: 'Lisbonne',
  country: 'Portugal',
  image_url:
    'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=900&q=80&auto=format&fit=crop',
  price_per_person: 189,
  currency: 'EUR',
  nights: 2,
  departure_airport: 'BVA',
  dates: { outbound: out, inbound: back },
  hotel_name: 'Hotel Lisboa Central',
  hotel_stars: 3,
  board: 'Petit-déjeuner',
  highlights: ['Vol A/R inclus', 'Hôtel centre-ville'],
  description: 'Aperçu Expo. Deal liké sans compte.',
  provider: 'mock',
  booking_url: 'https://www.expedia.fr/Lisbon.d178307.Destination-Travel-Guides',
  badge: 'Week-end',
}

const sampleFlightTrip = mockTrip('LIS', 'Lisbonne', 48, true)

let trips: PlannedTripDetail[] = [seedTrip()]
let likedDealIds = new Set<string>([sampleDeal.id])
let likedDeals: LikedDeal[] = [
  {
    id: 'dev-liked-1',
    deal_id: sampleDeal.id,
    deal: sampleDeal,
    created_at: new Date().toISOString(),
  },
]
let flightFavorites: SavedFavorite[] = [
  {
    id: 'dev-fav-1',
    trip: sampleFlightTrip,
    searchRequest: {
      aeroport_depart: 'BVA',
      dates_depart: [{ date: out }],
      dates_retour: [{ date: back }],
      budget_max: 80,
      passengers: 1,
    },
    createdAt: new Date().toISOString(),
    isStillValid: true,
  },
]

function toListItem(t: PlannedTripDetail): PlannedTrip {
  const { proposals: _p, members: _m, ...rest } = t
  return { ...rest, proposals_count: t.proposals.length }
}

export function listGuestTrips(): PlannedTrip[] {
  return trips
    .filter((t) => t.status !== 'archived')
    .map((t) => toListItem(cloneTrip(t)))
}

/** Aperçu invitation pour tester l’onboarding (sans backend). */
export function getDevInvitePreview(token?: string | null): InvitePreview | null {
  const t = String(token || '').trim()
  if (!t.startsWith('dev-invite-')) return null
  const trip =
    trips.find((row) => row.invite_token === t) ||
    trips.find((row) => row.id === 'dev-trip-lisbonne') ||
    trips[0]
  if (!trip) return null
  return {
    name: trip.name,
    departure_airport: trip.departure_airport,
    arrival_airport: trip.arrival_airport,
    passengers: trip.passengers,
    dates_depart: trip.dates_depart,
    dates_retour: trip.dates_retour,
    budget_max: trip.budget_max,
    organizer_name: 'Aperçu Expo',
    accepted_trip: null,
    members_count: trip.members?.length || 1,
    invite_token: t || DEV_INVITE_TOKEN,
  }
}

/** Trip id local pour simuler un join après onboarding Expo. */
export function resolveDevInviteTripId(token?: string | null): string | null {
  const t = String(token || '').trim()
  if (!t.startsWith('dev-invite-')) return null
  const trip =
    trips.find((row) => row.invite_token === t) ||
    trips.find((row) => row.id === 'dev-trip-lisbonne') ||
    trips[0]
  return trip?.id || null
}

export function getGuestTrip(id: string): PlannedTripDetail | null {
  const trip = trips.find((t) => t.id === id)
  return trip ? cloneTrip(trip) : null
}

export function addGuestTrip(body: CreatePlannedTripRequest): PlannedTrip {
  const id = `dev-trip-${Date.now()}`
  const row: PlannedTripDetail = {
    id,
    organizer_id: DEV_GUEST_USER.id,
    name: body.name,
    departure_airport: body.departure_airport,
    arrival_airport: body.arrival_airport ?? null,
    passengers: body.passengers,
    direct: !!body.direct,
    dates_depart: body.dates_depart,
    dates_retour: body.dates_retour,
    budget_max: body.budget_max,
    invite_token: `dev-invite-${id}`,
    status: 'planning',
    created_at: new Date().toISOString(),
    proposals_count: 0,
    proposals: [],
    members: [
      {
        id: `${id}-org`,
        trip_id: id,
        user_id: DEV_GUEST_USER.id,
        display_name: 'Aperçu Expo',
        role: 'organizer',
        status: 'joined',
        joined_at: new Date().toISOString(),
      },
    ],
  }
  trips = [row, ...trips]
  return toListItem(cloneTrip(row))
}

/** Search → Planner (guest): locked trip with flight already accepted. */
export function addGuestTripFromFlight(opts: {
  trip: EnrichedTripResponse
  passengers?: number
}): PlannedTripDetail {
  const { trip } = opts
  const passengers = Math.min(6, Math.max(1, opts.passengers || 1))
  const outIso = String(trip.aller?.departureTime || '').slice(0, 10)
  const retIso = String(trip.retour?.departureTime || '').slice(0, 10)
  const outTime = String(trip.aller?.departureTime || '').includes('T')
    ? String(trip.aller.departureTime).split('T')[1]?.slice(0, 5) || '00:00'
    : '00:00'
  const retTime = String(trip.retour?.departureTime || '').includes('T')
    ? String(trip.retour.departureTime).split('T')[1]?.slice(0, 5) || '00:00'
    : '00:00'
  const city =
    trip.aller?.destinationFull?.split('(')[0]?.trim() ||
    trip.destination_code ||
    'Voyage'
  const id = `dev-trip-${Date.now()}`
  const proposalId = `dev-prop-${Date.now()}`
  const now = new Date().toISOString()
  const proposal: TripProposal = {
    id: proposalId,
    trip_id: id,
    trip_data: trip,
    status: 'accepted',
    created_at: now,
  }
  const row: PlannedTripDetail = {
    id,
    organizer_id: DEV_GUEST_USER.id,
    name: city,
    departure_airport: trip.aller?.origin || 'BVA',
    arrival_airport: trip.destination_code || null,
    passengers,
    direct: (trip.transfers ?? 0) === 0,
    dates_depart: [{ date: outIso, heure_min: outTime, heure_max: outTime }],
    dates_retour: [{ date: retIso, heure_min: retTime, heure_max: retTime }],
    budget_max: Math.max(1, Math.round(Number(trip.prix_total) || 200)),
    invite_token: `dev-invite-${id}`,
    status: 'locked',
    created_at: now,
    proposals_count: 1,
    proposals: [proposal],
    accepted_proposal: proposal,
    members: [
      {
        id: `${id}-org`,
        trip_id: id,
        user_id: DEV_GUEST_USER.id,
        display_name: 'Aperçu Expo',
        role: 'organizer',
        status: 'joined',
        joined_at: now,
      },
    ],
  }
  trips = [row, ...trips]
  return cloneTrip(row)
}

/** Séjour → Planner (guest): locked trip from Mon voyage draft (vol + hôtel). */
export function addGuestTripFromMyTripDraft(opts: {
  draft: MyTripDraft
  city?: string | null
}): PlannedTripDetail {
  const { draft } = opts
  const payload = (draft.payload || {}) as Record<string, unknown>
  const flight = (payload.flight || {}) as Record<string, unknown>
  const hotel =
    (draft.hotel as Record<string, unknown> | null | undefined) ||
    (payload.hotel as Record<string, unknown> | null | undefined) ||
    null
  const origin = String(
    flight.origin_iata || draft.origin_iata || payload.origin_iata || 'BVA',
  )
  const dest = String(
    flight.destination_iata || draft.dest_iata || payload.destination || '',
  )
  const outRaw = String(
    flight.outbound_local ||
      flight.out_dep_local ||
      draft.out_date ||
      '',
  )
  const retRaw = String(
    flight.inbound_local ||
      flight.ret_dep_local ||
      draft.ret_date ||
      '',
  )
  const outIso = outRaw.slice(0, 10)
  const retIso = retRaw.slice(0, 10)
  const outTime = outRaw.includes('T')
    ? outRaw.split('T')[1]?.slice(0, 5) || '12:00'
    : '12:00'
  const retTime = retRaw.includes('T')
    ? retRaw.split('T')[1]?.slice(0, 5) || '12:00'
    : '12:00'
  const price = Number(flight.price_pp || payload.price_per_person || 0)
  const city =
    opts.city ||
    draft.city_name ||
    String(payload.city || '') ||
    dest ||
    'Voyage'
  const passengers = Math.min(6, Math.max(1, Number(draft.adults) || 1))
  const id = `dev-trip-${Date.now()}`
  const proposalId = `dev-prop-${Date.now()}`
  const now = new Date().toISOString()
  const tripData = {
    aller: {
      flightNumber: '',
      origin,
      originFull: origin,
      destination: dest,
      destinationFull: city,
      departureTime: outRaw.length === 10 ? `${outRaw}T12:00:00` : outRaw,
      price,
      currency: 'EUR',
    },
    retour: {
      flightNumber: '',
      origin: dest,
      originFull: city,
      destination: origin,
      destinationFull: origin,
      departureTime: retRaw.length === 10 ? `${retRaw}T12:00:00` : retRaw,
      price: 0,
      currency: 'EUR',
    },
    prix_total: price,
    destination_code: dest,
    provider: flight.provider as string | undefined,
    airline: (flight.airline || flight.carrier) as string | undefined,
    transfers: flight.direct === false ? 1 : 0,
    booking_url: (flight.booking_url || payload.booking_url) as
      | string
      | undefined,
  } as EnrichedTripResponse
  const proposal: TripProposal = {
    id: proposalId,
    trip_id: id,
    trip_data: tripData,
    status: 'accepted',
    created_at: now,
  }
  const row: PlannedTripDetail = {
    id,
    organizer_id: DEV_GUEST_USER.id,
    name: city,
    departure_airport: origin,
    arrival_airport: dest || null,
    passengers,
    direct: flight.direct !== false,
    dates_depart: [{ date: outIso, heure_min: outTime, heure_max: outTime }],
    dates_retour: [{ date: retIso, heure_min: retTime, heure_max: retTime }],
    budget_max: Math.max(1, Math.round(price) || 200),
    invite_token: `dev-invite-${id}`,
    status: 'locked',
    created_at: now,
    proposals_count: 1,
    proposals: [proposal],
    accepted_proposal: proposal,
    members: [
      {
        id: `${id}-org`,
        trip_id: id,
        user_id: DEV_GUEST_USER.id,
        display_name: 'Aperçu Expo',
        role: 'organizer',
        status: 'joined',
        joined_at: now,
      },
    ],
  }
  // Keep hotel on a side map keyed by trip for TripDetail guest workspace
  ;(row as PlannedTripDetail & { _guestHotel?: unknown })._guestHotel = hotel
  trips = [row, ...trips]
  return cloneTrip(row)
}

/** Simulate a price scan — always refreshes pending proposals. */
export async function scanGuestTrip(id: string): Promise<PlannedTripDetail | null> {
  const idx = trips.findIndex((t) => t.id === id)
  if (idx < 0) return null

  // Reopen like the API: drop accepted/pending before inserting a new scan.
  const prior = trips[idx]
  const keptRejected = (prior.proposals || [])
    .filter((p) => p.status === 'accepted' || p.status === 'rejected')
    .map((p) =>
      p.status === 'accepted' ? { ...p, status: 'rejected' as const } : p,
    )

  trips[idx] = {
    ...prior,
    status: 'scanning',
    proposals: keptRejected,
    proposals_count: 0,
  }

  await new Promise((r) => setTimeout(r, 900))

  const proposals = buildScanProposals(trips[idx])
  trips[idx] = {
    ...trips[idx],
    status: 'planning',
    proposals: [...proposals, ...keptRejected],
    proposals_count: proposals.length,
  }
  return cloneTrip(trips[idx])
}

export function acceptGuestProposal(proposalId: string): PlannedTripDetail | null {
  const idx = trips.findIndex((t) => t.proposals.some((p) => p.id === proposalId))
  if (idx < 0) return null
  const trip = trips[idx]
  trips[idx] = {
    ...trip,
    status: 'locked',
    proposals: trip.proposals.map((p) =>
      p.id === proposalId
        ? { ...p, status: 'accepted' as const }
        : p.status === 'pending'
          ? { ...p, status: 'rejected' as const }
          : p,
    ),
  }
  return cloneTrip(trips[idx])
}

export function rejectGuestProposal(proposalId: string): PlannedTripDetail | null {
  const idx = trips.findIndex((t) => t.proposals.some((p) => p.id === proposalId))
  if (idx < 0) return null
  const trip = trips[idx]
  trips[idx] = {
    ...trip,
    proposals: trip.proposals.map((p) =>
      p.id === proposalId ? { ...p, status: 'rejected' as const } : p,
    ),
  }
  return cloneTrip(trips[idx])
}

export function addGuestTripMember(
  tripId: string,
  displayName: string,
  email?: string,
): PlannedTripDetail | null {
  const idx = trips.findIndex((t) => t.id === tripId)
  if (idx < 0) return null
  const trip = trips[idx]
  const name = displayName.trim()
  if (name.length < 2) throw new Error('Nom trop court')
  if ((trip.members || []).length >= 6) throw new Error('Maximum 6 personnes')
  const em = (email || '').trim().toLowerCase()
  if (!em || !em.includes('@')) throw new Error('Email requis')

  const member: TripMember = {
    id: `dev-member-${Date.now()}`,
    trip_id: tripId,
    user_id: null,
    display_name: name,
    email: em,
    role: 'traveler',
    status: 'guest',
    joined_at: new Date().toISOString(),
  }
  const members = [...(trip.members || []), member]
  const seats = Math.max(trip.passengers, Math.min(6, members.length))
  trips[idx] = { ...trip, members, passengers: seats }
  return cloneTrip(trips[idx])
}

export function removeGuestTripMember(
  tripId: string,
  memberId: string,
): PlannedTripDetail | null {
  const idx = trips.findIndex((t) => t.id === tripId)
  if (idx < 0) return null
  const trip = trips[idx]
  const target = (trip.members || []).find((m) => m.id === memberId)
  if (!target) throw new Error('Voyageur introuvable')
  if (target.role === 'organizer') throw new Error("Impossible de retirer l'organisateur")
  trips[idx] = {
    ...trip,
    members: (trip.members || []).filter((m) => m.id !== memberId),
  }
  return cloneTrip(trips[idx])
}

export function completeGuestTrip(tripId: string): PlannedTripDetail | null {
  const idx = trips.findIndex((t) => t.id === tripId)
  if (idx < 0) return null
  trips[idx] = {
    ...trips[idx],
    status: 'completed',
    auto_scan_enabled: false,
    updated_at: new Date().toISOString(),
  }
  return cloneTrip(trips[idx])
}

export function deleteGuestTrip(tripId: string): boolean {
  const idx = trips.findIndex((t) => t.id === tripId)
  if (idx < 0) return false
  trips[idx] = {
    ...trips[idx],
    status: 'archived',
    auto_scan_enabled: false,
    updated_at: new Date().toISOString(),
  }
  return true
}

export function updateGuestTripArrival(
  tripId: string,
  arrival: string | null,
): PlannedTripDetail | null {
  const idx = trips.findIndex((t) => t.id === tripId)
  if (idx < 0) return null
  trips[idx] = {
    ...trips[idx],
    arrival_airport: arrival,
    route_ok: true,
    invalid_arrival_codes: [],
  }
  return cloneTrip(trips[idx])
}

export function updateGuestTripName(
  tripId: string,
  name: string,
): PlannedTripDetail | null {
  const cleaned = name.trim()
  if (cleaned.length < 2 || cleaned.length > 80) return null
  const idx = trips.findIndex((t) => t.id === tripId)
  if (idx < 0) return null
  trips[idx] = { ...trips[idx], name: cleaned }
  return cloneTrip(trips[idx])
}

export function listGuestLikedDeals(): LikedDeal[] {
  return likedDeals
}

export function listGuestLikedDealIds(): string[] {
  return [...likedDealIds]
}

export function likeGuestDeal(deal: TravelDeal) {
  likedDealIds.add(deal.id)
  if (!likedDeals.some((d) => d.deal_id === deal.id)) {
    likedDeals = [
      {
        id: `dev-liked-${Date.now()}`,
        deal_id: deal.id,
        deal,
        created_at: new Date().toISOString(),
      },
      ...likedDeals,
    ]
  }
}

export function unlikeGuestDeal(dealId: string) {
  likedDealIds.delete(dealId)
  likedDeals = likedDeals.filter((d) => d.deal_id !== dealId)
}

let likedActivities: LikedActivity[] = []
const likedActivityIds = new Set<string>()

export function listGuestLikedActivities(): LikedActivity[] {
  return likedActivities
}

export function listGuestLikedActivityIds(): string[] {
  return [...likedActivityIds]
}

export function likeGuestActivity(card: ActivityCardModel) {
  if (!card.productCode) return
  likedActivityIds.add(card.productCode)
  if (!likedActivities.some((a) => a.product_code === card.productCode)) {
    likedActivities = [
      {
        id: `dev-liked-act-${Date.now()}`,
        product_code: card.productCode,
        activity: { ...card },
        created_at: new Date().toISOString(),
      },
      ...likedActivities,
    ]
  }
}

export function unlikeGuestActivity(productCode: string) {
  likedActivityIds.delete(productCode)
  likedActivities = likedActivities.filter((a) => a.product_code !== productCode)
}

export function listGuestFlightFavorites(): SavedFavorite[] {
  return flightFavorites
}

export function removeGuestFlightFavorite(id: string) {
  flightFavorites = flightFavorites.filter((f) => f.id !== id)
}
