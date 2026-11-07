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
    title: 'Aucun séjour à venir',
    body: 'Dès qu’un vol est choisi ou que le séjour est composé, il apparaît ici.',
  },
  organize: {
    title: 'Rien en cours',
    body: 'Commence un séjour, scanne les prix, puis invite tes proches.',
    cta: 'Nouveau séjour',
  },
  past: {
    title: 'Aucun séjour passé',
    body: 'Tes séjours terminés restent ici.',
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
  flight_selected: 'Vol choisi. Compose ton hôtel.',
  composing: 'Finalise la réservation de ton séjour.',
  booked: 'Réservation rattachée à ce séjour.',
  past: 'Séjour terminé. Tu peux encore y ajouter des activités.',
}

export const PLANNER_PHASE_ACTION_FR: Record<TravelWorkspacePhase, string> = {
  planning: 'Continuer',
  flight_selected: 'Choisir mon hôtel',
  composing: 'Reprendre',
  booked: 'Ouvrir le séjour',
  past: 'Revoir le séjour',
}

export const HOTEL_CTA_FR = {
  choose: 'Choisir mon hôtel',
  pay: 'Payer ma chambre',
  view: 'Voir mon hôtel',
  backPlanner: 'Retour au planner',
} as const

export const PLANNER_PROMOTE_TOAST_FR = 'Séjour ajouté'
export const DESTINATION_FALLBACK_FR = 'Destination'

/** Invite / share block on a séjour. */
export const PLANNER_SHARE_TITLE_FR = 'Partager le séjour'
export const PLANNER_SHARE_HINT_FR = 'Invite ceux qui voyagent avec toi'
export const PLANNER_SHARE_ACTION_FR = 'Partager'
export const PLANNER_SHARE_EYEBROW_FR = 'Ensemble'
export const PLANNER_NEW_STAY_FR = 'Nouveau séjour'
export const PLANNER_HUB_KICKER_FR = 'SÉJOURS'
export const PLANNER_HUB_TITLE_FR = 'Tes séjours'
export const PLANNER_HUB_SUBTITLE_FR =
  'Crée un séjour, scanne les prix, invite tes proches.'

export function hubMatchesPhase(
  phase: TravelWorkspacePhase,
  filter: PlannerHubFilter,
): boolean {
  if (filter === 'organize') return phase === 'planning'
  if (filter === 'past') return phase === 'past'
  return phase !== 'planning' && phase !== 'past'
}
