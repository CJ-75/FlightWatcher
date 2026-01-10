/**
 * Page de callback pour OAuth Supabase
 * Gère la redirection après authentification Google
 * Note: Cette page est gérée automatiquement par Supabase via l'URL de callback
 */
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSupabaseClient } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    const handleAuthCallback = async () => {
      const supabase = await getSupabaseClient()
      if (!supabase) {
        navigate('/login')
        return
      }

      try {
        // Récupérer la session depuis l'URL
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Erreur récupération session:', error)
          navigate('/login')
          return
        }

        if (session) {
          console.log('✅ Connexion réussie:', session.user.email)
          
          // Vérifier si l'utilisateur vient de la page admin
          const fromAdmin = sessionStorage.getItem('admin_login_redirect')
          if (fromAdmin) {
            sessionStorage.removeItem('admin_login_redirect')
            // Vérifier le statut admin avant de rediriger
            const token = session.access_token
            if (token) {
              const apiUrl = window.location.origin.includes('localhost')
                ? 'http://localhost:8000/api/admin/verify'
                : '/api/admin/verify'
              
              try {
                const response = await fetch(apiUrl, {
                  headers: {
                    'Authorization': `Bearer ${token}`
                  }
                })
                
                if (response.ok) {
                  const data = await response.json()
                  console.log('[AuthCallback] Réponse verify admin:', data)
                  // Vérifier si l'email est admin
                  if (data.is_admin_email || data.requires_password) {
                    // Vérifier si le mot de passe a déjà été vérifié
                    const passwordVerified = document.cookie.includes('admin_password_verified=true')
                    if (passwordVerified) {
                      navigate('/admin/users')
                    } else {
                      // Rediriger vers la page admin login pour demander le mot de passe
                      navigate('/admin/login?password_required=true')
                    }
                    return
                  } else {
                    console.log('[AuthCallback] Email non admin:', session.user.email)
                  }
                } else {
                  const errorData = await response.json().catch(() => ({}))
                  console.error('[AuthCallback] Erreur vérification admin:', response.status, errorData)
                }
              } catch (error) {
                console.error('[AuthCallback] Erreur vérification admin:', error)
              }
            }
            // Si pas admin, rediriger vers login admin avec erreur
            navigate('/admin/login?error=not_admin')
            return
          }
          
          // Rediriger vers la page principale
          navigate('/')
        } else {
          navigate('/login')
        }
      } catch (error) {
        console.error('Erreur callback auth:', error)
        navigate('/login')
      }
    }

    handleAuthCallback()
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-2xl font-bold text-gray-800 mb-4">
          ⏳ Connexion en cours...
        </div>
        <div className="text-gray-600">
          Redirection en cours...
        </div>
      </div>
    </div>
  )
}

