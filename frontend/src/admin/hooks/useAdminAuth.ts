/**
 * Hook pour l'authentification admin
 */
import { useState, useEffect } from 'react'
import { getCurrentUser, getAccessToken } from '../../lib/supabase'

interface AdminAuthState {
  isAdmin: boolean
  loading: boolean
  user: any | null
}

export function useAdminAuth(): AdminAuthState & { checkAdmin: () => Promise<void> } {
  const [state, setState] = useState<AdminAuthState>({
    isAdmin: false,
    loading: true,
    user: null
  })

  const checkAdmin = async () => {
    try {
      const user = await getCurrentUser()
      if (!user) {
        setState({ isAdmin: false, loading: false, user: null })
        return
      }

      const token = await getAccessToken()
      if (!token) {
        setState({ isAdmin: false, loading: false, user })
        return
      }

      // Vérifier le statut admin via l'API
      const apiUrl = window.location.origin.includes('localhost') 
        ? 'http://localhost:8000/api/admin/verify'
        : '/api/admin/verify'
      
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include' // Important pour envoyer les cookies (admin_password_verified)
      })

      if (response.ok) {
        const data = await response.json()
        // Vérifier si l'email est admin (même si le mot de passe n'est pas encore vérifié)
        const isAdminEmail = data.is_admin_email === true || data.requires_password === true
        setState({ isAdmin: isAdminEmail, loading: false, user })
      } else {
        setState({ isAdmin: false, loading: false, user })
      }
    } catch (error) {
      console.error('Erreur vérification admin:', error)
      setState({ isAdmin: false, loading: false, user: null })
    }
  }

  useEffect(() => {
    checkAdmin()
  }, [])

  return { ...state, checkAdmin }
}

