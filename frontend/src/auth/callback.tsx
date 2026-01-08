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

