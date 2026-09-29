import { createApiClient, createSupabaseAuth, createAsyncKVStore, type ApiClient } from '@flightwatcher/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import Constants from 'expo-constants'
import { AppState, Platform } from 'react-native'

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

/**
 * Same origin as the working web app (`window.location.origin`).
 * Google still callbacks to https://<project>.supabase.co/auth/v1/callback
 * then Supabase redirects here — identical to web signInWithGoogle.
 */
function resolveWebOrigin(): string {
  const fromEnv = env('EXPO_PUBLIC_WEB_URL')
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const host = metroHost()
  if (host) return `http://${host}:5173`
  if (Platform.OS === 'android') return 'http://10.0.2.2:5173'
  return 'http://localhost:5173'
}

const apiBase = resolveApiBase()
const webOrigin = resolveWebOrigin()

export const kv = createAsyncKVStore(AsyncStorage)

/** Deep link back into the native app after the web callback finishes. */
export const appDeepLink = 'flightwatcher://auth/callback'

/**
 * Same redirectTo as web: `{origin}/auth/callback`
 * + app_redirect so the web page can open the native app with tokens.
 *
 * Do NOT replace Supabase's Google callback
 * `https://….supabase.co/auth/v1/callback` — that stays configured in Google / Supabase.
 */
export const redirectTo = `${webOrigin}/auth/callback?app_redirect=${encodeURIComponent(appDeepLink)}`

function isAuthCallback(url: string): boolean {
  return (
    url.startsWith('flightwatcher://') ||
    url.includes('auth/callback') ||
    url.includes('access_token=') ||
    url.includes('refresh_token=')
  )
}

async function openOAuthAndWaitForDeepLink(authUrl: string): Promise<string | null> {
  let settled = false

  return new Promise((resolve) => {
    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      linkSub.remove()
      appSub.remove()
      clearTimeout(timer)
      void WebBrowser.coolDownAsync().catch(() => undefined)
      resolve(value)
    }

    const linkSub = Linking.addEventListener('url', ({ url }) => {
      if (__DEV__) console.log('[auth] deep link', url.slice(0, 180))
      if (isAuthCallback(url)) {
        void WebBrowser.dismissBrowser()
        finish(url)
      }
    })

    const appSub = AppState.addEventListener('change', () => {
      /* deep link handled by Linking */
    })

    const timer = setTimeout(() => {
      if (__DEV__) console.warn('[auth] timeout waiting for app deep link')
      finish(null)
    }, 180_000)

    void (async () => {
      try {
        if (__DEV__) {
          console.log('[auth] OAuth (same as web)', {
            supabaseGoogleCallback: '(project)/auth/v1/callback — unchanged',
            redirectTo,
            webOrigin,
          })
        }
        if (Platform.OS === 'android') await WebBrowser.warmUpAsync()
        void WebBrowser.openBrowserAsync(authUrl, {
          showInRecents: true,
          enableDefaultShareMenuItem: false,
          createTask: true,
        }).then((result) => {
          if (__DEV__) console.log('[auth] browser dismissed', result.type)
        })
      } catch (e) {
        if (__DEV__) console.warn('[auth] open browser failed', e)
        finish(null)
      }
    })()
  })
}

export const auth = createSupabaseAuth({
  apiBaseUrl: apiBase,
  redirectTo,
  openAuthSession: async (url) => openOAuthAndWaitForDeepLink(url),
  authOptions: {
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
    // Tokens arrive on the web /auth/callback in the hash (no PKCE verifier on device)
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

export { apiBase, webOrigin }
