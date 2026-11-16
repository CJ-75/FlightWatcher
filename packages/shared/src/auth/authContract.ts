/**
 * Cross-platform auth contract — Next (web-public) / Vite (SPA) / Expo (mobile).
 * Unit tests lock the surface; live smoke stays deferred (AUTH_LIVE=1).
 */

export type AuthPlatform = 'next' | 'vite' | 'expo'

export type AuthProviderMethod = 'google' | 'apple' | 'email'

/** Email path after tapping “Continuer avec Email”. */
export type AuthEmailMode = 'login' | 'signup'

export type AuthEmailAction =
  | { mode: 'login'; method: 'password' }
  | { mode: 'signup'; method: 'otp_magic_link' }

/** Canonical product flow every client must implement. */
export const AUTH_EMAIL_ACTIONS: readonly AuthEmailAction[] = [
  { mode: 'login', method: 'password' },
  { mode: 'signup', method: 'otp_magic_link' },
] as const

export const AUTH_PROVIDER_ORDER: readonly AuthProviderMethod[] = [
  'google',
  'apple',
  'email',
] as const

export type AuthPlatformSurface = {
  platform: AuthPlatform
  /** Host / app shell that opens the sheet */
  sheetHost: string
  /** OAuth + magic-link return path */
  callbackPath: string
  /** Cookie / session flag used by middleware or SPA */
  signedInSignal: 'wp_signed_in' | 'supabase_session'
  providers: readonly AuthProviderMethod[]
  emailActions: readonly AuthEmailAction[]
}

export const AUTH_PLATFORM_SURFACES: readonly AuthPlatformSurface[] = [
  {
    platform: 'next',
    sheetHost: 'apps/web-public AuthHost + AuthLightbox',
    callbackPath: '/auth/callback',
    signedInSignal: 'wp_signed_in',
    providers: AUTH_PROVIDER_ORDER,
    emailActions: AUTH_EMAIL_ACTIONS,
  },
  {
    platform: 'vite',
    sheetHost: 'frontend AuthSheetHost + AuthSheet',
    callbackPath: '/auth/callback',
    signedInSignal: 'wp_signed_in',
    providers: AUTH_PROVIDER_ORDER,
    emailActions: AUTH_EMAIL_ACTIONS,
  },
  {
    platform: 'expo',
    sheetHost: 'mobile AuthSheetHost + AuthSheet',
    callbackPath: 'auth/callback (deep link)',
    signedInSignal: 'supabase_session',
    providers: AUTH_PROVIDER_ORDER,
    emailActions: AUTH_EMAIL_ACTIONS,
  },
] as const

/** Methods createSupabaseAuth must expose for the contract. */
export const AUTH_CLIENT_METHODS = [
  'signInWithGoogle',
  'signInWithApple',
  'signInWithOtp',
  'signInWithEmail',
  'getCurrentUser',
  'getCurrentSession',
  'signOut',
  'onAuthStateChange',
  'createSessionFromUrl',
] as const

export type AuthClientMethod = (typeof AUTH_CLIENT_METHODS)[number]

/** Manual / live smoke items — run later with AUTH_LIVE=1, not in CI by default. */
export const AUTH_LIVE_SMOKE_CHECKS = [
  {
    id: 'next-google',
    platform: 'next' as AuthPlatform,
    label: 'Pop like → Google OAuth → callback → keep resumes',
  },
  {
    id: 'next-email-login',
    platform: 'next' as AuthPlatform,
    label: 'Email login password on AuthLightbox',
  },
  {
    id: 'next-email-signup',
    platform: 'next' as AuthPlatform,
    label: 'Email signup OTP / magic link (Resend SMTP)',
  },
  {
    id: 'vite-google',
    platform: 'vite' as AuthPlatform,
    label: 'SPA favorite → Google → /auth/callback',
  },
  {
    id: 'vite-email-login',
    platform: 'vite' as AuthPlatform,
    label: 'SPA AuthSheet email + password login',
  },
  {
    id: 'vite-email-signup',
    platform: 'vite' as AuthPlatform,
    label: 'SPA AuthSheet signup magic link',
  },
  {
    id: 'expo-google',
    platform: 'expo' as AuthPlatform,
    label: 'Expo AuthSheet Google native session',
  },
  {
    id: 'expo-apple',
    platform: 'expo' as AuthPlatform,
    label: 'Expo AuthSheet Apple (iOS)',
  },
  {
    id: 'expo-email-login',
    platform: 'expo' as AuthPlatform,
    label: 'Expo email + password login',
  },
  {
    id: 'expo-email-signup',
    platform: 'expo' as AuthPlatform,
    label: 'Expo signup magic link deep link',
  },
] as const

export function friendlyAuthError(message: string): string {
  const m = String(message || '').toLowerCase()
  if (m.includes('invalid login') || m.includes('invalid credentials')) {
    return 'Email ou mot de passe incorrect.'
  }
  if (m.includes('rate') || m.includes('too many')) {
    return 'Trop de tentatives — réessaie dans un instant.'
  }
  if (m.includes('network') || m.includes('fetch')) {
    return 'Réseau indisponible — réessaie.'
  }
  return message || 'Connexion impossible.'
}

/** Static integrity check — no network. */
export function assertAuthContractIntegrity(): string[] {
  const errors: string[] = []
  if (AUTH_PROVIDER_ORDER.length !== 3) {
    errors.push('providers must be google, apple, email')
  }
  if (AUTH_PROVIDER_ORDER[0] !== 'google' || AUTH_PROVIDER_ORDER[2] !== 'email') {
    errors.push('provider order must be Google → Apple → Email')
  }
  for (const surface of AUTH_PLATFORM_SURFACES) {
    if (surface.providers.length !== AUTH_PROVIDER_ORDER.length) {
      errors.push(`${surface.platform}: missing providers`)
    }
    if (surface.emailActions.length !== AUTH_EMAIL_ACTIONS.length) {
      errors.push(`${surface.platform}: missing email login/signup actions`)
    }
    const hasLogin = surface.emailActions.some(
      (a) => a.mode === 'login' && a.method === 'password',
    )
    const hasSignup = surface.emailActions.some(
      (a) => a.mode === 'signup' && a.method === 'otp_magic_link',
    )
    if (!hasLogin) errors.push(`${surface.platform}: login/password required`)
    if (!hasSignup) errors.push(`${surface.platform}: signup/otp required`)
  }
  if (AUTH_LIVE_SMOKE_CHECKS.length < 9) {
    errors.push('live smoke checklist incomplete')
  }
  return errors
}
