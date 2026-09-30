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

const apiBase = resolveApiBase()

export const kv = createAsyncKVStore(AsyncStorage)

const LAN_IP_IN_URL = /exp:\/\/\d{1,3}(?:\.\d{1,3}){3}/

/**
 * Redirect strategy:
 *
 * - Dev client / standalone: flightwatcher:// (in Supabase — works with a native build)
 * - Expo Go: must use exp://… BUT Supabase rejects LAN IPs in redirect URLs
 *   (https://github.com/supabase/auth/issues/2039). So Expo Go needs:
 *     npx expo start --tunnel
 *   Then Linking.createURL has no 192.168.x.x and Supabase accepts exp://**.
 *
 * flightwatcher:// existing in Supabase is correct — Expo Go simply cannot
 * receive custom schemes (official Expo limitation).
 */
function resolveRedirectTo(): { redirectTo: string; warning: string | null } {
  if (Constants.appOwnership !== 'expo') {
    return { redirectTo: 'flightwatcher://auth/callback', warning: null }
  }

  const expoUrl = Linking.createURL('auth/callback')
  if (LAN_IP_IN_URL.test(expoUrl)) {
    return {
      redirectTo: expoUrl,
      warning:
        'Expo Go + Wi‑Fi LAN: Supabase blocks exp://192.168… redirects (even if allow-listed). ' +
        'flightwatcher:// is in Supabase but Expo Go cannot open custom schemes. ' +
        'Fix: stop Metro and run  npm run start:tunnel  then rescan QR.',
    }
  }

  return { redirectTo: expoUrl, warning: null }
}

const resolved = resolveRedirectTo()
export const redirectTo = resolved.redirectTo
export const appDeepLink = redirectTo
export const authRedirectWarning = resolved.warning

function authLog(...args: unknown[]) {
  if (__DEV__) console.log('[auth]', ...args)
}

function authWarn(...args: unknown[]) {
  if (__DEV__) console.warn('[auth]', ...args)
}

function describeAuthorizeUrl(authUrl: string) {
  try {
    const u = new URL(authUrl)
    const redirect = u.searchParams.get('redirect_to')
    return {
      redirect_to: redirect,
      has_code_challenge: u.searchParams.has('code_challenge'),
      matches_app_redirect: redirect === redirectTo,
      has_lan_ip: !!redirect && LAN_IP_IN_URL.test(redirect),
      looksLikeLocalhost: !!redirect?.includes('localhost'),
    }
  } catch {
    return { raw: authUrl.slice(0, 160) }
  }
}

function describeCallbackUrl(url: string) {
  const fragment = url.includes('#') ? url.split('#')[1] || '' : ''
  const query = url.includes('?') ? (url.split('?')[1] || '').split('#')[0] : ''
  const fp = new URLSearchParams(fragment)
  const qp = new URLSearchParams(query)
  return {
    scheme: url.split(':')[0],
    preview: url.slice(0, 160),
    has_access_token: fp.has('access_token') || qp.has('access_token'),
    has_refresh_token: fp.has('refresh_token') || qp.has('refresh_token'),
    has_code: fp.has('code') || qp.has('code'),
    error: fp.get('error') || qp.get('error'),
  }
}

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

async function openOAuthSession(authUrl: string): Promise<string | null> {
  authLog('—— openOAuthSession ——')
  authLog('appOwnership=', Constants.appOwnership)
  authLog('redirectTo=', redirectTo)
  if (authRedirectWarning) {
    authWarn('CONFIG', authRedirectWarning)
  }
  authLog('authorize=', describeAuthorizeUrl(authUrl))

  return new Promise((resolve) => {
    let settled = false
    const t0 = Date.now()

    const cleanup = () => {
      linkSub.remove()
      appSub.remove()
      clearTimeout(hardTimer)
      clearInterval(heartbeat)
    }

    const finish = (url: string | null, reason: string) => {
      if (settled) return
      settled = true
      cleanup()
      authLog('finish', reason, 'ms=', Date.now() - t0, url ? describeCallbackUrl(url) : null)
      resolve(url)
    }

    const onUrl = (url: string | null, source: string) => {
      if (!url || settled) return
      authLog('url candidate', source, describeCallbackUrl(url))
      if (isAuthCallback(url)) finish(url, source)
    }

    const linkSub = Linking.addEventListener('url', ({ url }) => onUrl(url, 'linking'))
    const appSub = AppState.addEventListener('change', (state) => {
      authLog('AppState', state, 'ms=', Date.now() - t0)
      if (state === 'active' && !settled) {
        void Linking.getInitialURL().then((u) => onUrl(u, 'resume-initial'))
      }
    })

    const heartbeat = setInterval(() => {
      if (settled) return
      authWarn('waiting return…', Math.round((Date.now() - t0) / 1000) + 's')
    }, 4000)

    const hardTimer = setTimeout(() => finish(null, 'timeout-90s'), 90_000)

    authLog('openAuthSessionAsync NOW')
    void WebBrowser.openAuthSessionAsync(authUrl, redirectTo, {
      showInRecents: true,
      preferEphemeralSession: false,
    })
      .then((session) => {
        authLog('authSession result', session.type, 'ms=', Date.now() - t0)
        if (session.type === 'success' && session.url) {
          onUrl(session.url, 'auth-session')
          return
        }
        if (!settled) {
          authWarn('authSession ended without URL:', session.type)
          setTimeout(() => {
            if (!settled) finish(null, `auth-session-${session.type}`)
          }, 1500)
        }
      })
      .catch((e) => {
        authWarn('authSession error', e)
        if (!settled) finish(null, 'auth-session-error')
      })
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
    flowType: 'implicit',
    storage: AsyncStorage,
  },
})

let api: ApiClient | null = null

export function getApi(): ApiClient {
  if (!api) {
    authLog('getApi baseUrl=', apiBase)
    api = createApiClient({
      baseUrl: apiBase,
      getToken: () => auth.getAccessToken(),
    })
  }
  return api
}

export { apiBase }
