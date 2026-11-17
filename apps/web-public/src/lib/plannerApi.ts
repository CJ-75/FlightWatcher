'use client'

import { createApiClient, type ApiClient } from '@waypop/shared'
import { auth } from '@/lib/auth'

function apiBase(): string {
  return (
    process.env.NEXT_PUBLIC_WAYPOP_API_URL ||
    process.env.WAYPOP_API_URL ||
    'https://api.waypop.co'
  ).replace(/\/$/, '')
}

let client: ApiClient | null = null

export function getPlannerApi(): ApiClient {
  if (!client) {
    client = createApiClient({
      baseUrl: apiBase(),
      getToken: () => auth.getAccessToken(),
    })
  }
  return client
}

/** App planner detail after create (same origin when proxied). */
export function plannerTripHref(tripId: string): string {
  return `/planner/${encodeURIComponent(tripId)}`
}
