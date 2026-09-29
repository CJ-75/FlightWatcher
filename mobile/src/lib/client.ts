import { createApiClient, createSupabaseAuth, createAsyncKVStore, type ApiClient } from '@flightwatcher/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

WebBrowser.maybeCompleteAuthSession()

/**
 * Resolve backend URL for Expo Go / device.
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
 * OAuth redirect:
 * - Expo Go → HTTP callback on the LAN API (intercepted by openAuthSessionAsync).
 *   Custom schemes (exp:// / flightwatcher://) reliably return `cancel` on iOS Expo Go.
 * - Standalone / dev client → custom scheme.
 *
 * Allow-list in Supabase Redirect URLs:
 *   http://<LAN-IP>:8000/auth/mobile-callback
 *   flightwatcher://auth/callback
 */
export const redirectTo =
  Constants.appOwnership === 'expo'
    ? `${apiBase}/auth/mobile-callback`
    : 'flightwatcher://auth/callback'

function isAuthCallback(url: string): boolean {
  return (
    url.includes('auth/mobile-callback') ||
    url.includes('auth/callback') ||
    url.includes('access_token=') ||
    url.includes('refresh_token=') ||
    /[?#&]code=/.test(url)
  )
}

async function openOAuthSession(authUrl: string, redirectUri: string): Promise<string | null> {
  let settled = false

  return new Promise((resolve) => {
    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      sub.remove()
      resolve(value)
    }

    const sub = Linking.addEventListener('url', ({ url }) => {
      if (__DEV__) console.log('[auth] linking event', url)
      if (isAuthCallback(url)) finish(url)
    })

    void (async () => {
      try {
        if (__DEV__) {
          console.log('[auth] openAuthSession', {
            redirectUri,
            authUrl: authUrl.slice(0, 96),
          })
        }
        const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri, {
          showInRecents: true,
          preferEphemeralSession: false,
          createTask: false,
        })
        if (__DEV__) {
          console.log(
            '[auth] authSession result',
            result.type,
            result.type === 'success' ? String(result.url).slice(0, 160) : '',
          )
        }
        if (result.type === 'success' && result.url) {
          finish(result.url)
          return
        }
        setTimeout(() => finish(null), 800)
      } catch (e) {
        if (__DEV__) console.warn('[auth] authSession error', e)
        finish(null)
      }
    })()
  })
}

export const auth = createSupabaseAuth({
  apiBaseUrl: apiBase,
  redirectTo,
  openAuthSession: (url, redirectUri) => openOAuthSession(url, redirectUri || redirectTo),
  authOptions: {
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
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
