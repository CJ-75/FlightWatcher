/**
 * Log as — session admin + ouverture magic link utilisateur.
 */
import { useCallback, useEffect, useState } from 'react'
import { AdminApiError, adminApi } from '../api/adminApi'

const LS_KEY = 'admin_impersonation'

interface ImpersonationState {
  isImpersonating: boolean
  targetUserId: string | null
  targetUserEmail: string | null
  actionLink: string | null
}

function readStored(): ImpersonationState | null {
  try {
    const stored = localStorage.getItem(LS_KEY)
    if (!stored) return null
    const data = JSON.parse(stored)
    const expMs =
      typeof data.expires_at === 'number'
        ? data.expires_at > 1e12
          ? data.expires_at
          : data.expires_at * 1000
        : 0
    if (expMs && expMs < Date.now()) {
      localStorage.removeItem(LS_KEY)
      return null
    }
    return {
      isImpersonating: true,
      targetUserId: data.target_user_id || null,
      targetUserEmail: data.target_user_email || null,
      actionLink: data.action_link || null,
    }
  } catch {
    localStorage.removeItem(LS_KEY)
    return null
  }
}

export function useImpersonation() {
  const [state, setState] = useState<ImpersonationState>({
    isImpersonating: false,
    targetUserId: null,
    targetUserEmail: null,
    actionLink: null,
  })

  useEffect(() => {
    const local = readStored()
    if (local) setState(local)
  }, [])

  const startImpersonation = useCallback(async (targetUserId: string) => {
    try {
      const data = await adminApi.impersonate(targetUserId)
      if (!data.action_link) {
        throw new Error('Lien de connexion manquant')
      }
      const expiresAt =
        typeof data.expires_at === 'number'
          ? data.expires_at > 1e12
            ? data.expires_at
            : data.expires_at * 1000
          : Date.now() + (data.ttl_sec || 900) * 1000

      const payload = {
        target_user_id: data.target_user_id,
        target_user_email: data.target_user_email,
        action_link: data.action_link,
        expires_at: expiresAt,
      }
      localStorage.setItem(LS_KEY, JSON.stringify(payload))
      setState({
        isImpersonating: true,
        targetUserId: data.target_user_id,
        targetUserEmail: data.target_user_email || null,
        actionLink: data.action_link,
      })

      // Ouvre l’app en tant que l’utilisateur (admin reste ouvert)
      window.open(data.action_link, '_blank', 'noopener,noreferrer')
      return { success: true as const, email: data.target_user_email }
    } catch (error) {
      const message =
        error instanceof AdminApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Log as impossible'
      return { success: false as const, error: message, status: error instanceof AdminApiError ? error.status : 0 }
    }
  }, [])

  const stopImpersonation = useCallback(async () => {
    try {
      await adminApi.stopImpersonate()
    } catch {
      /* ignore */
    }
    localStorage.removeItem(LS_KEY)
    setState({
      isImpersonating: false,
      targetUserId: null,
      targetUserEmail: null,
      actionLink: null,
    })
  }, [])

  const reopenLink = useCallback(() => {
    if (state.actionLink) {
      window.open(state.actionLink, '_blank', 'noopener,noreferrer')
    }
  }, [state.actionLink])

  return {
    ...state,
    startImpersonation,
    stopImpersonation,
    reopenLink,
  }
}
