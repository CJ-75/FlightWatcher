import { createApiClient, createSupabaseAuth, createAsyncKVStore, type ApiClient } from '@flightwatcher/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Linking from 'expo-linking'
import * as WebBrowser from 'expo-web-browser'
import Constants from 'expo-constants'
import { AppState, Platform } from 'react-native'

WebBrowser.maybeCompleteAuthSession()

function env(name: string): string | undefined {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env
  const fromProcess = proc?.[name]?.trim()
  if (fromProcess) return fromProcess
  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined
  return extra?.[name]?.trim() || extra?.[name.replace(/^EXPO_PUBLIC_/, '')]?.trim()
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
 * OAuth redirectTo
 *
 * Production / dev client (`npx expo run:ios`, EAS): flightwatcher://auth/callback
 *   — already in Supabase Redirect URLs. This is the path that works.
 *
 * Expo Go: custom schemes are not delivered; exp:// with LAN IP is rejected by
 *   Supabase (auth#2039). Optional EXPO_PUBLIC_AUTH_CALLBACK_ORIGIN (HTTPS bridge)
 *   is best-effort only — expect to validate Google login on a real build.
 */
function resolveRedirectTo(): { redirectTo: string; warning: string | null } {
  const nativeDeepLink = 'flightwatcher://auth/callback'

  // Standalone / dev client — production path
  if (Constants.appOwnership !== 'expo') {
    return { redirectTo: nativeDeepLink, warning: null }
  }

  // Expo Go — optional HTTPS bridge (Cloudflare). Not reliable for sign-off.
  // Recompute every call: Expo LAN / tunnel host can change without Metro restart.
  const publicOrigin = env('EXPO_PUBLIC_AUTH_CALLBACK_ORIGIN')?.replace(/\/$/, '')
  const expoLink = Linking.createURL('auth/callback')
  if (publicOrigin) {
    return {
      redirectTo: `${publicOrigin}/auth/mobile-callback?app_redirect=${encodeURIComponent(expoLink)}`,
      warning:
        'Expo Go + OAuth is unreliable. Prefer a dev/production build with flightwatcher://',
    }
  }

  return {
    redirectTo: expoLink,
    warning:
      'Google login needs a native build (flightwatcher://). Expo Go cannot complete Supabase OAuth reliably.',
  }
}

/** Fresh each call — do not cache across Expo tunnel / LAN host changes. */
export function getRedirectTo(): string {
  return resolveRedirectTo().redirectTo
}

export function getAppDeepLink(): string {
  if (Constants.appOwnership !== 'expo') return 'flightwatcher://auth/callback'
  return Linking.createURL('auth/callback')
}

/** @deprecated Prefer getRedirectTo() — kept for boot logs / AuthContext. */
export const redirectTo = getRedirectTo()
export const appDeepLink = getAppDeepLink()
export const authRedirectWarning = resolveRedirectTo().warning

if (__DEV__) {
  console.log('[auth] boot env', {
    EXPO_PUBLIC_API_URL: env('EXPO_PUBLIC_API_URL') ?? null,
    EXPO_PUBLIC_AUTH_CALLBACK_ORIGIN: env('EXPO_PUBLIC_AUTH_CALLBACK_ORIGIN') ?? null,
    EXPO_PUBLIC_WEB_ORIGIN: env('EXPO_PUBLIC_WEB_ORIGIN') ?? null,
    redirectTo: getRedirectTo(),
    appOwnership: Constants.appOwnership,
  })
  if (Constants.appOwnership === 'expo' && !env('EXPO_PUBLIC_AUTH_CALLBACK_ORIGIN')) {
    console.warn(
      '[auth] Expo Go: set EXPO_PUBLIC_AUTH_CALLBACK_ORIGIN to your live cloudflared URL (→ :8000)',
    )
  }
}

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
      matches_app_redirect: redirect === getRedirectTo(),
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
  // Do NOT match bare exp://192.168.x.x (Metro URL) — that aborted OAuth early
  return (
    url.includes('/auth/callback') ||
    url.includes('auth/callback') ||
    url.includes('access_token=') ||
    url.includes('refresh_token=') ||
    /[?#&]code=/.test(url)
  )
}

async function openOAuthSession(
  authUrl: string,
  _redirectTo?: string,
): Promise<string | null> {
  // Fresh deep link each attempt — Expo host can change without restarting Metro.
  const watchDeepLink = getAppDeepLink()
  authLog('—— openOAuthSession ——')
  authLog('appOwnership=', Constants.appOwnership)
  authLog('redirectTo (Supabase)=', _redirectTo || getRedirectTo())
  authLog('watch deep link=', watchDeepLink)
  const warning = resolveRedirectTo().warning
  if (warning) authWarn('CONFIG', warning)
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
      if (isAuthCallback(url)) {
        void WebBrowser.dismissBrowser().catch(() => undefined)
        finish(url, source)
      }
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
      authWarn(
        'waiting return…',
        Math.round((Date.now() - t0) / 1000) + 's',
        '| after Google you should see the orange callback page then return to Expo',
      )
    }, 4000)

    // Background safety net only (login UI is not blocked). Native builds
    // return via deep link in a few seconds; Expo Go + tunnel can be slower.
    const hardTimer = setTimeout(() => finish(null, 'timeout-90s'), 90_000)

    // Watch for exp:// deep link produced by /auth/mobile-callback
    authLog('openAuthSessionAsync (HTTPS bridge → deep link)')
    void WebBrowser.openAuthSessionAsync(authUrl, watchDeepLink, {
      showInRecents: true,
      preferEphemeralSession: false,
    })
      .then((session) => {
        authLog('authSession result', session.type, 'ms=', Date.now() - t0)
        if (session.type === 'success' && session.url) {
          onUrl(session.url, 'auth-session')
          return
        }
        // cancel often = user closed sheet OR deep link failed — keep waiting on Linking a bit
        if (!settled) {
          authWarn(
            'authSession ended:',
            session.type,
            '— if you saw the orange page, tap « Ouvrir FlightWatcher »',
          )
          setTimeout(() => {
            if (!settled) finish(null, `auth-session-${session.type}`)
          }, 8000)
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
  getRedirectTo,
  openAuthSession: async (url, redirect) => openOAuthSession(url, redirect),
  authOptions: {
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
    // PKCE verifier stays on device; Cloudflare callback 302s ?code= back to exp://
    flowType: 'pkce',
    storage: AsyncStorage,
  },
})

/** iOS/RN default fetch ~60s — XHR timeout lets inspire/scan run up to 5 min. */
function mobileFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : String(input.url)
  // NDJSON stream needs ReadableStream — XHR only resolves when complete.
  if (/\/api\/inspire\/stream(?:\?|$)/.test(url)) {
    return fetch(input, init)
  }
  const method = (init?.method || 'GET').toUpperCase()
  const timeoutMs = 300_000

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    xhr.timeout = timeoutMs

    const headers = new Headers(init?.headers)
    if (!headers.has('X-FW-Client')) {
      // Expo Go / Metro: backend may allow admin parcours APIs without admin email
      const expoDev =
        Constants.appOwnership === 'expo' ||
        (typeof __DEV__ !== 'undefined' && __DEV__)
      headers.set('X-FW-Client', expoDev ? 'expo' : 'mobile')
    }
    headers.forEach((value, key) => {
      xhr.setRequestHeader(key, value)
    })

    if (init?.signal) {
      if (init.signal.aborted) {
        reject(new Error('Aborted'))
        return
      }
      init.signal.addEventListener(
        'abort',
        () => {
          xhr.abort()
          reject(new Error('Aborted'))
        },
        { once: true },
      )
    }

    xhr.onload = () => {
      const raw = xhr.getAllResponseHeaders()
      const map: Record<string, string> = {}
      raw
        .trim()
        .split(/[\r\n]+/)
        .forEach((line) => {
          const i = line.indexOf(':')
          if (i > 0) map[line.slice(0, i).trim()] = line.slice(i + 1).trim()
        })
      resolve(
        new Response(xhr.responseText, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: map,
        }),
      )
    }
    xhr.onerror = () => reject(new TypeError('Network request failed'))
    xhr.ontimeout = () =>
      reject(
        new Error(
          'La recherche a pris trop de temps. Vérifie que le backend tourne, ou réduis les dates.',
        ),
      )
    xhr.send(typeof init?.body === 'string' ? init.body : init?.body ?? null)
  })
}

