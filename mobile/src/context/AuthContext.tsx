import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import * as Linking from 'expo-linking'
import type { Session, User } from '@flightwatcher/shared'
import { auth, redirectTo } from '../lib/client'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
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

  useEffect(() => {
    let mounted = true

    const applySession = (s: Session | null) => {
      if (!mounted) return
      setSession(s)
      setUser(s?.user ?? null)
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
      if (!url || !looksLikeAuthCallback(url)) return
      const { session: s, error } = await auth.createSessionFromUrl(url)
      if (error) {
        console.warn('[auth] createSessionFromUrl', error.message)
        return
      }
      if (s) applySession(s)
    }

    Linking.getInitialURL().then((url) => {
      void handleUrl(url)
    })
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url)
    })

    if (__DEV__) {
      console.log('[auth] redirectTo', redirectTo)
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
      signInWithGoogle: () => auth.signInWithGoogle(),
      signOut: async () => {
        await auth.signOut()
        setUser(null)
        setSession(null)
      },
    }),
    [user, session, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
