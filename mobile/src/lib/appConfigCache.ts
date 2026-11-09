/**
 * Public /api/config — memory + disk so TripDetail knows v2 before first paint
 * (avoids v1 flash → v2 swap).
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { ApiConfig } from '@flightwatcher/shared'
import { getApi } from './client'

const DISK_KEY = 'fw_api_config_v1'

let memory: ApiConfig | null = null
let inflight: Promise<ApiConfig> | null = null
let diskHydrate: Promise<ApiConfig | null> | null = null

export function peekAppConfig(): ApiConfig | null {
  return memory
}

export function setAppConfigMemory(cfg: ApiConfig) {
  if (!cfg || typeof cfg !== 'object') return
  memory = cfg
  void AsyncStorage.setItem(DISK_KEY, JSON.stringify(cfg)).catch(() => {})
}

export async function hydrateAppConfig(): Promise<ApiConfig | null> {
  if (memory) return memory
  if (!diskHydrate) {
    diskHydrate = AsyncStorage.getItem(DISK_KEY)
      .then((raw) => {
        if (!raw) return null
        const parsed = JSON.parse(raw) as ApiConfig
        if (!parsed || typeof parsed !== 'object') return null
        memory = parsed
        return parsed
      })
      .catch(() => null)
      .finally(() => {
        diskHydrate = null
      })
  }
  return diskHydrate
}

export function getAppConfigCached(): Promise<ApiConfig> {
  if (memory) return Promise.resolve(memory)
  if (inflight) return inflight
  inflight = getApi()
    .getConfig()
    .then((cfg) => {
      setAppConfigMemory(cfg)
      return cfg
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}
