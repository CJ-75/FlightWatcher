/**
 * Compte → Sécurité : mot de passe, légal, suppression de compte.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getCurrentUser, signOut } from '../lib/supabase'
import { getApiClient } from '../utils/apiClient'
import { useI18n } from '../contexts/I18nContext'
import { LanguageSwitcher } from '../components/LanguageSwitcher'

export default function Security() {
  const { t, language } = useI18n()
  const navigate = useNavigate()
  const [email, setEmail] = useState<string | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteErr, setDeleteErr] = useState<string | null>(null)

  const deleteWord = language === 'en' ? 'DELETE' : 'SUPPRIMER'

  useEffect(() => {
    void getCurrentUser().then((u) => {
      if (!u) {
        navigate('/login?redirect=/security')
        return
      }
      setEmail(u.email ?? null)
    })
  }, [navigate])

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
        current_password: currentPassword,
        new_password: newPassword,
      })
      setMsg(t('auth.security.passwordUpdated'))
      setCurrentPassword('')
      setNewPassword('')
      setConfirm('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('auth.security.changeError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FFF9F5]">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 w-80 h-80 rounded-full bg-[#FF6B35]/15 blur-3xl"
      />
      <div className="relative max-w-lg mx-auto px-4 py-8 sm:py-12">
        <div className="flex items-center justify-between mb-8">
          <Link to="/vols" className="text-sm font-bold text-[#E85A28]">
            ← {t('login.back')}
          </Link>
          <LanguageSwitcher />
        </div>

        <div className="app-card p-6 sm:p-8 space-y-6">
          <div>
            <p className="app-kicker mb-2">{t('auth.security.title')}</p>
            <h1 className="text-2xl font-extrabold text-ink tracking-tight">
              {t('auth.security.pageTitle')}
            </h1>
            {email ? (
              <p className="mt-2 text-sm text-muted">{email}</p>
            ) : null}
          </div>

          <form
            onSubmit={(e) => void submit(e)}
            className="rounded-2xl border border-orange-100 bg-[#FFF8F3] px-4 py-4 space-y-3"
          >
            <h2 className="font-bold text-slate-900">
              {t('auth.security.changePassword')}
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              {t('auth.security.changePasswordHint')}
            </p>
            <p className="text-xs text-slate-500">{t('auth.security.oauthHint')}</p>

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
              {busy ? t('auth.security.saving') : t('auth.security.savePassword')}
            </button>
            {msg ? (
              <p className="text-sm font-medium text-emerald-700">{msg}</p>
            ) : null}
            {err ? (
              <p className="text-sm font-medium text-red-600">{err}</p>
            ) : null}
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 space-y-2">
            <p className="text-xs font-black uppercase tracking-wider text-slate-400">
              Légal
            </p>
            <div className="flex flex-wrap gap-3 text-sm font-bold">
              <Link to="/privacy" className="text-primary-600 hover:underline">
                {t('auth.security.legalPrivacy')}
              </Link>
              <Link to="/terms" className="text-primary-600 hover:underline">
                {t('auth.security.legalTerms')}
              </Link>
              <Link to="/legal" className="text-primary-600 hover:underline">
                {t('auth.security.legalMentions')}
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-rose-200 bg-rose-50/60 px-4 py-4 space-y-3">
            <h2 className="font-bold text-rose-950">
              {t('auth.security.deleteTitle')}
            </h2>
            <p className="text-sm text-rose-900/80 leading-relaxed">
              {t('auth.security.deleteHint')}
            </p>
            <p className="text-xs text-rose-800/80">
              {t('auth.security.deleteConfirm')}
            </p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={deleteWord}
              autoComplete="off"
              className="w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-medium focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
            />
            <button
              type="button"
              disabled={
                deleting || deleteConfirm.trim().toUpperCase() !== deleteWord
              }
              onClick={() => {
                void (async () => {
                  setDeleteErr(null)
                  setDeleting(true)
                  try {
                    await getApiClient().deleteAccount({ confirm: deleteWord })
                    await signOut()
                    navigate('/login', { replace: true })
                  } catch (e) {
                    setDeleteErr(
                      e instanceof Error
                        ? e.message
                        : t('auth.security.deleteError'),
                    )
                  } finally {
                    setDeleting(false)
                  }
                })()
              }}
              className="w-full rounded-2xl border border-rose-300 bg-white px-5 py-3 text-sm font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50 min-h-[44px]"
            >
              {deleting
                ? t('auth.security.deleteBusy')
                : t('auth.security.deleteButton')}
            </button>
            {deleteErr ? (
              <p className="text-sm font-medium text-red-600">{deleteErr}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
