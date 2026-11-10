import AsyncStorage from '@react-native-async-storage/async-storage'
import type { TravelWorkspace } from '@flightwatcher/shared'
import { getApi } from './client'

/** Keep hub instant on tab focus; pull-to-refresh / mutations still force. */
const TTL_MS = 60_000
const DISK_KEY = 'fw_travel_workspaces_v1'

let cached: { at: number; data: TravelWorkspace[] } | null = null
let inflight: Promise<TravelWorkspace[]> | null = null
let diskHydrate: Promise<TravelWorkspace[] | null> | null = null

function setMemory(data: TravelWorkspace[]) {
  cached = { at: Date.now(), data }
  void AsyncStorage.setItem(DISK_KEY, JSON.stringify(data.slice(0, 60))).catch(
    () => undefined,
  )
}

export async function listTravelWorkspacesCached(opts?: {
  force?: boolean
}): Promise<TravelWorkspace[]> {
  const force = Boolean(opts?.force)
  if (!force && cached && Date.now() - cached.at < TTL_MS) {
    return cached.data
  }
  if (!force && inflight) return inflight
  const stale = cached?.data ?? null
  inflight = getApi()
    .listTravelWorkspaces()
    .then((list) => {
      const data = Array.isArray(list) ? list : []
      setMemory(data)
      return data
    })
    .catch(async (err) => {
      // Network blip (« Fetch failed ») — keep hub usable from memory/disk.
      if (stale?.length) return stale
      const disk = await hydrateTravelWorkspacesCache()
      if (disk?.length) return disk
      throw err
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function peekTravelWorkspacesCache(): TravelWorkspace[] | null {
  return cached?.data ?? null
}

/** Sync paint from memory, or kick disk hydrate once. */
export async function hydrateTravelWorkspacesCache(): Promise<
  TravelWorkspace[] | null
> {
  if (cached?.data) return cached.data
  if (!diskHydrate) {
    diskHydrate = AsyncStorage.getItem(DISK_KEY)
      .then((raw) => {
        if (!raw) return null
        const parsed = JSON.parse(raw) as TravelWorkspace[]
        if (!Array.isArray(parsed) || !parsed.length) return null
        if (!cached) cached = { at: 0, data: parsed }
        return parsed
      })
      .catch(() => null)
      .finally(() => {
        diskHydrate = null
      })
  }
  return diskHydrate
}

export function invalidateTravelWorkspacesCache() {
  cached = null
  inflight = null
  void AsyncStorage.removeItem(DISK_KEY).catch(() => undefined)
}
