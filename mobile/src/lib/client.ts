import { createApiClient, createSupabaseAuth, createAsyncKVStore, type ApiClient } from '@flightwatcher/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

WebBrowser.maybeCompleteAuthSession()

function env(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    name
  ]?.trim()
}

function metroHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    (Constants as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost
  if (!hostUri) return null
  const host = String(hostUri).split(':')[0]
  if (!host || host === 'localhost' || host === '127.0.0.1') return null
  return host
}

function resolveApiBase(): string {
  const fromEnv = env('EXPO_PUBLIC_API_URL')
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const host = metroHost()
  if (host) return `http://${host}:8000`
  if (Platform.OS === 'android') return 'http://10.0.2.2:8000'
  return 'http://localhost:8000'
}

const apiBase = resolveApiBase()

export const kv = createAsyncKVStore(AsyncStorage)

/**
 * Final OAuth redirect = deep link into Expo Go / the app.
 * Avoids Supabase Site URL fallback (localhost:5173) which the phone cannot use.
 *
 * Allow-list in Supabase Redirect URLs (see backend/MOBILE_AUTH.md):
 *   exp://192.168.1.161:8083/--/auth/callback
 *   flightwatcher://auth/callback
 *   and the exp:// wildcard form documented in MOBILE_AUTH.md
 */
export const redirectTo =
  Constants.appOwnership === 'expo'
    ? Linking.createURL('auth/callback')
    : 'flightwatcher://auth/callback'

export const appDeepLink = redirectTo

function isAuthCallback(url: string): boolean {
  return (
    url.includes('auth/callback') ||
    url.includes('access_token=') ||
    url.includes('refresh_token=') ||
    url.includes('code=') ||
    url.startsWith('flightwatcher://') ||
    url.startsWith('exp://')
  )
}

/**
 * Open Google; return when the deep link comes back with tokens/code.
 * No dismissBrowser before open (locks iOS). No http://localhost hop.
 */
async function openOAuthSession(authUrl: string): Promise<string | null> {
  if (__DEV__) {
    console.log('[auth] redirectTo (must be allow-listed)', redirectTo)
    console.log('[auth] open url', authUrl.slice(0, 200))
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = (url: string | null) => {
      if (settled) return
      settled = true
      linkSub.remove()
      clearTimeout(timer)
      resolve(url)
    }

    const linkSub = Linking.addEventListener('url', ({ url }) => {
      if (__DEV__) console.log('[auth] deep link', url.slice(0, 200))
      if (isAuthCallback(url)) finish(url)
    })

    const timer = setTimeout(() => {
      if (__DEV__) console.warn('[auth] timeout waiting for deep link')
      finish(null)
    }, 180_000)

    void (async () => {
      try {
        const session = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo, {
          showInRecents: true,
          preferEphemeralSession: false,
        })
        if (__DEV__) console.log('[auth] auth session', session.type)

        if (session.type === 'success' && session.url) {
          finish(session.url)
          return
        }

        if (settled) return

        // cancel without URL → still try system Safari (same authorize URL)
        if (__DEV__) console.log('[auth] auth session ended → system Safari')
        await Linking.openURL(authUrl)
      } catch (e) {
        if (__DEV__) console.warn('[auth] open failed → Safari', e)
        try {
          await Linking.openURL(authUrl)
        } catch (e2) {
          if (__DEV__) console.warn('[auth] Linking.openURL failed', e2)
          finish(null)
        }
      }
    })()
  })
}

export const auth = createSupabaseAuth({
  apiBaseUrl: apiBase,
  redirectTo,
  openAuthSession: async (url) => openOAuthSession(url),
  authOptions: {
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
    // Tokens in deep-link hash (no PKCE/WebCrypto on device)
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
