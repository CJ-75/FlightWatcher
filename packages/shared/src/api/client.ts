import type {
  Airport,
  ApiConfig,
  CreatePlannedTripRequest,
  Destination,
  InspireRequest,
  InspireResponse,
  InvitePreview,
  PlannedTrip,
  PlannedTripDetail,
  ScanRequest,
  ScanResponse,
  SavedFavorite,
  SavedSearch,
  TravelDeal,
  TripProposal,
  TripResponse,
} from '../types'

export interface ApiClientOptions {
  /** Absolute API base, e.g. http://localhost:8000 — empty for same-origin */
  baseUrl?: string
  getToken?: () => Promise<string | null>
  fetchImpl?: typeof fetch
}

/** Long scans (inspire/scan) often exceed the default ~60s iOS timeout. */
export const LONG_REQUEST_TIMEOUT_MS = 300_000

function joinUrl(base: string, path: string): string {
  const b = (base || '').replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

type RequestOptions = RequestInit & { timeoutMs?: number }

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = options.baseUrl ?? ''
  const fetchFn = options.fetchImpl ?? fetch.bind(globalThis)

  async function request<T>(
    path: string,
    init: RequestOptions = {}
  ): Promise<T> {
    const { timeoutMs, ...rest } = init
    const headers = new Headers(rest.headers)
    if (!headers.has('Content-Type') && rest.body) {
      headers.set('Content-Type', 'application/json')
    }
    if (options.getToken) {
      const token = await options.getToken()
      if (token) headers.set('Authorization', `Bearer ${token}`)
    }

    let signal = rest.signal
    let timer: ReturnType<typeof setTimeout> | undefined
    if (timeoutMs && timeoutMs > 0 && typeof AbortController !== 'undefined') {
      const controller = new AbortController()
      if (rest.signal) {
        if (rest.signal.aborted) controller.abort()
        else rest.signal.addEventListener('abort', () => controller.abort(), { once: true })
      }
      timer = setTimeout(() => controller.abort(), timeoutMs)
      signal = controller.signal
    }

    try {
      const response = await fetchFn(joinUrl(baseUrl, path), {
        ...rest,
        headers,
        signal,
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => response.statusText)
        throw new Error(`API ${response.status}: ${detail}`)
      }

      if (response.status === 204) {
        return undefined as T
      }
      return (await response.json()) as T
    } catch (e) {
      const name = e instanceof Error ? e.name : ''
      const msg = e instanceof Error ? e.message : String(e)
      if (name === 'AbortError' || /timeout|timed out|aborted/i.test(msg)) {
        throw new Error(
          'La recherche a pris trop de temps. Vérifie que le backend tourne, ou réduis les dates.'
        )
      }
      throw e
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  return {
    getConfig: () => request<ApiConfig>('/api/config'),
    health: () => request<{ status: string }>('/api/health'),

    scan: (body: ScanRequest) =>
      request<ScanResponse>('/api/scan', {
        method: 'POST',
        body: JSON.stringify(body),
        timeoutMs: LONG_REQUEST_TIMEOUT_MS,
      }),

    inspire: (body: InspireRequest) =>
      request<InspireResponse>('/api/inspire', {
        method: 'POST',
        body: JSON.stringify(body),
        timeoutMs: LONG_REQUEST_TIMEOUT_MS,
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
        timeoutMs: LONG_REQUEST_TIMEOUT_MS,
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

    getDeals: () => request<TravelDeal[]>('/api/deals'),
    getDeal: (id: string) =>
      request<TravelDeal>(`/api/deals/${encodeURIComponent(id)}`),

    listPlannedTrips: () => request<PlannedTrip[]>('/api/planner/trips'),
    createPlannedTrip: (body: CreatePlannedTripRequest) =>
      request<PlannedTrip>('/api/planner/trips', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    getPlannedTrip: (id: string) =>
      request<PlannedTripDetail>(`/api/planner/trips/${encodeURIComponent(id)}`),
    updatePlannedTrip: (id: string, body: Partial<CreatePlannedTripRequest>) =>
      request<PlannedTrip>(`/api/planner/trips/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    deletePlannedTrip: (id: string) =>
      request<void>(`/api/planner/trips/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    scanPlannedTrip: (id: string) =>
      request<{ proposals: TripProposal[]; nombre_requetes: number }>(
        `/api/planner/trips/${encodeURIComponent(id)}/scan`,
        { method: 'POST', timeoutMs: LONG_REQUEST_TIMEOUT_MS },
      ),
    acceptProposal: (id: string) =>
      request<TripProposal>(`/api/planner/proposals/${encodeURIComponent(id)}/accept`, {
        method: 'POST',
      }),
    rejectProposal: (id: string) =>
      request<TripProposal>(`/api/planner/proposals/${encodeURIComponent(id)}/reject`, {
        method: 'POST',
      }),
    getInvitePreview: (token: string) =>
      request<InvitePreview>(`/api/planner/invite/${encodeURIComponent(token)}`),
    joinInvite: (token: string) =>
      request<{ ok: boolean; trip_id: string }>(
        `/api/planner/invite/${encodeURIComponent(token)}/join`,
        { method: 'POST' },
      ),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

/** Normalize airports response shapes from backend. Dedupes by IATA code. */
export function normalizeAirports(data: { airports: Airport[] } | Airport[]): Airport[] {
  const list = Array.isArray(data) ? data : Array.isArray(data?.airports) ? data.airports : []
  const seen = new Set<string>()
  const out: Airport[] = []
  for (const a of list) {
    const code = (a?.code || '').toUpperCase()
    if (!code || seen.has(code)) continue
    seen.add(code)
    out.push({ ...a, code })
  }
  return out
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
