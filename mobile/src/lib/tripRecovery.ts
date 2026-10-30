/**
 * Persist recent MyTrip tokens so guests can reopen bookings (AsyncStorage).
 * Mirrors frontend/src/utils/tripRecovery.ts
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

export type TripRecovery = {
  draft_token: string
  booking_id?: string | null
  city?: string | null
  at: number
}

const KEY = 'fw_trip_recovery_v1'
const MAX = 12

async function readAll(): Promise<TripRecovery[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as TripRecovery[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x) => x && typeof x.draft_token === 'string')
  } catch {
    return []
  }
}

async function writeAll(list: TripRecovery[]) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    /* quota */
  }
}

export async function rememberTrip(input: {
  draft_token: string
  booking_id?: string | null
  city?: string | null
}): Promise<void> {
  const token = String(input.draft_token || '').trim()
  if (!token) return
  const prev = (await readAll()).filter((x) => x.draft_token !== token)
  const next: TripRecovery = {
    draft_token: token,
    booking_id: input.booking_id || null,
    city: input.city || null,
    at: Date.now(),
  }
  await writeAll([next, ...prev])
}

export async function listRememberedTrips(): Promise<TripRecovery[]> {
  return (await readAll()).sort((a, b) => b.at - a.at)
}

export async function latestTripDraft(): Promise<string | null> {
  const list = await listRememberedTrips()
  return list[0]?.draft_token || null
}
