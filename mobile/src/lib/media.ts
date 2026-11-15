import {
  createMediaStorage,
  parseMediaProviderId,
  type MediaStorage,
} from '@waypop/shared'
import Constants from 'expo-constants'
import { apiBase, auth } from './client'

function env(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env
  const fromProcess = proc?.[name]?.trim()
  if (fromProcess) return fromProcess
  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined
  return extra?.[name]?.trim()
}

let cached: MediaStorage | null = null

/**
 * Default: API upload → Supabase Storage (switch via EXPO_PUBLIC_MEDIA_PROVIDER).
 * `supabase` = direct client Storage (needs logged-in user + RLS).
 */
export function getMediaStorage(): MediaStorage {
  if (cached) return cached

  const provider = parseMediaProviderId(
    env('EXPO_PUBLIC_MEDIA_PROVIDER'),
    'api',
  )

  const expoDev =
    Constants.appOwnership === 'expo' ||
    (typeof __DEV__ !== 'undefined' && __DEV__)

  cached = createMediaStorage({
    provider,
    api: {
      baseUrl: apiBase,
      getToken: () => auth.getAccessToken(),
      credentials: 'omit',
      fetchImpl: (input, init) => {
        const headers = new Headers(init?.headers)
        if (!headers.has('X-FW-Client')) {
          headers.set('X-FW-Client', expoDev ? 'expo' : 'mobile')
        }
        // Native fetch handles RN FormData { uri, name, type } reliably
        return fetch(input, { ...init, headers })
      },
    },
    supabase: {
      getClient: () => auth.getClient(),
      getUserId: async () => (await auth.getCurrentUser())?.id ?? null,
    },
  })
  return cached
}
