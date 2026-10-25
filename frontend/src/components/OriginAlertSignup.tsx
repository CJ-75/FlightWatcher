import { useState, type FormEvent } from 'react'
import { getApiClient } from '../utils/apiClient'
import { useI18n } from '../contexts/I18nContext'

type Props = {
  originIata: string
  originLabel: string
}

export function OriginAlertSignup({ originIata, originLabel }: Props) {
  const { t, language } = useI18n()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!originIata) return null

  const city = originLabel || originIata.split(',')[0] || 'ton aéroport'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await getApiClient().signupOriginAlert({
        email: email.trim(),
        origin_iata: originIata,
        origin_label: city,
        locale: language === 'en' ? 'en' : 'fr',
      })
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('app.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-3xl border border-primary-100 bg-gradient-to-br from-primary-50 to-white p-5 sm:p-6 shadow-soft col-span-full">
      <p className="text-lg font-extrabold text-ink tracking-tight">
        {t('deals.alertTitle', { city })}
      </p>
      <p className="text-sm text-muted mt-1.5 max-w-xl">{t('deals.alertHint')}</p>
      {done ? (
        <p className="mt-4 text-sm font-bold text-emerald-700">{t('deals.alertDone')}</p>
      ) : (
        <form
          onSubmit={(e) => void submit(e)}
          className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-stretch max-w-lg"
        >
          <label className="sr-only" htmlFor="fw-origin-alert-email">
            {t('deals.alertEmail')}
          </label>
          <input
            id="fw-origin-alert-email"
            type="email"
            required
            autoComplete="email"
            placeholder={t('deals.alertEmail')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded-2xl border border-line bg-white px-4 py-3 text-sm font-medium text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary-300"
          />
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="rounded-2xl bg-primary-500 hover:bg-primary-600 text-white font-bold text-sm px-5 py-3 disabled:opacity-60 shrink-0"
          >
            {busy ? '…' : t('deals.alertCta')}
          </button>
        </form>
      )}
      {error ? <p className="text-xs text-red-600 mt-2 font-medium">{error}</p> : null}
    </div>
  )
}
