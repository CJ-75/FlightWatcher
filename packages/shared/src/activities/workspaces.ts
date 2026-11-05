/**
 * Activity switcher: one actionable séjour per row.
 * Prefer planned_trips; keep solo drafts only when unlinked.
 */
import type { TravelWorkspace, TravelWorkspacePhase } from '../types'

export const ACTIVITY_SWITCHER_SOFT_LIMIT = 10

const ACTIVE_PHASES: ReadonlySet<TravelWorkspacePhase> = new Set([
  'planning',
  'flight_selected',
  'composing',
  'booked',
  // Past stays stay selectable — ideas / souvenirs after return.
  'past',
])

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim()
}

function matchesCatalogCity(
  ws: TravelWorkspace,
  catalogCity?: string | null,
): boolean {
  const needle = normalizeKey(String(catalogCity || ''))
  if (!needle) return false
  const candidates = [
    ws.city,
    ws.title,
    ws.dest_iata,
    ws.dest_iata ? String(ws.dest_iata).slice(0, 3) : null,
  ]
  return candidates.some((c) => {
    const key = normalizeKey(String(c || ''))
    return Boolean(key) && (key === needle || key.includes(needle) || needle.includes(key))
  })
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

export type FilterActivitySwitcherOptions = {
  catalogCity?: string | null
}

/**
 * Slim list for ActivityPlannerPicker:
 * active planners + unlinked personal drafts; no past / booking orphans / local dupes.
 */
export function filterActivitySwitcherWorkspaces(
  rows: TravelWorkspace[],
  opts: FilterActivitySwitcherOptions = {},
): TravelWorkspace[] {
  const byKey = new Map<string, TravelWorkspace>()

  for (const w of rows) {
    if (!w) continue
    if (!ACTIVE_PHASES.has(w.phase)) continue
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

  const catalogCity = opts.catalogCity
  return eligible.sort((a, b) => {
    const aMatch = matchesCatalogCity(a, catalogCity) ? 0 : 1
    const bMatch = matchesCatalogCity(b, catalogCity) ? 0 : 1
    if (aMatch !== bMatch) return aMatch - bMatch
    const aPlanned = String(a.planned_trip_id || '').trim() ? 0 : 1
    const bPlanned = String(b.planned_trip_id || '').trim() ? 0 : 1
    if (aPlanned !== bPlanned) return aPlanned - bPlanned
    return String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
  })
}
