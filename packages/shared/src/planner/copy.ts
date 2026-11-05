/**
 * Canonical FR copy for planner hub / phases.
 * Prefer translate() when language is available; these maps keep mobile + web aligned.
 */
import type { TravelWorkspacePhase } from '../types'

export type PlannerHubFilter = 'organize' | 'upcoming' | 'past'

export const PLANNER_HUB_TABS: { key: PlannerHubFilter; labelKey: string; labelFr: string }[] =
  [
    { key: 'upcoming', labelKey: 'planner.hub.upcoming', labelFr: 'À venir' },
    { key: 'organize', labelKey: 'planner.hub.organize', labelFr: 'En cours' },
    { key: 'past', labelKey: 'planner.hub.past', labelFr: 'Passés' },
  ]

export const PLANNER_HUB_EMPTY_FR: Record<
  PlannerHubFilter,
  { title: string; body: string; cta?: string }
> = {
  upcoming: {
    title: 'Aucun voyage à venir',
    body: 'Dès qu’un vol est choisi ou que le séjour est composé, il apparaît ici.',
  },
  organize: {
    title: 'Rien en cours',
    body: 'Ici : les voyages encore à construire. Crée un voyage, scanne les prix, puis invite tes proches.',
    cta: 'Nouveau voyage',
  },
  past: {
    title: 'Aucun voyage passé',
    body: 'Les séjours terminés restent ici.',
  },
}

export const PLANNER_PHASE_LABEL_FR: Record<TravelWorkspacePhase, string> = {
  planning: 'En cours',
  flight_selected: 'Vol choisi',
  composing: 'À finaliser',
  booked: 'Réservé',
  past: 'Terminé',
}

export const PLANNER_PHASE_HINT_FR: Record<TravelWorkspacePhase, string> = {
  planning: 'Choisis un vol et invite qui part avec toi.',
  flight_selected: 'Vol choisi — compose ton hôtel.',
  composing: 'Séjour en cours — finalise la réservation.',
  booked: 'Réservation rattachée à ce voyage.',
  past: 'Voyage terminé — tu peux encore ajouter des activités.',
}

export const PLANNER_PHASE_ACTION_FR: Record<TravelWorkspacePhase, string> = {
  planning: 'Continuer',
  flight_selected: 'Choisir mon hôtel',
  composing: 'Reprendre le séjour',
  booked: 'Ouvrir le voyage',
  past: 'Revoir le voyage',
}

export const HOTEL_CTA_FR = {
  choose: 'Choisir mon hôtel',
  pay: 'Payer ma chambre',
  view: 'Voir mon hôtel',
  backPlanner: 'Retour au planner',
} as const

export const PLANNER_PROMOTE_TOAST_FR = 'Séjour ajouté au planner'
export const DESTINATION_FALLBACK_FR = 'Destination'

export function hubMatchesPhase(
  phase: TravelWorkspacePhase,
  filter: PlannerHubFilter,
): boolean {
  if (filter === 'organize') return phase === 'planning'
  if (filter === 'past') return phase === 'past'
  return phase !== 'planning' && phase !== 'past'
}
