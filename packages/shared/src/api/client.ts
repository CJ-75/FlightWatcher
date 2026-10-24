import type {
  Airport,
  ApiConfig,
  AddTripMemberRequest,
  CreatePlannedTripRequest,
  Destination,
  InspireRequest,
  InspireResponse,
  InvitePreview,
  LikedDeal,
  PlannedTrip,
  PlannedTripDetail,
  ScanRequest,
  ScanResponse,
  SavedFavorite,
  SavedSearch,
  TravelDeal,
  DealsListParams,
  DealCalendarParams,
  DealCalendarResponse,
  DealRevalidateRequest,
  DealRevalidateResponse,
  MyTripDraft,
  HotelBooking,
  HotelBookingBookRequest,
  HotelBookingPrebookRequest,
  HotelBookingPrebookResponse,
  HotelGalleryResponse,
  HotelUpsellJob,
  HotelUpsellLookupItem,
  HotelUpsellResult,
  TripProposal,
  TripMember,
  TripResponse,
  UpdatePlannedTripRequest,
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
        const raw = await response.text().catch(() => response.statusText)
        let message = raw || response.statusText
        try {
          const parsed = JSON.parse(raw) as { detail?: unknown }
          if (typeof parsed?.detail === 'string') message = parsed.detail
          else if (Array.isArray(parsed?.detail)) {
            message = parsed.detail
              .map((d) =>
                typeof d === 'object' && d && 'msg' in d
                  ? String((d as { msg: unknown }).msg)
                  : String(d),
              )
              .join(', ')
          }
        } catch {
          /* keep raw */
        }
        throw new Error(message)
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

    getDeals: (params?: DealsListParams) => {
      const q = new URLSearchParams()
      if (params?.origin) q.set('origin', params.origin)
      if (params?.adults != null) q.set('adults', String(params.adults))
      if (params?.window) q.set('window', params.window)
      if (params?.max_pp != null) q.set('max_pp', String(params.max_pp))
      const qs = q.toString()
      return request<TravelDeal[]>(`/api/deals${qs ? `?${qs}` : ''}`)
    },
    getDeal: (id: string) =>
      request<TravelDeal>(`/api/deals/${encodeURIComponent(id)}`),

    getHotelGallery: (hotelId: string, opts?: { language?: string; fallback?: string }) => {
      const q = new URLSearchParams()
      if (opts?.language) q.set('language', opts.language)
      if (opts?.fallback) q.set('fallback', opts.fallback)
      const qs = q.toString()
      return request<HotelGalleryResponse>(
        `/api/deals/hotels/${encodeURIComponent(hotelId)}/gallery${qs ? `?${qs}` : ''}`,
      )
    },

    getDealCalendar: (params: DealCalendarParams) => {
      const q = new URLSearchParams()
      q.set('origin', params.origin)
      if (params.slug) q.set('slug', params.slug)
      if (params.destination_id) q.set('destination_id', params.destination_id)
      if (params.iata) q.set('iata', params.iata)
      if (params.adults != null) q.set('adults', String(params.adults))
      if (params.window) q.set('window', params.window)
      return request<DealCalendarResponse>(`/api/deals/calendar?${q.toString()}`)
    },

    lookupHotelUpsell: (items: HotelUpsellLookupItem[]) =>
      request<{ results: HotelUpsellResult[] }>('/api/deals/hotel-upsell/lookup', {
        method: 'POST',
        body: JSON.stringify({ items }),
      }),

    fetchHotelUpsell: (body: HotelUpsellLookupItem) =>
      request<HotelUpsellResult>('/api/deals/hotel-upsell/fetch', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    getHotelUpsellJob: (jobId: string) =>
      request<HotelUpsellJob>(
        `/api/deals/hotel-upsell/jobs/${encodeURIComponent(jobId)}`,
      ),

    revalidateDeal: (dealKey: string, body: DealRevalidateRequest = {}) =>
      request<DealRevalidateResponse>(
        `/api/deals/${encodeURIComponent(dealKey)}/revalidate`,
        { method: 'POST', body: JSON.stringify(body) },
      ),

    createMyTrip: (body: Record<string, unknown>) =>
      request<MyTripDraft>('/api/deals/my-trip', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    getMyTrip: (draftToken: string) =>
      request<MyTripDraft>(
        `/api/deals/my-trip/${encodeURIComponent(draftToken)}`,
      ),

    claimMyTrip: (draftToken: string) =>
      request<MyTripDraft>(
        `/api/deals/my-trip/${encodeURIComponent(draftToken)}/claim`,
        { method: 'POST', body: JSON.stringify({}) },
      ),

    emailMyTrip: (draftToken: string, body: { email: string; consent: boolean }) =>
      request<{ ok: boolean; email?: string; error?: string }>(
        `/api/deals/my-trip/${encodeURIComponent(draftToken)}/email`,
        { method: 'POST', body: JSON.stringify(body) },
      ),

    markMyTripFlightBooked: (draftToken: string) =>
      request<MyTripDraft>(
        `/api/deals/my-trip/${encodeURIComponent(draftToken)}/flight-booked`,
        { method: 'POST', body: JSON.stringify({}) },
      ),

    recordFlightClick: (body: {
      deal_key: string
      verification_level?: string
      displayed_pp?: number | null
      checked_pp?: number | null
      outcome?: string
      source?: string
      draft_token?: string | null
      partner?: string | null
    }) =>
      request<{ ok: boolean; check?: { id?: string } }>('/api/deals/flight-click', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    flightClickFeedback: (body: {
      feedback: string
      check_id?: string | null
      draft_token?: string | null
      deal_key?: string | null
    }) =>
      request<{ ok: boolean }>('/api/deals/flight-click/feedback', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    revalidateDealFlight: (dealKey: string, adults: number) =>
      request<{
        ok: boolean
        revalidated?: boolean
        available?: boolean
        displayed_pp?: number
        checked_pp?: number | null
        adults?: number
        booking_url?: string | null
        price_note?: string | null
        delta_pct?: number | null
        error?: string
      }>(`/api/deals/${encodeURIComponent(dealKey)}/revalidate-flight`, {
        method: 'POST',
        body: JSON.stringify({ adults }),
      }),

    prebookHotel: (body: HotelBookingPrebookRequest) =>
      request<HotelBookingPrebookResponse>('/api/hotel-bookings/prebook', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    bookHotel: (bookingId: string, body: HotelBookingBookRequest) =>
      request<HotelBooking>(
        `/api/hotel-bookings/${encodeURIComponent(bookingId)}/book`,
        { method: 'POST', body: JSON.stringify(body) },
      ),

    listHotelBookings: () => request<HotelBooking[]>('/api/hotel-bookings'),

    getHotelBooking: (id: string) =>
      request<HotelBooking>(`/api/hotel-bookings/${encodeURIComponent(id)}`),

    getLikedDeals: () => request<LikedDeal[]>('/api/liked-deals'),
    getLikedDealIds: () => request<string[]>('/api/liked-deals/ids'),
    likeDeal: (deal: TravelDeal) =>
      request<LikedDeal>('/api/liked-deals', {
        method: 'POST',
        body: JSON.stringify(deal),
      }),
    unlikeDeal: (dealId: string) =>
      request<{ success: boolean }>(
        `/api/liked-deals/${encodeURIComponent(dealId)}`,
        { method: 'DELETE' },
      ),

    listPlannedTrips: () => request<PlannedTrip[]>('/api/planner/trips'),
    createPlannedTrip: (body: CreatePlannedTripRequest) =>
      request<PlannedTrip>('/api/planner/trips', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    getPlannedTrip: (id: string) =>
      request<PlannedTripDetail>(`/api/planner/trips/${encodeURIComponent(id)}`),
    updatePlannedTrip: (id: string, body: UpdatePlannedTripRequest) =>
      request<PlannedTrip>(`/api/planner/trips/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    deletePlannedTrip: (id: string) =>
      request<void>(`/api/planner/trips/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    addTripMember: (tripId: string, body: AddTripMemberRequest) =>
      request<TripMember>(
        `/api/planner/trips/${encodeURIComponent(tripId)}/members`,
        { method: 'POST', body: JSON.stringify(body) },
      ),
    removeTripMember: (tripId: string, memberId: string) =>
      request<{ ok: boolean }>(
        `/api/planner/trips/${encodeURIComponent(tripId)}/members/${encodeURIComponent(memberId)}`,
        { method: 'DELETE' },
      ),
    scanPlannedTrip: (id: string) =>
      request<{
        proposals: TripProposal[]
        nombre_requetes: number
        saved?: number
        budget_max?: number
        empty_reason?: 'budget' | 'no_flights' | null
        cheapest_found?: number | null
      }>(`/api/planner/trips/${encodeURIComponent(id)}/scan`, {
        method: 'POST',
        timeoutMs: LONG_REQUEST_TIMEOUT_MS,
      }),
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

    requestPasswordReset: () =>
      request<{ ok: boolean; email_masked?: string }>('/api/auth/password-reset', {
        method: 'POST',
      }),

    changePassword: (body: { current_password: string; new_password: string }) =>
      request<{ ok: boolean; email_masked?: string; email_sent?: boolean }>(
        '/api/auth/change-password',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      ),

    notifyPasswordChanged: () =>
      request<{ ok: boolean; email_masked?: string }>(
        '/api/auth/password-changed-notify',
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

/** Convert destination list into Airport[] for CityPicker grouping. */
export function destinationsToAirports(destinations: Destination[]): Airport[] {
  return destinations
    .filter((d) => d?.code && String(d.code).length === 3)
    .map((d) => ({
      code: String(d.code).toUpperCase(),
      name: d.destinationFull || d.nom || d.code,
      city: d.nom || d.code,
      country: d.pays || 'Europe',
    }))
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
