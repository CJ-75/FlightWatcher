/**
 * Page de login pour le panneau admin
 * Utilise Google OAuth pour l'authentification + mot de passe admin
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithGoogle, getCurrentUser } from '../lib/supabase'
import { useAdminAuth } from './hooks/useAdminAuth'
import { AdminPasswordModal } from './components/AdminPasswordModal'

export function AdminLogin() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const navigate = useNavigate()
  const { isAdmin, loading: authLoading, checkAdmin } = useAdminAuth()

  useEffect(() => {
    // Vérifier si l'utilisateur est déjà connecté et admin (une seule fois)
    if (authLoading) return
    
    const checkAuth = async () => {
      const user = await getCurrentUser()
      if (user) {
        await checkAdmin()
        // Attendre un peu pour que isAdmin soit mis à jour
        setTimeout(() => {
          const passwordVerified = document.cookie.includes('admin_password_verified=true')
          if (isAdmin && passwordVerified) {
            navigate('/admin/users')
          } else if (isAdmin && !passwordVerified) {
            setShowPasswordModal(true)
          }
        }, 100)
      }
    }
    
    checkAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading]) // Seulement quand authLoading change

  const handleGoogleAuth = async () => {
    setError(null)
    setLoading(true)

    try {
      // Marquer que l'utilisateur vient de la page admin
      sessionStorage.setItem('admin_login_redirect', 'true')
      
      const { error: signInError } = await signInWithGoogle()
      
      if (signInError) {
        sessionStorage.removeItem('admin_login_redirect')
        setError(signInError.message || 'Erreur lors de la connexion Google')
        setLoading(false)
        return
      }

      // La redirection OAuth se fait automatiquement
      // Après retour du callback, l'utilisateur sera redirigé vers /admin/users si admin
    } catch (err: any) {
      sessionStorage.removeItem('admin_login_redirect')
      setError(err.message || 'Une erreur est survenue')
      setLoading(false)
    }
  }

  // Vérifier les erreurs dans l'URL (une seule fois au montage)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const errorParam = urlParams.get('error')
    const passwordRequired = urlParams.get('password_required')
    
    if (errorParam === 'not_admin') {
      setError('Accès refusé : votre compte n\'est pas autorisé comme administrateur')
      window.history.replaceState({}, '', '/admin/login')
    } else if (passwordRequired === 'true') {
      // Vérifier si l'utilisateur est connecté et admin email
      const checkAndShowPassword = async () => {
        const user = await getCurrentUser()
        if (user) {
          await checkAdmin()
          // Attendre un peu pour que isAdmin soit mis à jour
          setTimeout(() => {
            if (isAdmin) {
              setShowPasswordModal(true)
            }
          }, 200)
        }
      }
      checkAndShowPassword()
      window.history.replaceState({}, '', '/admin/login')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Une seule fois au montage

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#1a1d29] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a1d29] flex items-center justify-center p-4">
      <div className="bg-[#252836] border border-gray-700 rounded-xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-bold text-2xl">F</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">FlightWatcher Admin</h1>
          <p className="text-gray-400">Connexion administrateur</p>
        </div>

        {error && (
          <div className="bg-red-600/20 border border-red-600/30 text-red-400 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="text-center text-sm text-gray-400 mb-4">
            <p>Connectez-vous avec votre compte Google</p>
            <p className="mt-1 text-xs text-gray-500">Seuls les administrateurs autorisés peuvent accéder</p>
          </div>

          <button
            onClick={handleGoogleAuth}
            disabled={loading}
            className="w-full bg-white hover:bg-gray-100 text-gray-900 font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-600"></div>
                <span>Connexion...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>Se connecter avec Google</span>
              </>
            )}
          </button>
        </div>

        <AdminPasswordModal
          isOpen={showPasswordModal}
          onSuccess={() => {
            setShowPasswordModal(false)
            navigate('/admin/users')
          }}
          onCancel={() => {
            setShowPasswordModal(false)
            // Déconnexion si l'utilisateur annule
            navigate('/login')
          }}
        />
      </div>
    </div>
  )
}

