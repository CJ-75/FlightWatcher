/**
 * Non-sensitive flag for Next middleware (LANDING_V2).
 * Does not grant rights — auth stays in Supabase session storage.
 */
const COOKIE = 'wp_signed_in'
const MAX_AGE_S = 60 * 60 * 24 * 30

function cookieSecure(): boolean {
  try {
    return window.location.protocol === 'https:'
  } catch {
    return true
  }
}

export function setSignedInCookie(on: boolean): void {
  try {
    if (on) {
      const secure = cookieSecure() ? '; Secure' : ''
      document.cookie = `${COOKIE}=1; Path=/; Max-Age=${MAX_AGE_S}; SameSite=Lax${secure}`
    } else {
      document.cookie = `${COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
    }
  } catch {
    /* private mode */
  }
}
