import type { TravelWorkspace } from '@flightwatcher/shared'
import { getApiClient } from './apiClient'

/** Hub + detail share one hit; mutations call invalidateTravelWorkspacesCache. */
const TTL_MS = 60_000
const DISK_KEY = 'fw_travel_workspaces_v1'

let cached: { at: number; data: TravelWorkspace[] } | null = null
let inflight: Promise<TravelWorkspace[]> | null = null

function readDisk(): TravelWorkspace[] | null {
  try {
    const raw = sessionStorage.getItem(DISK_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TravelWorkspace[]
    return Array.isArray(parsed) && parsed.length ? parsed : null
  } catch {
    return null
  }
}

function writeDisk(data: TravelWorkspace[]) {
  try {
    sessionStorage.setItem(DISK_KEY, JSON.stringify(data.slice(0, 60)))
  } catch {
    /* ignore */
  }
}

function setMemory(data: TravelWorkspace[]) {
  cached = { at: Date.now(), data }
  writeDisk(data)
}

// Hydrate memory from session on module load (instant hub paint).
;(() => {
  const disk = readDisk()
  if (disk && !cached) cached = { at: 0, data: disk }
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
  try {
    sessionStorage.removeItem(DISK_KEY)
  } catch {
    /* ignore */
  }
}
