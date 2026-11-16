import { createSupabaseAuth } from '@waypop/shared'

function apiBase(): string {
  return (
    process.env.NEXT_PUBLIC_WAYPOP_API_URL ||
    process.env.WAYPOP_API_URL ||
    'https://api.waypop.co'
  ).replace(/\/$/, '')
}

/** Browser Supabase auth — config from GET /api/config. */
export const auth = createSupabaseAuth({
  apiBaseUrl: apiBase(),
  getRedirectTo: () => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/auth/callback`
  },
})

const RETURN_KEY = 'wp_auth_return'

export function stashAuthReturn(path?: string): void {
  try {
    const next =
      path ||
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    sessionStorage.setItem(RETURN_KEY, next)
  } catch {
    /* ignore */
  }
}

export function consumeAuthReturn(fallback = '/'): string {
  try {
    const v = sessionStorage.getItem(RETURN_KEY)
    sessionStorage.removeItem(RETURN_KEY)
    if (v && v.startsWith('/')) return v
  } catch {
    /* ignore */
  }
  return fallback
}
