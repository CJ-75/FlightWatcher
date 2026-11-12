/**
 * Auth admin — cookie session password (ADMIN_PASSWORD). Pas de Google requis.
 */
import { useState, useEffect, useCallback } from 'react'
import { apiUrl } from '../../utils/apiBase'

interface AdminAuthState {
  isAdmin: boolean
  loading: boolean
  user: { email?: string; mode?: string } | null
}

export function useAdminAuth(): AdminAuthState & { checkAdmin: () => Promise<void> } {
  const [state, setState] = useState<AdminAuthState>({
    isAdmin: false,
    loading: true,
    user: null,
  })

  const checkAdmin = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/api/admin/verify'), {
        credentials: 'include',
      })
      if (!response.ok) {
        setState({ isAdmin: false, loading: false, user: null })
        return
      }
      const data = await response.json()
      const ok = data.is_admin === true
      setState({
        isAdmin: ok,
        loading: false,
        user: ok ? { email: data.email || 'admin@env', mode: data.mode } : null,
      })
    } catch (error) {
      console.error('Erreur vérification admin:', error)
      setState({ isAdmin: false, loading: false, user: null })
    }
  }, [])

  useEffect(() => {
    void checkAdmin()
  }, [checkAdmin])

  return { ...state, checkAdmin }
}
