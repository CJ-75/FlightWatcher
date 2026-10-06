import type {
  CreatePlannedTripRequest,
  EnrichedTripResponse,
  LikedDeal,
  PlannedTrip,
  PlannedTripDetail,
  SavedFavorite,
  TravelDeal,
  TripMember,
  TripProposal,
  User,
} from '@flightwatcher/shared'

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
    status: 'draft',
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
  description: 'Aperçu Expo — deal liké sans compte.',
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
  return trips.map((t) => toListItem(cloneTrip(t)))
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
    dates_depart: body.dates_depart,
    dates_retour: body.dates_retour,
    budget_max: body.budget_max,
    invite_token: `dev-invite-${id}`,
    status: 'draft',
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

/** Simulate a price scan — always refreshes pending proposals. */
export async function scanGuestTrip(id: string): Promise<PlannedTripDetail | null> {
  const idx = trips.findIndex((t) => t.id === id)
  if (idx < 0) return null

  trips[idx] = {
    ...trips[idx],
    status: 'scanning',
  }

  await new Promise((r) => setTimeout(r, 900))

  const proposals = buildScanProposals(trips[idx])
  trips[idx] = {
    ...trips[idx],
    status: 'planning',
    proposals,
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
): PlannedTripDetail | null {
  const idx = trips.findIndex((t) => t.id === tripId)
  if (idx < 0) return null
  const trip = trips[idx]
  const name = displayName.trim()
  if (name.length < 2) throw new Error('Nom trop court')
  if ((trip.members || []).length >= 6) throw new Error('Maximum 6 voyageurs')

  const member: TripMember = {
    id: `dev-member-${Date.now()}`,
    trip_id: tripId,
    user_id: null,
    display_name: name,
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

export function deleteGuestTrip(tripId: string): boolean {
  const before = trips.length
  trips = trips.filter((t) => t.id !== tripId)
  return trips.length < before
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

export function listGuestFlightFavorites(): SavedFavorite[] {
  return flightFavorites
}

export function removeGuestFlightFavorite(id: string) {
  flightFavorites = flightFavorites.filter((f) => f.id !== id)
}
