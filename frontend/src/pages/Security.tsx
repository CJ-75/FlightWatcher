/**
 * Compte → Sécurité : connexion Google/Apple + mot de passe optionnel + suppression.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { User } from '@flightwatcher/shared'
import {
  isAdminAccountEmail,
  userHasPasswordLogin,
  userNeedsPasswordSetup,
  userOauthProviderId,
  userOauthProviderLabel,
} from '@flightwatcher/shared'
import { getCurrentUser, signOut } from '../lib/supabase'
import { getApiClient } from '../utils/apiClient'
import { useI18n } from '../contexts/I18nContext'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { useShellReady } from '../hooks/useShellReady'

function ProviderMark({ id }: { id: string | null }) {
  if (id === 'apple') {
    return (
      <span
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E8D5C8] bg-[#FFF9F5] text-[17px] font-bold text-[#1A120E]"
        aria-hidden
      >
        
      </span>
    )
  }
  if (id === 'google') {
    return (
      <span
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E8D5C8] bg-[#FFF9F5]"
        aria-hidden
      >
        <img
          src="https://developers.google.com/identity/images/g-logo.png"
          alt=""
          className="h-[18px] w-[18px]"
        />
      </span>
    )
  }
  return (
    <span
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E8D5C8] bg-[#FFF9F5] text-sm font-bold text-[#4A3428]"
      aria-hidden
    >
      @
    </span>
  )
}

export default function Security() {
  const { t, language } = useI18n()
  const navigate = useNavigate()
  const shellReady = useShellReady()
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [bootLoading, setBootLoading] = useState(true)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteErr, setDeleteErr] = useState<string | null>(null)
  const [showPasswordForm, setShowPasswordForm] = useState(false)

  const deleteWord = language === 'en' ? 'DELETE' : 'SUPPRIMER'
  const needsPasswordSetup = userNeedsPasswordSetup(user)
  const hasPassword = userHasPasswordLogin(user)
  const oauthId = userOauthProviderId(user)
  const oauthProvider = userOauthProviderLabel(user)

  useEffect(() => {
    if (!shellReady) return
    void getCurrentUser()
      .then((u) => {
        if (!u) {
          navigate('/login?redirect=/security')
          return
        }
        setUser(u)
        setEmail(u.email ?? null)
        setShowPasswordForm(!userNeedsPasswordSetup(u))
      })
      .finally(() => setBootLoading(false))
  }, [shellReady, navigate])

  const signInHint = useMemo(() => {
    if (oauthId && hasPassword) {
      return t('auth.security.signInHintMixed', { provider: oauthProvider })
    }
    if (oauthId) {
      return t('auth.security.signInHintOauth', { provider: oauthProvider })
    }
    return t('auth.security.signInHintEmail')
  }, [oauthId, hasPassword, oauthProvider, t])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg(null)
    setErr(null)
    if (newPassword.length < 8) {
      setErr(t('auth.security.passwordTooShort'))
      return
    }
    if (newPassword !== confirm) {
      setErr(t('auth.security.passwordMismatch'))
      return
    }
    setBusy(true)
    try {
      await getApiClient().changePassword({
        current_password: needsPasswordSetup ? '' : currentPassword,
        new_password: newPassword,
      })
      setMsg(t('auth.security.passwordUpdated'))
      setCurrentPassword('')
      setNewPassword('')
      setConfirm('')
      setUser((prev) =>
        prev
          ? {
              ...prev,
              app_metadata: {
                ...(prev.app_metadata || {}),
                providers: Array.from(
                  new Set([
                    ...((prev.app_metadata?.providers as string[]) || []),
                    'email',
                  ]),
                ),
              },
            }
          : prev,
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('auth.security.changeError'))
    } finally {
      setBusy(false)
    }
  }

  const onDelete = () => {
    if (!window.confirm(t('auth.security.deletePopup'))) return
    void (async () => {
      setDeleteErr(null)
      setDeleting(true)
      try {
        await getApiClient().deleteAccount({ confirm: deleteWord })
        await signOut()
        navigate('/login', { replace: true })
      } catch (e) {
        setDeleteErr(
          e instanceof Error ? e.message : t('auth.security.deleteError'),
        )
      } finally {
        setDeleting(false)
      }
    })()
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FFF9F5]">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 h-80 w-80 rounded-full bg-[#FF6B35]/15 blur-3xl"
      />
      <div className="relative mx-auto max-w-lg px-4 py-8 sm:py-12">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/vols" className="text-sm font-bold text-[#E85A28]">
            ← {t('login.back')}
          </Link>
          <LanguageSwitcher />
        </div>

        <div className="space-y-5">
          <div>
            <p className="app-kicker mb-2">{t('auth.security.title')}</p>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">
              {t('auth.security.pageTitle')}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {t('auth.security.subtitle')}
            </p>
          </div>

          {bootLoading || !shellReady ? (
            <div className="space-y-4 animate-pulse" aria-busy>
              <div className="h-28 rounded-2xl border border-orange-100 bg-orange-50" />
              <div className="h-36 rounded-2xl border border-orange-100 bg-white" />
              <div className="h-32 rounded-2xl border border-rose-100 bg-rose-50/60" />
            </div>
          ) : (
            <>
              {isAdminAccountEmail(email) ? (
                <section className="app-card space-y-3 border border-[#FFDCC8] bg-gradient-to-br from-[#FFF3EC] to-white p-5 sm:p-6">
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#E85A28]">
                    Administration
                  </p>
                  <p className="text-sm text-muted">
                    Accès console admin (inscrits, parcours, ops).
                  </p>
                  <Link
                    to="/admin/login"
                    className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-[#FF6B35] to-[#E85A28] px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(255,107,53,0.28)]"
                  >
                    Ouvrir l’admin →
                  </Link>
                </section>
              ) : null}

              {/* Connexion */}
              <section className="app-card space-y-3 p-5 sm:p-6">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#C4A794]">
                  {t('auth.security.signInSection')}
                </p>
                <div className="flex items-center gap-3">
                  <ProviderMark id={oauthId} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-ink">
                      {oauthId
                        ? t('auth.security.signInWith', {
                            provider: oauthProvider,
                          })
                        : t('auth.security.signInEmail')}
                    </p>
                    {email ? (
                      <p className="truncate text-sm text-muted">{email}</p>
                    ) : null}
                  </div>
                  {oauthId ? (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                      {t('auth.security.active')}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm leading-relaxed text-muted">{signInHint}</p>
              </section>

              {/* Mot de passe */}
              <section className="app-card space-y-3 p-5 sm:p-6">
                <h2 className="text-base font-bold text-ink">
                  {needsPasswordSetup
                    ? t('auth.security.setPassword')
                    : t('auth.security.changePassword')}
                </h2>
                <p className="text-sm leading-relaxed text-muted">
                  {needsPasswordSetup
                    ? t('auth.security.setPasswordHint', {
                        provider: oauthProvider,
                      })
                    : t('auth.security.changePasswordHint')}
                </p>

                {needsPasswordSetup && !showPasswordForm ? (
                  <button
                    type="button"
                    onClick={() => setShowPasswordForm(true)}
                    className="inline-flex items-center rounded-full border border-[#E5CBB8] bg-[#FFF9F5] px-4 py-2.5 text-sm font-semibold text-ink hover:bg-white"
                  >
                    {t('auth.security.setPassword')}
                  </button>
                ) : (
                  <form
                    onSubmit={(e) => void submit(e)}
                    className="space-y-3 pt-1"
                  >
                    {!needsPasswordSetup ? (
                      <label className="block space-y-1.5">
                        <span className="text-sm font-bold text-slate-800">
                          {t('auth.security.currentPassword')}
                        </span>
                        <input
                          type="password"
                          autoComplete="current-password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="w-full rounded-2xl border border-orange-200 bg-white px-4 py-3 text-sm font-medium focus:border-[#FF6B35] focus:ring-2 focus:ring-orange-200"
                        />
                      </label>
                    ) : null}
                    <label className="block space-y-1.5">
                      <span className="text-sm font-bold text-slate-800">
                        {t('auth.security.newPassword')}
                      </span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full rounded-2xl border border-orange-200 bg-white px-4 py-3 text-sm font-medium focus:border-[#FF6B35] focus:ring-2 focus:ring-orange-200"
                        minLength={8}
                        required
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-sm font-bold text-slate-800">
                        {t('auth.security.confirmPassword')}
                      </span>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        className="w-full rounded-2xl border border-orange-200 bg-white px-4 py-3 text-sm font-medium focus:border-[#FF6B35] focus:ring-2 focus:ring-orange-200"
                        minLength={8}
                        required
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={busy}
                      className="app-btn-primary rounded-2xl px-5 py-3 text-sm disabled:opacity-60"
                    >
                      {busy
                        ? t('auth.security.saving')
                        : t('auth.security.savePassword')}
                    </button>
                    {msg ? (
                      <p className="text-sm font-medium text-emerald-700">{msg}</p>
                    ) : null}
                    {err ? (
                      <p className="text-sm font-medium text-red-600">{err}</p>
                    ) : null}
                  </form>
                )}
              </section>

              {/* Suppression */}
              <section className="space-y-3 rounded-2xl border border-rose-200 bg-[#FFF8F8] p-5 sm:p-6">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-rose-600">
                  {t('auth.security.dangerZone')}
                </p>
                <h2 className="text-base font-bold text-ink">
                  {t('auth.security.deleteTitle')}
                </h2>
                <p className="text-sm leading-relaxed text-muted">
                  {t('auth.security.deleteHint')}
                </p>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={onDelete}
                  className="mt-1 flex w-full min-h-[48px] items-center justify-center rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                >
                  {deleting
                    ? t('auth.security.deleteBusy')
                    : t('auth.security.deleteButton')}
                </button>
                {deleteErr ? (
                  <p className="text-sm font-medium text-red-600">{deleteErr}</p>
                ) : null}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
