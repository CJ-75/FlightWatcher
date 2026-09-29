import type {
  Airport,
  ApiConfig,
  Destination,
  InspireRequest,
  InspireResponse,
  ScanRequest,
  ScanResponse,
  SavedFavorite,
  SavedSearch,
  TripResponse,
} from '../types'

export interface ApiClientOptions {
  /** Absolute API base, e.g. http://localhost:8000 — empty for same-origin */
  baseUrl?: string
  getToken?: () => Promise<string | null>
  fetchImpl?: typeof fetch
}

function joinUrl(base: string, path: string): string {
  const b = (base || '').replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? ''
  const fetchFn = options.fetchImpl ?? fetch.bind(globalThis)

  async function request<T>(
    path: string,
    init: RequestInit = {}
  ): Promise<T> {
    const headers = new Headers(init.headers)
    if (!headers.has('Content-Type') && init.body) {
      headers.set('Content-Type', 'application/json')
    }
    if (options.getToken) {
      const token = await options.getToken()
      if (token) headers.set('Authorization', `Bearer ${token}`)
    }

    const response = await fetchFn(joinUrl(baseUrl, path), {
      ...init,
      headers,
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText)
      throw new Error(`API ${response.status}: ${detail}`)
    }

    if (response.status === 204) {
      return undefined as T
    }
    return (await response.json()) as T
  }

  return {
    getConfig: () => request<ApiConfig>('/api/config'),
    health: () => request<{ status: string }>('/api/health'),

    scan: (body: ScanRequest) =>
      request<ScanResponse>('/api/scan', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    inspire: (body: InspireRequest) =>
      request<InspireResponse>('/api/inspire', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    getAirports: () => request<{ airports: Airport[] } | Airport[]>('/api/airports'),

    getDestinations: (airport: string) =>
      request<{ destinations: Destination[] } | Destination[]>(
        `/api/destinations?airport=${encodeURIComponent(airport)}`
      ),

    autoCheck: (body: unknown) =>
      request<unknown>('/api/auto-check', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    getSearches: () => request<SavedSearch[]>('/api/supabase/searches'),
    saveSearch: (body: unknown) =>
      request<SavedSearch>('/api/supabase/searches', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    deleteSearch: (id: string) =>
      request<void>(`/api/supabase/searches/${id}`, { method: 'DELETE' }),

    getFavorites: () => request<SavedFavorite[]>('/api/supabase/favorites'),
    saveFavorite: (body: unknown) =>
      request<SavedFavorite>('/api/supabase/favorites', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    deleteFavorite: (id: string) =>
      request<void>(`/api/supabase/favorites/${id}`, { method: 'DELETE' }),

    getMe: () => request<unknown>('/api/auth/me'),
    updateProfile: (body: unknown) =>
      request<unknown>('/api/user/profile', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    trackSearchEvent: (body: unknown) =>
      request<unknown>('/api/analytics/search-event', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    trackBookingSasEvent: (body: unknown) =>
      request<void>('/api/analytics/booking-sas-event', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    supabaseStatus: () =>
      request<{ available: boolean }>('/api/supabase/status'),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

/** Normalize airports response shapes from backend. */
export function normalizeAirports(data: { airports: Airport[] } | Airport[]): Airport[] {
  if (Array.isArray(data)) return data
  const list = data?.airports
  return Array.isArray(list) ? list : []
}

export function normalizeDestinations(
  data: { destinations: Destination[] | Record<string, Destination[]> } | Destination[] | Record<string, Destination[]>
): Destination[] {
  if (Array.isArray(data)) return data
  const dest =
    data && typeof data === 'object' && 'destinations' in data
      ? (data as { destinations: unknown }).destinations
      : data
  if (Array.isArray(dest)) return dest
  if (dest && typeof dest === 'object') {
    return Object.values(dest as Record<string, Destination[]>).flat()
  }
  return []
}

/** Backend shape: destinations grouped by country. */
export function normalizeDestinationsByCountry(
  data: { destinations?: unknown } | Record<string, Destination[]> | Destination[]
): Record<string, Destination[]> {
  if (Array.isArray(data)) {
    const map: Record<string, Destination[]> = {}
    for (const d of data) {
      const key = d.pays || 'Autre'
      if (!map[key]) map[key] = []
      map[key].push(d)
    }
    return map
  }
  const dest =
    data && typeof data === 'object' && 'destinations' in data
      ? (data as { destinations: unknown }).destinations
      : data
  if (Array.isArray(dest)) {
    return normalizeDestinationsByCountry(dest)
  }
  if (dest && typeof dest === 'object' && !Array.isArray(dest)) {
    return dest as Record<string, Destination[]>
  }
  return {}
}

export type { TripResponse, ScanRequest, ScanResponse }
