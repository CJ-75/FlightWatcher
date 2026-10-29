import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Airport } from '@flightwatcher/shared'
import { normalizeAirports, seedPopularAirports } from '@flightwatcher/shared'
import { getApi } from './client'

const SEED = seedPopularAirports()
const LS_KEY = 'fw_airports_v1'
const LS_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** Below this → treat as seed/partial, keep fetching full catalog. */
const MIN_FULL_COUNT = 80

let cached: Airport[] | null = null
let inflight: Promise<Airport[]> | null = null
let fromDisk = false
let quietRefreshStarted = false
let hydrateStarted = false
let retryTimer: ReturnType<typeof setTimeout> | null = null

type Listener = (list: Airport[]) => void
const listeners = new Set<Listener>()

function isFullCatalog(list: Airport[] | null | undefined): boolean {
  return Boolean(list && list.length >= MIN_FULL_COUNT)
}

function notify(list: Airport[]) {
  listeners.forEach((fn) => {
    try {
      fn(list)
    } catch {
      /* ignore listener errors */
    }
  })
}

async function readDisk(): Promise<Airport[] | null> {
  try {
    const raw = await AsyncStorage.getItem(LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: number; airports?: Airport[] }
    if (!Array.isArray(parsed.airports) || !isFullCatalog(parsed.airports)) return null
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > LS_TTL_MS) return null
    return parsed.airports
  } catch {
    return null
  }
}

function writeDisk(list: Airport[]) {
  if (!isFullCatalog(list)) return
  void AsyncStorage.setItem(
    LS_KEY,
    JSON.stringify({ at: Date.now(), airports: list }),
  ).catch(() => undefined)
}

function applyFull(list: Airport[], source: 'network' | 'disk') {
  cached = list
  fromDisk = source === 'disk'
  if (source === 'network') writeDisk(list)
  notify(list)
}

function fetchNetwork(): Promise<Airport[]> {
  return getApi()
    .getAirports()
    .then((raw) => {
      const list = normalizeAirports(raw as Airport[] | { airports: Airport[] })
      if (!list.length) throw new Error('empty airports')
      applyFull(list, 'network')
      return list
    })
}

function scheduleRetry(delayMs = 2500) {
  if (isFullCatalog(cached) || retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    if (isFullCatalog(cached)) return
    void getCachedAirports()
  }, delayMs)
}

function refreshQuiet() {
  if (quietRefreshStarted || !fromDisk) return
  quietRefreshStarted = true
  fetchNetwork()
    .catch(() => {
      /* keep stale disk cache */
    })
    .finally(() => {
      quietRefreshStarted = false
    })
}

/** Kick AsyncStorage hydrate once (non-blocking). */
function ensureHydrate(): void {
  if (hydrateStarted || isFullCatalog(cached)) return
  hydrateStarted = true
  void readDisk().then((fromLs) => {
    if (fromLs && !isFullCatalog(cached)) {
      applyFull(fromLs, 'disk')
      refreshQuiet()
    }
  })
}

ensureHydrate()

/**
 * Full catalog when possible. Seed is never stored as the permanent cache —
 * failed/timeout fetches keep retrying.
 */
export function getCachedAirports(): Promise<Airport[]> {
  if (isFullCatalog(cached)) {
    refreshQuiet()
    return Promise.resolve(cached!)
  }
  if (inflight) return inflight

  const t0 = Date.now()
  inflight = (async () => {
    try {
      if (!isFullCatalog(cached)) {
        const fromLs = await readDisk()
        if (fromLs) {
          applyFull(fromLs, 'disk')
          refreshQuiet()
          if (__DEV__) {
            console.log('[airports] disk', fromLs.length, 'in', Date.now() - t0, 'ms')
          }
          return fromLs
        }
      }
      const list = await fetchNetwork()
      if (__DEV__) {
        console.log('[airports] loaded', list.length, 'in', Date.now() - t0, 'ms')
      }
      return list
    } catch (err) {
      if (__DEV__) console.warn('[airports] failed — seed until retry', err)
      // Never assign SEED to `cached` — next open / scheduled retry must hit network.
      scheduleRetry()
      return isFullCatalog(cached) ? cached! : SEED
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/** Sync peek for first paint: full cache if ready, else seed (never blocks). */
export function peekCachedAirports(): Airport[] {
  ensureHydrate()
  return isFullCatalog(cached) ? cached! : SEED
}

/** Subscribe to catalog updates (disk / network). Immediate if full already. */
export function subscribeAirports(fn: Listener): () => void {
  listeners.add(fn)
  if (isFullCatalog(cached)) fn(cached!)
  else void getCachedAirports().then((list) => {
    if (isFullCatalog(list)) fn(list)
  })
  return () => {
    listeners.delete(fn)
  }
}

export function hasFullAirportsCatalog(): boolean {
  return isFullCatalog(cached)
}
