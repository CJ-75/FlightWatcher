/**
 * Bottom sheet: Google / Apple / Email — login=password, signup=OTP.
 * Aligned with Next AuthLightbox + Expo AuthSheet (authContract).
 */
import React, { useCallback, useEffect, useState } from 'react'
import {
  authSheetTitle,
  friendlyAuthError,
  type AuthTrigger,
  type PendingAction,
  setPendingAction,
  clearPendingAction,
  getPendingAction,
} from '@waypop/shared'
import {
  signInWithApple,
  signInWithGoogle,
  signInWithOtp,
  signInWithEmail,
  getCurrentUser,
} from '../../lib/supabase'
import { getApiClient } from '../../utils/apiClient'
import './AuthSheet.css'

export type AuthSheetProps = {
  open: boolean
  trigger: AuthTrigger
  inviteFirstName?: string | null
  pending?: PendingAction | null
  onClose: () => void
  onAuthenticated?: () => void
}

type Step = 'providers' | 'email'
type EmailMode = 'login' | 'signup'
type Busy = 'apple' | 'google' | 'email' | null

function track(event: string, meta?: Record<string, unknown>) {
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
  const [step, setStep] = useState<Step>('providers')
  const [mode, setMode] = useState<EmailMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setStep('providers')
    setMode('login')
    setError(null)
    setEmailSent(false)
    setBusy(null)
    setEmail('')
    setPassword('')
    setShowPassword(false)
    track('auth_sheet_opened', { trigger })
    if (pending) void setPendingAction(pending)
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
      setError(friendlyAuthError(err.message))
      setBusy(null)
      return
    }
    const user = await getCurrentUser()
    if (user) await afterSuccess()
    else setBusy(null)
  }

  const runEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy('email')
    setError(null)
    track('auth_started', {
      trigger,
      method: mode === 'login' ? 'email_password' : 'email_otp',
    })

    if (mode === 'login') {
      const { error: err } = await signInWithEmail(email, password)
      if (err) {
        track('auth_failed', { trigger, method: 'email_password', message: err.message })
        setError(friendlyAuthError(err.message))
        setBusy(null)
        return
      }
      await afterSuccess()
      return
    }

    const { error: err } = await signInWithOtp(email)
    if (err) {
      track('auth_failed', { trigger, method: 'email_otp', message: err.message })
      setError(friendlyAuthError(err.message))
      setBusy(null)
      return
    }
    setEmailSent(true)
    setBusy(null)
  }

  if (!open) return null

  const title = authSheetTitle(trigger, { firstName: inviteFirstName })
  const lead =
    step === 'providers'
      ? 'Connecte-toi pour lancer — Apple, Google ou email.'
      : mode === 'login'
        ? 'Ton email et ton mot de passe, et c’est reparti.'
        : 'On t’envoie un lien magique — pas de mot de passe à retenir.'

  return (
    <div className="fw-auth-sheet-root" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="fw-auth-sheet-backdrop" aria-label="Fermer" onClick={onClose} />
      <div className="fw-auth-sheet-panel">
        <div className="fw-auth-sheet-handle" />
        <p className="fw-auth-sheet-brand">Waypop</p>
        <h2 className="fw-auth-sheet-title">{title}</h2>
        <p className="fw-auth-sheet-lead">{lead}</p>

        {step === 'providers' ? (
          <div className="fw-auth-sheet-actions">
            <button
              type="button"
              className="fw-auth-btn fw-auth-btn-google"
              disabled={!!busy}
              onClick={() => void runOAuth('google')}
            >
              {busy === 'google' ? '…' : 'Continuer avec Google'}
            </button>
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
              className="fw-auth-btn fw-auth-btn-email"
              disabled={!!busy}
              onClick={() => {
                setError(null)
                setStep('email')
              }}
            >
              Continuer avec Email
            </button>
          </div>
        ) : (
          <div className="fw-auth-sheet-email-step">
            <button
              type="button"
              className="fw-auth-sheet-back"
              onClick={() => {
                setEmailSent(false)
                setError(null)
                setStep('providers')
              }}
            >
              ← Autres options
            </button>

            {emailSent ? (
              <p className="fw-auth-sheet-sent">
                Lien envoyé à <strong>{email}</strong> — ouvre-le pour activer ton compte.
              </p>
            ) : (
              <>
                <div className="fw-auth-sheet-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'login'}
                    className={mode === 'login' ? 'is-active' : ''}
                    onClick={() => {
                      setMode('login')
                      setError(null)
                    }}
                  >
                    Connexion
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'signup'}
                    className={mode === 'signup' ? 'is-active' : ''}
                    onClick={() => {
                      setMode('signup')
                      setError(null)
                      setPassword('')
                    }}
                  >
                    Inscription
                  </button>
                </div>

                <form className="fw-auth-sheet-email" onSubmit={(ev) => void runEmail(ev)}>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="toi@email.com"
                    value={email}
                    onChange={(ev) => setEmail(ev.target.value)}
                    disabled={!!busy}
                  />
                  {mode === 'login' ? (
                    <div className="fw-auth-sheet-password-wrap">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        autoComplete="current-password"
                        placeholder="Mot de passe"
                        value={password}
                        onChange={(ev) => setPassword(ev.target.value)}
                        disabled={!!busy}
                      />
                      <button
                        type="button"
                        className="fw-auth-sheet-peek"
                        onClick={() => setShowPassword((v) => !v)}
                        tabIndex={-1}
                      >
                        {showPassword ? 'Cacher' : 'Voir'}
                      </button>
                    </div>
                  ) : (
                    <p className="fw-auth-sheet-hint">
                      Pas de mot de passe : tu reçois un lien pour confirmer.
                    </p>
                  )}
                  <button type="submit" className="fw-auth-btn fw-auth-btn-submit" disabled={!!busy}>
                    {busy === 'email'
                      ? '…'
                      : mode === 'login'
                        ? 'Se connecter'
                        : 'Recevoir mon lien'}
                  </button>
                </form>
              </>
            )}
          </div>
        )}

        {error ? <p className="fw-auth-sheet-error">{error}</p> : null}

        {step === 'providers' ? (
          <button type="button" className="fw-auth-sheet-dismiss" onClick={onClose}>
            Plus tard
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** Resume a stored pendingAction after auth (call from app root). */
export async function resumePendingAction(handlers: {
  joinInvite?: (token: string) => Promise<void>
  likeItinerary?: (id: string) => Promise<void>
  likeDeal?: (id: string) => Promise<void>
  createTrip?: (payload: Record<string, unknown>) => Promise<void>
}): Promise<boolean> {
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
