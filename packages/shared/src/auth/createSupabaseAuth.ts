import { createClient, type SupabaseClient, type User, type Session } from '@supabase/supabase-js'

export interface SupabaseAuthOptions {
  /** Fetch /api/config from this base (absolute or empty for same-origin). */
  apiBaseUrl?: string
  /** Override redirect URL for OAuth (web origin or mobile deep link). */
  redirectTo?: string
  /** Auth options passed to createClient */
  authOptions?: {
    autoRefreshToken?: boolean
    persistSession?: boolean
    detectSessionInUrl?: boolean
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
  onAuthStateChange: (
    callback: (event: string, session: Session | null) => void
  ) => () => void
}

function joinUrl(base: string, path: string): string {
  const b = (base || '').replace(/\/$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
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

  return {
    getClient,
    isAvailable: async () => (await getClient()) !== null,
    getCurrentUser: async () => {
      const c = await getClient()
      if (!c) return null
      const { data: { user } } = await c.auth.getUser()
      return user
    },
    getCurrentSession: async () => {
      const c = await getClient()
      if (!c) return null
      const { data: { session } } = await c.auth.getSession()
      return session
    },
    getAccessToken: async () => {
      const c = await getClient()
      if (!c) return null
      const { data: { session } } = await c.auth.getSession()
      return session?.access_token ?? null
    },
    signInWithGoogle: async () => {
      const c = await getClient()
      if (!c) return { error: new Error('Supabase is not configured') }
      const redirectTo = options.redirectTo
      const { error } = await c.auth.signInWithOAuth({
        provider: 'google',
        options: redirectTo ? { redirectTo } : undefined,
      })
      return { error: error ? new Error(error.message) : null }
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
        const { data: { subscription } } = c.auth.onAuthStateChange((event, session) => {
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
