import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import type { InvitePreview } from '../types'
import { getApiClient } from '../utils/apiClient'
import { getCurrentUser } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'
import { DestinationCard } from '../components/DestinationCard'
import { formatDateFr } from '@flightwatcher/shared'

export default function PlannerInvite() {
  const { token = '' } = useParams<{ token: string }>()
  const { t } = useI18n()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)

  useEffect(() => {
    void getCurrentUser().then((u) => setUserId(u?.id ?? null))
  }, [])

  const load = useCallback(async () => {
    if (!token) {
      setError('Lien invalide')
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await getApiClient().getInvitePreview(token)
      setPreview(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setLoading(false)
    }
  }, [token, t])

  useEffect(() => {
    void load()
  }, [load])

  const join = async () => {
    if (!token) return
    setJoining(true)
    setError(null)
    try {
      await getApiClient().joinInvite(token)
      setJoined(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FFF9F5]">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 w-80 h-80 rounded-full bg-[#FF6B35]/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 -left-20 w-72 h-72 rounded-full bg-[#FFB088]/25 blur-3xl"
      />

      <div className="relative max-w-lg mx-auto px-4 py-10 sm:py-16">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm font-bold text-[#E85A28] hover:text-[#FF6B35]"
        >
          ← FlightWatcher
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-7"
        >
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#E85A28] mb-2">
            {t('nav.planner')}
          </p>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-tight">
            {t('planner.invite.title')}
          </h1>
        </motion.div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-4 border-orange-200 border-t-[#FF6B35] rounded-full animate-spin" />
          </div>
        ) : error && !preview ? (
          <div className="mt-8 bg-white rounded-3xl border border-orange-100 shadow-lg p-8 text-center">
            <p className="font-bold text-slate-900 mb-2">Oups</p>
            <p className="text-sm text-slate-500">{error}</p>
          </div>
        ) : preview ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="mt-8 space-y-5"
          >
            <div className="rounded-3xl bg-gradient-to-br from-[#1A120E] via-[#2A1A12] to-[#3D2418] p-6 text-white shadow-2xl shadow-orange-900/15 overflow-hidden relative">
              <div
                aria-hidden
                className="absolute inset-0 opacity-30"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 20% 20%, rgba(255,107,53,0.45), transparent 45%)',
                }}
              />
              <div className="relative">
                <h2 className="text-xl font-black tracking-tight">{preview.name}</h2>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-orange-200/70">
                      Départ
                    </p>
                    <p className="text-3xl font-black">{preview.departure_airport}</p>
                  </div>
                  <div className="flex-1 h-px mb-3 bg-gradient-to-r from-transparent via-orange-300/50 to-transparent" />
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-orange-200/70">
                      Arrivée
                    </p>
                    <p className="text-3xl font-black">
                      {preview.arrival_airport || 'ANY'}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold text-orange-100/70">
                  <span className="px-2 py-0.5 rounded-md bg-white/10">
                    {preview.passengers} voy.
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-white/10">
                    max {preview.budget_max}€
                  </span>
                  {preview.dates_depart[0] && preview.dates_retour[0] ? (
                    <span className="px-2 py-0.5 rounded-md bg-white/10">
                      {formatDateFr(preview.dates_depart[0].date)} →{' '}
                      {formatDateFr(
                        preview.dates_retour[preview.dates_retour.length - 1].date,
                      )}
                    </span>
                  ) : null}
                  <span className="px-2 py-0.5 rounded-md bg-[#FF6B35]/30 text-orange-50">
                    {preview.members_count} membre
                    {preview.members_count > 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </div>

            {preview.accepted_trip ? (
              <DestinationCard
                trip={preview.accepted_trip}
                onSaveFavorite={() => undefined}
              />
            ) : null}

            {joined ? (
              <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 font-bold rounded-2xl p-4 text-center">
                {t('planner.invite.joined')}
              </div>
            ) : userId ? (
              <button
                type="button"
                disabled={joining}
                onClick={() => void join()}
                className="w-full bg-gradient-to-br from-[#FF6B35] to-[#E85A28] text-white font-bold py-3.5 rounded-2xl disabled:opacity-60 shadow-lg shadow-orange-500/25"
              >
                {joining ? '…' : t('planner.invite.join')}
              </button>
            ) : (
              <Link
                to={`/login?redirect=${encodeURIComponent(`/planner/invite/${token}`)}`}
                className="block w-full text-center bg-gradient-to-br from-[#FF6B35] to-[#E85A28] text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-orange-500/25"
              >
                {t('planner.invite.login')}
              </Link>
            )}

            {error ? (
              <p className="text-sm text-red-600 font-medium text-center">{error}</p>
            ) : null}
          </motion.div>
        ) : null}
      </div>
    </div>
  )
}
