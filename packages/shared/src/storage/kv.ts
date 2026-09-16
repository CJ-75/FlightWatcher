/** Platform-agnostic key-value store (localStorage / AsyncStorage). */
export interface KVStore {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
}

export const STORAGE_KEYS = {
  SEARCHES: 'flightwatcher_saved_searches',
  FAVORITES: 'flightwatcher_favorites',
  EXCLUDED_DESTINATIONS: 'flightwatcher_excluded_destinations',
  DEV_MODE: 'flightwatcher_dev_mode',
  NEW_RESULTS: 'flightwatcher_new_results',
  AUTO_EXPORT_ENABLED: 'flightwatcher_auto_export_enabled',
  LANGUAGE: 'language',
  SESSION_ID: 'flightwatcher_session_id',
} as const

/** In-memory KV for tests / SSR. */
export function createMemoryKVStore(initial: Record<string, string> = {}): KVStore {
  const map = new Map<string, string>(Object.entries(initial))
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}

/** Browser localStorage adapter. */
export function createLocalStorageKV(): KVStore {
  return {
    getItem: (key) => {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
    },
    setItem: (key, value) => {
      localStorage.setItem(key, value)
    },
    removeItem: (key) => {
      localStorage.removeItem(key)
    },
  }
}

/** Wrap AsyncStorage-like API (Expo) into KVStore. */
export function createAsyncKVStore(asyncStorage: {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
}): KVStore {
  return {
    getItem: (key) => asyncStorage.getItem(key),
    setItem: (key, value) => asyncStorage.setItem(key, value),
    removeItem: (key) => asyncStorage.removeItem(key),
  }
}

export async function kvGet(store: KVStore, key: string): Promise<string | null> {
  return await store.getItem(key)
}

export async function kvSet(store: KVStore, key: string, value: string): Promise<void> {
  await store.setItem(key, value)
}

export async function kvRemove(store: KVStore, key: string): Promise<void> {
  await store.removeItem(key)
}

export async function kvGetJson<T>(store: KVStore, key: string, fallback: T): Promise<T> {
  const raw = await kvGet(store, key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export async function kvSetJson(store: KVStore, key: string, value: unknown): Promise<void> {
  await kvSet(store, key, JSON.stringify(value))
}
