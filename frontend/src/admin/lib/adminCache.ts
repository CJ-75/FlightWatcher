/**
 * Client SWR cache for admin — instant paint + background refresh.
 */

type Entry<T> = {
  data: T
  at: number
}

const store = new Map<string, Entry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

const DEFAULT_TTL_MS = 45_000
const DEFAULT_STALE_MS = 180_000

export function adminCacheKey(parts: Array<string | number | boolean | null | undefined>): string {
  return parts.map((p) => (p == null ? '' : String(p))).join('|')
}

export function peekAdminCache<T>(key: string): T | null {
  const hit = store.get(key) as Entry<T> | undefined
  return hit ? hit.data : null
}

export function setAdminCache<T>(key: string, data: T): void {
  store.set(key, { data, at: Date.now() })
}

export function invalidateAdminCache(prefix?: string): void {
  if (!prefix) {
    store.clear()
    return
  }
  for (const k of [...store.keys()]) {
    if (k.startsWith(prefix)) store.delete(k)
  }
}

type SwrOpts<T> = {
  key: string
  fetcher: () => Promise<T>
  ttlMs?: number
  staleMs?: number
  force?: boolean
}

export async function adminSwr<T>(opts: SwrOpts<T>): Promise<{
  data: T
  fromCache: boolean
  stale: boolean
}> {
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS
  const staleWindow = opts.staleMs ?? DEFAULT_STALE_MS
  const now = Date.now()
  const hit = store.get(opts.key) as Entry<T> | undefined

  const runFetch = (): Promise<T> => {
    const existing = inflight.get(opts.key) as Promise<T> | undefined
    if (existing && !opts.force) return existing
    const p = opts
      .fetcher()
      .then((data) => {
        store.set(opts.key, { data, at: Date.now() })
        return data
      })
      .finally(() => {
        inflight.delete(opts.key)
      })
    inflight.set(opts.key, p)
    return p
  }

  if (!opts.force && hit) {
    const age = now - hit.at
    if (age < ttl) {
      return { data: hit.data, fromCache: true, stale: false }
    }
    if (age < staleWindow) {
      void runFetch()
      return { data: hit.data, fromCache: true, stale: true }
    }
  }

  const data = await runFetch()
  return { data, fromCache: false, stale: false }
}
