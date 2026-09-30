import { createClient, type SupabaseClient, type User, type Session } from '@supabase/supabase-js'

export interface SupabaseAuthOptions {
  /** Fetch /api/config from this base (absolute or empty for same-origin). */
  apiBaseUrl?: string
  /** Override redirect URL for OAuth (web origin or mobile deep link). */
  redirectTo?: string
  /**
   * Native / Expo: open the OAuth URL in an auth session and return the
   * redirect URL on success (null if cancelled). When set, skipBrowserRedirect
   * is used and the session is created from the callback URL.
   */
  openAuthSession?: (url: string, redirectTo: string) => Promise<string | null>
  /** Auth options passed to createClient */
  authOptions?: {
    autoRefreshToken?: boolean
    persistSession?: boolean
    detectSessionInUrl?: boolean
    flowType?: 'implicit' | 'pkce'
    storage?: {
      getItem: (key: string) => string | null | Promise<string | null>
      setItem: (key: string, value: string) => void | Promise<void>
      removeItem: (key: string) => void | Promise<void>
    }
  }
  fetchImpl?: typeof fetch
}

export interface SupabaseAuth {
  getClient: () => Promise<SupabaseClient | null>
  isAvailable: () => Promise<boolean>
  getCurrentUser: () => Promise<User | null>
  getCurrentSession: () => Promise<Session | null>
  getAccessToken: () => Promise<string | null>
  signInWithGoogle: () => Promise<{ error: Error | null }>
  signInWithEmail: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<{ error: Error | null }>
  /** Complete OAuth from a deep-link / auth-session redirect URL. */
  createSessionFromUrl: (url: string) => Promise<{ session: Session | null; error: Error | null }>
  onAuthStateChange: (
    callback: (event: string, session: Session | null) => void
  ) => () => void
}

function joinUrl(base: string, path: string): string {
  const b = (base || '').replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

/** Parse query or hash params from OAuth redirect URLs (incl. custom schemes). */
export function extractParamsFromUrl(url: string): Record<string, string> {
  const params: Record<string, string> = {}
  const hashPart = url.includes('#') ? url.split('#').slice(1).join('#') : ''
  const queryPart = url.includes('?')
    ? url.split('?')[1]?.split('#')[0] || ''
    : ''
  const raw = hashPart || queryPart
  if (!raw) return params
  for (const part of raw.split('&')) {
    if (!part) continue
    const eq = part.indexOf('=')
    const key = decodeURIComponent(eq >= 0 ? part.slice(0, eq) : part)
    const value = decodeURIComponent(eq >= 0 ? part.slice(eq + 1) : '')
    if (key) params[key] = value
  }
  return params
}

async function applySessionFromUrl(
  client: SupabaseClient,
  url: string,
): Promise<{ session: Session | null; error: Error | null }> {
  const params = extractParamsFromUrl(url)
  if (params.error || params.error_description) {
    return {
      session: null,
      error: new Error(params.error_description || params.error || 'OAuth error'),
    }
  }

  if (params.code) {
    const { data, error } = await client.auth.exchangeCodeForSession(params.code)
    if (error) return { session: null, error: new Error(error.message) }
    return { session: data.session, error: null }
  }

  if (params.access_token) {
    const { data, error } = await client.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token || '',
    })
    if (error) return { session: null, error: new Error(error.message) }
    return { session: data.session, error: null }
  }

  return { session: null, error: new Error('No auth tokens found in redirect URL') }
}

/**
 * Factory for platform-agnostic Supabase auth (web + Expo).
 * Loads URL/anon key from GET /api/config.
 */
