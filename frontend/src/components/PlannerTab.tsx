import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type {
  CreatePlannedTripRequest,
  DateAvecHoraire,
  PlannedTrip,
  PlannedTripDetail,
  TripProposal,
} from '../types'
import { getApiClient } from '../utils/apiClient'
import { getCurrentUser, signInWithGoogle, onAuthStateChange } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'
import { DestinationCard } from './DestinationCard'
import { BudgetSlider } from './BudgetSlider'
import { PassengerStepper } from './PassengerStepper'
import { DatePresets, type DatePreset } from './DatePresets'
import { FlexibleDatesSelector } from './FlexibleDatesSelector'
import { generateDatesFromPreset, formatDateFr } from '@flightwatcher/shared'

function inviteUrl(token: string) {
  return `${window.location.origin}/planner/invite/${token}`
}

async function shareInvite(name: string, token: string) {
  const url = inviteUrl(token)
  const text = `Rejoins mon voyage « ${name} » sur FlightWatcher : ${url}`
  if (navigator.share) {
    try {
      await navigator.share({ title: name, text, url })
      return 'shared'
    } catch {
      /* cancelled */
    }
  }
  await navigator.clipboard.writeText(url)
  return 'copied'
}

function PlannerGuestLanding() {
  const { t } = useI18n()
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const steps = [
    { title: t('planner.guest.step1'), detail: t('planner.guest.step1.detail') },
    { title: t('planner.guest.step2'), detail: t('planner.guest.step2.detail') },
    { title: t('planner.guest.step3'), detail: t('planner.guest.step3.detail') },
  ]

  const onCta = async () => {
    setError(null)
    setSigningIn(true)
    try {
      sessionStorage.setItem('fw_active_tab', 'planner')
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
    <div className="relative max-w-2xl mx-auto px-1 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full bg-[#FF6B35]/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-[#FFB088]/25 blur-3xl"
      />

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative"
      >
        <div className="text-center mb-7 sm:mb-9">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="inline-flex items-center gap-2 text-[11px] sm:text-xs font-black uppercase tracking-[0.22em] text-[#E85A28] mb-3"
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#FF6B35] animate-pulse" />
            {t('nav.planner')}
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-[1.75rem] sm:text-4xl font-black text-slate-900 tracking-tight leading-[1.1]"
          >
            {t('planner.guest.title')}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
            className="mt-3 text-slate-500 text-sm sm:text-base leading-relaxed max-w-md mx-auto"
          >
            {t('planner.guest.lead')}
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="relative mb-7 rounded-[1.75rem] bg-gradient-to-br from-[#1A120E] via-[#2A1A12] to-[#3D2418] p-5 sm:p-6 text-white shadow-2xl shadow-orange-900/20 overflow-hidden"
        >
          <div
            aria-hidden
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                'radial-gradient(circle at 20% 20%, rgba(255,107,53,0.45), transparent 45%), radial-gradient(circle at 80% 70%, rgba(255,176,136,0.25), transparent 40%)',
            }}
          />
          <div className="relative flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-orange-200/70">
                Départ
              </p>
              <p className="text-2xl sm:text-3xl font-black tracking-tight">
                {t('planner.guest.mock.from')}
              </p>
            </div>
            <div className="flex-1 flex flex-col items-center px-2">
              <div className="w-full h-px bg-gradient-to-r from-transparent via-orange-300/60 to-transparent relative">
                <motion.span
                  aria-hidden
                  className="absolute -top-2 left-0 text-orange-300"
                  animate={{ left: ['0%', '92%'] }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut', repeatDelay: 0.6 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
                  </svg>
                </motion.span>
              </div>
              <p className="mt-3 text-[11px] font-semibold text-orange-100/80">
                {t('planner.guest.mock.price')}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-orange-200/70">
                Arrivée
              </p>
              <p className="text-2xl sm:text-3xl font-black tracking-tight">
                {t('planner.guest.mock.to')}
              </p>
            </div>
          </div>
          <div className="relative mt-4 flex items-center gap-2 text-[11px] text-orange-100/55 font-medium">
            <span className="px-2 py-0.5 rounded-md bg-white/10">Weekend</span>
            <span className="px-2 py-0.5 rounded-md bg-white/10">2 voyageurs</span>
            <span className="px-2 py-0.5 rounded-md bg-[#FF6B35]/30 text-orange-50">Lien prêt</span>
          </div>
        </motion.div>

        <ol className="space-y-2.5 mb-8">
          {steps.map((step, i) => (
            <motion.li
              key={step.title}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.28 + i * 0.08 }}
              className="flex items-center gap-3.5 rounded-2xl bg-white/80 backdrop-blur-sm border border-orange-100/80 px-4 py-3.5 shadow-sm"
            >
              <span className="shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF6B35] to-[#E85A28] text-white font-black text-sm flex items-center justify-center shadow-md shadow-orange-500/25">
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
            className="group w-full flex items-center justify-center gap-3 bg-white hover:bg-orange-50 border-2 border-slate-200 hover:border-[#FF6B35]/40 text-slate-900 font-bold py-3.5 rounded-2xl disabled:opacity-60 shadow-lg shadow-slate-900/5 transition-all"
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
                {t('planner.guest.cta')}
              </>
            )}
          </button>
          {error ? (
            <p className="mt-3 text-sm text-red-600 font-medium text-center">{error}</p>
          ) : (
            <p className="mt-3 text-xs text-slate-400 text-center font-medium">
              {t('planner.guest.hint')}
            </p>
          )}
        </motion.div>
      </motion.div>
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  scanning: 'Scan…',
  planning: 'Propositions',
  locked: 'Confirmé',
}

