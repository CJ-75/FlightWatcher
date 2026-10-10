import { useState } from 'react'
import { motion } from 'framer-motion'
import { signInWithGoogle } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'

export function FavoritesGuestLanding() {
  const { t } = useI18n()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const steps = [
    { title: t('favorites.guest.step1'), detail: t('favorites.guest.step1.detail') },
    { title: t('favorites.guest.step2'), detail: t('favorites.guest.step2.detail') },
    { title: t('favorites.guest.step3'), detail: t('favorites.guest.step3.detail') },
  ]

  const onCta = async () => {
    setError(null)
    setSigningIn(true)
    try {
      sessionStorage.setItem('fw_active_tab', 'saved')
    } catch {
      /* ignore */
    }
    const { error: err } = await signInWithGoogle()
    if (err) {
      setError(err.message)
      setSigningIn(false)
    }
  }

  return (
    <div className="relative w-full overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full bg-[#FF6B35]/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-[#FF3D6B]/12 blur-3xl"
      />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative"
      >
        <div className="text-center lg:text-left mb-7 sm:mb-9">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="inline-flex items-center gap-2 text-[11px] sm:text-xs font-black uppercase tracking-[0.22em] text-[#E85A28] mb-3"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#FF3D6B] animate-pulse" />
            {t('nav.favorites')}
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-[1.75rem] sm:text-4xl font-black text-slate-900 tracking-tight leading-[1.1]"
          >
            {t('favorites.guest.title')}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
            className="mt-3 text-muted text-sm sm:text-base leading-relaxed max-w-lg mx-auto lg:mx-0"
          >
            {t('favorites.guest.lead')}
          </motion.p>
        </div>

        <div className="lg:grid lg:grid-cols-2 lg:gap-10 lg:items-start">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="relative mb-7 lg:mb-0 rounded-[1.75rem] bg-gradient-to-br from-[#1A120E] via-[#2A1418] to-[#3D1820] p-5 sm:p-6 text-white shadow-2xl shadow-rose-900/20 overflow-hidden"
        >
          <div
            aria-hidden
            className="absolute inset-0 opacity-35"
            style={{
              backgroundImage:
                'radial-gradient(circle at 18% 25%, rgba(255,61,107,0.4), transparent 45%), radial-gradient(circle at 85% 70%, rgba(255,107,53,0.28), transparent 40%)',
            }}
          />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-rose-200/70 mb-1">
                {t('favorites.guest.mock.tag')}
              </p>
              <p className="text-2xl sm:text-3xl font-black tracking-tight truncate">
                {t('favorites.guest.mock.city')}
              </p>
              <p className="mt-1 text-sm font-semibold text-rose-100/70">
                {t('favorites.guest.mock.route')}
              </p>
            </div>
            <motion.div
              aria-hidden
              animate={{ scale: [1, 1.12, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              className="shrink-0 w-12 h-12 rounded-2xl bg-[#FF3D6B] flex items-center justify-center shadow-lg shadow-rose-500/40"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white" aria-hidden>
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            </motion.div>
          </div>
          <div className="relative mt-5 flex items-end justify-between">
            <div className="flex gap-2 text-[11px] font-semibold text-rose-100/60">
              <span className="px-2 py-0.5 rounded-md bg-white/10">Weekend</span>
              <span className="px-2 py-0.5 rounded-md bg-white/10">Aller-retour</span>
            </div>
            <p className="text-2xl font-black text-white tracking-tight">
              {t('favorites.guest.mock.price')}
            </p>
          </div>
        </motion.div>

        <div>
        <ol className="space-y-2.5 mb-8">
          {steps.map((step, i) => (
            <motion.li
              key={step.title}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.28 + i * 0.08 }}
              className="flex items-center gap-3.5 rounded-2xl bg-white/80 backdrop-blur-sm border border-rose-100/80 px-4 py-3.5 shadow-sm"
            >
              <span className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF3D6B] to-[#E85A28] text-white font-black text-sm flex items-center justify-center shadow-md shadow-rose-500/25">
                {i + 1}
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-slate-900 text-sm sm:text-[15px]">
                  {step.title}
                </span>
                <span className="block text-slate-500 text-xs sm:text-sm mt-0.5">
                  {step.detail}
                </span>
              </span>
            </motion.li>
          ))}
        </ol>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.52 }}
        >
          <button
            type="button"
            disabled={signingIn}
            onClick={() => void onCta()}
            className="group w-full lg:w-auto lg:min-w-[280px] flex items-center justify-center gap-3 bg-white hover:bg-rose-50 border-2 border-slate-200 hover:border-[#FF3D6B]/35 text-slate-900 font-bold py-3.5 px-6 rounded-2xl disabled:opacity-60 shadow-lg shadow-slate-900/5 transition-all"
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
                {t('favorites.guest.cta')}
              </>
            )}
          </button>
          {error ? (
            <p className="mt-3 text-sm text-red-600 font-medium text-center lg:text-left">{error}</p>
          ) : (
            <p className="mt-3 text-xs text-slate-400 text-center lg:text-left font-medium">
              {t('favorites.guest.hint')}
            </p>
          )}
        </motion.div>
        </div>
        </div>
      </motion.div>
    </div>
  )
}
