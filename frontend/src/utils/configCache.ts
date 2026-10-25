/** Shared /api/config promise — one network call per page load. */
let configPromise: Promise<Record<string, unknown> | null> | null = null

export function getAppConfig(): Promise<Record<string, unknown> | null> {
  if (!configPromise) {
    configPromise = fetch('/api/config')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
  }
  return configPromise
}

export function resetAppConfigCache() {
  configPromise = null
}
