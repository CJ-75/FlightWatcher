import type { DateAvecHoraire, DatePresetId, EnrichedTripResponse } from '@flightwatcher/shared'

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
  }
  TripDetail: {
    tripId: string
    /** Création → lancer le scan immédiatement */
    autoScan?: boolean
  }
  Security: undefined
  Bookings: undefined
  HotelCompose: { draftToken: string }
  TripSummary: { draftToken: string }
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
}
