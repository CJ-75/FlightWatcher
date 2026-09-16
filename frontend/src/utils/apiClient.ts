import { createApiClient, normalizeAirports, normalizeDestinations, type ApiClient } from '@flightwatcher/shared'
import { getApiBaseUrl } from './apiBase'
import { getAccessToken } from '../lib/supabase'

export { normalizeAirports, normalizeDestinations }

let client: ApiClient | null = null

export function getApiClient(): ApiClient {
  if (!client) {
    client = createApiClient({
      baseUrl: getApiBaseUrl(),
      getToken: getAccessToken,
    })
  }
  return client
}
