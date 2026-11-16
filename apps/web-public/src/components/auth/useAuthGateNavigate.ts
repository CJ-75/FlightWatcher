'use client'

import { useCallback } from 'react'
import { useAuthSheet } from '@/components/auth/AuthHost'
import { auth, stashAuthReturn } from '@/lib/auth'

/** Navigate to href; if logged out, open auth lightbox first (same as Lancer le Pop). */
export function useAuthGateNavigate() {
  const { openAuthSheet, signedIn } = useAuthSheet()

  return useCallback(
    (href: string) => {
      void (async () => {
        const user = signedIn ? true : Boolean(await auth.getCurrentUser())
        const go = () => {
          window.location.href = href
        }
        if (!user) {
          stashAuthReturn(href)
          openAuthSheet({
            trigger: 'favorite',
            pending: {
              type: 'create_trip_from_parcours',
              trigger: 'favorite',
              payload: { href },
              createdAt: Date.now(),
            },
            onAuthenticated: go,
          })
          return
        }
        go()
      })()
    },
    [openAuthSheet, signedIn],
  )
}
