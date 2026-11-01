/** Split favorites into active vs past-dated (UI archive chapeau). */

import type { LikedActivity, LikedDeal, SavedFavorite } from '../types'

/** Local calendar day YYYY-MM-DD. */
export function todayIsoLocal(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function dayFromIso(raw: string | null | undefined): string | null {
  const s = String(raw || '').trim()
  if (!s) return null
  const day = s.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null
}

/** Flight favorite is past if flagged archived or return/outbound day < today. */
export function isPastFavoriteFlight(
  fav: SavedFavorite,
  today = todayIsoLocal(),
): boolean {
  if (fav.archived) return true
  const raw =
    fav.trip?.retour?.departureTime || fav.trip?.aller?.departureTime || null
  const day = dayFromIso(raw)
  if (!day) return false
  return day < today
}

/** Deal like is past when outbound day is before today. */
export function isPastFavoriteDeal(
  liked: LikedDeal,
  today = todayIsoLocal(),
): boolean {
  const day = dayFromIso(liked.deal?.dates?.outbound)
  if (!day) return false
  return day < today
}

/** Activities have no trip date — never auto-archived by calendar. */
export function isPastFavoriteActivity(
  _liked: LikedActivity,
  _today = todayIsoLocal(),
): boolean {
  return false
}

export function partitionFavoritesByPast<T>(
  items: T[],
  isPast: (item: T) => boolean,
): { active: T[]; archived: T[] } {
  const active: T[] = []
  const archived: T[] = []
  for (const item of items) {
    if (isPast(item)) archived.push(item)
    else active.push(item)
  }
  return { active, archived }
}
