/**
 * Shared trip-detail view model for Path skin (Aperçu · Programme).
 * Pure logic — web/Expo only render. Flag TRIP_DETAIL_V2 gates the new shell.
 * PDF 8 nov 2026 — affichage only.
 */

import type { TravelWorkspacePhase } from '../types'
import {
  buildStayPipeline,
  type FlightStepStatus,
  type HotelStepStatus,
  type PipelineStepState,
  type StayPipelineStep,
  type StayStepId,
} from '../deals/stayPipeline'
import { PLANNER_PHASE_LABEL_FR } from './copy'

export type TripDetailTabId = 'apercu' | 'programme' | 'voyageurs'

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
  | 'view_programme'
  | 'waiting_flight'

export type TripPrimaryAction = {
  id: TripPrimaryActionId
  label: string
  /** Soft / informational (e.g. invitee waiting) — not a hard CTA */
  informational?: boolean
}

export type TripDetailStepTile = {
  id: StayStepId
  label: string
  state: PipelineStepState
  /** Short FR status for the Étapes tile */
  statusLabel: string
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
  restaurantsEnabled?: boolean
  /** Airline label for « Réserver sur {compagnie} » */
  airlineLabel?: string | null
  /** Hotel finalize price fragment e.g. "189 €" */
  hotelFinalizePriceLabel?: string | null
  /** Display name of organizer for invitee waiting copy */
  organizerFirstName?: string | null
  flight?: FlightStepStatus
  hotel?: HotelStepStatus
  activitiesDone?: boolean
  activitiesPartial?: boolean
  restaurantsDone?: boolean
  restaurantsPartial?: boolean
}

export type TripDetailView = {
  tabs: { id: TripDetailTabId; label: string }[]
  phaseLabel: string
  primary: TripPrimaryAction
  steps: TripDetailStepTile[]
  showStepsActivities: boolean
  showStepsAddresses: boolean
}

export const TRIP_DETAIL_TABS: { id: TripDetailTabId; label: string }[] = [
  { id: 'apercu', label: 'Aperçu' },
  { id: 'programme', label: 'Programme' },
  { id: 'voyageurs', label: 'Voyageurs' },
]

const STEP_LABEL: Record<StayStepId, string> = {
  flight: 'Vol',
  hotel: 'Hôtel',
  activities: 'Activités',
  restaurants: 'Adresses',
}

const STEP_STATUS_LABEL: Record<PipelineStepState, string> = {
  done: 'Fait',
  current: 'En cours',
  upcoming: 'À faire',
  off: 'Off',
}

function organizerFirst(name?: string | null): string {
  const raw = String(name || '').trim()
  if (!raw) return 'l’organisateur'
  return raw.split(/\s+/)[0] || 'l’organisateur'
}

function airlineShort(label?: string | null): string {
  const raw = String(label || '').trim()
  if (!raw) return 'la compagnie'
  return raw.split(/[·|]/)[0]?.trim() || 'la compagnie'
}

/**
 * One primary sticky CTA from phase × role (PDF §4).
 */
export function resolveTripPrimaryAction(
  input: TripDetailViewInput,
): TripPrimaryAction {
  const {
    phase,
    role,
    hasProposals,
    flightBooked,
    hotelComposing,
    airlineLabel,
    hotelFinalizePriceLabel,
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
        ? {
            id: 'book_flight',
            label: `Réserver sur ${airlineShort(airlineLabel)}`,
          }
        : { id: 'book_my_flight', label: 'Réserver mon vol' }
    }
    return isOrga
      ? { id: 'choose_hotel', label: 'Choisir l’hôtel' }
      : { id: 'choose_my_hotel', label: 'Choisir mon hôtel' }
  }

  if (phase === 'composing' || hotelComposing) {
    if (isOrga) {
      const price = String(hotelFinalizePriceLabel || '').trim()
      return {
        id: 'finalize_hotel',
        label: price ? `Finaliser l’hôtel · ${price}` : 'Finaliser l’hôtel',
      }
    }
    return { id: 'finalize_my_hotel', label: 'Finaliser mon hôtel' }
  }

  if (phase === 'booked' || phase === 'past') {
    return { id: 'view_programme', label: 'Voir le programme' }
  }

  return isOrga
    ? { id: 'scan', label: 'Lancer la recherche de vols' }
    : {
        id: 'waiting_flight',
        label: 'En attente de l’organisateur',
        informational: true,
      }
}

function stepsFromPipeline(pipeline: StayPipelineStep[]): TripDetailStepTile[] {
  return pipeline
    .filter((s) => s.state !== 'off')
    .map((s) => ({
      id: s.id,
      label: STEP_LABEL[s.id] || s.shortLabel || s.label,
      state: s.state,
      statusLabel: s.hint || STEP_STATUS_LABEL[s.state] || s.state,
    }))
}

export function buildTripDetailView(input: TripDetailViewInput): TripDetailView {
  const activitiesEnabled = Boolean(input.activitiesEnabled)
  const restaurantsEnabled = Boolean(input.restaurantsEnabled)
  const pipeline =
    input.flight != null || input.hotel != null
      ? buildStayPipeline({
          flight: input.flight || 'none',
          hotel: input.hotel || 'none',
          activitiesEnabled,
          activitiesDone: input.activitiesDone,
          activitiesPartial: input.activitiesPartial,
          restaurantsEnabled,
          restaurantsDone: input.restaurantsDone,
          restaurantsPartial: input.restaurantsPartial,
        })
      : []

  return {
    tabs: TRIP_DETAIL_TABS,
    phaseLabel: PLANNER_PHASE_LABEL_FR[input.phase] || input.phase,
    primary: resolveTripPrimaryAction(input),
    steps: stepsFromPipeline(pipeline),
    showStepsActivities: activitiesEnabled,
    showStepsAddresses: restaurantsEnabled,
  }
}

/** Analytics event names (PDF §10) — same on v1 and v2. */
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
