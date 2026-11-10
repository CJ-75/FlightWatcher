/**
 * Durable client store (localStorage) — survives tab close, unlike sessionStorage.
 * Soft-fail on quota / private mode.
 */

export function readDurableJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeDurableJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    try {
      // Drop oldest fw_* keys if quota exceeded
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('fw_'))
      for (const k of keys.slice(0, Math.ceil(keys.length / 4))) {
        localStorage.removeItem(k)
      }
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* ignore */
    }
  }
}

export function removeDurable(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** Migrate session → local once, then drop session key. */
export function migrateSessionToDurable<T>(key: string): T | null {
  try {
    const durable = readDurableJson<T>(key)
    if (durable != null) {
      try {
        sessionStorage.removeItem(key)
      } catch {
        /* ignore */
      }
      return durable
    }
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as T
    writeDurableJson(key, parsed)
    sessionStorage.removeItem(key)
    return parsed
  } catch {
    return null
  }
}