export function PlannerTab() {
  const { t } = useI18n()
  const [userId, setUserId] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [trips, setTrips] = useState<PlannedTrip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    void getCurrentUser().then((u) => {
      setUserId(u?.id ?? null)
      setAuthReady(true)
    })
    const unsub = onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
      setAuthReady(true)
    })
    return () => {
      unsub?.()
    }
  }, [])

  const load = useCallback(async () => {
    if (!userId) {
      setTrips([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const list = await getApiClient().listPlannedTrips()
      setTrips(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
      setTrips([])
    } finally {
      setLoading(false)
    }
  }, [userId, t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(id)
  }, [toast])

  if (!authReady) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin mb-4" />
        <p className="font-medium">{t('app.loading')}</p>
      </div>
    )
  }

  if (!userId) {
    return <PlannerGuestLanding />
  }

  if (selectedTripId) {
    return (
      <TripDetailView
        tripId={selectedTripId}
        userId={userId}
        onBack={() => {
          setSelectedTripId(null)
          void load()
        }}
        onToast={setToast}
      />
    )
  }

  return (
    <div className="relative max-w-3xl mx-auto">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 right-0 w-56 h-56 rounded-full bg-[#FF6B35]/10 blur-3xl"
      />

      <div className="relative mb-6 sm:mb-8 px-1 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {t('nav.planner')}
          </h2>
          <p className="text-slate-500 mt-1 text-sm sm:text-base">{t('planner.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center justify-center gap-2 bg-gradient-to-br from-[#FF6B35] to-[#E85A28] text-white font-bold px-5 py-2.5 rounded-xl shrink-0 shadow-lg shadow-orange-500/25 hover:scale-[1.02] active:scale-[0.98] transition-transform"
        >
          <span className="text-lg leading-none">+</span>
          {t('planner.create')}
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin mb-4" />
          <p className="font-medium">{t('planner.loading')}</p>
        </div>
      ) : error ? (
        <div className="bg-white/90 backdrop-blur rounded-3xl border border-orange-100 shadow-lg p-8 text-center">
          <p className="font-bold text-slate-900 mb-2">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="bg-primary-500 text-white font-bold px-5 py-2.5 rounded-xl"
          >
            {t('deals.retry')}
          </button>
        </div>
      ) : trips.length === 0 ? (
        <div className="relative overflow-hidden bg-white rounded-3xl border border-orange-100 shadow-lg p-8 sm:p-10 text-center">
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-br from-orange-50/80 to-transparent"
          />
          <div className="relative">
            <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#E85A28] text-white flex items-center justify-center shadow-lg shadow-orange-500/30">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z" />
              </svg>
            </div>
            <p className="font-black text-xl text-slate-900 mb-2">{t('planner.emptyTitle')}</p>
            <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">{t('planner.emptyBody')}</p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="bg-gradient-to-br from-[#FF6B35] to-[#E85A28] text-white font-bold px-6 py-3 rounded-xl shadow-md shadow-orange-500/25"
            >
              {t('planner.create')}
            </button>
          </div>
        </div>
      ) : (
        <motion.div layout className="space-y-3">
          {trips.map((trip, index) => (
            <motion.button
              key={trip.id}
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              onClick={() => setSelectedTripId(trip.id)}
              className="group w-full text-left bg-white/95 backdrop-blur rounded-2xl border border-orange-100/80 shadow-sm hover:shadow-lg hover:border-orange-200 transition-all p-4 sm:p-5"
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-[#FFF3EC] to-[#FFE0CC] flex flex-col items-center justify-center border border-orange-100">
                  <span className="text-[10px] font-bold text-[#E85A28] leading-none">
                    {trip.departure_airport}
                  </span>
                  <span className="text-[9px] text-orange-300 my-0.5">↓</span>
                  <span className="text-[10px] font-bold text-slate-700 leading-none">
                    {trip.arrival_airport || 'ANY'}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="flex-1 font-bold text-base sm:text-lg text-slate-900 truncate group-hover:text-[#E85A28] transition-colors">
                      {trip.name}
                    </h3>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                        trip.status === 'locked'
                          ? 'bg-emerald-50 text-emerald-700'
                          : trip.status === 'planning'
                            ? 'bg-orange-50 text-[#E85A28]'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {STATUS_LABEL[trip.status] || trip.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">
                    {trip.passengers} voy. · max {trip.budget_max}€
                    {(trip.proposals_count ?? 0) > 0
                      ? ` · ${trip.proposals_count} prop.`
                      : ''}
                  </p>
                </div>
                <span className="hidden sm:flex self-center text-slate-300 group-hover:text-[#FF6B35] transition-colors text-xl">
                  ›
                </span>
              </div>
            </motion.button>
          ))}
        </motion.div>
      )}

      {showCreate ? (
        <CreateTripModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false)
            void load()
            setSelectedTripId(id)
          }}
        />
      ) : null}

      {toast ? (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg z-50">
          {toast}
        </div>
      ) : null}
    </div>
  )
}

function CreateTripModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { t } = useI18n()
  const initial = useMemo(() => generateDatesFromPreset('next-weekend'), [])
  const [name, setName] = useState('')
  const [departure, setDeparture] = useState('BVA')
  const [arrival, setArrival] = useState('')
  const [passengers, setPassengers] = useState(2)
  const [budget, setBudget] = useState(150)
  const [preset, setPreset] = useState<DatePreset>('next-weekend')
  const [datesDepart, setDatesDepart] = useState<DateAvecHoraire[]>(initial.dates_depart)
  const [datesRetour, setDatesRetour] = useState<DateAvecHoraire[]>(initial.dates_retour)
  const [showFlexible, setShowFlexible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onPreset = (p: DatePreset) => {
    setPreset(p)
    if (p === 'flexible') {
      setShowFlexible(true)
      return
    }
    const d = generateDatesFromPreset(p)
    setDatesDepart(d.dates_depart)
    setDatesRetour(d.dates_retour)
  }

  const submit = async () => {
    if (!name.trim()) {
      setError('Nom requis')
      return
    }
    if (!datesDepart.length || !datesRetour.length) {
      setError('Dates requises')
      return
    }
    setSaving(true)
    setError(null)
    const body: CreatePlannedTripRequest = {
      name: name.trim(),
      departure_airport: departure.trim().toUpperCase(),
      arrival_airport: arrival.trim() ? arrival.trim().toUpperCase() : null,
      passengers,
      dates_depart: datesDepart,
      dates_retour: datesRetour,
      budget_max: budget,
    }
    try {
      const trip = await getApiClient().createPlannedTrip(body)
      onCreated(trip.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
          <h3 className="font-black text-lg text-slate-900">{t('planner.create')}</h3>
          <button type="button" onClick={onClose} className="text-slate-500 font-semibold">
            ✕
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-sm font-bold text-slate-700 block mb-1">Nom</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Weekend Lisbonne"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 font-medium"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold text-slate-700 block mb-1">Départ</label>
              <input
                value={departure}
                onChange={(e) => setDeparture(e.target.value.toUpperCase())}
                maxLength={3}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 font-bold tracking-wider"
              />
            </div>
            <div>
              <label className="text-sm font-bold text-slate-700 block mb-1">Arrivée (opt.)</label>
              <input
                value={arrival}
                onChange={(e) => setArrival(e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="ANY"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 font-bold tracking-wider"
              />
            </div>
          </div>
          <PassengerStepper value={passengers} onChange={setPassengers} />
          <BudgetSlider value={budget} onChange={setBudget} />
          <DatePresets
            selected={preset}
            onChange={onPreset}
            onFlexibleClick={() => {
              setPreset('flexible')
              setShowFlexible(true)
            }}
          />
          {datesDepart[0] && datesRetour[0] ? (
            <p className="text-sm text-slate-500">
              {formatDateFr(datesDepart[0].date)} →{' '}
              {formatDateFr(datesRetour[datesRetour.length - 1].date)}
            </p>
          ) : null}
          {error ? <p className="text-sm text-red-600 font-medium">{error}</p> : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="w-full bg-primary-500 text-white font-bold py-3 rounded-xl disabled:opacity-60"
          >
            {saving ? '…' : 'Créer'}
          </button>
        </div>
      </div>

      {showFlexible ? (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-black text-slate-900">Dates libres</h4>
              <button
                type="button"
                onClick={() => setShowFlexible(false)}
                className="font-bold text-primary-600"
              >
                OK
              </button>
            </div>
            <FlexibleDatesSelector
              flexibleDates={{ dates_depart: datesDepart, dates_retour: datesRetour }}
              onFlexibleDatesChange={(d) => {
                setDatesDepart(d.dates_depart)
                setDatesRetour(d.dates_retour)
              }}
              formatDateFr={formatDateFr}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function TripDetailView({
  tripId,
  userId,
  onBack,
  onToast,
}: {
  tripId: string
  userId: string
  onBack: () => void
  onToast: (msg: string) => void
}) {
  const { t } = useI18n()
  const [trip, setTrip] = useState<PlannedTripDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const detail = await getApiClient().getPlannedTrip(tripId)
      setTrip(detail)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setLoading(false)
    }
  }, [tripId, t])

  useEffect(() => {
    void load()
  }, [load])

  const isOrganizer = trip?.organizer_id === userId
  const pending = (trip?.proposals || []).filter((p) => p.status === 'pending')
  const accepted = (trip?.proposals || []).find((p) => p.status === 'accepted')

  const scan = async () => {
    setScanning(true)
    try {
      await getApiClient().scanPlannedTrip(tripId)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setScanning(false)
    }
  }

  const accept = async (id: string) => {
    setActing(id)
    try {
      await getApiClient().acceptProposal(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setActing(null)
    }
  }

  const reject = async (id: string) => {
    setActing(id)
    try {
      await getApiClient().rejectProposal(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setActing(null)
    }
  }

  const doShare = async () => {
    if (!trip) return
    const result = await shareInvite(trip.name, trip.invite_token)
    if (result === 'copied') onToast(t('planner.shareCopied'))
  }

  if (loading && !trip) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (!trip) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error || 'Introuvable'}</p>
        <button type="button" onClick={onBack} className="font-bold text-primary-500">
          ← Retour
        </button>
      </div>
    )
  }

  const url = inviteUrl(trip.invite_token)
  const encoded = encodeURIComponent(`Rejoins mon voyage « ${trip.name} » : ${url}`)

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <button type="button" onClick={onBack} className="text-sm font-bold text-primary-600">
        ← {t('nav.planner')}
      </button>

      <div className="bg-white rounded-2xl shadow-md p-6 space-y-2">
        <div className="flex items-start gap-3">
          <h2 className="flex-1 text-2xl font-black text-slate-900">{trip.name}</h2>
          <span className="text-xs font-bold text-primary-700 bg-orange-50 px-2.5 py-1 rounded-full">
            {STATUS_LABEL[trip.status] || trip.status}
          </span>
        </div>
        <p className="text-slate-500">
          {trip.departure_airport}
          {trip.arrival_airport ? ` → ${trip.arrival_airport}` : ' · inspire'}
          {' · '}
          {trip.passengers} voy. · {trip.budget_max}€/pers
        </p>
        {trip.dates_depart[0] && trip.dates_retour[0] ? (
          <p className="text-sm text-slate-500">
            {formatDateFr(trip.dates_depart[0].date)} →{' '}
            {formatDateFr(trip.dates_retour[trip.dates_retour.length - 1].date)}
          </p>
        ) : null}
        <p className="text-sm text-slate-400">
          {t('planner.members')}: {(trip.members || []).length}
        </p>
      </div>

      {error ? <p className="text-red-600 text-sm font-medium">{error}</p> : null}

      {isOrganizer && trip.status !== 'locked' ? (
        <button
          type="button"
          disabled={scanning}
          onClick={() => void scan()}
          className="w-full sm:w-auto bg-primary-500 text-white font-bold px-6 py-3 rounded-xl disabled:opacity-60"
        >
          {scanning ? t('planner.scanning') : t('planner.scan')}
        </button>
      ) : null}

      {accepted ? (
        <section className="space-y-4">
          <h3 className="font-bold text-lg text-slate-900">Proposition acceptée</h3>
          <DestinationCard
            trip={accepted.trip_data}
            onSaveFavorite={() => undefined}
          />
          {isOrganizer ? <ShareBar onShare={() => void doShare()} encoded={encoded} url={url} t={t} /> : null}
        </section>
      ) : null}

      {pending.length > 0 ? (
        <section className="space-y-4">
          <h3 className="font-bold text-lg text-slate-900">
            {t('planner.proposals')} ({pending.length})
          </h3>
          {pending.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              isOrganizer={!!isOrganizer}
              busy={acting === p.id}
              onAccept={() => void accept(p.id)}
              onReject={() => void reject(p.id)}
              t={t}
            />
          ))}
        </section>
      ) : null}

      {!accepted && pending.length === 0 && !scanning ? (
        <div className="bg-white rounded-2xl shadow p-8 text-center text-slate-500">
          {isOrganizer
            ? 'Lance un scan pour trouver des vols.'
            : 'Pas encore de propositions.'}
        </div>
      ) : null}

      {trip.status === 'locked' && isOrganizer ? (
        <ShareBar onShare={() => void doShare()} encoded={encoded} url={url} t={t} />
      ) : null}
    </div>
  )
}

function ProposalCard({
  proposal,
  isOrganizer,
  busy,
  onAccept,
  onReject,
  t,
}: {
  proposal: TripProposal
  isOrganizer: boolean
  busy: boolean
  onAccept: () => void
  onReject: () => void
  t: (k: string) => string
}) {
  return (
    <div className="space-y-3">
      <DestinationCard trip={proposal.trip_data} onSaveFavorite={() => undefined} />
      {isOrganizer ? (
        <div className="flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onReject}
            className="flex-1 border border-slate-200 rounded-xl py-2.5 font-bold text-slate-600 disabled:opacity-50"
          >
            {t('planner.reject')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onAccept}
            className="flex-1 bg-primary-500 text-white rounded-xl py-2.5 font-bold disabled:opacity-50"
          >
            {t('planner.accept')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function ShareBar({
  onShare,
  encoded,
  url,
  t,
}: {
  onShare: () => void
  encoded: string
  url: string
  t: (k: string) => string
}) {
  return (
    <div className="bg-white rounded-2xl shadow-md p-5 space-y-3">
      <p className="font-bold text-slate-900">{t('planner.share')}</p>
      <p className="text-xs text-slate-400 break-all">{url}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onShare}
          className="bg-primary-500 text-white font-bold px-4 py-2 rounded-xl text-sm"
        >
          {t('planner.share')}
        </button>
        <a
          href={`https://wa.me/?text=${encoded}`}
          target="_blank"
          rel="noreferrer"
          className="bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-sm"
        >
          WhatsApp
        </a>
        <a
          href={`https://twitter.com/intent/tweet?text=${encoded}`}
          target="_blank"
          rel="noreferrer"
          className="bg-slate-900 text-white font-bold px-4 py-2 rounded-xl text-sm"
        >
          X
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noreferrer"
          className="bg-blue-600 text-white font-bold px-4 py-2 rounded-xl text-sm"
        >
          Facebook
        </a>
      </div>
    </div>
  )
}
