import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import * as Linking from 'expo-linking'
import type { Session, User } from '@flightwatcher/shared'
import { auth, redirectTo, authRedirectWarning } from '../lib/client'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  /** Dev-only bypass — no real session. */
  isGuest: boolean
  continueAsGuest: () => void
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
      },
      signInWithGoogle: () => auth.signInWithGoogle(),
      signOut: async () => {
        await auth.signOut()
        setUser(null)
        setSession(null)
        setIsGuest(false)
      },
    }),
    [user, session, loading, isGuest],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
