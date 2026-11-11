/**
 * Activity switcher: one actionable séjour per row.
 * Prefer planned_trips; keep solo drafts only when unlinked.
 *
 * Hero / picker order:
 * 1. exclude past / expired dates
 * 2. reserved (booked) first
 * 3. last opened (updated_at DESC)
 * 4. soonest out_date
 */
import type { TravelWorkspace, TravelWorkspacePhase } from '../types'

export const ACTIVITY_SWITCHER_SOFT_LIMIT = 10

/** Auto titles: "Weekend Lisbonne", "Séjour à Rome", "Week-end à Porto"… */
const GENERIC_STAY_TITLE_PREFIX =
  /^(weekend|week[\s-]?end|voyage|séjour(?:\s+à)?)\s+/i

function normalizeStayToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** City token only — collapses "Malte, Malte" / "Lisbonne, Portugal". */
export function activityStayCityToken(raw?: string | null): string {
  const parts = String(raw || '')
    .split(',')
    .map((p) => p.split('(')[0]?.trim() || '')
    .filter(Boolean)
  if (!parts.length) return ''
  if (
    parts.length >= 2 &&
    normalizeStayToken(parts[0]) === normalizeStayToken(parts[1])
  ) {
    return parts[0]
  }
  return parts[0]
}

/**
 * Label for « Choisir un séjour » rows: city only, unless a dedicated
 * planner name (custom trip title) is set.
 */
export function activityWorkspaceStayLabel(ws: {
  title?: string | null
  city?: string | null
}): string {
  const city = activityStayCityToken(ws.city)
  const titleRaw = String(ws.title || '').trim()
  if (!titleRaw) return city || 'Séjour'

  const hasGenericPrefix = GENERIC_STAY_TITLE_PREFIX.test(titleRaw)
  const titleCore = activityStayCityToken(
    hasGenericPrefix
      ? titleRaw.replace(GENERIC_STAY_TITLE_PREFIX, '').trim()
      : titleRaw,
  )
  const sameAsCity =
    Boolean(city) &&
    (normalizeStayToken(titleRaw) === normalizeStayToken(city) ||
      normalizeStayToken(titleCore) === normalizeStayToken(city))

  if (hasGenericPrefix || sameAsCity) {
    return city || titleCore || 'Séjour'
  }

  return titleRaw
}

/** Upcoming / actionable only — past stays stay on Planner hub, not Activités. */
const ACTIVE_PHASES: ReadonlySet<TravelWorkspacePhase> = new Set([
  'planning',
  'flight_selected',
  'composing',
  'booked',
])

function todayYmd(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function ymd(raw?: string | null): string | null {
  const s = String(raw || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

/** End of stay for expiry: retour, else aller. */
export function activityWorkspaceEndDate(
  ws: Pick<TravelWorkspace, 'out_date' | 'ret_date'>,
): string | null {
  return ymd(ws.ret_date) || ymd(ws.out_date)
}

/** Phase past, or end date strictly before today. */
export function isActivityWorkspaceExpired(
  ws: Pick<TravelWorkspace, 'phase' | 'out_date' | 'ret_date'>,
  now = new Date(),
): boolean {
  if (ws.phase === 'past') return true
  const end = activityWorkspaceEndDate(ws)
  if (end && end < todayYmd(now)) return true
  return false
}

/** Vol / hôtel réservé — prioritaire pour le hero Activités. */
export function isActivityWorkspaceReserved(
  ws: Pick<
    TravelWorkspace,
    'phase' | 'pipeline' | 'flight_booking_status' | 'hotel_booking_status'
  >,
): boolean {
  if (ws.phase === 'booked') return true
  if (ws.pipeline?.flight === 'booked' || ws.pipeline?.hotel === 'booked') {
    return true
  }
  const flight = String(ws.flight_booking_status || '').toLowerCase()
  if (
    flight === 'user_confirmed' ||
    flight === 'partner_confirmed' ||
    flight === 'confirmed'
  ) {
    return true
  }
  const hotel = String(ws.hotel_booking_status || '').toLowerCase()
  if (hotel === 'confirmed' || hotel === 'booked') return true
  return false
}

function workspaceOwnerKey(ws: TravelWorkspace): string | null {
  const planned = String(ws.planned_trip_id || '').trim()
  const draft = String(ws.draft_token || '').trim()
  if (planned) return `p:${planned}`
  if (draft) return `d:${draft}`
  return null
}

function preferWorkspace(a: TravelWorkspace, b: TravelWorkspace): TravelWorkspace {
  const aPlanned = Boolean(String(a.planned_trip_id || '').trim())
  const bPlanned = Boolean(String(b.planned_trip_id || '').trim())
  if (aPlanned !== bPlanned) return aPlanned ? a : b
  const aTs = String(a.updated_at || '')
  const bTs = String(b.updated_at || '')
  return bTs.localeCompare(aTs) > 0 ? b : a
}

/**
 * Compare for Activités hero + picker:
 * reserved → last opened → soonest departure.
 */
export function compareActivitySwitcherWorkspaces(
  a: TravelWorkspace,
  b: TravelWorkspace,
): number {
  const aReserved = isActivityWorkspaceReserved(a) ? 0 : 1
  const bReserved = isActivityWorkspaceReserved(b) ? 0 : 1
  if (aReserved !== bReserved) return aReserved - bReserved

  const byOpened = String(b.updated_at || '').localeCompare(
    String(a.updated_at || ''),
  )
  if (byOpened) return byOpened

  const aOut = ymd(a.out_date) || '9999-99-99'
  const bOut = ymd(b.out_date) || '9999-99-99'
  const byOut = aOut.localeCompare(bOut)
  if (byOut) return byOut

  return String(a.title || '').localeCompare(String(b.title || ''), 'fr')
}

/**
 * Slim list for ActivityPlannerPicker + Activités hero.
 * No past / expired; booked first, then last opened, then next out_date.
 */
export function filterActivitySwitcherWorkspaces(
  rows: TravelWorkspace[],
  now = new Date(),
): TravelWorkspace[] {
  const byKey = new Map<string, TravelWorkspace>()

  for (const w of rows) {
    if (!w) continue
    if (!ACTIVE_PHASES.has(w.phase)) continue
    if (isActivityWorkspaceExpired(w, now)) continue
    const id = String(w.workspace_id || '')
    if (id.startsWith('booking:')) continue
    const key = workspaceOwnerKey(w)
    if (!key) continue
    const existing = byKey.get(key)
    byKey.set(key, existing ? preferWorkspace(existing, w) : w)
  }

  const merged = [...byKey.values()]

  const draftTokensOnPlanners = new Set<string>()
  for (const w of merged) {
    const planned = String(w.planned_trip_id || '').trim()
    const draft = String(w.draft_token || '').trim()
    if (planned && draft) draftTokensOnPlanners.add(draft)
  }

  const eligible = merged.filter((w) => {
    const planned = String(w.planned_trip_id || '').trim()
    const draft = String(w.draft_token || '').trim()
    if (planned) return true
    if (!draft) return false
    if (draftTokensOnPlanners.has(draft)) return false
    return true
  })

  return eligible.sort(compareActivitySwitcherWorkspaces)
}
