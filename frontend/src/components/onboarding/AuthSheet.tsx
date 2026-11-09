/**
 * Bottom sheet: Apple / Google / email magic link + pendingAction resume.
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  authSheetTitle,
  type AuthTrigger,
  type PendingAction,
  setPendingAction,
  clearPendingAction,
  getPendingAction,
} from '@flightwatcher/shared'
import {
  signInWithApple,
  signInWithGoogle,
  signInWithOtp,
  getCurrentUser,
} from '../../lib/supabase'
import { getApiClient } from '../../utils/apiClient'
import './AuthSheet.css'

export type AuthSheetProps = {
  open: boolean
  trigger: AuthTrigger
  /** Organizer first name for invite_join title */
  inviteFirstName?: string | null
  pending?: PendingAction | null
  onClose: () => void
  /** Called after successful auth (session present). */
  onAuthenticated?: () => void
}

function track(
  event: string,
  meta?: Record<string, unknown>,
) {
  void getApiClient()
    .trackActivityEvent({
      domain: 'auth',
      event,
      surface: 'auth_sheet',
      platform: 'web',
      meta: meta || {},
    })
    .catch(() => {})
}

export function AuthSheet({
  open,
  trigger,
  inviteFirstName,
  pending,
  onClose,
  onAuthenticated,
}: AuthSheetProps) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<'apple' | 'google' | 'email' | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setEmailSent(false)
    setBusy(null)
    track('auth_sheet_opened', { trigger })
    if (pending) {
      void setPendingAction(pending)
    }
  }, [open, trigger, pending])

  const afterSuccess = useCallback(async () => {
    track('auth_succeeded', { trigger, method: busy })
    onAuthenticated?.()
    onClose()
  }, [busy, onAuthenticated, onClose, trigger])

  const runOAuth = async (method: 'apple' | 'google') => {
    setBusy(method)
    setError(null)
    track('auth_started', { trigger, method })
    const { error: err } =
      method === 'apple' ? await signInWithApple() : await signInWithGoogle()
    if (err) {
      track('auth_failed', { trigger, method, message: err.message })
      setError(err.message)
      setBusy(null)
      return
    }
    // OAuth redirects away; if still here (popup cancelled), clear busy
    const user = await getCurrentUser()
    if (user) await afterSuccess()
    else setBusy(null)
  }

  const runEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy('email')
    setError(null)
    track('auth_started', { trigger, method: 'email' })
    const { error: err } = await signInWithOtp(email)
    if (err) {
      track('auth_failed', { trigger, method: 'email', message: err.message })
      setError(err.message)
      setBusy(null)
      return
    }
    setEmailSent(true)
    setBusy(null)
  }

  if (!open) return null

  const title = authSheetTitle(trigger, { firstName: inviteFirstName })

  return (
    <div className="fw-auth-sheet-root" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="fw-auth-sheet-backdrop" aria-label="Fermer" onClick={onClose} />
      <div className="fw-auth-sheet-panel">
        <div className="fw-auth-sheet-handle" />
        <h2 className="fw-auth-sheet-title">{title}</h2>
        <p className="fw-auth-sheet-lead">Apple, Google ou un lien par e-mail — c’est tout.</p>

        <div className="fw-auth-sheet-actions">
          <button
            type="button"
            className="fw-auth-btn fw-auth-btn-apple"
            disabled={!!busy}
            onClick={() => void runOAuth('apple')}
          >
            {busy === 'apple' ? '…' : 'Continuer avec Apple'}
          </button>
          <button
            type="button"
            className="fw-auth-btn fw-auth-btn-google"
            disabled={!!busy}
            onClick={() => void runOAuth('google')}
          >
            {busy === 'google' ? '…' : 'Continuer avec Google'}
          </button>
        </div>

        <div className="fw-auth-sheet-divider">
          <span>ou</span>
        </div>

        {emailSent ? (
          <p className="fw-auth-sheet-sent">
            Lien envoyé à <strong>{email}</strong> — ouvre-le pour te connecter.
          </p>
        ) : (
          <form className="fw-auth-sheet-email" onSubmit={(ev) => void runEmail(ev)}>
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="ton@email.com"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              disabled={!!busy}
            />
            <button type="submit" className="fw-auth-btn fw-auth-btn-email" disabled={!!busy}>
              {busy === 'email' ? '…' : 'Recevoir un lien'}
            </button>
          </form>
        )}

        {error ? <p className="fw-auth-sheet-error">{error}</p> : null}

        <button type="button" className="fw-auth-sheet-dismiss" onClick={onClose}>
          Plus tard
        </button>
      </div>
    </div>
  )
}

/** Resume a stored pendingAction after auth (call from app root). */
export async function resumePendingAction(
  handlers: {
    joinInvite?: (token: string) => Promise<void>
    likeItinerary?: (id: string) => Promise<void>
    likeDeal?: (id: string) => Promise<void>
    createTrip?: (payload: Record<string, unknown>) => Promise<void>
  },
): Promise<boolean> {
  const pending = await getPendingAction()
  if (!pending) return false
  try {
    if (pending.type === 'join_invite' && handlers.joinInvite) {
      const token = String(pending.payload?.token || '')
      if (token) await handlers.joinInvite(token)
    } else if (pending.type === 'like_itinerary' && handlers.likeItinerary) {
      const id = String(pending.payload?.itineraryId || '')
      if (id) await handlers.likeItinerary(id)
    } else if (pending.type === 'like_deal' && handlers.likeDeal) {
      const id = String(pending.payload?.dealId || '')
      if (id) await handlers.likeDeal(id)
    } else if (pending.type === 'create_trip_from_parcours' && handlers.createTrip) {
      await handlers.createTrip(pending.payload || {})
    }
  } finally {
    await clearPendingAction()
  }
  return true
}
