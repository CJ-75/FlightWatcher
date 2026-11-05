/** Shared Activity step helpers — web + Expo (Lot E). */

import type { TripItemStatus } from './labels'

export const ACTIVITY_BOOKED_PROMPT_FR = (title: string) =>
  `Tu as réservé ${title} ?`

export const ACTIVITY_SKIP_LABEL_FR = 'Pas d’activité'
export const ACTIVITY_ADD_LABEL_FR = 'Ajouter une activité'
export const ACTIVITY_VALIDATE_LABEL_FR = 'Valider'
export const ACTIVITY_BOOK_VIATOR_FR = 'Réserver'
export const ACTIVITY_BROWSE_CATALOG_FR = 'Parcourir le catalogue'
export const ACTIVITY_OPEN_PLANNER_FR = 'Ouvrir le voyage'
/** Titre page Activités (miroir Séjours). */
export const ACTIVITY_PAGE_KICKER_FR = 'Activités'
export const ACTIVITY_PAGE_TITLE_FR = 'Sur place'
export const ACTIVITY_PAGE_SUBTITLE_FR = 'Visites, sorties et expériences.'

/** Label long (fiche détail) — jamais « Au planner ». */
export const ACTIVITY_ADD_TO_PLANNER_FR = 'Ajouter'
/** Bouton compact carte — le « + » est rendu en UI. */
export const ACTIVITY_ADD_SHORT_FR = 'Ajouter'
export const ACTIVITY_PICK_PLANNER_TITLE_FR = 'Ajouter à quel séjour ?'
export const ACTIVITY_PICK_PLANNER_HINT_FR =
  'Choisis le voyage (ou la réservation) qui recevra cette idée.'
export const ACTIVITY_NO_PLANNER_TO_ADD_FR =
  'Aucun séjour disponible. Crée ou ouvre un voyage dans Voyages.'
export const ACTIVITY_SIGN_IN_TO_ADD_FR =
  'Connecte-toi pour choisir un séjour et y ajouter l’activité.'
export const ACTIVITY_TRIP_HERO_KICKER_FR = 'En cours'
export const ACTIVITY_CHANGE_TRIP_FR = 'Changer'
export const ACTIVITY_CHOOSE_TRIP_FR = 'Choisir un séjour'
export const ACTIVITY_TRIP_IN_PROGRESS_FR = (city: string) =>
  `Voyage en cours · ${city}`
export const ACTIVITY_TRIP_IN_PROGRESS_HINT_FR =
  'Ajoute des idées ici — elles atterrissent dans ton séjour.'
export const ACTIVITY_TRIP_PLANNER_COUNT_FR = (n: number) =>
  n <= 0 ? '0 activité' : n === 1 ? '1 activité' : `${n} activités`

/** Statut séjour pour le hero Activités, calé sur la date du jour. */
export type ActivityTripTimingStatus =
  | 'upcoming'
  | 'ongoing'
  | 'past'
  | 'undated'

