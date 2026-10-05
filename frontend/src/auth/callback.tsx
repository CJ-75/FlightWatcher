/**
 * Page de callback pour OAuth Supabase
 * - Web: session puis redirect /
 * - Mobile: si ?app_redirect=…, renvoie les tokens vers l’app (deep link)
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSupabaseClient } from '../lib/supabase'
import { apiUrl } from '../utils/apiBase'

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
  const navigate = useNavigate()
  const [mobileLink, setMobileLink] = useState<string | null>(null)
  const [status, setStatus] = useState('Connexion en cours…')

  useEffect(() => {
    const handleAuthCallback = async () => {
      const supabase = await getSupabaseClient()
      if (!supabase) {
        navigate('/login')
        return
      }

      const search = new URLSearchParams(window.location.search)
      const appRedirect = search.get('app_redirect')

      try {
        // Implicit (mobile): tokens in URL hash — detectSessionInUrl / getSession
        // PKCE (web): ?code=…
        const code = search.get('code')
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            console.error('Erreur exchangeCodeForSession:', exchangeError)
            navigate('/login')
            return
          }
        } else if (window.location.hash.includes('access_token')) {
          // Ensure hash tokens are applied (some loads race detectSessionInUrl)
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
              navigate('/login')
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
          navigate('/login')
          return
        }

        if (!session) {
          navigate('/login')
          return
        }

        console.log('✅ Connexion réussie:', session.user.email)

        // Retour app mobile (même flow web + deep link)
        if (appRedirect) {
          const deepLink = buildAppDeepLink(appRedirect, session)
          setMobileLink(deepLink)
          setStatus('Retour à l’application…')
          window.location.href = deepLink
          return
        }

        const fromAdmin = sessionStorage.getItem('admin_login_redirect')
        if (fromAdmin) {
          sessionStorage.removeItem('admin_login_redirect')
          const token = session.access_token
          if (token) {
            try {
              const response = await fetch(apiUrl('/api/admin/verify'), {
                headers: { Authorization: `Bearer ${token}` },
              })

              if (response.ok) {
                const data = await response.json()
                if (data.is_admin_email || data.requires_password) {
                  const passwordVerified = document.cookie.includes('admin_password_verified=true')
                  if (passwordVerified) {
                    navigate('/admin/users')
                  } else {
                    navigate('/admin/login?password_required=true')
                  }
                  return
                }
              }
            } catch (err) {
              console.error('[AuthCallback] Erreur vérification admin:', err)
            }
          }
          navigate('/admin/login?error=not_admin')
          return
        }

        const postLogin = sessionStorage.getItem('fw_post_login_redirect')
        if (postLogin && postLogin.startsWith('/')) {
          sessionStorage.removeItem('fw_post_login_redirect')
          navigate(postLogin)
          return
        }

        navigate('/')
      } catch (err) {
        console.error('Erreur callback auth:', err)
        navigate('/login')
      }
    }

    void handleAuthCallback()
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-orange-100 p-6">
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
