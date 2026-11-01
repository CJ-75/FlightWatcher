/** Shared Activity step helpers — web + Expo (Lot E). */

import type { TripItemStatus } from './labels'

export const ACTIVITY_BOOKED_PROMPT_FR = (title: string) =>
  `Tu as réservé ${title} ?`

export const ACTIVITY_SKIP_LABEL_FR = 'Pas d’activité'
export const ACTIVITY_ADD_LABEL_FR = 'Ajouter une activité'
export const ACTIVITY_VALIDATE_LABEL_FR = 'Valider'
export const ACTIVITY_BOOK_VIATOR_FR = 'Réserver sur Viator'
export const ACTIVITY_BROWSE_CATALOG_FR = 'Parcourir le catalogue'
export const ACTIVITY_OPEN_PLANNER_FR = 'Ouvrir le planner'
export const ACTIVITY_ADD_TO_PLANNER_FR = 'Au planner'
export const ACTIVITY_TRIP_HERO_KICKER_FR = 'Voyage en cours'
export const ACTIVITY_TRIP_IN_PROGRESS_FR = (city: string) =>
  `Voyage en cours · ${city}`
export const ACTIVITY_TRIP_IN_PROGRESS_HINT_FR =
  'Ajoute des idées ici — elles atterrissent dans ton planner séjour.'
export const ACTIVITY_TRIP_PLANNER_COUNT_FR = (n: number) =>
  n <= 0 ? 'Planner prêt' : n === 1 ? '1 idée au planner' : `${n} idées au planner`
export const ACTIVITY_SYNC_CITY_FR = (city: string) => `Activités à ${city}`
export const ACTIVITY_NO_TRIP_CTA_TITLE_FR = 'Ton prochain séjour commence ici'
export const ACTIVITY_NO_TRIP_CTA_BODY_FR =
  'Ouvre un voyage en cours pour composer les activités au même endroit que ton vol et ton hôtel.'
export const ACTIVITY_NO_TRIP_CTA_BUTTON_FR = 'Voir les séjours'
export const ACTIVITY_ADDED_TO_PLANNER_FR = (city: string) =>
  `Ajouté au planner · ${city}`
export const ACTIVITY_KEEP_ADDING_FR =
  'Continue — ajoute d’autres idées, puis reviens au planner.'
export const ACTIVITY_SESSION_ADDED_FR = (n: number) =>
  n <= 1 ? '1 activité ajoutée' : `${n} activités ajoutées`
export const ACTIVITY_SEE_PLANNER_FR = 'Voir le planner'
export const ACTIVITY_BACK_TO_PLANNER_FR = 'Retour au planner'
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
  const booked = active.some((i) => i.status === 'booked')
  const validated = active.some((i) => i.status === 'validated' || i.status === 'booked')
  if (booked) return { done: true, partial: false, hint: 'Réservée' }
  if (validated) return { done: false, partial: true, hint: 'À réserver' }
  return { done: false, partial: true, hint: 'Idée' }
}

export function nextStatusAfterBookConfirm(yes: boolean): TripItemStatus {
  return yes ? 'booked' : 'validated'
}