function dayIso(raw?: string | null): string | null {
  const s = String(raw || '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

function todayIsoLocal(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function activityTripTimingStatus(
  outDate?: string | null,
  retDate?: string | null,
  now = new Date(),
): ActivityTripTimingStatus {
  const today = todayIsoLocal(now)
  const out = dayIso(outDate)
  const ret = dayIso(retDate) || out
  if (!out && !ret) return 'undated'
  if (ret && ret < today) return 'past'
  if (out && out > today) return 'upcoming'
  return 'ongoing'
}

export const ACTIVITY_TRIP_TIMING_KICKER_FR: Record<
  ActivityTripTimingStatus,
  string
> = {
  upcoming: 'À venir',
  ongoing: 'Séjour en cours',
  past: 'Terminé',
  /** Pas de dates → on traite comme un prochain séjour. */
  undated: 'À venir',
}

export const ACTIVITY_TRIP_TIMING_HINT_FR: Record<
  ActivityTripTimingStatus,
  string
> = {
  upcoming: 'Prépare ton séjour — les idées rejoignent ton voyage.',
  ongoing: ACTIVITY_TRIP_IN_PROGRESS_HINT_FR,
  past: 'Séjour passé — tu peux encore noter des idées pour la prochaine fois.',
  undated: 'Prépare ton séjour — les idées rejoignent ton voyage.',
}
export const ACTIVITY_SYNC_CITY_FR = (city: string) => `Activités à ${city}`
export const ACTIVITY_NO_TRIP_CTA_TITLE_FR = 'Ton prochain séjour commence ici'
export const ACTIVITY_NO_TRIP_CTA_BODY_FR =
  'Ouvre ton voyage pour composer les activités au même endroit que ton vol et ton hôtel.'
export const ACTIVITY_NO_TRIP_CTA_BUTTON_FR = 'Ouvrir le voyage'
export const ACTIVITY_NO_TRIP_CTA_SECONDARY_FR = 'Voir les séjours'
export const ACTIVITY_ADDED_BADGE_FR = 'Ajouté'
export const ACTIVITY_ADDED_TO_PLANNER_FR = (city: string) =>
  `Ajouté au voyage · ${city}`
export const ACTIVITY_KEEP_ADDING_FR =
  'Continue — ajoute d’autres idées, puis reviens au voyage.'
export const ACTIVITY_SESSION_ADDED_FR = (n: number) =>
  n <= 1 ? '1 activité ajoutée' : `${n} activités ajoutées`
export const ACTIVITY_SEE_PLANNER_FR = 'Voir le voyage'
export const ACTIVITY_BACK_TO_PLANNER_FR = 'Retour au voyage'
/** Kept for later / parcours global — not shown in Affiner Activités for now. */
export const ACTIVITY_NEARBY_LABEL_FR = 'Autour de moi'
export const ACTIVITY_NEARBY_CLOSER_FR = 'Plus près'
export const ACTIVITY_RADIUS_HINT_FR = (km: number) => `Dans un rayon de ${km} km`

/** Fractional sort_key between neighbors (lexicographic strings). */
export function midSortKey(before?: string | null, after?: string | null): string {
  const a = before || 'a0'
  const b = after || 'z9'
  if (a >= b) return `${a}m`
  // Simple midpoint on char codes of equal-ish length
  const len = Math.max(a.length, b.length)
  const padA = a.padEnd(len, '0')
  const padB = b.padEnd(len, '0')
  let out = ''
  for (let i = 0; i < len; i++) {
    const ca = padA.charCodeAt(i)
    const cb = padB.charCodeAt(i)
    if (ca === cb) {
      out += padA[i]
      continue
    }
    const mid = Math.floor((ca + cb) / 2)
    out += String.fromCharCode(mid === ca ? ca + 1 : mid)
    return out || `${a}n`
  }
  return `${a}n`
}

export function reorderKeysMoving(
  ids: string[],
  fromIndex: number,
  toIndex: number,
): { id: string; sort_key: string }[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= ids.length ||
    toIndex >= ids.length ||
    fromIndex === toIndex
  ) {
    return ids.map((id, i) => ({ id, sort_key: String.fromCharCode(97 + i) }))
  }
  const next = [...ids]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next.map((id, i) => ({
    id,
    sort_key: String.fromCharCode(97 + Math.min(i, 25)) + String(i),
  }))
}

export function activityStepProgress(items: { status?: string | null }[]): {
  done: boolean
  partial: boolean
  hint: string
} {
  const active = items.filter((i) => i.status !== 'skipped')
  if (!active.length) {
    const skipped = items.some((i) => i.status === 'skipped')
    return {
      done: skipped,
      partial: false,
      hint: skipped ? 'Passé' : 'Choisir',
    }
  }
  // ≥1 activité sur le séjour → étape verte (parcours).
  const booked = active.some((i) => i.status === 'booked')
  const validated = active.some(
    (i) => i.status === 'validated' || i.status === 'booked',
  )
  if (booked) return { done: true, partial: false, hint: 'Réservée' }
  if (validated) return { done: true, partial: false, hint: 'Validé' }
  const n = active.length
  return {
    done: true,
    partial: false,
    hint: n === 1 ? '1 idée' : `${n} idées`,
  }
}

export const RESTAURANT_SKIP_LABEL_FR = 'Pas de restaurant prévu'
/** @deprecated Paste-link CTA removed — prefer RESTAURANT_NEAR_HOTEL_LABEL_FR */
export const RESTAURANT_ADD_LABEL_FR = 'Coller un lien'
export const RESTAURANT_NEAR_HOTEL_LABEL_FR = 'Restaurants autour de ton hôtel'
export const RESTAURANT_NEEDS_HOTEL_FR =
  'Réserve d’abord ton hôtel pour voir les restos autour.'
export const RESTAURANT_SEARCH_LABEL_FR = 'Chercher un restaurant'
export const RESTAURANT_VALIDATE_LABEL_FR = 'Valider'
export const RESTAURANT_MAPS_LABEL_FR = 'Avis et photos'
export const RESTAURANT_BOOK_LABEL_FR = 'Réserver'
export const RESTAURANT_EMPTY_TITLE_FR = (city: string) =>
  `Où manger à ${city} ?`
export const RESTAURANT_EMPTY_BODY_FR =
  'Repère les bonnes adresses près de ton hôtel pour ton séjour.'
export const RESTAURANT_BUDGET_HINT_FR = 'Restaurants non inclus'
export const RESTAURANT_ADDRESSES_TAB_FR = 'Mes adresses'
export const ACTIVITIES_EAT_CTA_FR = (city: string) =>
  `Où manger à ${city} ? Restaurants autour de ton hôtel`

export function restaurantStepProgress(items: { status?: string | null }[]): {
  done: boolean
  partial: boolean
  hint: string
  skipped: boolean
} {
  const skipped = items.some((i) => i.status === 'skipped')
  const active = items.filter((i) => i.status !== 'skipped')
  if (!active.length) {
    return {
      done: skipped,
      partial: false,
      hint: skipped ? 'Passé' : 'Choisir',
      skipped,
    }
  }
  const validated = active.some(
    (i) => i.status === 'validated' || i.status === 'booked',
  )
  if (validated) return { done: true, partial: false, hint: 'Validé', skipped: false }
  return { done: false, partial: true, hint: 'Idée', skipped: false }
}

export function nextStatusAfterBookConfirm(yes: boolean): TripItemStatus {
  return yes ? 'booked' : 'validated'
}
