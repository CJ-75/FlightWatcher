/**
 * InviteLanding — preview restreint + AuthSheet + AppPromo (Lot 2).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import type { InvitePreview } from '../types'
import { getApiClient } from '../utils/apiClient'
import { getCurrentUser, onAuthStateChange } from '../lib/supabase'
import { formatTripDateRangeFr } from '@flightwatcher/shared'
import { useAuthSheet } from '../components/onboarding/AuthSheetHost'
import { AppPromoCard } from '../components/onboarding/AppPromoCard'

function InviteLandingInner() {
  const { token = '' } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { openAuthSheet } = useAuthSheet()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)
  const autoJoinTried = useRef(false)

  useEffect(() => {
    void getCurrentUser().then((u) => setUserId(u?.id ?? null))
    return onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null)
    })
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
      void getApiClient()
        .trackActivityEvent({
          domain: 'invite',
          event: 'invite_landing_viewed',
          surface: 'invite_landing',
          platform: 'web',
          meta: { state: data.state || 'open' },
        })
        .catch(() => {})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      void getApiClient()
        .trackActivityEvent({
          domain: 'invite',
          event: 'invite_preview_failed',
          surface: 'invite_landing',
          platform: 'web',
          meta: {},
        })
        .catch(() => {})
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const join = useCallback(async () => {
    if (!token) return
    setJoining(true)
    setError(null)
    void getApiClient()
      .trackActivityEvent({
        domain: 'invite',
        event: 'invite_join_clicked',
        surface: 'invite_landing',
        platform: 'web',
        meta: {},
      })
      .catch(() => {})
    try {
      const res = await getApiClient().joinInvite(token)
      setJoined(true)
      void getApiClient()
        .trackActivityEvent({
          domain: 'invite',
          event: 'invite_joined',
          surface: 'invite_landing',
          platform: 'web',
          meta: { trip_id: res.trip_id },
        })
        .catch(() => {})
      toast.success('Tu as rejoint le voyage')
      navigate(`/planner/${encodeURIComponent(res.trip_id)}`, { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setJoined(false)
    } finally {
      setJoining(false)
    }
  }, [token, navigate])

  useEffect(() => {
    if (!userId || !preview || joined || joining || autoJoinTried.current) return
    if (preview.state && preview.state !== 'open' && preview.state !== 'already_member')
      return
    autoJoinTried.current = true
    void join()
  }, [userId, preview, joined, joining, join])

  const firstName =
    preview?.organizer?.first_name ||
    (preview?.organizer_name || '').split(/\s+/)[0] ||
    null

  const onJoinClick = () => {
    if (userId) {
      void join()
      return
    }
    openAuthSheet({
      trigger: 'invite_join',
      inviteFirstName: firstName,
      pending: {
        type: 'join_invite',
        trigger: 'invite_join',
        payload: { token },
        createdAt: Date.now(),
      },
      onAuthenticated: () => {
        void join()
      },
    })
  }

  const state = preview?.state || 'open'
  const dateLabel =
    preview?.dates_depart?.[0] && preview?.dates_retour?.[0]
      ? formatTripDateRangeFr(
          preview.dates_depart[0].date,
          preview.dates_retour[preview.dates_retour.length - 1].date,
        )
      : null

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#FFF9F5] font-[family-name:Sora,system-ui,sans-serif]">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 w-80 h-80 rounded-full bg-[#FF6B35]/15 blur-3xl"
      />
      <div className="relative max-w-lg mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <Link
          to="/sejours"
          className="inline-flex items-center gap-1 text-sm font-bold text-[#E85A28] hover:text-[#FF6B35]"
        >
          ← FlightWatcher
        </Link>

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-10 h-10 border-4 border-orange-200 border-t-[#FF6B35] rounded-full animate-spin" />
          </div>
        ) : error && !preview ? (
          <div className="mt-10 bg-white rounded-3xl border border-orange-100 shadow-lg p-8 text-center">
            <p className="font-bold text-slate-900 mb-2">Invitation introuvable</p>
            <p className="text-sm text-slate-500">{error}</p>
          </div>
        ) : preview ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-8 space-y-5"
          >
            {preview.cover_url ? (
              <div className="relative h-48 sm:h-56 rounded-3xl overflow-hidden shadow-xl">
                <img
                  src={preview.cover_url}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-200/90">
                    Invitation
                  </p>
                  <h1 className="text-2xl font-black tracking-tight mt-1">
                    {preview.city || preview.name}
                  </h1>
                </div>
              </div>
            ) : (
              <div className="rounded-3xl bg-gradient-to-br from-[#1A120E] via-[#2A1A12] to-[#3D2418] p-6 text-white shadow-2xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-200/90">
                  Invitation
                </p>
                <h1 className="text-2xl font-black tracking-tight mt-1">
                  {preview.city || preview.name}
                </h1>
              </div>
            )}

            <div className="rounded-2xl bg-white border border-orange-100/80 p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-3">
                {preview.organizer?.avatar_url ? (
                  <img
                    src={preview.organizer.avatar_url}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#FF6B35]/20 text-[#E85A28] flex items-center justify-center font-bold">
                    {(firstName || '?').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {firstName
                      ? `${firstName} t’invite`
                      : 'On t’invite sur ce voyage'}
                  </p>
                  <p className="text-xs text-slate-500">{preview.name}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                {dateLabel ? (
                  <span className="px-2.5 py-1 rounded-lg bg-[#FFF5EF]">{dateLabel}</span>
                ) : null}
                <span className="px-2.5 py-1 rounded-lg bg-[#FFF5EF]">
                  {preview.members_count} membre
                  {preview.members_count > 1 ? 's' : ''}
                </span>
                {preview.price_estimate != null ? (
                  <span className="px-2.5 py-1 rounded-lg bg-[#FFF5EF]">
                    ~{Math.round(preview.price_estimate)}€
                    {preview.price_status === 'estimated' ? ' estimé' : ''}
                  </span>
                ) : null}
              </div>

              {preview.program_summary && preview.program_summary.length > 0 ? (
                <ul className="space-y-1.5 pt-1">
                  {preview.program_summary.map((step) => (
                    <li key={step} className="text-sm text-slate-700 flex gap-2">
                      <span className="text-[#FF6B35]">·</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {state === 'expired' ? (
              <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 text-center text-sm font-semibold text-amber-900">
                Cette invitation a expiré.
              </div>
            ) : state === 'full' ? (
              <div className="rounded-2xl bg-slate-100 border border-slate-200 p-4 text-center text-sm font-semibold text-slate-700">
                Ce voyage est complet.
              </div>
            ) : joined ? (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-center text-sm font-bold text-emerald-800">
                Tu as rejoint le voyage
              </div>
            ) : (
              <button
                type="button"
                disabled={joining}
                onClick={onJoinClick}
                className="w-full bg-gradient-to-br from-[#FF6B35] to-[#E85A28] text-white font-bold py-3.5 rounded-2xl disabled:opacity-60 shadow-lg shadow-orange-500/25"
              >
                {joining
                  ? '…'
                  : firstName
                    ? `Rejoindre ${firstName}`
                    : 'Rejoindre le voyage'}
              </button>
            )}

            <AppPromoCard deepLinkPath={`/planner/invite/${token}`} compact />

            {error ? (
              <p className="text-sm text-red-600 font-medium text-center">{error}</p>
            ) : null}
          </motion.div>
        ) : null}
      </div>
    </div>
  )
}

export default function PlannerInvite() {
  return <InviteLandingInner />
}
