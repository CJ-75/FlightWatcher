/**
 * Base URL for API calls.
 * Empty string = same origin (Vite proxy in dev).
 * Override with VITE_API_URL for absolute backend URL.
 */
export function getApiBaseUrl(): string {
  const env = import.meta.env.VITE_API_URL as string | undefined
  if (env && env.trim()) {
    return env.replace(/\/$/, '')
  }
  return ''
}

/** Build an API path, e.g. apiUrl('/api/admin/verify') */
export function apiUrl(path: string): string {
  const base = getApiBaseUrl()
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${base}${normalized}`
}

/** Resolve a fetchable URL (handles relative paths for URL constructor). */
export function resolveApiUrl(path: string, params?: Record<string, string | number | boolean | undefined | null>): string {
  const full = apiUrl(path)
  const absolute =
    full.startsWith('http://') || full.startsWith('https://')
      ? full
      : `${typeof window !== 'undefined' ? window.location.origin : 'http://localhost'}${full}`
  const url = new URL(absolute)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value))
      }
    })
  }
  // If no absolute API base, return path+search (relative) for Vite proxy
  if (!getApiBaseUrl()) {
    return `${url.pathname}${url.search}`
  }
  return url.toString()
}
