'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, consumeAuthReturn } from '@/lib/auth'
import { setSignedInCookie } from '@/lib/signedInCookie'

function isBenignExchangeError(message: string): boolean {
  const m = message.toLowerCase()
  return (
    m.includes('already') ||
    m.includes('flow state') ||
    m.includes('code verifier') ||
    m.includes('invalid request') ||
    m.includes('expired')
  )
}

export default function AuthCallbackPage() {
  const router = useRouter()
  const [status, setStatus] = useState('Connexion en cours…')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    const run = async () => {
      const client = await auth.getClient()
      if (!client) {
        setStatus('Auth indisponible')
        router.replace('/')
        return
      }

      try {
        const search = new URLSearchParams(window.location.search)
        const code = search.get('code')
        if (code) {
          const {
            data: { session: existing },
          } = await client.auth.getSession()
          if (!existing) {
            const { error } = await client.auth.exchangeCodeForSession(code)
            if (error) {
              const {
                data: { session: after },
              } = await client.auth.getSession()
              if (!after && !isBenignExchangeError(error.message)) {
                setStatus('Échec de connexion')
                router.replace('/')
                return
              }
            }
          }
        } else {
          // Implicit / hash tokens — detectSessionInUrl handles most cases
          await auth.createSessionFromUrl(window.location.href)
        }

        const user = await auth.getCurrentUser()
        setSignedInCookie(Boolean(user))
        const next = consumeAuthReturn('/')
        router.replace(user ? next : '/')
      } catch {
        setStatus('Erreur')
        router.replace('/')
      }
    }

    void run()
  }, [router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FFF9F5] px-6">
      <p className="text-sm font-semibold text-ink/70">{status}</p>
    </main>
  )
}
