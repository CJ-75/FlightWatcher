/**
 * trip_items are XOR-owned server-side: draft XOR planned.
 * Prefer planned_trip_id whenever present; draft_token is solo fallback only.
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
  const draft = String(opts.draftToken || '').trim()
  const out: TripItemOwnerKeys = {}
  if (planned) {
    out.planned_trip_id = planned
    return out
  }
  if (draft) out.draft_token = draft
  return out
}

export function hasTripItemOwner(keys: TripItemOwnerKeys): boolean {
  return Boolean(keys.draft_token || keys.planned_trip_id)
}
