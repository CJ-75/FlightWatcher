/**
 * Canonical FR copy for planner hub / phases.
 * Prefer translate() when language is available; these maps keep mobile + web aligned.
 */
import type { PlannedTrip, PlannedTripMeta, TravelWorkspacePhase } from '../types'

/** True when the trip was created / filled from a Pop (parcours). */
export function plannedTripIsFromPop(
  trip?: Pick<PlannedTrip, 'meta'> | null,
): boolean {
  const meta = (trip?.meta || null) as PlannedTripMeta | null | undefined
  if (!meta || typeof meta !== 'object') return false
  if (meta.from_pop === true) return true
  const src = meta.source_itinerary_id
  return typeof src === 'string' && src.trim().length > 0
}

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
  past: 'Dates passées — un tap pour repartir avec de nouveaux prix.',
}

export const PLANNER_PHASE_ACTION_FR: Record<TravelWorkspacePhase, string> = {
  planning: 'Continuer',
  flight_selected: 'Choisir mon hôtel',
  composing: 'Reprendre',
  booked: 'Ouvrir le séjour',
  past: 'Repartir',
}

/** Hub / detail — completed without booking (default path for most trips) */
export const PLANNER_RELAUNCH_KICKER_FR = 'Prêt pour la suite'
export const PLANNER_RELAUNCH_ACTION_FR = 'Choisir de nouvelles dates'
export const PLANNER_RELAUNCH_TITLE_FR = 'Et si on repartait ?'
export const PLANNER_RELAUNCH_LEAD_FR =
  'Ce week-end, le prochain, la semaine suivante… on relance toute la recherche.'
export const PLANNER_RELAUNCH_CONFIRM_FR = 'C’est parti — chercher des vols'
export const PLANNER_RELAUNCH_CARD_FR =
  'Les dates sont derrière toi. Choisis-en de nouvelles et on te trouve les meilleurs prix.'

/** Title with destination when available. */
export function plannerRelaunchTitleFr(city?: string | null): string {
  const c = String(city || '')
    .trim()
    .replace(/^ta ville$/i, '')
  if (!c) return PLANNER_RELAUNCH_TITLE_FR
  return `Et si on repartait à ${c} ?`
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
export const PLANNER_HUB_KICKER_FR = 'VOYAGES'
export const PLANNER_HUB_TITLE_FR = 'Tes voyages'
export const PLANNER_HUB_SUBTITLE_FR =
  'Crée un voyage, scanne les prix, invite tes proches.'

/** Sort hub cards by departure date ascending (missing dates last). */
export function sortWorkspacesByDeparture<
  T extends { out_date?: string | null; updated_at?: string | null },
>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const da = String(a.out_date || '').slice(0, 10)
    const db = String(b.out_date || '').slice(0, 10)
    if (da && db && da !== db) return da.localeCompare(db)
    if (da && !db) return -1
    if (!da && db) return 1
    return String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
  })
}

export function hubMatchesPhase(
  phase: TravelWorkspacePhase,
  filter: PlannerHubFilter,
): boolean {
  if (filter === 'organize') return phase === 'planning'
  if (filter === 'past') return phase === 'past'
  return phase !== 'planning' && phase !== 'past'
}
