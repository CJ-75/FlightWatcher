import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type {
  Airport,
  CreatePlannedTripRequest,
  DateAvecHoraire,
  EnrichedTripResponse,
  PlannedTrip,
  PlannedTripDetail,
  TripMember,
  TripProposal,
} from '../types'
import { getApiClient, normalizeAirports } from '../utils/apiClient'
import { getCurrentUser, signInWithGoogle, onAuthStateChange } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'
import { DestinationCard } from './DestinationCard'
import { BookingSas } from './BookingSas'
import { BudgetSlider } from './BudgetSlider'
import { PassengerStepper } from './PassengerStepper'
import { DatePresets, type DatePreset } from './DatePresets'
import { FlexibleDatesSelector } from './FlexibleDatesSelector'
import {
  arrivalDisplayLabel,
  cityImageUrl,
  encodeArrivalCodes,
  findCityGroupByKey,
  formatDateFr,
  generateDatesFromPreset,
  groupAirportsByCity,
  type CityAirportGroup,
} from '@flightwatcher/shared'

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
  const [airports, setAirports] = useState<Airport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const cityGroups = useMemo(() => groupAirportsByCity(airports), [airports])

  useEffect(() => {
    void getApiClient()
      .getAirports()
      .then((raw) => setAirports(normalizeAirports(raw as Airport[] | { airports: Airport[] })))
      .catch(() => undefined)
  }, [])

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
        onDeleted={() => {
          setSelectedTripId(null)
          void load()
        }}
        onToast={setToast}
      />
    )
  }

  return (
    <div className="relative max-w-2xl mx-auto">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -right-10 w-72 h-72 rounded-full bg-[#FF6B35]/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-40 -left-16 w-56 h-56 rounded-full bg-[#FFB088]/20 blur-3xl"
      />

      <div className="relative mb-7 sm:mb-9 px-1 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold tracking-[0.14em] text-[#FF6B35] mb-1.5">
            PLANNER
          </p>
          <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
            Tes voyages
          </h2>
          <p className="text-slate-500 mt-1.5 text-sm sm:text-base">
            Crée, scanne les prix, invite tes proches.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center justify-center gap-2 bg-gradient-to-br from-[#FF6B35] to-[#E85A28] text-white font-bold px-5 py-3 rounded-2xl shrink-0 shadow-lg shadow-orange-500/25 hover:scale-[1.02] active:scale-[0.98] transition-transform"
        >
          <span className="text-lg leading-none">+</span>
          Nouveau
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
        <div className="relative overflow-hidden bg-white rounded-[28px] border border-orange-100 shadow-lg p-8 sm:p-10 text-center">
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-br from-orange-50/80 to-transparent"
          />
          <div className="relative">
            <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#E85A28] text-white flex items-center justify-center shadow-lg shadow-orange-500/30 text-2xl">
              ✈
            </div>
            <p className="font-black text-2xl text-slate-900 mb-2 tracking-tight">
              Ton premier voyage
            </p>
            <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto leading-relaxed">
              Choisis une ville, scanne les prix, partage le lien.
            </p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="bg-gradient-to-br from-[#FF6B35] to-[#E85A28] text-white font-bold px-6 py-3 rounded-2xl shadow-md shadow-orange-500/25"
            >
              Créer un voyage
            </button>
          </div>
        </div>
      ) : (
        <motion.div layout className="space-y-6">
          {trips.map((trip, index) => {
            const arrival = arrivalDisplayLabel(trip.arrival_airport, cityGroups)
            const imageUri = arrival.isAny
              ? cityImageUrl(null)
              : cityImageUrl(arrival.city)
            const codes = arrival.isAny ? [] : arrival.codes.split(' · ').filter(Boolean)
            return (
              <motion.button
                key={trip.id}
                type="button"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => setSelectedTripId(trip.id)}
                className="group w-full text-left bg-white rounded-[28px] border border-orange-100/70 shadow-md hover:shadow-2xl hover:-translate-y-0.5 transition-all overflow-hidden"
              >
                <div className="relative h-52 sm:h-60">
                  <img
                    src={imageUri}
                    alt={arrival.city}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/20" />
                  <span
                    className={`absolute top-4 right-4 text-[11px] font-bold px-3 py-1.5 rounded-full backdrop-blur-sm ${
                      trip.status === 'locked'
                        ? 'bg-emerald-50/95 text-emerald-700'
                        : trip.status === 'planning'
                          ? 'bg-orange-50/95 text-[#E85A28]'
                          : 'bg-white/95 text-slate-600'
                    }`}
                  >
                    {STATUS_LABEL[trip.status] || trip.status}
                  </span>
                  <div className="absolute bottom-4 left-5 right-5">
                    <p className="text-white text-3xl font-black tracking-tight">
                      {arrival.isAny ? 'Destination libre' : arrival.city}
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-white font-bold text-sm tracking-wide">
                      <span>{trip.departure_airport}</span>
                      <span className="w-7 h-0.5 rounded bg-white/55" />
                      <span>{arrival.isAny ? 'ANY' : codes[0]}</span>
                      {codes.length > 1 ? (
                        <span className="text-white/75 font-semibold text-xs">
                          +{codes.length - 1}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="p-5 sm:p-6">
                  <h3 className="font-bold text-xl text-slate-900 tracking-tight group-hover:text-[#E85A28] transition-colors">
                    {trip.name}
                  </h3>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-[#FFF3EC] text-[#8B2E0E]">
                      {trip.passengers} voy.
                    </span>
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-[#FFF3EC] text-[#8B2E0E]">
                      max {trip.budget_max}€
                    </span>
                    {(trip.proposals_count ?? 0) > 0 ? (
                      <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-[#FFE8DC] text-[#E85A28]">
                        {trip.proposals_count} prop.
                      </span>
                    ) : null}
                  </div>
                  {trip.dates_depart?.[0] && trip.dates_retour?.[0] ? (
                    <p className="text-sm font-semibold text-slate-600 mt-3">
                      {formatDateFr(trip.dates_depart[0].date)} →{' '}
                      {formatDateFr(
                        trip.dates_retour[trip.dates_retour.length - 1].date,
                      )}
                    </p>
                  ) : null}
                  <div className="mt-4 pt-3 border-t border-orange-50 flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#FF6B35]">Voir le voyage</span>
                    <span className="text-[#FF6B35] text-xl leading-none group-hover:translate-x-0.5 transition-transform">
                      ›
                    </span>
                  </div>
                </div>
              </motion.button>
            )
          })}
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
  const initial = useMemo(() => {
    const d = generateDatesFromPreset('next-weekend')
    return {
      dates_depart: d.dates_depart.map((x) => ({
        ...x,
        heure_min: '00:00',
        heure_max: '23:59',
      })),
      dates_retour: d.dates_retour.map((x) => ({
        ...x,
        heure_min: '00:00',
        heure_max: '23:59',
      })),
    }
  }, [])
  const [name, setName] = useState('')
  const [departure, setDeparture] = useState('BVA')
  const [arrivalCityKey, setArrivalCityKey] = useState('')
  const [arrivalCodes, setArrivalCodes] = useState<string[]>([])
  const [airports, setAirports] = useState<Airport[]>([])
  const [cityQuery, setCityQuery] = useState('')
  const [passengers, setPassengers] = useState(2)
  const [budget, setBudget] = useState(150)
  const [preset, setPreset] = useState<DatePreset>('next-weekend')
  const [datesDepart, setDatesDepart] = useState<DateAvecHoraire[]>(initial.dates_depart)
  const [datesRetour, setDatesRetour] = useState<DateAvecHoraire[]>(initial.dates_retour)
  const [showFlexible, setShowFlexible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cityGroups = useMemo(() => groupAirportsByCity(airports), [airports])
  const selectedCity = useMemo(
    () => findCityGroupByKey(cityGroups, arrivalCityKey),
    [cityGroups, arrivalCityKey],
  )
  const filteredCities = useMemo(() => {
    const q = cityQuery.trim().toLowerCase()
    if (!q) return cityGroups.slice(0, 40)
    return cityGroups
      .filter(
        (g) =>
          g.city.toLowerCase().includes(q) ||
          g.country.toLowerCase().includes(q) ||
          g.airports.some((a) => a.code.toLowerCase().includes(q)),
      )
      .slice(0, 40)
  }, [cityGroups, cityQuery])

  useEffect(() => {
    void getApiClient()
      .getAirports()
      .then((raw) => setAirports(normalizeAirports(raw as Airport[] | { airports: Airport[] })))
      .catch(() => undefined)
  }, [])

  const selectCity = (group: CityAirportGroup | null) => {
    if (!group) {
      setArrivalCityKey('')
      setArrivalCodes([])
      return
    }
    setArrivalCityKey(group.key)
    setArrivalCodes(group.airports.map((a) => a.code))
    if (!name.trim()) setName(`Weekend ${group.city}`)
  }

  const onPreset = (p: DatePreset) => {
    setPreset(p)
    if (p === 'flexible') {
      setShowFlexible(true)
      return
    }
    const d = generateDatesFromPreset(p)
    // Planner: whole-day window so price scan matches trip calendar days
    setDatesDepart(
      d.dates_depart.map((x) => ({ ...x, heure_min: '00:00', heure_max: '23:59' })),
    )
    setDatesRetour(
      d.dates_retour.map((x) => ({ ...x, heure_min: '00:00', heure_max: '23:59' })),
    )
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
      arrival_airport: encodeArrivalCodes(arrivalCodes),
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
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between z-10">
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
            <label className="text-sm font-bold text-slate-700 block mb-1">
              Ville d’arrivée (optionnel)
            </label>
            {selectedCity ? (
              <div className="relative rounded-2xl overflow-hidden h-36 mb-3 shadow-sm">
                <img
                  src={cityImageUrl(selectedCity.city)}
                  alt={selectedCity.city}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-white font-black text-xl">{selectedCity.city}</p>
                    <p className="text-white/85 text-xs font-medium">
                      {selectedCity.airports.map((a) => a.code).join(' · ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectCity(null)}
                    className="text-xs font-bold bg-white/95 text-slate-800 px-3 py-1.5 rounded-full"
                  >
                    Effacer
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => selectCity(null)}
                className="w-full mb-3 text-left rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3"
              >
                <p className="font-bold text-slate-800">Toutes destinations</p>
                <p className="text-xs text-slate-500">Mode inspire — sans filtre ville</p>
              </button>
            )}
            <input
              value={cityQuery}
              onChange={(e) => setCityQuery(e.target.value)}
              placeholder="Chercher une ville…"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 font-medium mb-2"
            />
            <div className="max-h-44 overflow-y-auto space-y-1.5 rounded-xl border border-slate-100 p-1.5">
              {filteredCities.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => selectCity(g)}
                  className={`w-full flex items-center gap-3 text-left px-2 py-2 rounded-xl transition-colors ${
                    g.key === arrivalCityKey
                      ? 'bg-[#FFF3EC] ring-1 ring-orange-200'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <img
                    src={cityImageUrl(g.city)}
                    alt=""
                    className="w-11 h-11 rounded-xl object-cover shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 truncate">{g.city}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {g.country} · {g.airports.map((a) => a.code).join(' · ')}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <PassengerStepper value={passengers} onChange={setPassengers} />
          <BudgetSlider value={budget} onChange={setBudget} />

          <div>
            <DatePresets
              selected={preset}
              onChange={onPreset}
              onFlexibleClick={() => {
                setPreset('flexible')
                setShowFlexible(true)
              }}
            />
            {datesDepart[0] && datesRetour[0] ? (
              <p className="text-sm text-slate-500 mt-2">
                {formatDateFr(datesDepart[0].date)} →{' '}
                {formatDateFr(datesRetour[datesRetour.length - 1].date)}
              </p>
            ) : null}
          </div>

          {error ? <p className="text-sm text-red-600 font-medium">{error}</p> : null}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="w-full bg-primary-500 hover:bg-primary-600 text-white font-bold py-3 rounded-xl disabled:opacity-60"
          >
            {saving ? '…' : t('planner.create')}
          </button>
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
    </div>
  )
}

function TripDetailView({
  tripId,
  userId,
  onBack,
  onDeleted,
  onToast,
}: {
  tripId: string
  userId: string
  onBack: () => void
  onDeleted: () => void
  onToast: (msg: string) => void
}) {
  const { t } = useI18n()
  const [trip, setTrip] = useState<PlannedTripDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const [membersBusy, setMembersBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [bookingTrip, setBookingTrip] = useState<EnrichedTripResponse | null>(null)
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
      const scanRes = await getApiClient().scanPlannedTrip(tripId)
      setTrip((prev) =>
        prev
          ? {
              ...prev,
              status: 'planning',
              proposals: scanRes.proposals || [],
              proposals_count: (scanRes.proposals || []).length,
            }
          : prev,
      )
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

  const addMember = async () => {
    const display_name = newName.trim()
    if (display_name.length < 2) return
    setMembersBusy(true)
    setError(null)
    try {
      await getApiClient().addTripMember(tripId, { display_name })
      setNewName('')
      setAddOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setMembersBusy(false)
    }
  }

  const removeMember = async (member: TripMember) => {
    const label = member.display_name?.trim() || t('planner.members')
    if (!window.confirm(t('planner.members.removeConfirm', { name: label }))) return
    setMembersBusy(true)
    setError(null)
    try {
      await getApiClient().removeTripMember(tripId, member.id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setMembersBusy(false)
    }
  }

  const doDelete = async () => {
    if (!trip) return
    if (!window.confirm(t('planner.deleteConfirm', { name: trip.name }))) return
    setDeleting(true)
    setError(null)
    try {
      await getApiClient().deletePlannedTrip(tripId)
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setDeleting(false)
    }
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
          {trip.arrival_airport ? ` → ${trip.arrival_airport.replace(/,/g, ' · ')}` : ' · inspire'}
          {' · '}
          {trip.budget_max}€/pers
        </p>
        {trip.dates_depart[0] && trip.dates_retour[0] ? (
          <p className="text-sm text-slate-500">
            {formatDateFr(trip.dates_depart[0].date)} →{' '}
            {formatDateFr(trip.dates_retour[trip.dates_retour.length - 1].date)}
          </p>
        ) : null}
      </div>

      <TravelersPanel
        members={trip.members || []}
        seats={trip.passengers}
        currentUserId={userId}
        isOrganizer={!!isOrganizer}
        busy={membersBusy}
        addOpen={addOpen}
        newName={newName}
        onOpenAdd={() => setAddOpen(true)}
        onCloseAdd={() => {
          setAddOpen(false)
          setNewName('')
        }}
        onNameChange={setNewName}
        onAdd={() => void addMember()}
        onRemove={(m) => void removeMember(m)}
        t={t}
      />

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
            onBook={() => setBookingTrip(accepted.trip_data)}
          />
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
              onBook={() => setBookingTrip(p.trip_data)}
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

      {isOrganizer && (trip.status === 'locked' || !!accepted) ? (
        <ShareBar onShare={() => void doShare()} encoded={encoded} url={url} t={t} />
      ) : null}

      {isOrganizer ? (
        <button
          type="button"
          disabled={deleting}
          onClick={() => void doDelete()}
          className="w-full sm:w-auto text-red-600 font-bold px-5 py-3 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 disabled:opacity-50"
        >
          {deleting ? '…' : t('planner.delete')}
        </button>
      ) : null}

      {bookingTrip ? (
        <BookingSas
          trip={bookingTrip}
          passengers={trip.passengers}
          onClose={() => setBookingTrip(null)}
          onSaveFavorite={() => undefined}
        />
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
  onBook,
  t,
}: {
  proposal: TripProposal
  isOrganizer: boolean
  busy: boolean
  onAccept: () => void
  onReject: () => void
  onBook: () => void
  t: (k: string) => string
}) {
  return (
    <div className="space-y-3">
      <DestinationCard
        trip={proposal.trip_data}
        onSaveFavorite={() => undefined}
        onBook={onBook}
      />
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

function memberLabel(m: TripMember, currentUserId: string, t: (k: string) => string): string {
  if (m.display_name?.trim()) return m.display_name.trim()
  if (m.user_id && m.user_id === currentUserId) return t('planner.members.you')
  if (m.role === 'organizer') return t('planner.members.organizer')
  return t('planner.members')
}

function sortMembers(list: TripMember[]): TripMember[] {
  return [...list].sort((a, b) => {
    const rank = (m: TripMember) =>
      m.role === 'organizer' ? 0 : m.status === 'joined' ? 1 : 2
    const d = rank(a) - rank(b)
    if (d !== 0) return d
    return (a.joined_at || '').localeCompare(b.joined_at || '')
  })
}

function TravelersPanel({
  members,
  seats,
  currentUserId,
  isOrganizer,
  busy,
  addOpen,
  newName,
  onOpenAdd,
  onCloseAdd,
  onNameChange,
  onAdd,
  onRemove,
  t,
}: {
  members: TripMember[]
  seats: number
  currentUserId: string
  isOrganizer: boolean
  busy: boolean
  addOpen: boolean
  newName: string
  onOpenAdd: () => void
  onCloseAdd: () => void
  onNameChange: (v: string) => void
  onAdd: () => void
  onRemove: (m: TripMember) => void
  t: (k: string, params?: Record<string, string | number>) => string
}) {
  const sorted = sortMembers(members)
  const count = sorted.length
  const full = count >= 6

  return (
    <section className="bg-white rounded-2xl shadow-md p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-lg text-slate-900">{t('planner.members')}</h3>
          <p className="text-sm text-slate-500">
            {t('planner.members.seats', { count, seats: Math.max(seats, count) })}
          </p>
        </div>
        {isOrganizer && !full ? (
          <button
            type="button"
            disabled={busy}
            onClick={onOpenAdd}
            className="text-sm font-bold text-primary-700 bg-orange-50 px-3 py-2 rounded-xl disabled:opacity-50"
          >
            + {t('planner.members.addShort')}
          </button>
        ) : null}
        {isOrganizer && full ? (
          <span className="text-xs font-semibold text-slate-400">{t('planner.members.full')}</span>
        ) : null}
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-slate-500">{t('planner.members.empty')}</p>
      ) : (
        <ul className="space-y-3">
          {sorted.map((m) => {
            const label = memberLabel(m, currentUserId, t)
            const onApp = m.status === 'joined' && !!m.user_id
            const isOrg = m.role === 'organizer'
            const initial = label.trim().charAt(0).toUpperCase() || '?'
            return (
              <li key={m.id} className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0 ${
                    isOrg ? 'bg-primary-500' : onApp ? 'bg-teal-600' : 'bg-slate-400'
                  }`}
                >
                  {initial}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 truncate">{label}</span>
                    {isOrg ? (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-primary-700 bg-orange-50 px-2 py-0.5 rounded-md">
                        {t('planner.members.organizer')}
                      </span>
                    ) : null}
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                      onApp ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${onApp ? 'bg-teal-500' : 'bg-slate-400'}`}
                    />
                    {onApp ? t('planner.members.onApp') : t('planner.members.offApp')}
                  </span>
                </div>
                {isOrganizer && !isOrg ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRemove(m)}
                    className="text-sm font-semibold text-red-600 disabled:opacity-50"
                  >
                    {t('planner.members.remove')}
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {addOpen ? (
        <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/80">
          <p className="font-bold text-slate-900">{t('planner.members.addTitle')}</p>
          <p className="text-sm text-slate-500">{t('planner.members.addHint')}</p>
          <input
            type="text"
            value={newName}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={t('planner.members.namePlaceholder')}
            maxLength={60}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium outline-none focus:border-primary-400"
            onKeyDown={(e) => {
              if (e.key === 'Enter') onAdd()
            }}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCloseAdd}
              className="flex-1 rounded-xl bg-white border border-slate-200 py-2.5 font-semibold text-slate-600"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={busy || newName.trim().length < 2}
              onClick={onAdd}
              className="flex-1 rounded-xl bg-primary-500 text-white py-2.5 font-bold disabled:opacity-50"
            >
              {t('planner.members.add')}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
