import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { getApiClient, normalizeAirports, destinationsToAirports, normalizeDestinations } from '../utils/apiClient'
import { getCurrentUser, getSupabaseClient, signInWithGoogle, onAuthStateChange } from '../lib/supabase'
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
  pickPopularCityGroups,
  type CityAirportGroup,
} from '@flightwatcher/shared'

type TripGalleryDensity = 'solo' | 'duo' | 'multi'

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
    <div className="relative w-full overflow-hidden">
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
        <div className="text-center lg:text-left mb-7 sm:mb-9 max-w-3xl mx-auto lg:mx-0 lg:max-w-none">
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
            className="mt-3 text-muted text-sm sm:text-base leading-relaxed max-w-lg mx-auto lg:mx-0 lg:text-left"
          >
            {t('planner.guest.lead')}
          </motion.p>
        </div>

        <div className="lg:grid lg:grid-cols-2 lg:gap-10 lg:items-start">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="relative mb-7 lg:mb-0 rounded-[1.75rem] bg-gradient-to-br from-[#1A120E] via-[#2A1A12] to-[#3D2418] p-5 sm:p-6 text-white shadow-2xl shadow-orange-900/20 overflow-hidden"
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

        <div>
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
              className="group w-full lg:w-auto lg:min-w-[280px] flex items-center justify-center gap-3 bg-white hover:bg-orange-50 border-2 border-slate-200 hover:border-[#FF6B35]/40 text-slate-900 font-bold py-3.5 px-6 rounded-2xl disabled:opacity-60 shadow-lg shadow-slate-900/5 transition-all"
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
              <p className="mt-3 text-sm text-red-600 font-medium text-center lg:text-left">{error}</p>
            ) : (
              <p className="mt-3 text-xs text-slate-400 text-center lg:text-left font-medium">
                {t('planner.guest.hint')}
              </p>
            )}
          </motion.div>
        </div>
        </div>
      </motion.div>
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Créé',
  scanning: 'Scan…',
  planning: 'Créé',
  locked: 'Confirmé',
}

function TripsGallery({
  trips,
  cityGroups,
  currentUserId,
  onOpen,
}: {
  trips: PlannedTrip[]
  cityGroups: CityAirportGroup[]
  currentUserId: string | null
  onOpen: (id: string) => void
}) {
  const density: TripGalleryDensity =
    trips.length === 1 ? 'solo' : trips.length === 2 ? 'duo' : 'multi'
  const [selfProfile, setSelfProfile] = useState<{
    name: string
    avatarUrl?: string
  } | null>(null)

  useEffect(() => {
    if (!currentUserId) {
      setSelfProfile(null)
      return
    }
    let cancelled = false
    void loadAccountHolderInfo(currentUserId).then((info) => {
      if (!cancelled) setSelfProfile(info)
    })
    return () => {
      cancelled = true
    }
  }, [currentUserId])

  const enrichTrip = (trip: PlannedTrip): PlannedTrip => {
    if (!currentUserId || trip.organizer_id !== currentUserId || !selfProfile) return trip
    const apiName = trip.organizer?.full_name?.trim()
    const apiAvatar = trip.organizer?.avatar_url?.trim()
    const fullName = apiName || selfProfile.name
    const avatarUrl = apiAvatar || selfProfile.avatarUrl || null
    const names = [...(trip.member_names || [])]
    if (names.length > 0) {
      const first = names[0]
      if (!first || first === 'Organisateur' || first === 'Organizer') {
        names[0] = fullName
      }
    }
    return {
      ...trip,
      member_names: names.length ? names : [fullName],
      organizer: {
        id: currentUserId,
        full_name: fullName,
        avatar_url: avatarUrl,
      },
    }
  }

  const cards = trips.map(enrichTrip)

  if (density === 'solo') {
    return (
      <motion.div layout className="w-full">
        <TripListCard
          trip={cards[0]}
          cityGroups={cityGroups}
          density="solo"
          index={0}
          onOpen={onOpen}
        />
      </motion.div>
    )
  }

  if (density === 'duo') {
    return (
      <motion.div
        layout
        className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 min-h-[min(70vh,640px)] md:items-stretch"
      >
        {cards.map((trip, index) => (
          <TripListCard
            key={trip.id}
            trip={trip}
            cityGroups={cityGroups}
            density="duo"
            index={index}
            onOpen={onOpen}
          />
        ))}
      </motion.div>
    )
  }

  return (
    <motion.div
      layout
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5"
    >
      {cards.map((trip, index) => (
        <TripListCard
          key={trip.id}
          trip={trip}
          cityGroups={cityGroups}
          density="multi"
          index={index}
          onOpen={onOpen}
        />
      ))}
    </motion.div>
  )
}

const MEMBER_CHIP_COLORS = [
  'bg-[#FF6B35]',
  'bg-[#E85A28]',
  'bg-[#1A120E]',
  'bg-teal-700',
  'bg-amber-700',
  'bg-slate-600',
]

function firstNameOf(full: string): string {
  const t = full.trim()
  if (!t) return ''
  return t.split(/\s+/)[0]
}

