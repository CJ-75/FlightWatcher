import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Airport } from '@flightwatcher/shared'
import {
  bundledAirports,
  normalizeAirports,
  seedPopularAirports,
} from '@flightwatcher/shared'
import { apiBase } from './client'

/** Instant full catalog (bundled). Network refreshes when LAN backend is reachable. */
const BUNDLE = bundledAirports()
const SEED = seedPopularAirports()
const INSTANT = BUNDLE.length >= 80 ? BUNDLE : SEED

const LS_KEY = 'fw_airports_v1'
const LS_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MIN_FULL_COUNT = 80
/** Fail fast on LAN — backend often bound to 127.0.0.1 only. */
const NETWORK_TIMEOUT_MS = 4_000

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
      /* ignore */
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

function applyFull(list: Airport[], source: 'network' | 'disk' | 'bundle') {
  cached = list
  fromDisk = source === 'disk'
  retryAttempt = 0
  if (source === 'network') writeDisk(list)
  notify(list)
}

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
  if (retryTimer || retryAttempt >= 4) return
  retryAttempt += 1
  const delayMs = Math.min(15_000, 3000 * retryAttempt)
  retryTimer = setTimeout(() => {
    retryTimer = null
    refreshQuiet()
  }, delayMs)
}

function refreshQuiet() {
  if (quietRefreshStarted) return
  quietRefreshStarted = true
  fetchNetwork()
    .catch((err) => {
      if (__DEV__) console.warn('[airports] refresh skipped', err)
    })
    .finally(() => {
      quietRefreshStarted = false
    })
}

function ensureHydrate(): void {
  if (hydrateStarted) return
  hydrateStarted = true
  void readDisk().then((fromLs) => {
    if (fromLs && (!cached || fromLs.length >= (cached?.length ?? 0))) {
      applyFull(fromLs, 'disk')
    }
    refreshQuiet()
  })
}

ensureHydrate()

export function getCachedAirports(opts?: { force?: boolean }): Promise<Airport[]> {
  const force = Boolean(opts?.force)

  if (!force && isFullCatalog(cached)) {
    refreshQuiet()
    return Promise.resolve(cached!)
  }

  // Instant: never block UI on LAN — serve bundle/disk immediately
  if (!force && !isFullCatalog(cached)) {
    cached = INSTANT
    applyFull(INSTANT, 'bundle')
    refreshQuiet()
    return Promise.resolve(INSTANT)
  }

  if (inflight) return inflight

  const t0 = Date.now()
  inflight = (async () => {
    try {
      if (!force) {
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
      if (__DEV__) console.warn('[airports] network fail — using bundle', err)
      const fallback = isFullCatalog(cached) ? cached! : INSTANT
      applyFull(fallback, isFullCatalog(cached) ? 'disk' : 'bundle')
      scheduleRetry()
      return fallback
    } finally {
      inflight = null
    }
  })()

  return inflight
}

export function peekCachedAirports(): Airport[] {
  ensureHydrate()
  if (isFullCatalog(cached)) return cached!
  cached = INSTANT
  return INSTANT
}

export function subscribeAirports(fn: Listener): () => void {
  listeners.add(fn)
  fn(peekCachedAirports())
  void getCachedAirports().then((list) => fn(list))
  return () => {
    listeners.delete(fn)
  }
}

export function hasFullAirportsCatalog(): boolean {
  return isFullCatalog(cached) || INSTANT.length >= MIN_FULL_COUNT
}
