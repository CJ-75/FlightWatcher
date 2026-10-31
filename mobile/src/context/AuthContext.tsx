import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import * as Linking from 'expo-linking'
import type { Session, User } from '@flightwatcher/shared'
import { auth, redirectTo, authRedirectWarning } from '../lib/client'
import { DEV_GUEST_USER } from '../dev/guestPreview'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  /** Dev-only bypass — no real session, stay in Main tabs. */
  isGuest: boolean
  continueAsGuest: () => void
  /**
   * Dev-only: UI pretends the user is logged out (guest landings),
   * without leaving Main / signing out.
   */
  appearLoggedOut: boolean
  setAppearLoggedOut: (value: boolean) => void
  /** user unless appearLoggedOut (dev preview). Use for UI gates. */
  viewUser: User | null
  signInWithGoogle: () => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function looksLikeAuthCallback(url: string): boolean {
  return (
    url.includes('auth/callback') ||
    url.includes('access_token=') ||
    url.includes('refresh_token=') ||
    url.includes('code=')
  )
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isGuest, setIsGuest] = useState(false)
  const [appearLoggedOut, setAppearLoggedOutState] = useState(false)

  useEffect(() => {
    let mounted = true
    /** Never block the UI on a slow Supabase storage read. */
    const AUTH_BOOT_MS = 1200
    /** Returning user: short carousel then Main → Search. */
    const LOGGED_IN_SPLASH_MS = 1100
    let splashTimer: ReturnType<typeof setTimeout> | null = null
    let bootPending = true

    const finishLoading = () => {
      bootPending = false
      if (mounted) setLoading(false)
    }

    const applySession = (s: Session | null, fromBoot = false) => {
      if (!mounted) return
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user) setIsGuest(false)

      // After first boot, never re-enter splash delay
      if (!bootPending && !fromBoot) return

      if (splashTimer) {
        clearTimeout(splashTimer)
        splashTimer = null
      }
      if (s?.user) {
        splashTimer = setTimeout(finishLoading, LOGGED_IN_SPLASH_MS)
      } else {
        finishLoading()
      }
    }

    const bootTimer = setTimeout(() => {
      if (mounted && bootPending) finishLoading()
    }, AUTH_BOOT_MS)

    ;(async () => {
      try {
        const s = await auth.getCurrentSession()
        clearTimeout(bootTimer)
        applySession(s, true)
      } catch {
        clearTimeout(bootTimer)
        if (mounted) finishLoading()
      }
    })()

    const unsub = auth.onAuthStateChange((_event, s) => {
      applySession(s, false)
    })

    const handleUrl = async (url: string | null) => {
      if (__DEV__) console.log('[auth] AuthContext Linking url=', url?.slice(0, 200) ?? null)
      if (!url || !looksLikeAuthCallback(url)) {
        if (__DEV__ && url) console.log('[auth] AuthContext ignore (not callback)')
        return
      }
      if (__DEV__) console.log('[auth] AuthContext createSessionFromUrl…')
      const { session: s, error } = await auth.createSessionFromUrl(url)
      if (error) {
        console.warn('[auth] AuthContext createSessionFromUrl FAILED', error.message)
        return
      }
      if (s) {
        if (__DEV__) console.log('[auth] AuthContext session OK user=', s.user?.email ?? s.user?.id)
        applySession(s)
      } else if (__DEV__) {
        console.warn('[auth] AuthContext createSessionFromUrl returned no session')
      }
    }

    Linking.getInitialURL().then((url) => {
      if (__DEV__) console.log('[auth] AuthContext getInitialURL=', url?.slice(0, 200) ?? null)
      void handleUrl(url)
    })
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url)
    })

    if (__DEV__) {
      console.log('[auth] AuthContext ready redirectTo=', redirectTo)
      if (authRedirectWarning) console.warn('[auth] CONFIG', authRedirectWarning)
    }

    return () => {
      mounted = false
      clearTimeout(bootTimer)
      if (splashTimer) clearTimeout(splashTimer)
      unsub()
      linkSub.remove()
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      isGuest,
      continueAsGuest: () => {
        if (!__DEV__) return
        setIsGuest(true)
        setAppearLoggedOutState(false)
      },
      appearLoggedOut: __DEV__ ? appearLoggedOut : false,
      setAppearLoggedOut: (value: boolean) => {
        if (!__DEV__) return
        setAppearLoggedOutState(value)
      },
      viewUser:
        __DEV__ && appearLoggedOut
          ? null
          : user ?? (__DEV__ && isGuest ? DEV_GUEST_USER : null),
      signInWithGoogle: () => auth.signInWithGoogle(),
      signOut: async () => {
        await auth.signOut()
        setUser(null)
        setSession(null)
        setIsGuest(false)
        setAppearLoggedOutState(false)
      },
    }),
    [user, session, loading, isGuest, appearLoggedOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
