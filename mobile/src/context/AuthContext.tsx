import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import * as Linking from 'expo-linking'
import type { Session, User } from '@flightwatcher/shared'
import { auth, redirectTo, authRedirectWarning } from '../lib/client'

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

    const applySession = (s: Session | null) => {
      if (!mounted) return
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user) setIsGuest(false)
      setLoading(false)
    }

    ;(async () => {
      const s = await auth.getCurrentSession()
      applySession(s)
    })()

    const unsub = auth.onAuthStateChange((_event, s) => {
      applySession(s)
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
      viewUser: __DEV__ && appearLoggedOut ? null : user,
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
