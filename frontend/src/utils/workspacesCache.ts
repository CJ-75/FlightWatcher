import type { TravelWorkspace } from '@flightwatcher/shared'
import { getApiClient } from './apiClient'
import {
  migrateSessionToDurable,
  removeDurable,
  writeDurableJson,
} from './durableStore'

/** Hub + detail share one hit; mutations call invalidateTravelWorkspacesCache. */
const TTL_MS = 60_000
const DISK_KEY = 'fw_travel_workspaces_v1'

let cached: { at: number; data: TravelWorkspace[] } | null = null
let inflight: Promise<TravelWorkspace[]> | null = null

function setMemory(data: TravelWorkspace[]) {
  cached = { at: Date.now(), data }
  writeDurableJson(DISK_KEY, data.slice(0, 60))
}

// Hydrate memory from durable L2 (migrate session → local once).
;(() => {
  const disk = migrateSessionToDurable<TravelWorkspace[]>(DISK_KEY)
  if (Array.isArray(disk) && disk.length && !cached) {
    cached = { at: 0, data: disk }
  }
})()

export async function listTravelWorkspacesCached(opts?: {
  force?: boolean
}): Promise<TravelWorkspace[]> {
  const force = Boolean(opts?.force)
  if (!force && cached && Date.now() - cached.at < TTL_MS) {
    return cached.data
  }
  if (!force && inflight) return inflight
  inflight = getApiClient()
    .listTravelWorkspaces()
    .then((list) => {
      const data = Array.isArray(list) ? list : []
      setMemory(data)
      return data
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function peekTravelWorkspacesCache(): TravelWorkspace[] | null {
  return cached?.data ?? null
}

export function invalidateTravelWorkspacesCache() {
  cached = null
  inflight = null
  removeDurable(DISK_KEY)
  try {
    sessionStorage.removeItem(DISK_KEY)
  } catch {
    /* ignore */
  }
}
