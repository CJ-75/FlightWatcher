'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import {
  authSheetTitle,
  friendlyAuthError,
  setPendingAction,
  type AuthTrigger,
  type PendingAction,
} from '@waypop/shared'
import { auth, stashAuthReturn } from '@/lib/auth'

export type AuthLightboxProps = {
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

export function AuthLightbox({
  open,
  trigger,
  inviteFirstName,
  pending,
  onClose,
  onAuthenticated,
}: AuthLightboxProps) {
  const titleId = useId()
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
    if (pending) void setPendingAction(pending)
  }, [open, pending])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (step === 'email' && !emailSent) setStep('providers')
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose, step, emailSent])

  const afterSuccess = useCallback(() => {
    onAuthenticated?.()
    onClose()
  }, [onAuthenticated, onClose])

  const runOAuth = async (method: 'apple' | 'google') => {
    setBusy(method)
    setError(null)
    stashAuthReturn()
    const { error: err } =
      method === 'apple'
        ? await auth.signInWithApple()
        : await auth.signInWithGoogle()
    if (err) {
      setError(friendlyAuthError(err.message))
      setBusy(null)
      return
    }
    const user = await auth.getCurrentUser()
    if (user) afterSuccess()
    else setBusy(null)
  }

  const runEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy('email')
    setError(null)
    stashAuthReturn()

    if (mode === 'login') {
      const { error: err } = await auth.signInWithEmail(email, password)
      if (err) {
        setError(friendlyAuthError(err.message))
        setBusy(null)
        return
      }
      afterSuccess()
      return
    }

    // Inscription — magic link (Supabase + Resend SMTP)
    const { error: err } = await auth.signInWithOtp(email)
    if (err) {
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
      ? 'Choisis comment tu veux continuer — en un geste.'
      : mode === 'login'
        ? 'Ton email et ton mot de passe, et c’est reparti.'
        : 'On t’envoie un lien magique — pas de mot de passe à retenir.'

  return (
    <div
      className="wp-auth-root fixed inset-0 z-[12000] flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="wp-auth-backdrop absolute inset-0 cursor-pointer border-0"
        aria-label="Fermer"
        onClick={onClose}
      />

      <div className="wp-auth-panel relative w-full max-w-[420px] overflow-hidden rounded-t-[28px] sm:rounded-[28px]">
        <div className="wp-auth-glow" aria-hidden />
        <div className="relative px-6 pb-[calc(1.35rem+env(safe-area-inset-bottom,0px))] pt-4 sm:px-7 sm:pb-7 sm:pt-6">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink/15 sm:hidden" />

          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-accent">
                Waypop
              </p>
              <h2
                id={titleId}
                className="mt-1.5 text-[1.45rem] font-extrabold leading-[1.15] tracking-[-0.03em] text-ink sm:text-[1.55rem]"
              >
                {title}
              </h2>
              <p className="mt-2 text-[0.9rem] leading-snug text-ink-muted">{lead}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full bg-ink/[0.04] p-2.5 text-ink/55 transition hover:bg-ink/[0.08] hover:text-ink"
              aria-label="Fermer"
            >
              <CloseIcon />
            </button>
          </div>

          {step === 'providers' ? (
            <div className="wp-auth-step flex flex-col gap-2.5">
              <ProviderButton
                label={busy === 'google' ? 'Connexion…' : 'Continuer avec Google'}
                disabled={!!busy}
                onClick={() => void runOAuth('google')}
                icon={<GoogleIcon />}
              />
              <ProviderButton
                label={busy === 'apple' ? 'Connexion…' : 'Continuer avec Apple'}
                disabled={!!busy}
                onClick={() => void runOAuth('apple')}
                icon={<AppleIcon />}
              />
              <ProviderButton
                label="Continuer avec Email"
                disabled={!!busy}
                onClick={() => {
                  setError(null)
                  setStep('email')
                }}
                icon={<EmailIcon />}
                accent
              />
            </div>
          ) : (
            <div className="wp-auth-step">
              <button
                type="button"
                onClick={() => {
                  setEmailSent(false)
                  setError(null)
                  setStep('providers')
                }}
                className="mb-4 inline-flex items-center gap-1.5 text-[0.82rem] font-semibold text-ink-muted transition hover:text-ink"
              >
                <BackIcon />
                Autres options
              </button>

              {emailSent ? (
                <div className="rounded-2xl border border-line bg-white/80 px-4 py-5 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <MailSentIcon />
                  </div>
                  <p className="text-[0.95rem] font-bold text-ink">Lien envoyé</p>
                  <p className="mt-2 text-[0.88rem] leading-snug text-ink-muted">
                    Ouvre le message envoyé à{' '}
                    <span className="font-semibold text-ink">{email}</span> pour
                    activer ton compte.
                  </p>
                  <button
                    type="button"
                    className="mt-4 text-[0.82rem] font-semibold text-accent hover:underline"
                    onClick={() => {
                      setEmailSent(false)
                      setBusy(null)
                    }}
                  >
                    Renvoyer / changer d’email
                  </button>
                </div>
              ) : (
                <>
                  <div
                    className="mb-4 grid grid-cols-2 rounded-2xl bg-ink/[0.04] p-1"
                    role="tablist"
                    aria-label="Connexion ou inscription"
                  >
                    <ModeTab
                      active={mode === 'login'}
                      onClick={() => {
                        setMode('login')
                        setError(null)
                      }}
                      label="Connexion"
                    />
                    <ModeTab
                      active={mode === 'signup'}
                      onClick={() => {
                        setMode('signup')
                        setError(null)
                        setPassword('')
                      }}
                      label="Inscription"
                    />
                  </div>

                  <form onSubmit={(ev) => void runEmail(ev)} className="space-y-3">
                    <label className="block">
                      <span className="mb-1.5 block text-[0.75rem] font-bold uppercase tracking-[0.06em] text-ink-muted">
                        Email
                      </span>
                      <input
                        type="email"
                        required
                        autoComplete="email"
                        autoFocus
                        placeholder="toi@email.com"
                        value={email}
                        onChange={(ev) => setEmail(ev.target.value)}
                        disabled={!!busy}
                        className="wp-auth-input"
                      />
                    </label>

                    {mode === 'login' ? (
                      <label className="block">
                        <span className="mb-1.5 block text-[0.75rem] font-bold uppercase tracking-[0.06em] text-ink-muted">
                          Mot de passe
                        </span>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            minLength={6}
                            autoComplete="current-password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(ev) => setPassword(ev.target.value)}
                            disabled={!!busy}
                            className="wp-auth-input pr-12"
                          />
                          <button
                            type="button"
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1.5 text-[0.75rem] font-semibold text-ink-muted hover:text-ink"
                            onClick={() => setShowPassword((v) => !v)}
                            tabIndex={-1}
                          >
                            {showPassword ? 'Cacher' : 'Voir'}
                          </button>
                        </div>
                      </label>
                    ) : (
                      <p className="rounded-xl bg-accent-soft/70 px-3.5 py-3 text-[0.84rem] leading-snug text-ink/80">
                        Pas de mot de passe : tu reçois un lien pour confirmer
                        et entrer directement.
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={!!busy}
                      className="wp-auth-submit"
                    >
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

          {error ? (
            <p
              className="mt-3 rounded-xl border border-[#f0c7c0] bg-[#fff5f3] px-3.5 py-2.5 text-[0.84rem] text-[#9b2c1f]"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          {step === 'providers' ? (
            <button
              type="button"
              onClick={onClose}
              className="mt-5 block w-full border-0 bg-transparent py-2 text-center text-[0.86rem] font-medium text-ink-muted transition hover:text-ink"
            >
              Plus tard
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function ProviderButton({
  label,
  icon,
  onClick,
  disabled,
  accent,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  accent?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        accent
          ? 'flex w-full items-center justify-center gap-2.5 rounded-2xl border border-transparent bg-ink px-4 py-3.5 text-center text-[0.95rem] font-semibold text-cream shadow-[0_12px_28px_rgba(29,27,25,0.22)] transition enabled:hover:bg-accent enabled:active:scale-[0.985] disabled:cursor-wait disabled:opacity-55'
          : 'flex w-full items-center justify-center gap-2.5 rounded-2xl border border-line bg-white/90 px-4 py-3.5 text-center text-[0.95rem] font-semibold text-ink transition enabled:hover:border-ink/20 enabled:hover:bg-white enabled:active:scale-[0.985] disabled:cursor-wait disabled:opacity-55'
      }
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  )
}

function ModeTab({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        active
          ? 'rounded-xl bg-white px-3 py-2.5 text-[0.88rem] font-bold text-ink shadow-soft'
          : 'rounded-xl px-3 py-2.5 text-[0.88rem] font-semibold text-ink-muted transition hover:text-ink'
      }
    >
      {label}
    </button>
  )
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.7 12.6c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.2-1.7-1.3-.1-2.6.8-3.3.8-.7 0-1.8-.8-3-.7-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-.1 3-2.3.7-1.1 1-2.1 1-2.2-.1 0-2.1-.8-2.1-3.1zM14.4 5.9c.6-.8 1.1-1.9.9-3-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.8-.9 2.9 1 .1 2-.5 2.6-1.3z" />
    </svg>
  )
}

function EmailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M4 7.5l7.2 5.1a1.4 1.4 0 0 0 1.6 0L20 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function MailSentIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7.5l7.2 5.1a1.4 1.4 0 0 0 1.6 0L20 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M15.5 3.5l2 2 3.5-3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