function TripListCard({
  trip,
  cityGroups,
  density,
  index,
  onOpen,
}: {
  trip: PlannedTrip
  cityGroups: CityAirportGroup[]
  density: TripGalleryDensity
  index: number
  onOpen: (id: string) => void
}) {
  const { t } = useI18n()
  const arrival = arrivalDisplayLabel(trip.arrival_airport, cityGroups)
  const imageUri = arrival.isAny ? cityImageUrl(null) : cityImageUrl(arrival.city)
  const codes = arrival.isAny ? [] : arrival.codes.split(' · ').filter(Boolean)
  const cityLabel = arrival.isAny ? 'Destination libre' : arrival.city

  const statusClass =
    trip.status === 'locked'
      ? 'bg-emerald-50/95 text-emerald-700'
      : trip.status === 'planning'
        ? 'bg-orange-50/95 text-[#E85A28]'
        : 'bg-white/95 text-slate-600'

  const [orgAvatarBroken, setOrgAvatarBroken] = useState(false)
  const organizerName =
    trip.organizer?.full_name?.trim() ||
    (trip.member_names?.[0] &&
    trip.member_names[0] !== 'Organisateur' &&
    trip.member_names[0] !== 'Organizer'
      ? trip.member_names[0]
      : null)
  const organizerAvatar = trip.organizer?.avatar_url?.trim() || null

  const memberNames = useMemo(() => {
    const names = [...(trip.member_names || [])]
    if (organizerName && names.length > 0) {
      const first = names[0]
      if (!first || first === 'Organisateur' || first === 'Organizer') {
        names[0] = organizerName
      }
    } else if (organizerName && names.length === 0) {
      names.push(organizerName)
    }
    return names
  }, [trip.member_names, organizerName])

  const maxShown = density === 'multi' ? 3 : density === 'duo' ? 4 : 5
  const shownMembers = memberNames.slice(0, maxShown)
  const extraMembers = Math.max(0, memberNames.length - shownMembers.length)
  const withLabel = shownMembers.map(firstNameOf).filter(Boolean).join(', ')

  useEffect(() => {
    setOrgAvatarBroken(false)
  }, [organizerAvatar])

  const travelersBlock =
    shownMembers.length > 0 ? (
      <div className={`flex items-center gap-2.5 min-w-0 ${density === 'solo' ? 'mt-5' : 'mt-3'}`}>
        <div className="flex -space-x-2 shrink-0">
          {shownMembers.map((name, i) => {
            const isOrganizerChip = i === 0 && !!organizerAvatar && !orgAvatarBroken
            return (
              <span
                key={`${name}-${i}`}
                className={`relative w-7 h-7 rounded-full border-2 border-white text-white text-[10px] font-black flex items-center justify-center shadow-sm overflow-hidden ${
                  isOrganizerChip ? 'bg-slate-100' : MEMBER_CHIP_COLORS[i % MEMBER_CHIP_COLORS.length]
                }`}
                title={name}
              >
                {isOrganizerChip ? (
                  <img
                    src={organizerAvatar!}
                    alt={name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={() => setOrgAvatarBroken(true)}
                  />
                ) : (
                  (firstNameOf(name) || '?').charAt(0).toUpperCase()
                )}
              </span>
            )
          })}
          {extraMembers > 0 ? (
            <span className="w-7 h-7 rounded-full border-2 border-white bg-slate-200 text-slate-600 text-[10px] font-black flex items-center justify-center">
              +{extraMembers}
            </span>
          ) : null}
        </div>
        <p
          className={`min-w-0 truncate font-semibold text-slate-600 ${
            density === 'solo' ? 'text-[15px]' : 'text-sm'
          }`}
        >
          {t('planner.card.with', {
            names: withLabel + (extraMembers > 0 ? ` +${extraMembers}` : ''),
          })}
        </p>
      </div>
    ) : null

  const meta = (
    <>
      <div className="flex flex-wrap gap-2">
        <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-[#FFF3EC] text-[#8B2E0E]">
          {trip.passengers} voy.
        </span>
        {trip.route_ok === false ? (
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-50 text-amber-800">
            Route à mettre à jour
          </span>
        ) : null}
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
          {formatDateFr(trip.dates_retour[trip.dates_retour.length - 1].date)}
        </p>
      ) : null}
      {travelersBlock}
    </>
  )

  if (density === 'solo') {
    return (
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => onOpen(trip.id)}
        className="group w-full text-left bg-white rounded-[32px] border border-orange-100/70 shadow-lg hover:shadow-2xl transition-all overflow-hidden"
      >
        <div className="grid lg:grid-cols-5 min-h-[min(72vh,560px)]">
          <div className="relative lg:col-span-3 h-64 sm:h-80 lg:h-auto min-h-[280px] overflow-hidden">
            <img
              src={imageUri}
              alt={cityLabel}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-black/10 lg:to-black/40" />
            <span
              className={`absolute top-5 right-5 text-[11px] font-bold px-3 py-1.5 rounded-full backdrop-blur-sm ${statusClass}`}
            >
              {STATUS_LABEL[trip.status] || trip.status}
            </span>
            <div className="absolute bottom-6 left-6 right-6 lg:hidden">
              <p className="text-white text-4xl font-black tracking-tight">{cityLabel}</p>
              <div className="flex items-center gap-2 mt-2 text-white font-bold text-sm tracking-wide">
                <span>{trip.departure_airport}</span>
                <span className="w-8 h-0.5 rounded bg-white/55" />
                <span>{arrival.isAny ? 'ANY' : codes[0]}</span>
              </div>
            </div>
          </div>
          <div className="lg:col-span-2 flex flex-col justify-between p-6 sm:p-8 lg:p-10">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#E85A28] mb-2">
                Ton voyage
              </p>
              <h3 className="font-black text-3xl sm:text-4xl text-slate-900 tracking-tight leading-tight group-hover:text-[#E85A28] transition-colors">
                {trip.name}
              </h3>
              <p className="hidden lg:block text-2xl font-bold text-slate-700 mt-3 tracking-tight">
                {cityLabel}
              </p>
              <div className="hidden lg:flex items-center gap-2 mt-2 text-slate-500 font-bold text-sm tracking-wide">
                <span>{trip.departure_airport}</span>
                <span className="w-7 h-0.5 rounded bg-slate-300" />
                <span>{arrival.isAny ? 'ANY' : codes[0]}</span>
                {codes.length > 1 ? (
                  <span className="text-slate-400 font-semibold text-xs">+{codes.length - 1}</span>
                ) : null}
              </div>
              <div className="mt-6">{meta}</div>
            </div>
            <div className="mt-8 pt-5 border-t border-orange-50 flex items-center justify-between">
              <span className="text-base font-bold text-[#FF6B35]">Ouvrir le voyage</span>
              <span className="w-11 h-11 rounded-2xl bg-[#FFF3EC] text-[#FF6B35] font-black text-xl flex items-center justify-center group-hover:translate-x-0.5 transition-transform">
                ›
              </span>
            </div>
          </div>
        </div>
      </motion.button>
    )
  }

  const imageH =
    density === 'duo' ? 'h-56 sm:h-72 md:h-[min(46vh,360px)]' : 'h-44 sm:h-52'

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={() => onOpen(trip.id)}
      className={`group w-full text-left bg-white rounded-[28px] border border-orange-100/70 shadow-md hover:shadow-2xl hover:-translate-y-0.5 transition-all overflow-hidden h-full flex flex-col ${
        density === 'duo' ? 'min-h-[420px]' : ''
      }`}
    >
      <div className={`relative ${imageH} shrink-0 overflow-hidden`}>
        <img
          src={imageUri}
          alt={cityLabel}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/20" />
        <span
          className={`absolute top-4 right-4 text-[11px] font-bold px-3 py-1.5 rounded-full backdrop-blur-sm ${statusClass}`}
        >
          {STATUS_LABEL[trip.status] || trip.status}
        </span>
        <div className="absolute bottom-4 left-5 right-5">
          <p
            className={`text-white font-black tracking-tight ${
              density === 'duo' ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl'
            }`}
          >
            {cityLabel}
          </p>
          <div className="flex items-center gap-2 mt-2 text-white font-bold text-sm tracking-wide">
            <span>{trip.departure_airport}</span>
            <span className="w-7 h-0.5 rounded bg-white/55" />
            <span>{arrival.isAny ? 'ANY' : codes[0]}</span>
            {codes.length > 1 ? (
              <span className="text-white/75 font-semibold text-xs">+{codes.length - 1}</span>
            ) : null}
          </div>
        </div>
      </div>
      <div className={`flex-1 flex flex-col ${density === 'duo' ? 'p-6 sm:p-7' : 'p-5'}`}>
        <h3
          className={`font-bold text-slate-900 tracking-tight group-hover:text-[#E85A28] transition-colors ${
            density === 'duo' ? 'text-2xl' : 'text-xl'
          }`}
        >
          {trip.name}
        </h3>
        <div className="mt-3 flex-1">{meta}</div>
        <div className="mt-4 pt-3 border-t border-orange-50 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#FF6B35]">Voir le voyage</span>
          <span className="text-[#FF6B35] text-xl leading-none group-hover:translate-x-0.5 transition-transform">
            ›
          </span>
        </div>
      </div>
    </motion.button>
  )
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
  const [autoScanTripId, setAutoScanTripId] = useState<string | null>(null)
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
        autoScan={autoScanTripId === selectedTripId}
        onAutoScanDone={() => setAutoScanTripId(null)}
        onBack={() => {
          setSelectedTripId(null)
          setAutoScanTripId(null)
          void load()
        }}
        onDeleted={() => {
          setSelectedTripId(null)
          setAutoScanTripId(null)
          void load()
        }}
        onToast={setToast}
      />
    )
  }

  return (
    <div className="relative w-full">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -right-10 w-72 h-72 rounded-full bg-[#FF6B35]/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-40 -left-16 w-56 h-56 rounded-full bg-[#FFB088]/20 blur-3xl"
      />

      <div className="relative mb-7 sm:mb-9 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="app-kicker mb-1.5">Planner</p>
          <h2 className="app-title">Tes voyages</h2>
          <p className="app-subtitle mt-1.5">
            Crée, scanne les prix, invite tes proches.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="app-btn-primary shrink-0"
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
        <TripsGallery
          trips={trips}
          cityGroups={cityGroups}
          currentUserId={userId}
          onOpen={(id) => setSelectedTripId(id)}
        />
      )}

      {showCreate ? (
        <CreateTripModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false)
            void load()
            setAutoScanTripId(id)
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

const CREATE_STEPS = [
  { id: 1 as const, label: 'Départ', title: 'D’où pars-tu ?', hint: 'Choisis ton aéroport de départ' },
  { id: 2 as const, label: 'Destination', title: 'Où vas-tu ?', hint: 'Optionnel — laisse ouvert pour t’inspirer' },
  { id: 3 as const, label: 'Détails', title: 'Cadre du voyage', hint: 'Dates, budget, voyageurs' },
]

const POPULAR_DEPARTURE_CODES = ['BVA', 'CRL', 'ORY', 'CDG', 'LTN', 'STN', 'MAD', 'BCN', 'FCO', 'BGY']

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
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [name, setName] = useState('')
  const [departure, setDeparture] = useState('')
  const [arrivalCityKey, setArrivalCityKey] = useState('')
  const [arrivalCodes, setArrivalCodes] = useState<string[]>([])
  const [airports, setAirports] = useState<Airport[]>([])
  const [arrivalAirports, setArrivalAirports] = useState<Airport[]>([])
  const [airportQuery, setAirportQuery] = useState('')
  const [cityQuery, setCityQuery] = useState('')
  const [passengers, setPassengers] = useState(2)
  const [budget, setBudget] = useState(150)
  const [preset, setPreset] = useState<DatePreset>('next-weekend')
  const [datesDepart, setDatesDepart] = useState<DateAvecHoraire[]>(initial.dates_depart)
  const [datesRetour, setDatesRetour] = useState<DateAvecHoraire[]>(initial.dates_retour)
  const [showFlexible, setShowFlexible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cityGroups = useMemo(() => groupAirportsByCity(arrivalAirports), [arrivalAirports])
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

  const popularCities = useMemo(() => pickPopularCityGroups(cityGroups, 8), [cityGroups])

  const departureAirport = useMemo(
    () => airports.find((a) => a.code === departure) ?? null,
    [airports, departure],
  )

  const popularDepartures = useMemo(() => {
    const byCode = new Map(airports.map((a) => [a.code, a]))
    return POPULAR_DEPARTURE_CODES.map((code) => byCode.get(code)).filter(
      (a): a is Airport => Boolean(a),
    )
  }, [airports])

  const filteredDepartures = useMemo(() => {
    const q = airportQuery.trim().toLowerCase()
    if (q.length < 2) return []
    const scored = airports
      .map((a) => {
        const code = a.code.toLowerCase()
        const city = a.city.toLowerCase()
        const name = a.name.toLowerCase()
        const country = a.country.toLowerCase()
        let score = 0
        if (code === q) score = 100
        else if (code.startsWith(q)) score = 90
        else if (city.startsWith(q)) score = 80
        else if (city.includes(q)) score = 60
        else if (name.includes(q) || country.includes(q)) score = 40
        else if (code.includes(q)) score = 30
        else return null
        return { a, score }
      })
      .filter((x): x is { a: Airport; score: number } => Boolean(x))
      .sort((x, y) => y.score - x.score || x.a.city.localeCompare(y.a.city))
    return scored.slice(0, 8).map((x) => x.a)
  }, [airports, airportQuery])

  useEffect(() => {
    void getApiClient()
      .getAirports()
      .then((raw) => setAirports(normalizeAirports(raw as Airport[] | { airports: Airport[] })))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!departure) {
      setArrivalAirports([])
      return
    }
    let cancelled = false
    void getApiClient()
      .getDestinations(departure)
      .then((raw) => {
        if (cancelled) return
        const next = destinationsToAirports(normalizeDestinations(raw as any))
        setArrivalAirports(next)
        setArrivalCodes((codes) => {
          const allowed = new Set(next.map((a) => a.code))
          const kept = codes.filter((c) => allowed.has(c))
          if (kept.length !== codes.length) {
            setArrivalCityKey('')
            return []
          }
          return codes
        })
      })
      .catch(() => {
        if (!cancelled) setArrivalAirports([])
      })
    return () => {
      cancelled = true
    }
  }, [departure])

  const selectDeparture = (airport: Airport) => {
    setDeparture(airport.code)
    setAirportQuery('')
    setError(null)
    setStep(2)
  }

  const selectCity = (group: CityAirportGroup | null, advance = false) => {
    if (!group) {
      setArrivalCityKey('')
      setArrivalCodes([])
      if (!name.trim() || name.startsWith('Weekend ')) setName('')
      if (advance) setStep(3)
      return
    }
    setArrivalCityKey(group.key)
    setArrivalCodes(group.airports.map((a) => a.code))
    if (!name.trim() || name.startsWith('Weekend ')) setName(`Weekend ${group.city}`)
    if (advance) setStep(3)
  }

  const onPreset = (p: DatePreset) => {
    setPreset(p)
    if (p === 'flexible') {
      setShowFlexible(true)
      return
    }
    const d = generateDatesFromPreset(p)
    setDatesDepart(
      d.dates_depart.map((x) => ({ ...x, heure_min: '00:00', heure_max: '23:59' })),
    )
    setDatesRetour(
      d.dates_retour.map((x) => ({ ...x, heure_min: '00:00', heure_max: '23:59' })),
    )
  }

  const goNext = () => {
    setError(null)
    if (step === 1) {
      if (!departure) {
        setError('Choisis un aéroport de départ')
        return
      }
      setStep(2)
      return
    }
    if (step === 2) {
      setStep(3)
      return
    }
  }

  const goBack = () => {
    setError(null)
    if (step === 1) {
      onClose()
      return
    }
    setStep((s) => (s === 3 ? 2 : 1))
  }

  const submit = async () => {
    if (!departure) {
      setError('Choisis un aéroport de départ')
      setStep(1)
      return
    }
    const tripName =
      name.trim() ||
      (selectedCity ? `Weekend ${selectedCity.city}` : `Weekend depuis ${departure}`)
    if (!datesDepart.length || !datesRetour.length) {
      setError('Dates requises')
      return
    }
    setSaving(true)
    setError(null)
    const body: CreatePlannedTripRequest = {
      name: tripName,
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

  const stepMeta = CREATE_STEPS[step - 1]

  return (
    <div className="app-dialog-root">
      <button type="button" aria-label="Fermer" className="app-dialog-backdrop" onClick={onClose} />
      <div className="app-dialog-panel app-dialog-xl">
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-line px-5 sm:px-8 py-4 sm:py-5 z-10">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#E85A28] mb-1">
                Étape {step} / 3
              </p>
              <h3 className="font-extrabold text-xl sm:text-2xl text-ink tracking-tight">
                {stepMeta.title}
              </h3>
              <p className="text-sm text-muted mt-0.5">{stepMeta.hint}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 shrink-0 rounded-full bg-canvas text-ink-soft font-bold hover:bg-primary-50"
            >
              ✕
            </button>
          </div>

          <div className="flex items-center gap-2">
            {CREATE_STEPS.map((s, i) => {
              const done = step > s.id
              const active = step === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={s.id > step && (s.id === 2 ? !departure : s.id === 3 ? !departure : false)}
                  onClick={() => {
                    if (s.id === 1 || (s.id === 2 && departure) || (s.id === 3 && departure)) {
                      setError(null)
                      setStep(s.id)
                    }
                  }}
                  className="flex-1 min-w-0 group"
                >
                  <div
                    className={`h-1.5 rounded-full transition-colors ${
                      done || active ? 'bg-[#FF6B35]' : 'bg-slate-200'
                    }`}
                  />
                  <p
                    className={`mt-1.5 text-[11px] sm:text-xs font-bold truncate text-left ${
                      active ? 'text-[#E85A28]' : done ? 'text-slate-700' : 'text-slate-400'
                    }`}
                  >
                    {i + 1}. {s.label}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        <div className="p-5 sm:p-8 min-h-[420px]">
          {step === 1 ? (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              {popularDepartures.length > 0 ? (
                <div>
                  <p className="text-sm font-bold text-slate-700 mb-3">Départs fréquents</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
                    {popularDepartures.map((a, i) => {
                      const active = departure === a.code
                      return (
                        <motion.button
                          key={a.code}
                          type="button"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.03 }}
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => selectDeparture(a)}
                          className={`relative overflow-hidden rounded-2xl text-left h-[104px] sm:h-[112px] group border-2 transition-shadow ${
                            active
                              ? 'border-[#FF6B35] shadow-md shadow-orange-500/20'
                              : 'border-transparent hover:border-orange-200 shadow-sm'
                          }`}
                        >
                          <img
                            src={cityImageUrl(a.city)}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/10" />
                          {active ? (
                            <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#FF6B35] text-white text-[10px] font-black flex items-center justify-center">
                              ✓
                            </span>
                          ) : null}
                          <div className="relative h-full flex flex-col justify-end p-2.5 sm:p-3">
                            <span className="inline-flex self-start px-1.5 py-0.5 rounded-md bg-white/95 text-[11px] font-black tracking-wider text-slate-900 mb-1">
                              {a.code}
                            </span>
                            <p className="text-white font-bold text-sm sm:text-[15px] leading-tight truncate drop-shadow-sm">
                              {a.city}
                            </p>
                          </div>
                        </motion.button>
                      )
                    })}
                  </div>
                </div>
              ) : airports.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Chargement des aéroports…</p>
              ) : null}

              <div className="relative">
                <p className="text-sm font-bold text-slate-700 mb-2">Autre aéroport</p>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <circle cx="11" cy="11" r="7" />
                      <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
                    </svg>
                  </span>
                  <input
                    value={airportQuery}
                    onChange={(e) => setAirportQuery(e.target.value)}
                    placeholder="Tape une ville ou un code…"
                    autoComplete="off"
                    className="w-full border border-slate-200 rounded-2xl pl-11 pr-4 py-3.5 font-medium text-[15px] focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 bg-white"
                  />
                  {airportQuery ? (
                    <button
                      type="button"
                      onClick={() => setAirportQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-100 text-slate-500 text-xs font-bold hover:bg-slate-200"
                      aria-label="Effacer"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>

                {airportQuery.trim().length > 0 && airportQuery.trim().length < 2 ? (
                  <p className="mt-2 text-xs text-slate-400 font-medium px-1">
                    Continue à taper pour afficher des suggestions…
                  </p>
                ) : null}

                {airportQuery.trim().length >= 2 ? (
                  <div className="absolute left-0 right-0 z-20 mt-1.5 max-h-[260px] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lift">
                    {filteredDepartures.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-8 px-4">
                        Aucun aéroport pour « {airportQuery.trim()} »
                      </p>
                    ) : (
                      <ul className="py-1.5" role="listbox">
                        {filteredDepartures.map((a) => {
                          const active = departure === a.code
                          return (
                            <li key={a.code}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={active}
                                onClick={() => selectDeparture(a)}
                                className={`w-full flex items-center gap-3 text-left px-3.5 py-2.5 transition-colors ${
                                  active ? 'bg-[#FFF3EC]' : 'hover:bg-slate-50'
                                }`}
                              >
                                <span
                                  className={`shrink-0 w-12 h-10 rounded-xl font-black tracking-wider text-xs flex items-center justify-center ${
                                    active ? 'bg-[#FF6B35] text-white' : 'bg-slate-100 text-slate-800'
                                  }`}
                                >
                                  {a.code}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block font-bold text-slate-900 truncate text-sm">{a.city}</span>
                                  <span className="block text-xs text-slate-500 truncate">
                                    {a.name} · {a.country}
                                  </span>
                                </span>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>

              {departureAirport && !airportQuery.trim() ? (
                <div className="flex items-center gap-3 rounded-2xl border border-orange-200 bg-[#FFF3EC] px-4 py-3">
                  <div className="w-11 h-11 rounded-xl bg-[#FF6B35] text-white font-black flex items-center justify-center tracking-wider shrink-0 text-sm">
                    {departureAirport.code}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 truncate">{departureAirport.city}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {departureAirport.name} · {departureAirport.country}
                    </p>
                  </div>
                  <span className="text-xs font-bold text-[#E85A28]">Sélectionné</span>
                </div>
              ) : null}
            </motion.div>
          ) : null}

          {step === 2 ? (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
                <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-slate-100 font-black text-slate-800 tracking-wider">
                  {departure}
                </span>
                <span>→</span>
                <span>{selectedCity ? selectedCity.city : 'Toutes destinations'}</span>
              </div>

              <button
                type="button"
                onClick={() => selectCity(null, true)}
                className={`w-full text-left rounded-2xl border px-4 py-4 transition-colors ${
                  !arrivalCityKey
                    ? 'border-[#FF6B35] bg-[#FFF3EC]'
                    : 'border-dashed border-slate-200 bg-slate-50 hover:border-orange-300 hover:bg-[#FFF8F3]'
                }`}
              >
                <p className="font-bold text-slate-800">Toutes destinations</p>
                <p className="text-xs text-slate-500 mt-0.5">Mode inspire — sans filtre ville</p>
              </button>

              {selectedCity ? (
                <div className="relative rounded-2xl overflow-hidden h-36 sm:h-40 shadow-sm">
                  <img
                    src={cityImageUrl(selectedCity.city)}
                    alt={selectedCity.city}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
                    <div>
                      <p className="text-white font-black text-xl tracking-tight">{selectedCity.city}</p>
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
              ) : null}

              {popularCities.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {popularCities.map((g) => (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => selectCity(g, true)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${
                        g.key === arrivalCityKey
                          ? 'bg-[#FF6B35] text-white border-[#FF6B35]'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-orange-300'
                      }`}
                    >
                      {g.city}
                    </button>
                  ))}
                </div>
              ) : null}

              <p className="text-[11px] text-slate-400">
                Routes Ryanair depuis {departure} · mises à jour en direct
              </p>
              <input
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
                placeholder="Chercher une ville…"
                className="w-full border border-slate-200 rounded-2xl px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-primary-300"
              />
              <div className="max-h-[260px] sm:max-h-[300px] overflow-y-auto space-y-1.5 rounded-2xl border border-slate-100 p-1.5 bg-white">
                {filteredCities.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-10">
                    {arrivalAirports.length === 0 ? 'Chargement des destinations…' : 'Aucune ville trouvée'}
                  </p>
                ) : (
                  filteredCities.map((g) => (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => selectCity(g, true)}
                      className={`w-full flex items-center gap-3 text-left px-2.5 py-2.5 rounded-xl transition-colors ${
                        g.key === arrivalCityKey
                          ? 'bg-[#FFF3EC] ring-1 ring-orange-200'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <img
                        src={cityImageUrl(g.city)}
                        alt=""
                        className="w-12 h-12 rounded-xl object-cover shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900 truncate">{g.city}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {g.country} · {g.airports.map((a) => a.code).join(' · ')}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          ) : null}

          {step === 3 ? (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-5 max-w-xl mx-auto"
            >
              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-black tracking-wider text-slate-900">{departure}</span>
                <span className="text-slate-400">→</span>
                <span className="font-semibold text-slate-800">
                  {selectedCity ? selectedCity.city : 'Toutes destinations'}
                </span>
                {datesDepart[0] && datesRetour[0] ? (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-600 font-medium">
                      {formatDateFr(datesDepart[0].date)} →{' '}
                      {formatDateFr(datesRetour[datesRetour.length - 1].date)}
                    </span>
                  </>
                ) : null}
              </div>

              <div>
                <label className="text-sm font-bold text-slate-700 block mb-1.5">Nom du voyage</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    selectedCity
                      ? `Weekend ${selectedCity.city}`
                      : `Weekend depuis ${departure || '…'}`
                  }
                  className="w-full border border-slate-200 rounded-2xl px-4 py-3 font-medium text-[15px] focus:outline-none focus:ring-2 focus:ring-primary-300"
                />
              </div>

              <div className="[&>div]:mb-4">
                <DatePresets
                  selected={preset}
                  onChange={onPreset}
                  onFlexibleClick={() => {
                    setPreset('flexible')
                    setShowFlexible(true)
                  }}
                />
              </div>

              <div className="[&>div]:mb-4">
                <PassengerStepper value={passengers} onChange={setPassengers} />
              </div>
              <div className="[&>div]:mb-2">
                <BudgetSlider value={budget} onChange={setBudget} />
              </div>
            </motion.div>
          ) : null}

          {error ? <p className="text-sm text-red-600 font-medium mt-5">{error}</p> : null}
        </div>

        <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-line px-5 sm:px-8 py-4 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          <button
            type="button"
            onClick={goBack}
            className="sm:px-5 py-3 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {step === 1 ? 'Annuler' : 'Retour'}
          </button>
          {step < 3 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={step === 1 && !departure}
              className="app-btn-primary rounded-2xl disabled:opacity-50 sm:min-w-[200px] py-3.5"
            >
              Continuer
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving}
              className="app-btn-primary rounded-2xl disabled:opacity-60 sm:min-w-[220px] py-3.5"
            >
              {saving ? '…' : t('planner.create')}
            </button>
          )}
        </div>

        {showFlexible ? (
          <div className="app-dialog-root z-[60]">
            <button type="button" aria-label="Fermer" className="app-dialog-backdrop" onClick={() => setShowFlexible(false)} />
            <div className="app-dialog-panel app-dialog-xl p-5 sm:p-8">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-extrabold text-lg text-ink">Dates libres</h4>
                <button
                  type="button"
                  onClick={() => setShowFlexible(false)}
                  className="font-bold text-primary-600 px-3 py-1.5 rounded-xl hover:bg-primary-50"
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
  autoScan = false,
  onAutoScanDone,
  onBack,
  onDeleted,
  onToast,
}: {
  tripId: string
  userId: string
  autoScan?: boolean
  onAutoScanDone?: () => void
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
  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName, setNewLastName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [bookingTrip, setBookingTrip] = useState<EnrichedTripResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanEmpty, setScanEmpty] = useState<{
    reason: 'budget' | 'no_flights'
    budget: number
    cheapest?: number | null
  } | null>(null)
  const [editBudget, setEditBudget] = useState(150)
  const [editDatesDepart, setEditDatesDepart] = useState<DateAvecHoraire[]>([])
  const [editDatesRetour, setEditDatesRetour] = useState<DateAvecHoraire[]>([])
  const [editPreset, setEditPreset] = useState<DatePreset>('next-weekend')
  const [showEditFlexible, setShowEditFlexible] = useState(false)
  const [savingCriteria, setSavingCriteria] = useState(false)
  const [watchBusy, setWatchBusy] = useState(false)
  const [watchInterval, setWatchInterval] = useState(3600)
  const autoScanStarted = useRef(false)

  const syncEditFromTrip = useCallback((detail: PlannedTripDetail) => {
    setEditBudget(detail.budget_max || 150)
    setEditDatesDepart(detail.dates_depart || [])
    setEditDatesRetour(detail.dates_retour || [])
    setEditPreset('flexible')
    setWatchInterval(
      Math.max(900, detail.auto_scan_interval_seconds || 3600),
    )
  }, [])

  const load = useCallback(async () => {
    setError(null)
    try {
      const detail = await getApiClient().getPlannedTrip(tripId)
      setTrip(detail)
      syncEditFromTrip(detail)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setLoading(false)
    }
  }, [tripId, t, syncEditFromTrip])

  useEffect(() => {
    void load()
  }, [load])

  const isOrganizer = trip?.organizer_id === userId
  const pending = (trip?.proposals || []).filter((p) => p.status === 'pending')
  const accepted = (trip?.proposals || []).find((p) => p.status === 'accepted')

  const suggestedBudget = useMemo(() => {
    if (!scanEmpty?.cheapest) return null
    return Math.min(1000, Math.max(20, Math.ceil(scanEmpty.cheapest / 10) * 10))
  }, [scanEmpty?.cheapest])

  const onEditPreset = (p: DatePreset) => {
    setEditPreset(p)
    if (p === 'flexible') {
      setShowEditFlexible(true)
      return
    }
    const d = generateDatesFromPreset(p)
    setEditDatesDepart(
      d.dates_depart.map((x) => ({ ...x, heure_min: '00:00', heure_max: '23:59' })),
    )
    setEditDatesRetour(
      d.dates_retour.map((x) => ({ ...x, heure_min: '00:00', heure_max: '23:59' })),
    )
  }

  const datesChanged = (a: DateAvecHoraire[], b: DateAvecHoraire[]) => {
    if (a.length !== b.length) return true
    return a.some(
      (d, i) =>
        d.date !== b[i]?.date ||
        d.heure_min !== b[i]?.heure_min ||
        d.heure_max !== b[i]?.heure_max,
    )
  }

  const scan = useCallback(async () => {
    setScanning(true)
    setScanEmpty(null)
    setError(null)
    try {
      const scanRes = await getApiClient().scanPlannedTrip(tripId)
      const proposals = scanRes.proposals || []
      setTrip((prev) =>
        prev
          ? {
              ...prev,
              status: 'planning',
              proposals,
              proposals_count: proposals.length,
            }
          : prev,
      )
      await load()
      if (proposals.length === 0) {
        const budget = scanRes.budget_max ?? trip?.budget_max ?? 150
        const cheapest = scanRes.cheapest_found
        setScanEmpty({
          reason: scanRes.empty_reason === 'budget' ? 'budget' : 'no_flights',
          budget,
          cheapest,
        })
        if (cheapest != null) {
          setEditBudget(Math.min(1000, Math.max(budget, Math.ceil(cheapest / 10) * 10)))
        }
      } else {
        setScanEmpty(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setScanning(false)
    }
  }, [tripId, trip?.budget_max, load, t])

  const updateCriteriaAndScan = async () => {
    if (!trip) return
    if (!editDatesDepart.length || !editDatesRetour.length) {
      setError('Dates requises')
      return
    }
    const nextBudget = Math.min(1000, Math.max(20, Math.round(editBudget / 10) * 10))
    const patch: Partial<CreatePlannedTripRequest> = {}
    if (nextBudget !== trip.budget_max) patch.budget_max = nextBudget
    if (datesChanged(editDatesDepart, trip.dates_depart || [])) {
      patch.dates_depart = editDatesDepart
    }
    if (datesChanged(editDatesRetour, trip.dates_retour || [])) {
      patch.dates_retour = editDatesRetour
    }
    setSavingCriteria(true)
    setError(null)
    try {
      if (Object.keys(patch).length > 0) {
        await getApiClient().updatePlannedTrip(tripId, patch)
        setTrip((prev) =>
          prev
            ? {
                ...prev,
                budget_max: nextBudget,
                dates_depart: editDatesDepart,
                dates_retour: editDatesRetour,
              }
            : prev,
        )
        setEditBudget(nextBudget)
      }
      await scan()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setSavingCriteria(false)
    }
  }

  useEffect(() => {
    if (!autoScan || !trip || !isOrganizer || loading || autoScanStarted.current) return
    autoScanStarted.current = true
    void scan().finally(() => onAutoScanDone?.())
  }, [autoScan, trip, isOrganizer, loading, scan, onAutoScanDone])

  const setPriceWatch = async (enabled: boolean) => {
    if (!trip) return
    const interval = Math.max(900, watchInterval || 3600)
    setWatchBusy(true)
    setError(null)
    try {
      const updated = await getApiClient().updatePlannedTrip(tripId, {
        auto_scan_enabled: enabled,
        auto_scan_interval_seconds: interval,
      })
      setTrip((prev) =>
        prev
          ? {
              ...prev,
              auto_scan_enabled: updated.auto_scan_enabled ?? enabled,
              auto_scan_interval_seconds:
                updated.auto_scan_interval_seconds ?? interval,
            }
          : prev,
      )
      setWatchInterval(updated.auto_scan_interval_seconds ?? interval)
      onToast(
        enabled ? t('planner.watch.on') : t('planner.watch.off'),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setWatchBusy(false)
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
    const first_name = newFirstName.trim()
    const last_name = newLastName.trim()
    const email = newEmail.trim().toLowerCase()
    if (!first_name) {
      setError(t('planner.members.firstNameRequired'))
      return
    }
    if (!last_name) {
      setError(t('planner.members.lastNameRequired'))
      return
    }
    if (!email) {
      setError(t('planner.members.emailRequired'))
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t('planner.members.emailInvalid'))
      return
    }
    setMembersBusy(true)
    setError(null)
    try {
      await getApiClient().addTripMember(tripId, { first_name, last_name, email })
      setNewFirstName('')
      setNewLastName('')
      setNewEmail('')
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

  const clearStaleArrival = async () => {
    setError(null)
    try {
      await getApiClient().updatePlannedTrip(tripId, { arrival_airport: null })
      await load()
      onToast('Destination retirée — mode inspire')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
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
    <div className="w-full space-y-6">
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

      {trip.route_ok === false ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <p className="font-bold text-amber-900">{t('planner.routeStale')}</p>
          <p className="text-sm text-amber-800">
            {t('planner.routeStaleBody', {
              codes: (trip.invalid_arrival_codes || []).join(', '),
              dep: trip.departure_airport,
            })}
          </p>
          {isOrganizer ? (
            <button
              type="button"
              onClick={() => void clearStaleArrival()}
              className="text-sm font-bold bg-amber-500 text-white px-4 py-2 rounded-xl"
            >
              {t('planner.routeClear')}
            </button>
          ) : null}
        </div>
      ) : null}

      <TravelersPanel
        members={trip.members || []}
        seats={trip.passengers}
        currentUserId={userId}
        isOrganizer={!!isOrganizer}
        busy={membersBusy}
        addOpen={addOpen}
        newFirstName={newFirstName}
        newLastName={newLastName}
        newEmail={newEmail}
        onOpenAdd={() => setAddOpen(true)}
        onCloseAdd={() => {
          setAddOpen(false)
          setNewFirstName('')
          setNewLastName('')
          setNewEmail('')
        }}
        onFirstNameChange={setNewFirstName}
        onLastNameChange={setNewLastName}
        onEmailChange={setNewEmail}
        onAdd={() => void addMember()}
        onRemove={(m) => void removeMember(m)}
        t={t}
      />

      {error ? <p className="text-red-600 text-sm font-medium">{error}</p> : null}

      {isOrganizer && trip.status !== 'locked' ? (
        <div className="space-y-3">
          <button
            type="button"
            disabled={scanning}
            onClick={() => void scan()}
            className="w-full sm:w-auto app-btn-primary rounded-2xl px-6 disabled:opacity-60"
          >
            {scanning ? t('planner.scanning') : t('planner.scan')}
          </button>

          <div className="rounded-2xl border border-orange-100 bg-[#FFF8F3] px-4 py-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold text-slate-900">{t('planner.watch')}</p>
                <p className="text-sm text-slate-500 mt-0.5">{t('planner.watch.hint')}</p>
              </div>
              <button
                type="button"
                disabled={watchBusy}
                onClick={() => void setPriceWatch(!trip.auto_scan_enabled)}
                className={`shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition-colors disabled:opacity-60 ${
                  trip.auto_scan_enabled
                    ? 'bg-slate-200 text-slate-700'
                    : 'bg-primary-500 text-white'
                }`}
              >
                {trip.auto_scan_enabled ? t('planner.watch.off') : t('planner.watch')}
              </button>
            </div>
            {trip.auto_scan_enabled ? (
              <p className="text-xs font-semibold text-primary-700">
                {t('planner.watch.every', {
                  minutes: Math.floor(
                    (trip.auto_scan_interval_seconds || watchInterval || 3600) / 60,
                  ),
                })}
              </p>
            ) : (
              <label className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span className="font-semibold">{t('planner.watch.interval')}</span>
                <select
                  value={watchInterval}
                  onChange={(e) => setWatchInterval(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-semibold"
                >
                  <option value={900}>15 min</option>
                  <option value={1800}>30 min</option>
                  <option value={3600}>1 h</option>
                  <option value={7200}>2 h</option>
                  <option value={21600}>6 h</option>
                  <option value={86400}>24 h</option>
                </select>
              </label>
            )}
          </div>
        </div>
      ) : null}

      {scanning ? (
        <div className="rounded-2xl border border-orange-100 bg-[#FFF8F3] px-5 py-8 text-center">
          <div className="mx-auto mb-3 w-9 h-9 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
          <p className="font-bold text-slate-900">{t('planner.scan.auto')}</p>
          <p className="text-sm text-slate-500 mt-1">
            {trip.departure_airport}
            {trip.arrival_airport ? ` → ${trip.arrival_airport.replace(/,/g, ' · ')}` : ' → inspire'}
            {' · '}
            {trip.budget_max}€/pers
          </p>
        </div>
      ) : null}

      {accepted ? (
        <section className="space-y-4">
          <h3 className="font-bold text-lg text-ink">Proposition acceptée</h3>
          <div className="max-w-md">
            <DestinationCard
              trip={accepted.trip_data}
              onSaveFavorite={() => undefined}
              onBook={() => setBookingTrip(accepted.trip_data)}
            />
          </div>
        </section>
      ) : null}

      {pending.length > 0 ? (
        <section className="space-y-4">
          <h3 className="font-bold text-lg text-ink">
            {t('planner.proposals')} ({pending.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
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
          </div>
        </section>
      ) : null}

      {!accepted && pending.length === 0 && !scanning ? (
        scanEmpty ? (
          <div
            className={`rounded-2xl border px-5 py-6 sm:px-7 sm:py-7 ${
              scanEmpty.reason === 'budget'
                ? 'border-amber-200 bg-amber-50'
                : 'border-slate-200 bg-white shadow-sm'
            }`}
          >
            <div className="text-center">
              <p
                className={`font-extrabold text-lg ${
                  scanEmpty.reason === 'budget' ? 'text-amber-950' : 'text-slate-900'
                }`}
              >
                {scanEmpty.reason === 'budget'
                  ? t('planner.scan.emptyBudget', { budget: scanEmpty.budget })
                  : t('planner.scan.emptyNone')}
              </p>
              {scanEmpty.reason === 'budget' ? (
                <p className="text-sm text-amber-900/80 mt-2 max-w-md mx-auto leading-relaxed">
                  {scanEmpty.cheapest
                    ? t('planner.scan.emptyBudgetHint', {
                        price: Math.ceil(scanEmpty.cheapest),
                      })
                    : t('planner.scan.emptyBudgetNoPrice')}
                </p>
              ) : null}
            </div>

            {isOrganizer ? (
              <div className="mt-6 max-w-lg mx-auto text-left space-y-5">
                <p className="text-sm font-bold text-slate-800 text-center sm:text-left">
                  {t('planner.scan.editCriteria')}
                </p>

                <div className="rounded-2xl bg-white border border-slate-100 px-4 pt-4 pb-2 shadow-sm">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
                    {t('planner.scan.editDates')}
                  </p>
                  <div className="[&>div]:mb-2">
                    <DatePresets
                      selected={editPreset}
                      onChange={onEditPreset}
                      onFlexibleClick={() => {
                        setEditPreset('flexible')
                        setShowEditFlexible(true)
                      }}
                    />
                  </div>
                  {editDatesDepart[0] && editDatesRetour[0] ? (
                    <p className="text-sm text-slate-600 font-medium pb-2">
                      {formatDateFr(editDatesDepart[0].date)} →{' '}
                      {formatDateFr(editDatesRetour[editDatesRetour.length - 1].date)}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-2xl bg-white border border-slate-100 px-4 pt-4 pb-2 shadow-sm [&>div]:mb-3">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
                    {t('planner.scan.editBudget')}
                  </p>
                  {suggestedBudget && suggestedBudget > scanEmpty.budget ? (
                    <button
                      type="button"
                      onClick={() => setEditBudget(suggestedBudget)}
                      className="mb-3 text-xs font-bold px-3 py-1.5 rounded-full border border-orange-300 bg-white text-[#E85A28] hover:bg-[#FFF3EC]"
                    >
                      {t('planner.scan.useCheapest', { price: suggestedBudget })}
                    </button>
                  ) : null}
                  <BudgetSlider value={editBudget} onChange={setEditBudget} />
                </div>

                <button
                  type="button"
                  disabled={scanning || savingCriteria}
                  onClick={() => void updateCriteriaAndScan()}
                  className="w-full app-btn-primary rounded-2xl py-3.5 disabled:opacity-60"
                >
                  {savingCriteria || scanning
                    ? t('planner.scanning')
                    : t('planner.scan.updateAndScan')}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow p-8 text-center text-slate-500">
            {isOrganizer ? t('planner.scan.emptyPrompt') : t('planner.proposals.empty')}
          </div>
        )
      ) : null}

      {isOrganizer && (trip.status === 'locked' || !!accepted) ? (
        <ShareBar onShare={() => void doShare()} encoded={encoded} url={url} t={t} />
      ) : null}

      {isOrganizer ? (
        <div className="pt-14 pb-6 mt-6 border-t border-slate-100">
          <button
            type="button"
            disabled={deleting}
            onClick={() => void doDelete()}
            className="w-full sm:w-auto text-red-600 font-bold px-5 py-3 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 disabled:opacity-50"
          >
            {deleting ? '…' : t('planner.delete')}
          </button>
        </div>
      ) : null}

      {showEditFlexible ? (
        <div className="app-dialog-root z-[60]">
          <button
            type="button"
            aria-label="Fermer"
            className="app-dialog-backdrop"
            onClick={() => setShowEditFlexible(false)}
          />
          <div className="app-dialog-panel app-dialog-xl p-5 sm:p-8">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-extrabold text-lg text-ink">{t('planner.scan.editDates')}</h4>
              <button
                type="button"
                onClick={() => setShowEditFlexible(false)}
                className="font-bold text-primary-600 px-3 py-1.5 rounded-xl hover:bg-primary-50"
              >
                OK
              </button>
            </div>
            <FlexibleDatesSelector
              flexibleDates={{ dates_depart: editDatesDepart, dates_retour: editDatesRetour }}
              onFlexibleDatesChange={(d) => {
                setEditDatesDepart(d.dates_depart)
                setEditDatesRetour(d.dates_retour)
                setEditPreset('flexible')
              }}
              formatDateFr={formatDateFr}
            />
          </div>
        </div>
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
    <DestinationCard
      trip={proposal.trip_data}
      onSaveFavorite={() => undefined}
      primaryAction={
        isOrganizer
          ? { label: t('planner.accept'), onClick: onAccept, disabled: busy }
          : undefined
      }
      secondaryAction={
        isOrganizer
          ? { label: t('planner.reject'), onClick: onReject, disabled: busy }
          : undefined
      }
    />
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

function memberLabel(
  m: TripMember,
  currentUserId: string,
  t: (k: string) => string,
  accountName?: string | null,
): string {
  if (m.role === 'organizer' && accountName?.trim()) return accountName.trim()
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

const MEMBER_AVATAR_STYLES = [
  'from-[#FF6B35] to-[#E85A28]',
  'from-[#FF8A5B] to-[#FF6B35]',
  'from-[#1A120E] to-[#3D2818]',
  'from-[#0F766E] to-[#115E59]',
  'from-[#B45309] to-[#92400E]',
  'from-[#475569] to-[#334155]',
]

async function loadAccountHolderInfo(userId: string): Promise<{
  name: string
  avatarUrl?: string
} | null> {
  try {
    const current = await getCurrentUser()
    let name = ''
    let avatarUrl: string | undefined

    if (current?.id === userId) {
      name =
        (current.user_metadata?.full_name as string | undefined)?.trim() ||
        (current.user_metadata?.name as string | undefined)?.trim() ||
        current.email?.split('@')[0] ||
        ''
      avatarUrl =
        (current.user_metadata?.avatar_url as string | undefined) ||
        (current.user_metadata?.picture as string | undefined) ||
        undefined
    }

    const supabase = await getSupabaseClient()
    if (supabase) {
      const { data } = await supabase
        .from('user_profiles')
        .select('avatar_url, full_name')
        .eq('id', userId)
        .maybeSingle()
      if (data?.full_name?.trim()) name = data.full_name.trim()
      if (data?.avatar_url) avatarUrl = data.avatar_url
      // Prefer live Google metadata avatar when it's the current user
      if (current?.id === userId) {
        const metaAvatar =
          (current.user_metadata?.avatar_url as string | undefined) ||
          (current.user_metadata?.picture as string | undefined)
        if (metaAvatar) avatarUrl = metaAvatar
        const metaName =
          (current.user_metadata?.full_name as string | undefined)?.trim() ||
          (current.user_metadata?.name as string | undefined)?.trim()
        if (metaName) name = metaName
      }
    }

    if (!name && !avatarUrl) return null
    return { name: name || 'User', avatarUrl }
  } catch {
    return null
  }
}

function TravelersPanel({
  members,
  seats,
  currentUserId,
  isOrganizer,
  busy,
  addOpen,
  newFirstName,
  newLastName,
  newEmail,
  onOpenAdd,
  onCloseAdd,
  onFirstNameChange,
  onLastNameChange,
  onEmailChange,
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
  newFirstName: string
  newLastName: string
  newEmail: string
  onOpenAdd: () => void
  onCloseAdd: () => void
  onFirstNameChange: (v: string) => void
  onLastNameChange: (v: string) => void
  onEmailChange: (v: string) => void
  onAdd: () => void
  onRemove: (m: TripMember) => void
  t: (k: string, params?: Record<string, string | number>) => string
}) {
  const sorted = sortMembers(members)
  const count = sorted.length
  const seatTotal = Math.min(6, Math.max(seats, count, 1))
  const full = count >= 6
  const freeSlots = Math.max(0, seatTotal - count)
  const progress = Math.min(100, Math.round((count / Math.max(seatTotal, 1)) * 100))
  const organizer = sorted.find((m) => m.role === 'organizer')
  const organizerUserId = organizer?.user_id || (isOrganizer ? currentUserId : null)
  const [accountHolder, setAccountHolder] = useState<{
    name: string
    avatarUrl?: string
  } | null>(null)
  const [avatarBroken, setAvatarBroken] = useState(false)

  useEffect(() => {
    setAvatarBroken(false)
    if (!organizerUserId) {
      setAccountHolder(null)
      return
    }
    let cancelled = false
    void loadAccountHolderInfo(organizerUserId).then((info) => {
      if (!cancelled) setAccountHolder(info)
    })
    return () => {
      cancelled = true
    }
  }, [organizerUserId])

  return (
    <section className="relative overflow-hidden rounded-3xl border border-orange-100/80 bg-white shadow-md">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-10 w-44 h-44 rounded-full bg-[#FF6B35]/10 blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -left-12 w-40 h-40 rounded-full bg-[#FFB088]/15 blur-2xl"
      />

      <div className="relative p-5 sm:p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#E85A28] mb-1">
              {t('planner.members.kicker')}
            </p>
            <h3 className="font-extrabold text-xl text-slate-900 tracking-tight">
              {t('planner.members')}
            </h3>
            <p className="text-sm text-slate-500 mt-0.5">
              {t('planner.members.seats', { count, seats: seatTotal })}
            </p>
          </div>
          {isOrganizer && !full ? (
            <button
              type="button"
              disabled={busy}
              onClick={onOpenAdd}
              className="shrink-0 inline-flex items-center gap-1.5 text-sm font-bold text-white bg-[#FF6B35] hover:bg-[#E85A28] px-3.5 py-2.5 rounded-2xl shadow-sm shadow-orange-500/25 disabled:opacity-50 transition-colors"
            >
              <span className="text-lg leading-none">+</span>
              {t('planner.members.addShort')}
            </button>
          ) : null}
          {isOrganizer && full ? (
            <span className="shrink-0 text-xs font-bold text-slate-500 bg-slate-100 px-3 py-2 rounded-2xl">
              {t('planner.members.full')}
            </span>
          ) : null}
        </div>

        <div>
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-1.5">
            <span>{t('planner.members.places')}</span>
            <span className="text-slate-600">
              {count}/{seatTotal}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <motion.div
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
              className="h-full rounded-full bg-gradient-to-r from-[#FF6B35] to-[#FF8A5B]"
            />
          </div>
        </div>

        {sorted.length === 0 && !addOpen ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center">
            <p className="text-sm font-medium text-slate-500">{t('planner.members.empty')}</p>
            {isOrganizer ? (
              <button
                type="button"
                disabled={busy}
                onClick={onOpenAdd}
                className="mt-3 text-sm font-bold text-[#E85A28] hover:underline disabled:opacity-50"
              >
                + {t('planner.members.add')}
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {sorted.map((m, i) => {
              const isOrg = m.role === 'organizer'
              const label = memberLabel(
                m,
                currentUserId,
                t,
                isOrg ? accountHolder?.name : null,
              )
              const onApp = m.status === 'joined' && !!m.user_id
              const isYou = !!m.user_id && m.user_id === currentUserId
              const initial =
                label
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2) || '?'
              const avatar = isOrg
                ? MEMBER_AVATAR_STYLES[0]
                : MEMBER_AVATAR_STYLES[i % MEMBER_AVATAR_STYLES.length]
              const showPhoto = isOrg && !!accountHolder?.avatarUrl && !avatarBroken
              return (
                <motion.li
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="group flex items-center gap-3 rounded-2xl border border-slate-100 bg-white/90 px-3 py-3 shadow-sm hover:border-orange-200 hover:shadow-md transition-all"
                >
                  <div
                    className={`relative w-11 h-11 rounded-2xl overflow-hidden flex items-center justify-center text-white font-black text-sm shrink-0 shadow-sm ${
                      showPhoto ? 'bg-slate-100' : `bg-gradient-to-br ${avatar}`
                    }`}
                  >
                    {showPhoto ? (
                      <img
                        src={accountHolder!.avatarUrl}
                        alt={label}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={() => setAvatarBroken(true)}
                      />
                    ) : (
                      initial
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-bold text-slate-900 truncate text-[15px]">{label}</span>
                      {isYou ? (
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-[#E85A28] bg-[#FFF3EC] px-1.5 py-0.5 rounded-md">
                          {t('planner.members.you')}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      {isOrg ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-primary-700 bg-orange-50 px-2 py-0.5 rounded-md">
                          {t('planner.members.organizer')}
                        </span>
                      ) : null}
                      {!isOrg && m.email ? (
                        <span className="text-[11px] font-medium text-slate-500 truncate max-w-full">
                          {m.email}
                        </span>
                      ) : (
                        <span
                          className={`text-[11px] font-semibold ${
                            onApp ? 'text-emerald-700' : 'text-slate-400'
                          }`}
                        >
                          {onApp ? t('planner.members.onApp') : t('planner.members.offApp')}
                        </span>
                      )}
                    </div>
                  </div>
                  {isOrganizer && !isOrg ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onRemove(m)}
                      title={t('planner.members.remove')}
                      className="shrink-0 w-9 h-9 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 font-bold text-lg leading-none disabled:opacity-50 transition-colors opacity-70 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      ×
                    </button>
                  ) : null}
                </motion.li>
              )
            })}

            {isOrganizer && !full
              ? Array.from({ length: Math.min(freeSlots, 2) }).map((_, i) => (
                  <li key={`empty-${i}`}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={onOpenAdd}
                      className="w-full h-full min-h-[68px] flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 text-slate-400 hover:border-orange-300 hover:bg-[#FFF8F3] hover:text-[#E85A28] transition-colors disabled:opacity-50 px-3 py-3"
                    >
                      <span className="w-9 h-9 rounded-2xl border border-dashed border-current flex items-center justify-center text-xl font-light">
                        +
                      </span>
                      <span className="text-sm font-bold">{t('planner.members.addShort')}</span>
                    </button>
                  </li>
                ))
              : null}
          </ul>
        )}

        {addOpen ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-orange-200 bg-[#FFF8F3] p-4 sm:p-5 space-y-3"
          >
            <div>
              <p className="font-extrabold text-slate-900">{t('planner.members.addTitle')}</p>
              <p className="text-sm text-slate-500 mt-0.5">{t('planner.members.addHint')}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1.5">
                  {t('planner.members.firstNameLabel')}
                </label>
                <input
                  type="text"
                  autoComplete="given-name"
                  value={newFirstName}
                  onChange={(e) => onFirstNameChange(e.target.value)}
                  placeholder={t('planner.members.firstNamePlaceholder')}
                  maxLength={40}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] font-medium outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1.5">
                  {t('planner.members.lastNameLabel')}
                </label>
                <input
                  type="text"
                  autoComplete="family-name"
                  value={newLastName}
                  onChange={(e) => onLastNameChange(e.target.value)}
                  placeholder={t('planner.members.lastNamePlaceholder')}
                  maxLength={40}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] font-medium outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 block mb-1.5">
                {t('planner.members.emailLabel')}
              </label>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={newEmail}
                onChange={(e) => onEmailChange(e.target.value)}
                placeholder={t('planner.members.emailPlaceholder')}
                maxLength={120}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] font-medium outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onAdd()
                }}
              />
              <p className="text-[11px] text-slate-400 mt-1.5 font-medium">
                {t('planner.members.emailHint')}
              </p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button
                type="button"
                onClick={onCloseAdd}
                className="sm:flex-1 rounded-2xl bg-white border border-slate-200 py-3 font-bold text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={
                  busy ||
                  !newFirstName.trim() ||
                  !newLastName.trim() ||
                  !newEmail.trim()
                }
                onClick={onAdd}
                className="sm:flex-1 rounded-2xl bg-[#FF6B35] text-white py-3 font-bold disabled:opacity-50 hover:bg-[#E85A28] shadow-sm shadow-orange-500/20"
              >
                {t('planner.members.add')}
              </button>
            </div>
          </motion.div>
        ) : null}
      </div>
    </section>
  )
}
