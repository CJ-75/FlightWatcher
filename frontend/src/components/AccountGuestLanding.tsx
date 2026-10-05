import { useState } from 'react'
import { motion } from 'framer-motion'
import { signInWithGoogle } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'

type Props = {
  onStartSignIn?: () => void
}

export function AccountGuestLanding({ onStartSignIn }: Props) {
  const { t } = useI18n()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onCta = async () => {
    setError(null)
    setSigningIn(true)
    onStartSignIn?.()
    const { error: err } = await signInWithGoogle()
    if (err) {
      setError(err.message)
      setSigningIn(false)
    }
  }

  return (
    <div className="relative max-w-md mx-auto px-1 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -right-12 w-56 h-56 rounded-full bg-[#FF6B35]/12 blur-3xl"
      />

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative text-center"
      >
        <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#E85A28] flex items-center justify-center shadow-lg shadow-orange-500/25">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="white" aria-hidden>
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
          </svg>
        </div>

        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#E85A28] mb-3">
          {t('nav.account')}
        </p>
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          {t('profile.guest.title')}
        </h2>
        <p className="mt-3 text-slate-500 text-sm sm:text-base leading-relaxed">
          {t('profile.guest.lead')}
        </p>

        <button
          type="button"
          disabled={signingIn}
          onClick={() => void onCta()}
          className="mt-8 w-full flex items-center justify-center gap-3 bg-white hover:bg-orange-50 border-2 border-slate-200 hover:border-[#FF6B35]/40 text-slate-900 font-bold py-3.5 rounded-2xl disabled:opacity-60 shadow-md transition-all"
        >
          {signingIn ? (
            t('auth.signInProgressLong')
          ) : (
            <>
              <span className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden>
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              </span>
              {t('profile.guest.cta')}
            </>
          )}
        </button>

        {error ? (
          <p className="mt-3 text-sm text-red-600 font-medium">{error}</p>
        ) : (
          <p className="mt-3 text-xs text-slate-400 font-medium">{t('profile.guest.hint')}</p>
        )}
      </motion.div>
    </div>
  )
}
