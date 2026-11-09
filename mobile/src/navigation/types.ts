import type {
  DateAvecHoraire,
  DatePresetId,
  EnrichedTripResponse,
  MyTripDraft,
} from '@flightwatcher/shared'

export type SearchInfo = {
  airport: string
  budget: number
  passengers?: number
  datePreset: DatePresetId
  datesDepart: DateAvecHoraire[]
  datesRetour: DateAvecHoraire[]
  excludedDestinations: string[]
  searchEventId?: string | null
}

export type MainTabParamList = {
  Search:
    | {
        origin?: string
        adults?: number
        destination?: string
        city?: string
        outbound?: string
        inbound?: string
        autoSearch?: boolean
      }
    | undefined
  Deals: undefined
  Activities:
    | {
        city?: string
        draftToken?: string
        plannedTripId?: string
        /**
         * Depuis un séjour (Que faire à X) — hero neutre, pas de voyage planner
         * accroché (évite Sync / confusion).
         */
        browse?: boolean
      }
    | undefined
  Planner: undefined
  Favorites: undefined
  Profile: undefined
}

export type RootStackParamList = {
  Login: undefined
  Main:
    | undefined
    | {
        screen?: keyof MainTabParamList
        params?: MainTabParamList[keyof MainTabParamList]
      }
  Results: {
    trips: EnrichedTripResponse[]
    title?: string
    searchInfo?: SearchInfo
  }
  DealDetail: {
    dealId: string
    /** List/favorites snapshot — paint before getDeal returns. */
    preview?: import('@flightwatcher/shared').TravelDeal
  }
  TripDetail: {
    tripId: string
    /** Création → lancer le scan immédiatement */
    autoScan?: boolean
    /** Ouvert depuis « En faire mon voyage » (retour → parcours) */
    fromParcours?: boolean
  }
  Security: undefined
  Bookings: undefined
  HotelCompose: {
    draftToken: string
    seed?: MyTripDraft
    /** Open the already-chosen hotel fiche instead of browsing the list. */
    openSelected?: boolean
    hotelId?: string
  }
  TripSummary: { draftToken: string; seed?: MyTripDraft }
  PlannerInvite: { token: string }
  DealCheckout: {
    dealId?: string
    draftToken?: string
    hotelId?: string
    payResult?: { confirmation: string; bookingId?: string }
  }
  HotelPayWebView: {
    bookingId: string
    publicKey: string
    secretKey: string
    draftToken?: string
    firstName: string
    lastName: string
    email: string
    liteapiEnv?: string
    returnDealId?: string
    returnHotelId?: string
  }
  InAppBrowser: { url: string; title?: string }
  ItineraryDetail: {
    itineraryId: string
    /** Card snapshot for instant chrome (+ steps when catalogue embeds them). */
    preview?: {
      id: string
      slug?: string | null
      title?: string
      subtitle?: string | null
      intro?: string | null
      cover_image?: string | null
      city_slug?: string | null
      duration_kind?: string | null
      occasions?: string[] | null
      featured_from?: string | null
      featured_to?: string | null
      budget_estimate_eur?: number | null
      budget_basis?: string | null
      itinerary_items?: import('@flightwatcher/shared').ItineraryItem[] | null
    }
  }
  NotFound: undefined
}