let api: ApiClient | null = null

export function getApi(): ApiClient {
  if (!api) {
    authLog('getApi baseUrl=', apiBase)
    api = createApiClient({
      baseUrl: apiBase,
      getToken: () => auth.getAccessToken(),
      fetchImpl: mobileFetch as typeof fetch,
    })
  }
  return api
}

export { apiBase }

function isLocalApiHost(url: string): boolean {
  try {
    const h = new URL(url).hostname
    return (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h === '10.0.2.2' ||
      /^192\.168\.\d+\.\d+$/.test(h) ||
      /^10\.\d+\.\d+\.\d+$/.test(h) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(h)
    )
  } catch {
    return true
  }
}

/**
 * Public web origin for invite links + MyTrip hotel compose (?compose=1).
 * Prefer EXPO_PUBLIC_WEB_ORIGIN. Do NOT use AUTH_CALLBACK_ORIGIN (OAuth tunnel ≠ SPA).
 * When API is the same deployed host (Vercel), reuse that origin.
 */
function isLanIpHost(host: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) && !host.startsWith('127.')
}

export function getWebOrigin(): string {
  const fromEnv = env('EXPO_PUBLIC_WEB_ORIGIN')?.replace(/\/$/, '')
  if (fromEnv) return fromEnv

  if (apiBase && !isLocalApiHost(apiBase)) {
    try {
      return new URL(apiBase).origin
    } catch {
      /* fall through */
    }
  }

  // Expo --tunnel hostUri is *.expo.app — not the Vite SPA. Prefer LAN IP only.
  const host = metroHost()
  if (host && isLanIpHost(host)) return `http://${host}:5173`

  return 'http://localhost:5173'
}

export function plannerInviteUrl(token: string): string {
  return `${getWebOrigin()}/planner/invite/${token}`
}

/** Extract invite token from flightwatcher:// or HTTPS planner invite URLs. */
export function parsePlannerInviteToken(url: string): string | null {
  const raw = String(url || '').trim()
  if (!raw) return null
  const m = raw.match(
    /(?:flightwatcher:\/\/|https?:\/\/[^/]+\/)?planner\/invite\/([^/?#]+)/i,
  )
  return m?.[1] ? decodeURIComponent(m[1]) : null
}
