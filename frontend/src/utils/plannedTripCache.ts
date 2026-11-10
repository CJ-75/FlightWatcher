/**
 * Planned trip detail — memory + durable L2 + singleflight (parity mobile).
 */
import type { PlannedTripDetail, TravelWorkspace } from '@flightwatcher/shared'
import { getApiClient } from './apiClient'
import { readDurableJson, writeDurableJson, removeDurable } from './durableStore'

const DISK_PREFIX = 'fw_planned_trip_v1_'

const memory = new Map<string, PlannedTripDetail>()
const inflight = new Map<string, Promise<PlannedTripDetail>>()

function diskKey(id: string) {
  return `${DISK_PREFIX}${String(id || '').trim()}`
}

export function peekPlannedTrip(id: string): PlannedTripDetail | null {
  const key = String(id || '').trim()
  if (!key) return null
  return memory.get(key) || null
}

export function setPlannedTripMemory(trip: PlannedTripDetail) {
  const id = String(trip?.id || '').trim()
  if (!id) return
  memory.set(id, trip)
  writeDurableJson(diskKey(id), trip)
}

export function hydratePlannedTrip(id: string): PlannedTripDetail | null {
  const key = String(id || '').trim()
  if (!key) return null
  const mem = memory.get(key)
  if (mem) return mem
  const parsed = readDurableJson<PlannedTripDetail>(diskKey(key))
  if (!parsed?.id) return null
  memory.set(key, parsed)
  return parsed
}

export function stubPlannedTripFromWorkspace(
  tripId: string,
  ws: TravelWorkspace,
): PlannedTripDetail {
  const out = String(ws.out_date || '').slice(0, 10)
  const ret = String(ws.ret_date || '').slice(0, 10)
  return {
    id: tripId,
    organizer_id: '',
    name: String(ws.title || ws.city || 'Séjour'),
    departure_airport: String(ws.origin_iata || ''),
    arrival_airport: ws.dest_iata ? String(ws.dest_iata) : null,
    passengers: 2,
    dates_depart: out ? [{ date: out }] : [],
    dates_retour: ret ? [{ date: ret }] : [],
    budget_max: 150,
    invite_token: '',
    status:
      ws.phase === 'flight_selected' ||
      ws.phase === 'booked' ||
      ws.phase === 'composing'
        ? 'locked'
        : 'planning',
    created_at: String(ws.updated_at || new Date().toISOString()),
    proposals: [],
    members: [],
  }
}

export function getPlannedTripCached(
  id: string,
  opts?: { force?: boolean },
): Promise<PlannedTripDetail> {
  const key = String(id || '').trim()
  if (!key) return Promise.reject(new Error('missing_trip_id'))
  const force = Boolean(opts?.force)

  if (!force) {
    const mem = memory.get(key) || hydratePlannedTrip(key)
    if (mem?.id && mem.invite_token) return Promise.resolve(mem)
  }

  const pending = inflight.get(key)
  if (pending) return pending

  const req = getApiClient()
    .getPlannedTrip(key)
    .then((detail) => {
      if (!detail?.id) throw new Error('Voyage introuvable')
      setPlannedTripMemory(detail)
      return detail
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, req)
  return req
}

export function prefetchPlannedTrips(
  ids: Array<string | null | undefined>,
  opts?: { limit?: number },
) {
  const limit = Math.max(1, Math.min(12, opts?.limit ?? 6))
  const seen = new Set<string>()
  let n = 0
  for (const raw of ids) {
    const id = String(raw || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    if (memory.get(id)?.invite_token) continue
    if (inflight.has(id)) continue
    void getPlannedTripCached(id, { force: true }).catch(() => undefined)
    n += 1
    if (n >= limit) break
  }
}

export function clearPlannedTripCache(id?: string) {
  if (id) {
    const key = String(id).trim()
    memory.delete(key)
    inflight.delete(key)
    removeDurable(diskKey(key))
    return
  }
  memory.clear()
  inflight.clear()
}
