/**
 * Hook pour gérer l'impersonation d'utilisateur
 */
import { useState, useEffect } from 'react'
import { getAccessToken } from '../../lib/supabase'

interface ImpersonationState {
  isImpersonating: boolean
  targetUserId: string | null
  targetUserEmail: string | null
  impersonationToken: string | null
}

export function useImpersonation() {
  const [state, setState] = useState<ImpersonationState>({
    isImpersonating: false,
    targetUserId: null,
    targetUserEmail: null,
    impersonationToken: null
  })

  // Vérifier s'il y a une impersonation en cours (depuis localStorage)
  useEffect(() => {
    const stored = localStorage.getItem('admin_impersonation')
    if (stored) {
      try {
        const data = JSON.parse(stored)
        if (data.expires_at > Date.now()) {
          setState({
            isImpersonating: true,
            targetUserId: data.target_user_id,
            targetUserEmail: data.target_user_email,
            impersonationToken: data.token
          })
        } else {
          // Token expiré, nettoyer
          localStorage.removeItem('admin_impersonation')
        }
      } catch (e) {
        localStorage.removeItem('admin_impersonation')
      }
    }
  }, [])

  const startImpersonation = async (targetUserId: string) => {
    try {
      const token = await getAccessToken()
      if (!token) {
        throw new Error('Token d\'accès non disponible')
      }

      const apiUrl = window.location.origin.includes('localhost')
        ? `http://localhost:8000/api/admin/impersonate/${targetUserId}`
        : `/api/admin/impersonate/${targetUserId}`
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include' // Important pour envoyer les cookies (admin_password_verified)
      })

      if (!response.ok) {
        throw new Error('Erreur lors de la création du token d\'impersonation')
      }

      const data = await response.json()
      
      // Stocker les informations d'impersonation
      const impersonationData = {
        target_user_id: data.target_user_id,
        target_user_email: data.target_user_email,
        token: data.token || token, // Utiliser le token retourné ou le token actuel
        expires_at: data.expires_at || (Date.now() + 3600000) // 1h par défaut
      }

      localStorage.setItem('admin_impersonation', JSON.stringify(impersonationData))

      setState({
        isImpersonating: true,
        targetUserId: data.target_user_id,
        targetUserEmail: data.target_user_email,
        impersonationToken: impersonationData.token
      })

      return { success: true }
    } catch (error: any) {
      console.error('Erreur impersonation:', error)
      return { success: false, error: error.message }
    }
  }

  const stopImpersonation = () => {
    localStorage.removeItem('admin_impersonation')
    setState({
      isImpersonating: false,
      targetUserId: null,
      targetUserEmail: null,
      impersonationToken: null
    })
    // Recharger la page pour revenir au compte admin
    window.location.href = '/admin'
  }

  return {
    ...state,
    startImpersonation,
    stopImpersonation
  }
}

