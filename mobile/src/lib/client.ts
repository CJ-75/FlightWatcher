import { createApiClient, createSupabaseAuth, createAsyncKVStore, type ApiClient } from '@flightwatcher/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as WebBrowser from 'expo-web-browser'
import { makeRedirectUri } from 'expo-auth-session'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

WebBrowser.maybeCompleteAuthSession()

/**
 * Resolve backend URL for Expo Go / device.
 * - Prefer EXPO_PUBLIC_API_URL
 * - Else use the same LAN host as the Metro bundler (phone cannot reach "localhost")
 * - Android emulator: 10.0.2.2 maps to host machine
 */
function resolveApiBase(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  const fromEnv = env?.EXPO_PUBLIC_API_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')

  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    (Constants as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost

  if (hostUri) {
    const host = String(hostUri).split(':')[0]
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:8000`
    }
  }

  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000'
  }

  return 'http://localhost:8000'
}

const apiBase = resolveApiBase()

export const kv = createAsyncKVStore(AsyncStorage)

/** Deep link used as Supabase OAuth redirect (must be allow-listed). */
export const redirectTo = makeRedirectUri({
  scheme: 'flightwatcher',
  path: 'auth/callback',
})

export const auth = createSupabaseAuth({
  apiBaseUrl: apiBase,
  redirectTo,
  openAuthSession: async (url, redirectUri) => {
    const result = await WebBrowser.openAuthSessionAsync(url, redirectUri, {
      showInRecents: true,
      preferEphemeralSession: false,
    })
    if (result.type === 'success' && result.url) return result.url
    return null
  },
  authOptions: {
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
    flowType: 'pkce',
    storage: AsyncStorage,
  },
})

let api: ApiClient | null = null

export function getApi(): ApiClient {
  if (!api) {
    api = createApiClient({
      baseUrl: apiBase,
      getToken: () => auth.getAccessToken(),
    })
  }
  return api
}

export { apiBase }
