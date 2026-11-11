import type {
  Airport,
  ApiConfig,
  AddTripMemberRequest,
  CreatePlannedTripFromFlightRequest,
  CreatePlannedTripFromMyTripRequest,
  CreatePlannedTripRequest,
  Destination,
  InspireRequest,
  InspireResponse,
  InspireStreamEvent,
  InvitePreview,
  LikedActivity,
  LikedDeal,
  LikedItinerary,
  PlannedTrip,
  PlannedTripDetail,
  ScanRequest,
  ScanResponse,
  SavedFavorite,
  SavedSearch,
  TravelDeal,
  DealsListParams,
  DealOccasionsResponse,
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
  HotelReviewsResponse,
  HotelUpsellJob,
  HotelUpsellLookupItem,
  HotelUpsellOption,
  HotelUpsellResult,
  TripProposal,
  TripMember,
  TripResponse,
  TravelWorkspace,
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
          } else if (
            parsed?.detail &&
            typeof parsed.detail === 'object' &&
            'message' in (parsed.detail as object)
          ) {
            message = String((parsed.detail as { message: unknown }).message)
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

    /**
     * Progressive inspire (NDJSON). Whichever provider finishes first paints;
     * others append as they arrive. Calls onEvent for each line.
     */
    inspireStream: async (
      body: InspireRequest,
      onEvent: (event: InspireStreamEvent) => void,
      opts?: { signal?: AbortSignal },
    ): Promise<void> => {
      const headers = new Headers({ 'Content-Type': 'application/json' })
      if (options.getToken) {
        const token = await options.getToken()
        if (token) headers.set('Authorization', `Bearer ${token}`)
      }
      const controller =
        typeof AbortController !== 'undefined' ? new AbortController() : null
      const timer =
        controller && LONG_REQUEST_TIMEOUT_MS > 0
          ? setTimeout(() => controller.abort(), LONG_REQUEST_TIMEOUT_MS)
          : undefined
      if (opts?.signal && controller) {
        if (opts.signal.aborted) controller.abort()
        else
          opts.signal.addEventListener('abort', () => controller.abort(), {
            once: true,
          })
      }
      try {
        const response = await fetchFn(joinUrl(baseUrl, '/api/inspire/stream'), {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller?.signal ?? opts?.signal,
        })
        if (!response.ok) {
          const raw = await response.text().catch(() => response.statusText)
          throw new Error(raw || response.statusText)
        }
        if (!response.body) {
          throw new Error('Stream inspire indisponible')
        }
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() || ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue
            try {
              onEvent(JSON.parse(trimmed) as InspireStreamEvent)
            } catch {
              /* skip bad line */
            }
          }
        }
        const tail = buf.trim()
        if (tail) {
          try {
            onEvent(JSON.parse(tail) as InspireStreamEvent)
          } catch {
            /* ignore */
          }
        }
      } catch (e) {
        const name = e instanceof Error ? e.name : ''
        const msg = e instanceof Error ? e.message : String(e)
        if (name === 'AbortError' || /timeout|timed out|aborted/i.test(msg)) {
          throw new Error(
            'La recherche a pris trop de temps. Vérifie que le backend tourne, ou réduis les dates.',
          )
        }
        throw e
      } finally {
        if (timer) clearTimeout(timer)
      }
    },

    getAirports: () =>
      request<{ airports: Airport[] } | Airport[]>('/api/airports', {
        // Cold backend / first enrich can exceed 10s; picker keeps seed until then.
        timeoutMs: 25_000,
      }),

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
      if (params?.destination) q.set('destination', params.destination)
      if (params?.adults != null) q.set('adults', String(params.adults))
      if (params?.window) q.set('window', params.window)
      if (params?.max_pp != null) q.set('max_pp', String(params.max_pp))
      if (params?.occasion) q.set('occasion', params.occasion)
      if (params?.duration) q.set('duration', params.duration)
      if (params?.limit != null) q.set('limit', String(params.limit))
      const qs = q.toString()
      return request<TravelDeal[]>(`/api/deals${qs ? `?${qs}` : ''}`)
    },
    getDeal: (id: string) =>
      request<TravelDeal>(`/api/deals/${encodeURIComponent(id)}`),

    getDealOccasions: (params?: {
      origin?: string
      destination?: string
      adults?: number
      duration?: string
    }) => {
      const q = new URLSearchParams()
      if (params?.origin) q.set('origin', params.origin)
      if (params?.destination) q.set('destination', params.destination)
      if (params?.adults != null) q.set('adults', String(params.adults))
      if (params?.duration) q.set('duration', params.duration)
      const qs = q.toString()
      return request<DealOccasionsResponse>(`/api/deals/occasions${qs ? `?${qs}` : ''}`)
    },

    signupOriginAlert: (body: {
      email: string
      origin_iata: string
      origin_label?: string
      locale?: string
    }) =>
      request<{
        ok: boolean
        email?: string
        origin_iata?: string
        origin_label?: string
        confirmation_sent?: boolean
        error?: string
      }>('/api/deals/origin-alerts', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    registerPushToken: (body: {
      token: string
      platform?: string
      locale?: string
      origin_iata?: string
    }) =>
      request<{ ok: boolean }>('/api/deals/push-tokens', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    getHotelGallery: (
      hotelId: string,
      opts?: { language?: string; fallback?: string; limit?: number },
    ) => {
      const q = new URLSearchParams()
      if (opts?.language) q.set('language', opts.language)
      if (opts?.fallback) q.set('fallback', opts.fallback)
      if (opts?.limit != null) q.set('limit', String(opts.limit))
      const qs = q.toString()
      return request<HotelGalleryResponse>(
        `/api/deals/hotels/${encodeURIComponent(hotelId)}/gallery${qs ? `?${qs}` : ''}`,
      )
    },

    getHotelReviews: (
      hotelId: string,
      opts?: { language?: string; limit?: number },
    ) => {
      const q = new URLSearchParams()
      if (opts?.language) q.set('language', opts.language)
      if (opts?.limit != null) q.set('limit', String(opts.limit))
      const qs = q.toString()
      return request<HotelReviewsResponse>(
        `/api/deals/hotels/${encodeURIComponent(hotelId)}/reviews${qs ? `?${qs}` : ''}`,
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

    /** Mon voyage guest checkout — bypasses community deal_key */
    revalidateMyTripHotel: (
      draftToken: string,
      body: DealRevalidateRequest = {},
    ) =>
      request<DealRevalidateResponse>(
        `/api/deals/my-trip/${encodeURIComponent(draftToken)}/revalidate-hotel`,
        {
          method: 'POST',
          body: JSON.stringify({ ...body, draft_token: draftToken }),
        },
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

    updateMyTripHotel: (
      draftToken: string,
      body: { hotel: Record<string, unknown> | null; price_per_person?: number | null },
    ) =>
      request<MyTripDraft>(
        `/api/deals/my-trip/${encodeURIComponent(draftToken)}/hotel`,
        { method: 'PATCH', body: JSON.stringify(body) },
      ),

    saveMyTripComposeOptions: (
      draftToken: string,
      body: {
        options: HotelUpsellOption[]
        night_cap?: number | null
        city?: string | null
      },
    ) =>
      request<MyTripDraft>(
        `/api/deals/my-trip/${encodeURIComponent(draftToken)}/compose-options`,
        { method: 'PATCH', body: JSON.stringify(body) },
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
    updateMyTripFlightBookingStatus: (
      draftToken: string,
      body: {
        status: 'redirected' | 'pending_partner' | 'user_confirmed' | 'cancelled'
        provider?: string | null
        reference?: string | null
      },
    ) =>
      request<MyTripDraft>(
        `/api/deals/my-trip/${encodeURIComponent(draftToken)}/flight-booking-status`,
        { method: 'POST', body: JSON.stringify(body) },
      ),

    markMyTripHotelBooked: (
      draftToken: string,
      body?: {
        booking_id?: string | null
        confirmation_code?: string | null
        holder_email?: string | null
        charged_price?: number | null
      },
    ) =>
      request<MyTripDraft>(
        `/api/deals/my-trip/${encodeURIComponent(draftToken)}/hotel-booked`,
        { method: 'POST', body: JSON.stringify(body || {}) },
      ),

    trackMyTripEvent: (
      draftToken: string,
      event: string,
      meta?: Record<string, unknown>,
    ) =>
      request<{ ok: boolean; error?: string }>(
        `/api/deals/my-trip/${encodeURIComponent(draftToken)}/event`,
        {
          method: 'POST',
          body: JSON.stringify({ event, meta: meta || {} }),
        },
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

    /** Soft live flight price refresh for Mon voyage drafts. */
    revalidateMyTripFlight: (draftToken: string) =>
      request<{
        ok: boolean
        revalidated?: boolean
        available?: boolean
        reason?: string
        displayed_pp?: number
        checked_pp?: number | null
        adults?: number
        booking_url?: string | null
        delta_pct?: number | null
        draft?: MyTripDraft
        error?: string
      }>(
        `/api/deals/my-trip/${encodeURIComponent(draftToken)}/revalidate-flight`,
        { method: 'POST', body: JSON.stringify({}) },
      ),

    listCityActivities: (citySlug: string, adults = 2) =>
      request<{
        ok: boolean
        items: Record<string, unknown>[]
        city_slug?: string
        cached?: boolean
        error?: string
      }>(
        `/api/activities/cities/${encodeURIComponent(citySlug)}?adults=${adults}`,
      ),

    nearbyActivities: (body: { lat: number; lng: number; adults?: number }) =>
      request<{
        ok: boolean
        items: Record<string, unknown>[]
        header?: string
        radius_km?: number
        count?: number
        fallback_hint?: string
        error?: string
      }>('/api/activities/nearby', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    getActivityProduct: (productCode: string) =>
      request<{ ok: boolean; product: Record<string, unknown>; cached?: boolean }>(
        `/api/activities/products/${encodeURIComponent(productCode)}`,
      ),

    trackActivityEvent: (body: Record<string, unknown>) =>
      request<{ ok: boolean }>('/api/activities/events', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    listTripItems: (opts: {
      draft_token?: string
      planned_trip_id?: string
    }) => {
      const q = new URLSearchParams()
      if (opts.draft_token) q.set('draft_token', opts.draft_token)
      if (opts.planned_trip_id) q.set('planned_trip_id', opts.planned_trip_id)
      return request<{ ok: boolean; items: Record<string, unknown>[] }>(
        `/api/activities/trip-items?${q.toString()}`,
      )
    },

    addTripItem: (body: Record<string, unknown>) =>
      request<{ ok: boolean; item: Record<string, unknown> }>(
        '/api/activities/trip-items',
        { method: 'POST', body: JSON.stringify(body) },
      ),

    patchTripItem: (itemId: string, body: Record<string, unknown>) =>
      request<{ ok: boolean; item: Record<string, unknown> }>(
        `/api/activities/trip-items/${encodeURIComponent(itemId)}`,
        { method: 'PATCH', body: JSON.stringify(body) },
      ),

    reorderTripItems: (
      items: Record<string, unknown>[],
      owner?: { draft_token?: string; planned_trip_id?: string },
    ) =>
      request<{ ok: boolean; updated: number }>(
        '/api/activities/trip-items/reorder',
        {
          method: 'POST',
          body: JSON.stringify({
            items,
            draft_token: owner?.draft_token,
            planned_trip_id: owner?.planned_trip_id,
          }),
        },
      ),

    transferTripItems: (body: {
      draft_token: string
      planned_trip_id: string
    }) =>
      request<{ ok: boolean; moved?: number }>(
        '/api/activities/trip-items/transfer',
        { method: 'POST', body: JSON.stringify(body) },
      ),

    createItinerary: (body: Record<string, unknown>) =>
      request<{ ok: boolean; itinerary?: Record<string, unknown>; error?: string }>(
        '/api/activities/itineraries',
        { method: 'POST', body: JSON.stringify(body) },
      ),

    applyItinerary: (itineraryId: string, body: Record<string, unknown>) =>
      request<{ ok: boolean; created?: number }>(
        `/api/activities/itineraries/${encodeURIComponent(itineraryId)}/apply`,
        { method: 'POST', body: JSON.stringify(body) },
      ),

    getItinerary: (itineraryId: string) =>
      request<{ ok: boolean; itinerary: Record<string, unknown> }>(
        `/api/activities/itineraries/${encodeURIComponent(itineraryId)}`,
      ),

    /** Public catalogue — published admin parcours */
    listParcours: (params?: {
      city?: string
      occasion?: string
      featured?: boolean
      include_demo?: boolean
      limit?: number
    }) => {
      const q = new URLSearchParams()
      if (params?.city) q.set('city', params.city)
      if (params?.occasion) q.set('occasion', params.occasion)
      if (params?.featured) q.set('featured', 'true')
      if (params?.include_demo != null)
        q.set('include_demo', params.include_demo ? 'true' : 'false')
      if (params?.limit != null) q.set('limit', String(params.limit))
      const qs = q.toString()
      return request<{ ok: boolean; itineraries: Record<string, unknown>[] }>(
        `/api/parcours${qs ? `?${qs}` : ''}`,
      )
    },

    getParcours: (idOrSlug: string, opts?: { include_demo?: boolean }) => {
      const q = new URLSearchParams()
      if (opts?.include_demo != null)
        q.set('include_demo', opts.include_demo ? 'true' : 'false')
      const qs = q.toString()
      const looksLikeUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          idOrSlug,
        )
      const path = looksLikeUuid
        ? `/api/parcours/${encodeURIComponent(idOrSlug)}`
        : `/api/parcours/by-slug/${encodeURIComponent(idOrSlug)}`
      return request<{ ok: boolean; itinerary: Record<string, unknown> }>(
        `${path}${qs ? `?${qs}` : ''}`,
      )
    },

    /** Admin catalogue éditorial */
    adminListParcours: (params?: {
      city?: string
      status?: string
      occasion?: string
      limit?: number
    }) => {
      const q = new URLSearchParams()
      if (params?.city) q.set('city', params.city)
      if (params?.status) q.set('status', params.status)
      if (params?.occasion) q.set('occasion', params.occasion)
      if (params?.limit != null) q.set('limit', String(params.limit))
      const qs = q.toString()
      return request<{
        ok: boolean
        itineraries: Record<string, unknown>[]
        error?: string
      }>(`/api/admin/parcours${qs ? `?${qs}` : ''}`)
    },

    adminGetParcours: (id: string) =>
      request<{
        ok: boolean
        itinerary: Record<string, unknown>
        blockers?: { code: string; message: string }[]
        warnings?: { code: string; message: string }[]
        error?: string
      }>(`/api/admin/parcours/${encodeURIComponent(id)}`),

    adminCreateParcours: (body?: {
      title?: string
      city_slug?: string
      cover_image?: string
    }) =>
      request<{ ok: boolean; itinerary: Record<string, unknown>; error?: string }>(
        '/api/admin/parcours',
        { method: 'POST', body: JSON.stringify(body || {}) },
      ),

    adminUpdateParcours: (id: string, body: Record<string, unknown>) =>
      request<{
        ok: boolean
        itinerary?: Record<string, unknown>
        blockers?: { code: string; message: string }[]
        warnings?: { code: string; message: string }[]
        error?: string
      }>(`/api/admin/parcours/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),

    adminPublishParcours: (id: string) =>
      request<{
        ok: boolean
        itinerary?: Record<string, unknown>
        blockers?: { code: string; message: string }[]
        warnings?: { code: string; message: string }[]
        error?: string
      }>(`/api/admin/parcours/${encodeURIComponent(id)}/publish`, {
        method: 'POST',
        body: '{}',
      }),

    adminSetParcoursStatus: (id: string, status: string) =>
      request<{
        ok: boolean
        itinerary?: Record<string, unknown>
        blockers?: { code: string; message: string }[]
        error?: string
      }>(`/api/admin/parcours/${encodeURIComponent(id)}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      }),

    adminDeleteParcours: (id: string) =>
      request<{ ok: boolean; error?: string }>(
        `/api/admin/parcours/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      ),

    listLikedItineraryIds: () =>
      request<{ ok: boolean; ids: string[] }>('/api/liked-itineraries/ids'),

    listLikedItineraries: () =>
      request<{ ok: boolean; items: LikedItinerary[] }>(
        '/api/liked-itineraries',
      ),

    likeItinerary: (body: {
      itinerary_id: string
      itinerary_data?: Record<string, unknown>
    }) =>
      request<{ ok: boolean; item?: LikedItinerary }>(
        '/api/liked-itineraries',
        { method: 'POST', body: JSON.stringify(body) },
      ),

    unlikeItinerary: (itineraryId: string) =>
      request<{ ok: boolean }>(
        `/api/liked-itineraries/${encodeURIComponent(itineraryId)}`,
        { method: 'DELETE' },
      ),

    importRestaurantLinks: (body: {
      text: string
      draft_token?: string
      planned_trip_id?: string
      city_slug?: string
    }) =>
      request<{
        ok: boolean
        results: Record<string, unknown>[]
        counts: Record<string, number>
        suggested_city?: string | null
      }>('/api/restaurants/import-links', {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    confirmRestaurantPlace: (body: Record<string, unknown>) =>
      request<{ ok: boolean; item?: Record<string, unknown>; user_place?: unknown }>(
        '/api/restaurants/confirm',
        { method: 'POST', body: JSON.stringify(body) },
      ),

    listUserAddresses: (opts?: { city_slug?: string; draft_token?: string }) => {
      const q = new URLSearchParams()
      if (opts?.city_slug) q.set('city_slug', opts.city_slug)
      if (opts?.draft_token) q.set('draft_token', opts.draft_token)
      const qs = q.toString()
      return request<{ ok: boolean; items: Record<string, unknown>[] }>(
        `/api/restaurants/addresses${qs ? `?${qs}` : ''}`,
      )
    },

    patchUserAddress: (id: string, body: Record<string, unknown>) =>
      request<{ ok: boolean; item?: Record<string, unknown> }>(
        `/api/restaurants/addresses/${encodeURIComponent(id)}`,
        { method: 'PATCH', body: JSON.stringify(body) },
      ),

    reportPlace: (body: { place_id: string; reason?: string; note?: string }) =>
      request<{ ok: boolean }>('/api/restaurants/report', {
        method: 'POST',
        body: JSON.stringify(body),
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

    cancelHotelBooking: (
      bookingId: string,
      body?: { draft_token?: string | null },
    ) =>
      request<
        HotelBooking & {
          already_cancelled?: boolean
          refund_amount?: number | null
          cancellation_fee?: number | null
          draft?: MyTripDraft
        }
      >(`/api/hotel-bookings/${encodeURIComponent(bookingId)}/cancel`, {
        method: 'POST',
        body: JSON.stringify(body || {}),
      }),

    listHotelBookings: (opts?: { draft_token?: string | null }) => {
      const q =
        opts?.draft_token != null && opts.draft_token !== ''
          ? `?draft_token=${encodeURIComponent(opts.draft_token)}`
          : ''
      return request<HotelBooking[]>(`/api/hotel-bookings${q}`)
    },

    getHotelBooking: (
      id: string,
      opts?: { draft_token?: string | null; sync?: boolean },
    ) => {
      const params = new URLSearchParams()
      if (opts?.draft_token != null && opts.draft_token !== '') {
        params.set('draft_token', opts.draft_token)
      }
      if (opts?.sync) params.set('sync', 'true')
      const q = params.toString() ? `?${params}` : ''
      return request<HotelBooking>(
        `/api/hotel-bookings/${encodeURIComponent(id)}${q}`,
      )
    },

    /**
     * Download LiteAPI guest invoice PDF (paid / reserved).
     * Prefer this over opening a raw URL so Authorization is applied.
     */
    downloadHotelBookingInvoice: async (
      id: string,
      opts?: { draft_token?: string | null },
    ): Promise<Blob> => {
      const params = new URLSearchParams()
      if (opts?.draft_token) params.set('draft_token', opts.draft_token)
      const q = params.toString() ? `?${params}` : ''
      const path = `/api/hotel-bookings/${encodeURIComponent(id)}/invoice${q}`
      const headers = new Headers()
      if (options.getToken) {
        const token = await options.getToken()
        if (token) headers.set('Authorization', `Bearer ${token}`)
      }
      const response = await fetchFn(joinUrl(baseUrl, path), { headers })
      if (!response.ok) {
        const raw = await response.text().catch(() => response.statusText)
        let message = raw || response.statusText
        try {
          const parsed = JSON.parse(raw) as { detail?: unknown }
          if (typeof parsed?.detail === 'string') message = parsed.detail
        } catch {
          /* keep raw */
        }
        throw new Error(message || 'Facture indisponible')
      }
      return response.blob()
    },

    /** Build invoice URL for in-browser / WebBrowser open (token in query). */
    hotelBookingInvoiceUrl: async (
      id: string,
      opts?: { draft_token?: string | null },
    ): Promise<string> => {
      const params = new URLSearchParams()
      if (opts?.draft_token) params.set('draft_token', opts.draft_token)
      if (options.getToken) {
        const token = await options.getToken()
        if (token) params.set('access_token', token)
      }
      const q = params.toString() ? `?${params}` : ''
      return joinUrl(
        baseUrl,
        `/api/hotel-bookings/${encodeURIComponent(id)}/invoice${q}`,
      )
    },

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

    getLikedActivities: () =>
      request<LikedActivity[]>('/api/liked-activities'),
    getLikedActivityIds: () =>
      request<string[]>('/api/liked-activities/ids'),
    likeActivity: (activity: {
      productCode: string
      title: string
      photoUrl?: string | null
      rating?: number | null
      reviewCount?: number | null
      durationLabel?: string | null
      priceLabel?: string | null
      productUrl?: string | null
      freeCancellation?: boolean
      instantConfirmation?: boolean
      destinationLabel?: string | null
      distanceLabel?: string | null
    }) =>
      request<LikedActivity>('/api/liked-activities', {
        method: 'POST',
        body: JSON.stringify(activity),
      }),
    unlikeActivity: (productCode: string) =>
      request<{ success: boolean }>(
        `/api/liked-activities/${encodeURIComponent(productCode)}`,
        { method: 'DELETE' },
      ),

    listPlannedTrips: () => request<PlannedTrip[]>('/api/planner/trips'),
    listTravelWorkspaces: () =>
      request<TravelWorkspace[]>('/api/travel-workspaces'),
    createPlannedTrip: (body: CreatePlannedTripRequest) =>
      request<PlannedTrip>('/api/planner/trips', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    createPlannedTripFromFlight: (body: CreatePlannedTripFromFlightRequest) =>
      request<PlannedTripDetail>('/api/planner/trips/from-flight', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    createPlannedTripFromMyTrip: (body: CreatePlannedTripFromMyTripRequest) =>
      request<PlannedTripDetail>('/api/planner/trips/from-my-trip', {
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
    completePlannedTrip: (id: string) =>
      request<PlannedTrip>(
        `/api/planner/trips/${encodeURIComponent(id)}/complete`,
        { method: 'POST' },
      ),
    deletePlannedTrip: (id: string) =>
      request<{ ok: boolean; archived?: boolean; reservations_preserved?: boolean }>(
        `/api/planner/trips/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        },
      ),
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
    reopenPlannedTripFlight: (id: string) =>
      request<{ ok: boolean; trip: PlannedTrip }>(
        `/api/planner/trips/${encodeURIComponent(id)}/reopen-flight`,
        { method: 'POST' },
      ),
    skipPlannedTripFlight: (id: string) =>
      request<MyTripDraft & { flight_external?: boolean; reused?: boolean }>(
        `/api/planner/trips/${encodeURIComponent(id)}/skip-flight`,
        { method: 'POST' },
      ),
    skipPlannedTripHotel: (id: string) =>
      request<MyTripDraft & { hotel_external?: boolean; reused?: boolean }>(
        `/api/planner/trips/${encodeURIComponent(id)}/skip-hotel`,
        { method: 'POST' },
      ),
    acceptProposal: (id: string) =>
      request<TripProposal>(`/api/planner/proposals/${encodeURIComponent(id)}/accept`, {
        method: 'POST',
      }),
    getOrCreateExecutionDraft: (proposalId: string) =>
      request<MyTripDraft>(
        `/api/planner/proposals/${encodeURIComponent(proposalId)}/execution-draft`,
        { method: 'POST' },
      ),
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

    deleteAccount: (body?: { confirm?: string }) =>
      request<{ ok: boolean; deleted?: boolean }>('/api/user/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: body?.confirm || 'SUPPRIMER' }),
      }),

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
    // Drop aerodromes / airfields from Search & planner pickers.
    const blob = `${a?.name || ''} ${a?.city || ''}`
    if (/\b(a[ée]rodrome|aerodrome|airfield|heliport|ulm|seaplane|hydravion)\b/i.test(blob)) {
      continue
    }
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
    .map((d) => {
      const code = String(d.code).toUpperCase()
      const full = d.destinationFull || d.nom || ''
      // Prefer resolved city name — avoid city === "CDG".
      let city = (d.nom || '').trim()
      if (!city || /^[A-Za-z]{3}$/.test(city)) {
        const beforeComma = full.split(',')[0]?.trim() || ''
        city =
          beforeComma && !/^[A-Za-z]{3}$/.test(beforeComma) ? beforeComma : code
      }
      return {
        code,
        name: full || city || code,
        city,
        country: d.pays || 'Europe',
      }
    })
    .filter((a) => {
      const blob = `${a.name} ${a.city}`
      return !/\b(a[ée]rodrome|aerodrome|airfield|heliport|ulm|seaplane|hydravion)\b/i.test(
        blob,
      )
    })
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
