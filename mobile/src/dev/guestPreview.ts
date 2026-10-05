import type {
  CreatePlannedTripRequest,
  EnrichedTripResponse,
  LikedDeal,
  PlannedTrip,
  PlannedTripDetail,
  SavedFavorite,
  TravelDeal,
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

const sampleFlightTrip: EnrichedTripResponse = {
  aller: {
    flightNumber: 'FR1234',
    origin: 'BVA',
    originFull: 'Beauvais',
    destination: 'LIS',
    destinationFull: 'Lisbonne',
    departureTime: `${out}T07:40:00`,
    price: 24,
    currency: 'EUR',
  },
  retour: {
    flightNumber: 'FR1235',
    origin: 'LIS',
    originFull: 'Lisbonne',
    destination: 'BVA',
    destinationFull: 'Beauvais',
    departureTime: `${back}T21:15:00`,
    price: 24,
    currency: 'EUR',
  },
  prix_total: 48,
  destination_code: 'LIS',
  is_good_deal: true,
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

function seedProposal(tripId: string): TripProposal {
  return {
    id: 'dev-proposal-lis',
    trip_id: tripId,
    trip_data: sampleFlightTrip,
    status: 'pending',
    created_at: new Date().toISOString(),
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
    proposals_count: 1,
    proposals: [seedProposal(id)],
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
    ],
  }
}

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
  return trips.map(toListItem)
}

export function getGuestTrip(id: string): PlannedTripDetail | null {
  return trips.find((t) => t.id === id) ?? null
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
  return toListItem(row)
}

export function scanGuestTrip(id: string): PlannedTripDetail | null {
  const trip = trips.find((t) => t.id === id)
  if (!trip) return null
  if (trip.proposals.length === 0) {
    trip.proposals = [seedProposal(id)]
  }
  trip.status = 'planning'
  trip.proposals_count = trip.proposals.length
  return trip
}

export function acceptGuestProposal(proposalId: string): PlannedTripDetail | null {
  const trip = trips.find((t) => t.proposals.some((p) => p.id === proposalId))
  if (!trip) return null
  trip.proposals = trip.proposals.map((p) =>
    p.id === proposalId ? { ...p, status: 'accepted' } : { ...p, status: 'rejected' },
  )
  trip.status = 'locked'
  return trip
}

export function rejectGuestProposal(proposalId: string): PlannedTripDetail | null {
  const trip = trips.find((t) => t.proposals.some((p) => p.id === proposalId))
  if (!trip) return null
  trip.proposals = trip.proposals.map((p) =>
    p.id === proposalId ? { ...p, status: 'rejected' } : p,
  )
  return trip
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