export function createSupabaseAuth(options: SupabaseAuthOptions = {}): SupabaseAuth {
  const apiBase = options.apiBaseUrl ?? ''
  const fetchFn = options.fetchImpl ?? fetch.bind(globalThis)

  let client: SupabaseClient | null = null
  let configPromise: Promise<void> | null = null
  let loaded = false
  let supabaseUrl: string | undefined
  let supabaseAnonKey: string | undefined

  async function loadConfig(): Promise<void> {
    if (loaded) return
    try {
      const res = await fetchFn(joinUrl(apiBase, '/api/config'))
      if (!res.ok) return
      const config = await res.json()
      if (config.available && config.supabase_url && config.supabase_anon_key) {
        supabaseUrl = config.supabase_url
        supabaseAnonKey = config.supabase_anon_key
        loaded = true
      }
    } catch {
      // config unavailable
    }
  }

  function ensureConfig(): Promise<void> {
    if (!configPromise) configPromise = loadConfig()
    return configPromise
  }

  function initClient(): SupabaseClient | null {
    if (!supabaseUrl || !supabaseAnonKey) return null
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        ...options.authOptions,
      },
    })
  }

  async function getClient(): Promise<SupabaseClient | null> {
    if (client) return client
    await ensureConfig()
    if (!client) client = initClient()
    return client
  }

  async function createSessionFromUrl(url: string) {
    const c = await getClient()
    if (!c) return { session: null, error: new Error('Supabase is not configured') }
    return applySessionFromUrl(c, url)
  }

  return {
    getClient,
    isAvailable: async () => (await getClient()) !== null,
    getCurrentUser: async () => {
      const c = await getClient()
      if (!c) return null
      const {
        data: { user },
      } = await c.auth.getUser()
      return user
    },
    getCurrentSession: async () => {
      const c = await getClient()
      if (!c) return null
      const {
        data: { session },
      } = await c.auth.getSession()
      return session
    },
    getAccessToken: async () => {
      const c = await getClient()
      if (!c) return null
      const {
        data: { session },
      } = await c.auth.getSession()
      return session?.access_token ?? null
    },
    createSessionFromUrl,
    signInWithGoogle: async () => {
      const c = await getClient()
      if (!c) return { error: new Error('Supabase is not configured') }
      const redirectTo = options.redirectTo
      const useNative = typeof options.openAuthSession === 'function'

      console.log('[auth] signInWithGoogle start', {
        redirectTo,
        useNative,
        flowType: options.authOptions?.flowType ?? '(default)',
      })

      const { data, error } = await c.auth.signInWithOAuth({
        provider: 'google',
        options: {
          ...(redirectTo ? { redirectTo } : {}),
          skipBrowserRedirect: useNative,
        },
      })
      if (error) {
        console.warn('[auth] signInWithOAuth error', error.message)
        return { error: new Error(error.message) }
      }

      console.log('[auth] signInWithOAuth ok', {
        hasUrl: !!data?.url,
        urlPreview: data?.url?.slice(0, 220) ?? null,
      })

      if (!useNative) return { error: null }

      if (!data?.url) return { error: new Error('No OAuth URL returned') }

      try {
        console.log('[auth] openAuthSession…')
        const resultUrl = await options.openAuthSession!(data.url, redirectTo || '')
        console.log('[auth] openAuthSession returned', {
          hasUrl: !!resultUrl,
          preview: resultUrl?.slice(0, 220) ?? null,
        })
        if (!resultUrl) {
          console.warn('[auth] openAuthSession returned null (cancel / timeout / fallback open only)')
          return { error: null }
        }
        console.log('[auth] applySessionFromUrl…')
        const { error: sessionError } = await applySessionFromUrl(c, resultUrl)
        if (sessionError) {
          console.warn('[auth] applySessionFromUrl FAILED', sessionError.message)
        } else {
          console.log('[auth] applySessionFromUrl OK')
        }
        return { error: sessionError }
      } catch (e) {
        console.warn('[auth] openAuthSession / applySession threw', e)
        return { error: e instanceof Error ? e : new Error(String(e)) }
      }
    },
    signInWithEmail: async (email, password) => {
      const c = await getClient()
      if (!c) return { error: new Error('Supabase is not configured') }
      const { error } = await c.auth.signInWithPassword({ email, password })
      return { error: error ? new Error(error.message) : null }
    },
    signOut: async () => {
      const c = await getClient()
      if (!c) return { error: new Error('Supabase is not configured') }
      const { error } = await c.auth.signOut()
      return { error: error ? new Error(error.message) : null }
    },
    onAuthStateChange: (callback) => {
      let unsubscribe: (() => void) | null = null
      getClient().then((c) => {
        if (!c) return
        const {
          data: { subscription },
        } = c.auth.onAuthStateChange((event, session) => {
          callback(event, session)
        })
        unsubscribe = () => subscription.unsubscribe()
      })
      return () => {
        unsubscribe?.()
      }
    },
  }
}

export type { User, Session, SupabaseClient }
