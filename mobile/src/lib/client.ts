import { createApiClient, createSupabaseAuth, createAsyncKVStore, type ApiClient } from '@flightwatcher/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as WebBrowser from 'expo-web-browser'
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

/**
 * Always use the custom scheme — never exp://IP:port.
 * On a physical iPhone, Safari treats exp://… as an unreachable “server”
 * and shows “Safari ne peut pas ouvrir la page”.
 * Must be allow-listed in Supabase Auth → Redirect URLs.
 */
export const redirectTo = 'flightwatcher://auth/callback'

export const auth = createSupabaseAuth({
  apiBaseUrl: apiBase,
  redirectTo,
  openAuthSession: async (url, redirectUri) => {
    const result = await WebBrowser.openAuthSessionAsync(url, redirectUri, {
      showInRecents: true,
      // Keep cookies so Google account picker works; ephemeral can break redirects on iOS
      preferEphemeralSession: false,
      createTask: false,
    })
    if (__DEV__) {
      console.log('[auth] openAuthSession result', result.type, 'url' in result ? result.url : '')
    }
    if (result.type === 'success' && result.url) return result.url
    return null
  },
  authOptions: {
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
    // Implicit avoids PKCE/WebCrypto (unsupported in RN → “plain” challenge breaks OAuth)
    flowType: 'implicit',
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
