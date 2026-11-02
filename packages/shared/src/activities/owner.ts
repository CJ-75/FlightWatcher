/**
 * trip_items are XOR-owned: draft XOR planned.
 * Prefer collaborative Planner when both are known.
 */

export type TripItemOwnerKeys = {
  draft_token?: string
  planned_trip_id?: string
}

export function pickTripItemOwner(opts: {
  draftToken?: string | null
  plannedTripId?: string | null
}): TripItemOwnerKeys {
  const planned = String(opts.plannedTripId || '').trim()
  if (planned) return { planned_trip_id: planned }
  const draft = String(opts.draftToken || '').trim()
  if (draft) return { draft_token: draft }
  return {}
}

export function hasTripItemOwner(keys: TripItemOwnerKeys): boolean {
  return Boolean(keys.draft_token || keys.planned_trip_id)
}
