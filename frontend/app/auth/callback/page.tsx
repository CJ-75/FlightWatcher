'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/src/lib/supabase'

function buildAppDeepLink(
  appRedirect: string,
  session: { access_token: string; refresh_token: string },
): string {
  const base = appRedirect.split('#')[0].split('?')[0]
  const hash = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: 'bearer',
  }).toString()
  return `${base}#${hash}`
}

export default function AuthCallback() {
  const router = useRouter()
  const [mobileLink, setMobileLink] = useState<string | null>(null)
  const [status, setStatus] = useState('Connexion en cours…')

  useEffect(() => {
    const handleAuthCallback = async () => {
      const supabase = await getSupabaseClient()
      if (!supabase) {
        router.push('/')
        return
      }

      const search = new URLSearchParams(window.location.search)
      const appRedirect = search.get('app_redirect')

      try {
        const code = search.get('code')
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            console.error('Erreur exchangeCodeForSession:', exchangeError)
            router.push('/')
            return
          }
        } else if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
          const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
          const access_token = hash.get('access_token')
          const refresh_token = hash.get('refresh_token')
          if (access_token && refresh_token) {
            const { error: setErr } = await supabase.auth.setSession({
              access_token,
              refresh_token,
            })
            if (setErr) {
              console.error('Erreur setSession:', setErr)
              router.push('/')
              return
            }
          }
        }

        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()

        if (error) {
          console.error('Erreur récupération session:', error)
          router.push('/')
          return
        }

        if (session) {
          console.log('✅ Connexion réussie:', session.user.email)
          if (appRedirect) {
            const deepLink = buildAppDeepLink(appRedirect, session)
            setMobileLink(deepLink)
            setStatus('Retour à l’application…')
            window.location.href = deepLink
            return
          }
          router.push('/')
        } else {
          router.push('/')
        }
      } catch (err) {
        console.error('Erreur callback auth:', err)
        router.push('/')
      }
    }

    void handleAuthCallback()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="text-2xl font-bold text-gray-800 mb-4">{status}</div>
        {mobileLink ? (
          <a
            href={mobileLink}
            className="inline-block mt-2 px-5 py-3 rounded-xl bg-[#FF6B35] text-white font-semibold"
          >
            Ouvrir FlightWatcher
          </a>
        ) : (
          <div className="text-gray-600">Redirection en cours…</div>
        )}
      </div>
    </div>
  )
}
