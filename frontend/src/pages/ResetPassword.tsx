/**
 * Landing after Resend / Supabase recovery link — set a new password.
 */
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getSupabaseClient, updatePassword } from '../lib/supabase'
import { getApiClient } from '../utils/apiClient'
import { useI18n } from '../contexts/I18nContext'
import { LanguageSwitcher } from '../components/LanguageSwitcher'

export default function ResetPassword() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const boot = async () => {
      const supabase = await getSupabaseClient()
      if (!supabase) {
        setError(t('auth.security.supabaseMissing'))
        return
      }
      // Recovery tokens may be in hash (implicit) or exchanged via detectSessionInUrl
      if (window.location.hash.includes('access_token')) {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        const access_token = hash.get('access_token')
        const refresh_token = hash.get('refresh_token')
        if (access_token && refresh_token) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          })
          if (setErr) {
            setError(setErr.message)
            return
          }
        }
      }
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        setError(t('auth.security.linkInvalid'))
        return
      }
      setReady(true)
    }
    void boot()
  }, [t])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError(t('auth.security.passwordTooShort'))
      return
    }
    if (password !== confirm) {
      setError(t('auth.security.passwordMismatch'))
      return
    }
    setBusy(true)
    const { error: err } = await updatePassword(password)
    if (err) {
      setBusy(false)
      setError(err.message)
      return
    }
    try {
      await getApiClient().notifyPasswordChanged()
    } catch {
      // Password already updated — confirmation email is best-effort
    }
    setBusy(false)
    setDone(true)
    setTimeout(() => navigate('/vols'), 1800)
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FFF9F5]">
      <div className="relative max-w-md mx-auto px-4 py-10 sm:py-16">
        <div className="flex items-center justify-between mb-8">
          <Link to="/vols" className="text-sm font-bold text-[#E85A28]">
            {t('login.back')}
          </Link>
          <LanguageSwitcher />
        </div>

        <div className="app-card p-6 sm:p-8 space-y-5">
          <div>
            <p className="app-kicker mb-2">{t('auth.security.title')}</p>
            <h1 className="text-2xl font-extrabold text-ink tracking-tight">
              {t('auth.security.newPasswordTitle')}
            </h1>
            <p className="mt-2 text-sm text-muted">{t('auth.security.newPasswordHint')}</p>
          </div>

          {done ? (
            <p className="text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
              {t('auth.security.passwordUpdated')}
            </p>
          ) : !ready && !error ? (
            <div className="flex justify-center py-8">
              <div className="w-9 h-9 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
            </div>
          ) : error && !ready ? (
            <p className="text-sm font-medium text-red-600">{error}</p>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-sm font-bold text-slate-800">
                  {t('auth.security.newPassword')}
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-orange-200 px-4 py-3 text-sm font-medium focus:border-[#FF6B35] focus:ring-2 focus:ring-orange-200"
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
                  className="w-full rounded-2xl border border-orange-200 px-4 py-3 text-sm font-medium focus:border-[#FF6B35] focus:ring-2 focus:ring-orange-200"
                  minLength={8}
                  required
                />
              </label>
              {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
              <button
                type="submit"
                disabled={busy}
                className="w-full app-btn-primary rounded-2xl py-3.5 disabled:opacity-60"
              >
                {busy ? '…' : t('auth.security.savePassword')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
