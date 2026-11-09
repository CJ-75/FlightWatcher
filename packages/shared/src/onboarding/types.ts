/** Auth sheet triggers — brief §5.1 */
export type AuthTrigger =
  | 'invite_join'
  | 'favorite'
  | 'create_trip'
  | 'invite_friends'
  | 'book'
  | 'already_account'

export type TravelPreference = 'amis' | 'couple' | 'solo' | 'famille'

export type PendingActionType =
  | 'join_invite'
  | 'like_itinerary'
  | 'like_deal'
  | 'create_trip_from_parcours'
  | 'none'

export type PendingAction = {
  type: PendingActionType
  trigger: AuthTrigger
  payload?: Record<string, unknown>
  createdAt: number
}

export type OnboardingPrefs = {
  departureCitySlug: string | null
  departureCityLabel: string | null
  /** Encoded airport codes for deals/MakeTrip (never primary UI). */
  departureAirportCodes: string | null
  travelPreference: TravelPreference | null
  onboardingCompletedAt: string | null
  appPromoDismissed: boolean
  firstTripInviteTipSeen: boolean
  firstNamePromptDone: boolean
}

export const DEFAULT_ONBOARDING_PREFS: OnboardingPrefs = {
  departureCitySlug: null,
  departureCityLabel: null,
  departureAirportCodes: null,
  travelPreference: null,
  onboardingCompletedAt: null,
  appPromoDismissed: false,
  firstTripInviteTipSeen: false,
  firstNamePromptDone: false,
}

export const AUTH_SHEET_TITLES: Record<AuthTrigger, string> = {
  invite_join: 'Rejoins {name} en un geste',
  favorite: 'Garde ce week-end',
  create_trip: 'Crée ton voyage en un geste',
  invite_friends: 'Invite tes amis en un geste',
  book: 'Connecte-toi pour réserver',
  already_account: 'Content de te revoir',
}

export function authSheetTitle(
  trigger: AuthTrigger,
  opts?: { firstName?: string | null },
): string {
  const raw = AUTH_SHEET_TITLES[trigger]
  if (trigger === 'invite_join') {
    const name = (opts?.firstName || '').trim() || 'tes amis'
    return raw.replace('{name}', name)
  }
  return raw
}

export const TRAVEL_PREFERENCE_CARDS: {
  id: TravelPreference
  label: string
  icon: string
}[] = [
  { id: 'amis', label: 'Entre amis', icon: 'users' },
  { id: 'couple', label: 'En couple', icon: 'heart' },
  { id: 'solo', label: 'Seul', icon: 'user' },
  { id: 'famille', label: 'En famille', icon: 'home' },
]
