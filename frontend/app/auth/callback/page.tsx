'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/src/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const handleAuthCallback = async () => {
      const supabase = await getSupabaseClient()
      if (!supabase) {
        router.push('/')
        return
      }

      try {
        // Récupérer la session depuis l'URL
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Erreur récupération session:', error)
          router.push('/')
          return
        }

        if (session) {
          console.log('✅ Connexion réussie:', session.user.email)
          // Rediriger vers la page principale
          router.push('/')
        } else {
          router.push('/')
        }
      } catch (error) {
        console.error('Erreur callback auth:', error)
        router.push('/')
      }
    }

    handleAuthCallback()
  }, [router])

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

