import type { TravelWorkspace } from '@flightwatcher/shared'
import { getApiClient } from './apiClient'

/** Hub + detail share one hit; mutations call invalidateTravelWorkspacesCache. */
const TTL_MS = 60_000

let cached: { at: number; data: TravelWorkspace[] } | null = null
let inflight: Promise<TravelWorkspace[]> | null = null

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
      cached = { at: Date.now(), data }
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
}
