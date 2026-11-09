/** Shared /api/config promise — one network call per page load. */
let configPromise: Promise<Record<string, unknown> | null> | null = null

export function getAppConfig(): Promise<Record<string, unknown> | null> {
  if (!configPromise) {
    const ctrl =
      typeof AbortController !== 'undefined' ? new AbortController() : null
    const timer =
      ctrl && typeof window !== 'undefined'
        ? window.setTimeout(() => ctrl.abort(), 8_000)
        : null
    configPromise = fetch('/api/config', ctrl ? { signal: ctrl.signal } : undefined)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .finally(() => {
        if (timer != null) window.clearTimeout(timer)
      })
  }
  return configPromise
}

export function resetAppConfigCache() {
  configPromise = null
}
