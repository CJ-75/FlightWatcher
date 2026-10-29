/** Persist recent MyTrip tokens so guests can reopen /trip or /bookings. */

export type TripRecovery = {
  draft_token: string
  booking_id?: string | null
  city?: string | null
  at: number
}

const KEY = 'fw_trip_recovery_v1'
const MAX = 12

function readAll(): TripRecovery[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as TripRecovery[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x) => x && typeof x.draft_token === 'string')
  } catch {
    return []
  }
}

function writeAll(list: TripRecovery[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    /* quota */
  }
}

export function rememberTrip(input: {
  draft_token: string
  booking_id?: string | null
  city?: string | null
}) {
  const token = String(input.draft_token || '').trim()
  if (!token) return
  const prev = readAll().filter((x) => x.draft_token !== token)
  const next: TripRecovery = {
    draft_token: token,
    booking_id: input.booking_id || null,
    city: input.city || null,
    at: Date.now(),
  }
  writeAll([next, ...prev])
}

export function listRememberedTrips(): TripRecovery[] {
  return readAll().sort((a, b) => b.at - a.at)
}

export function latestTripDraft(): string | null {
  return listRememberedTrips()[0]?.draft_token || null
}
