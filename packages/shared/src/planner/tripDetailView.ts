/**
 * Shared trip-detail view model for Path skin (Aperçu · Programme · Carnet).
 * Pure logic — web/Expo only render. Flag TRIP_DETAIL_V2 gates the new shell.
 */

import type { TravelWorkspacePhase } from '../types'
import { PLANNER_PHASE_LABEL_FR } from './copy'

export type TripDetailTabId = 'apercu' | 'programme' | 'carnet'

export type TripDetailRole = 'organizer' | 'member'

export type TripPrimaryActionId =
  | 'scan'
  | 'choose_flight'
  | 'view_proposals'
  | 'book_flight'
  | 'book_my_flight'
  | 'choose_hotel'
  | 'choose_my_hotel'
  | 'finalize_hotel'
  | 'finalize_my_hotel'
  | 'complete_programme'
  | 'view_programme'
  | 'programme_today'
  | 'tell_story'
  | 'leave_review'
  | 'waiting_flight'

export type TripPrimaryAction = {
  id: TripPrimaryActionId
  label: string
  /** Soft / informational (e.g. invitee waiting) — not a hard CTA */
  informational?: boolean
}

export type TripDetailViewInput = {
  phase: TravelWorkspacePhase
  role: TripDetailRole
  /** At least one pending proposal */
  hasProposals?: boolean
  flightBooked?: boolean
  hotelBooked?: boolean
  hotelComposing?: boolean
  activitiesEnabled?: boolean
  /** Display name of organizer for invitee waiting copy */
  organizerFirstName?: string | null
}

export type TripDetailView = {
  tabs: { id: TripDetailTabId; label: string }[]
  phaseLabel: string
  primary: TripPrimaryAction
  showStepsActivities: boolean
}

export const TRIP_DETAIL_TABS: { id: TripDetailTabId; label: string }[] = [
  { id: 'apercu', label: 'Aperçu' },
  { id: 'programme', label: 'Programme' },
  { id: 'carnet', label: 'Carnet' },
]

function organizerFirst(name?: string | null): string {
  const raw = String(name || '').trim()
  if (!raw) return 'l’organisateur'
  return raw.split(/\s+/)[0] || 'l’organisateur'
}

/**
 * One primary sticky CTA from phase × role (PROMPT Path §4.3).
 */
export function resolveTripPrimaryAction(
  input: TripDetailViewInput,
): TripPrimaryAction {
  const {
    phase,
    role,
    hasProposals,
    flightBooked,
    hotelBooked,
    hotelComposing,
  } = input
  const isOrga = role === 'organizer'

  if (phase === 'planning') {
    if (!hasProposals) {
      if (isOrga) {
        return { id: 'scan', label: 'Lancer la recherche de vols' }
      }
      return {
        id: 'waiting_flight',
        label: `En attente du vol choisi par ${organizerFirst(input.organizerFirstName)}`,
        informational: true,
      }
    }
    if (isOrga) return { id: 'choose_flight', label: 'Choisir le vol' }
    return { id: 'view_proposals', label: 'Voir les vols proposés' }
  }

  if (phase === 'flight_selected') {
    if (!flightBooked) {
      return isOrga
        ? { id: 'book_flight', label: 'Réserver sur la compagnie' }
        : { id: 'book_my_flight', label: 'Réserver mon vol' }
    }
    return isOrga
      ? { id: 'choose_hotel', label: 'Choisir l’hôtel' }
      : { id: 'choose_my_hotel', label: 'Choisir mon hôtel' }
  }

  if (phase === 'composing' || hotelComposing) {
    return isOrga
      ? { id: 'finalize_hotel', label: 'Finaliser l’hôtel' }
      : { id: 'finalize_my_hotel', label: 'Finaliser mon hôtel' }
  }

  if (phase === 'booked') {
    if (hotelBooked) {
      // During stay vs before — callers can refine; default programme
      return isOrga
        ? { id: 'complete_programme', label: 'Compléter le programme' }
        : { id: 'view_programme', label: 'Voir le programme' }
    }
    return isOrga
      ? { id: 'choose_hotel', label: 'Choisir l’hôtel' }
      : { id: 'choose_my_hotel', label: 'Choisir mon hôtel' }
  }

  if (phase === 'past') {
    return isOrga
      ? { id: 'tell_story', label: 'Raconter le voyage' }
      : { id: 'leave_review', label: 'Donner mon avis' }
  }

  return isOrga
    ? { id: 'scan', label: 'Lancer la recherche de vols' }
    : {
        id: 'waiting_flight',
        label: 'En attente de l’organisateur',
        informational: true,
      }
}

export function buildTripDetailView(input: TripDetailViewInput): TripDetailView {
  return {
    tabs: TRIP_DETAIL_TABS,
    phaseLabel: PLANNER_PHASE_LABEL_FR[input.phase] || input.phase,
    primary: resolveTripPrimaryAction(input),
    showStepsActivities: Boolean(input.activitiesEnabled),
  }
}

/** Analytics event names (CADRE §4) — same on v1 and v2. */
export const TRIP_DETAIL_EVENTS = {
  viewed: 'trip_detail_viewed',
  tabViewed: 'trip_tab_viewed',
  primaryClicked: 'trip_primary_action_clicked',
  partnerBooking: 'trip_partner_booking_clicked',
  inviteOpened: 'trip_invite_opened',
  inviteJoined: 'trip_invite_joined',
  itemPlaced: 'trip_item_placed',
  shared: 'trip_shared',
} as const

export type TripDetailVariant = 'v1' | 'v2'
