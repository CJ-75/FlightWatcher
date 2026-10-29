import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Airport } from '@flightwatcher/shared'
import { normalizeAirports, seedPopularAirports } from '@flightwatcher/shared'
import { apiBase } from './client'

const SEED = seedPopularAirports()
const LS_KEY = 'fw_airports_v1'
const LS_TTL_MS = 7 * 24 * 60 * 60 * 1000
/** Below this → treat as seed/partial, keep fetching full catalog. */
const MIN_FULL_COUNT = 80
const NETWORK_TIMEOUT_MS = 25_000

let cached: Airport[] | null = null
let inflight: Promise<Airport[]> | null = null
let fromDisk = false
let quietRefreshStarted = false
let hydrateStarted = false
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryAttempt = 0

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
  retryAttempt = 0
  if (source === 'network') writeDisk(list)
  notify(list)
}

/**
 * Public /api/airports — direct XHR, no auth token (avoids Supabase getSession lag).
 */
function fetchNetwork(): Promise<Airport[]> {
  const url = `${apiBase.replace(/\/$/, '')}/api/airports`
  if (__DEV__) console.log('[airports] GET', url)

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('GET', url)
    xhr.timeout = NETWORK_TIMEOUT_MS
    xhr.onload = () => {
      try {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(`airports HTTP ${xhr.status}`))
          return
        }
        const data = JSON.parse(xhr.responseText) as
          | Airport[]
          | { airports: Airport[] }
        const list = normalizeAirports(data)
        if (!isFullCatalog(list)) {
          reject(new Error(`airports too small (${list.length})`))
          return
        }
        applyFull(list, 'network')
        resolve(list)
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    }
    xhr.onerror = () => reject(new TypeError(`Network failed: ${url}`))
    xhr.ontimeout = () => reject(new Error(`airports timeout ${NETWORK_TIMEOUT_MS}ms`))
    xhr.send()
  })
}

function scheduleRetry() {
  if (isFullCatalog(cached) || retryTimer) return
  retryAttempt += 1
  const delayMs = Math.min(10_000, 1500 * retryAttempt)
  retryTimer = setTimeout(() => {
    retryTimer = null
    if (isFullCatalog(cached)) return
    void getCachedAirports({ force: true })
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

export function getCachedAirports(opts?: { force?: boolean }): Promise<Airport[]> {
  const force = Boolean(opts?.force)

  if (!force && isFullCatalog(cached)) {
    refreshQuiet()
    return Promise.resolve(cached!)
  }
  if (inflight) return inflight

  const t0 = Date.now()
  inflight = (async () => {
    try {
      if (!force && !isFullCatalog(cached)) {
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
      scheduleRetry()
      const fallback = isFullCatalog(cached) ? cached! : SEED
      notify(fallback)
      return fallback
    } finally {
      inflight = null
    }
  })()

  return inflight
}

export function peekCachedAirports(): Airport[] {
  ensureHydrate()
  return isFullCatalog(cached) ? cached! : SEED
}

/** Subscribe — immediate peek, then updates when full catalog arrives. */
export function subscribeAirports(fn: Listener): () => void {
  listeners.add(fn)
  fn(peekCachedAirports())
  void getCachedAirports().then((list) => fn(list))
  return () => {
    listeners.delete(fn)
  }
}

export function hasFullAirportsCatalog(): boolean {
  return isFullCatalog(cached)
}
