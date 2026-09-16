import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@flightwatcher/shared'
import { auth } from '../lib/client'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const s = await auth.getCurrentSession()
      if (!mounted) return
      setSession(s)
      setUser(s?.user ?? null)
      setLoading(false)
    })()

    const unsub = auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
      setLoading(false)
    })
    return () => {
      mounted = false
      unsub()
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
    [user, session, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
