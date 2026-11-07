import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type {
  Airport,
  CreatePlannedTripRequest,
  DateAvecHoraire,
  EnrichedTripResponse,
  PlannedTrip,
  PlannedTripDetail,
  TravelWorkspace,
  TripMember,
  TripProposal,
  UpdatePlannedTripRequest,
} from '../types'
import { getApiClient } from '../utils/apiClient'
import {
  InvoiceBusyLabel,
  openHotelInvoicePdf,
} from '../utils/hotelInvoice'
import { getAppConfig } from '../utils/configCache'
import { listTripItemsCached } from '../utils/tripItemsCache'
import {
  invalidateTravelWorkspacesCache,
  listTravelWorkspacesCached,
  peekTravelWorkspacesCache,
} from '../utils/workspacesCache'
import { loadAirportsOnce } from '../hooks/useAirports'
import { useShellReady } from '../hooks/useShellReady'
import { getCurrentUser, getSupabaseClient, signInWithGoogle, onAuthStateChange } from '../lib/supabase'
import { useI18n } from '../contexts/I18nContext'
import { DestinationCard } from './DestinationCard'
import { PlannerScanPanel } from './PlannerScanPanel'
import { BudgetSlider } from './BudgetSlider'
import { PassengerStepper } from './PassengerStepper'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  clearFlightReturnAsk,
  clearPendingHotelUpsell,
  consumeFlightReturnAsk,
  markFlightReturnAsk,
  openPartnerBookSync,
  resolveTripPriceSource,
} from '../utils/partnerBook'
import { DatePresets, type DatePreset } from './DatePresets'
import { FlexibleDatesSelector } from './FlexibleDatesSelector'
import {
  resolveActivityCitySlug,
  activityStepProgress,
  buildStayPipeline,
  arrivalDisplayLabel,
  cityDisplayNameFr,
  cityImageUrl,
  resolveTripImageUrl,
  formatAirlineLabel,
  formatDateFr,
  formatTripDateRangeFr,
  generateDatesFromPreset,
  groupAirportsByCity,
  parseAirportCodes,
  primaryAirportCode,
  sanitizeTripAirports,
  partyModeFromCount,
  partyModeKickerFr,
  partyModeSubtitleFr,
  partyModeTitleFr,
  resolveFlightStepStatus,
  resolveHotelStepStatus,
  PLANNER_HUB_TABS,
  PLANNER_HUB_EMPTY_FR,
  PLANNER_PHASE_LABEL_FR,
  PLANNER_PHASE_HINT_FR,
  PLANNER_PHASE_ACTION_FR,
  PLANNER_PROMOTE_TOAST_FR,
  PLANNER_SHARE_ACTION_FR,
  PLANNER_SHARE_EYEBROW_FR,
  PLANNER_SHARE_HINT_FR,
  PLANNER_SHARE_TITLE_FR,
  HOTEL_CTA_FR,
  hubMatchesPhase,
  computeTripPartyPrice,
  type CityAirportGroup,
  type FlightBookingStatus,
  type MyTripDraft,
  type PlannerHubFilter,
  type StayStepId,
} from '@flightwatcher/shared'
import { CreateTripModal } from './planner/CreateTripModal'
import { StayPipelineStepper } from './StayPipelineStepper'
import { ActivityStepPanel } from './ActivityStepPanel'
import { HotelPhotoGallery } from './HotelPhotoGallery'

function PencilIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

/** Compact label for multi-IATA departure without needing city groups. */
function departureRouteLabel(value: string | null | undefined): string {
  const codes = parseAirportCodes(value)
  if (!codes.length) return value || '—'
  const cities = [...new Set(codes.map((c) => cityDisplayNameFr(c)))]
  if (cities.length === 1) {
    return codes.length > 1
      ? `${cities[0]} · ${codes.join(' · ')}`
      : `${cities[0]} · ${codes[0]}`
  }
  return codes.join(' · ')
}

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
    <div className="relative w-full overflow-x-clip">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 right-0 w-56 h-56 rounded-full bg-[#FF6B35]/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-12 left-0 w-48 h-48 rounded-full bg-[#FFB088]/25 blur-3xl"
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
          <div className="relative mt-4 flex flex-wrap items-center gap-2 text-[11px] text-orange-100/55 font-medium">
            <span className="px-2 py-0.5 rounded-md bg-white/10">{t('planner.guest.mock.chip1')}</span>
            <span className="px-2 py-0.5 rounded-md bg-white/10">{t('planner.guest.mock.chip2')}</span>
            <span className="px-2 py-0.5 rounded-md bg-white/10">{t('planner.guest.mock.chip3')}</span>
            <span className="px-2 py-0.5 rounded-md bg-[#FF6B35]/30 text-orange-50">
              {t('planner.guest.mock.chipAccent')}
            </span>
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

const PHASE_LABEL = PLANNER_PHASE_LABEL_FR
const PHASE_HINT = PLANNER_PHASE_HINT_FR
const PHASE_ACTION = PLANNER_PHASE_ACTION_FR

const PHASE_CHIP_CLASS: Record<TravelWorkspace['phase'], string> = {
  planning: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
  flight_selected: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200',
  composing: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200',
  booked: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200',
  past: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
}

type HubFilter = PlannerHubFilter

function hubMatches(workspace: TravelWorkspace, filter: HubFilter): boolean {
  return hubMatchesPhase(workspace.phase, filter)
}

const FLIGHT_BOOKED_STATUSES = new Set<FlightBookingStatus>([
  'user_confirmed',
  'partner_confirmed',
])

/** Planned trips + personal séjours with hôtel choisi / résa entamée. */
function workspaceVisibleInPlanner(w: TravelWorkspace): boolean {
  if (w.planned_trip_id) return true
  const hotel = w.pipeline?.hotel
  if (hotel === 'selected' || hotel === 'booked') return true
  if (w.hotel_booking_id) return true
  const st = String(w.hotel_booking_status || '')
  return (
    st === 'draft' ||
    st === 'prebooked' ||
    st === 'payment_pending' ||
    st === 'payment_succeeded' ||
    st === 'booking_pending' ||
    st === 'confirmed'
  )
}

function tripAsWorkspace(
  trip: PlannedTrip,
  currentUserId?: string | null,
): TravelWorkspace {
  const dest = parseAirportCodes(trip.arrival_airport)[0] || null
  const isOrganizer = currentUserId
    ? trip.organizer_id === currentUserId
    : true
  return {
    workspace_id: `planner:${trip.id}`,
    planned_trip_id: trip.id,
    proposal_id: trip.accepted_proposal?.id || null,
    scope: 'collaborative',
    phase: trip.status === 'locked' ? 'flight_selected' : 'planning',
    title: trip.name,
    city: dest ? cityDisplayNameFr(dest) : 'Destination libre',
    origin_iata: trip.departure_airport,
    dest_iata: trip.arrival_airport,
    out_date: trip.dates_depart?.[0]?.date || null,
    ret_date: trip.dates_retour?.[trip.dates_retour.length - 1]?.date || null,
    is_organizer: isOrganizer,
    is_invitee: !isOrganizer,
    membership_joined_via: isOrganizer ? 'created' : 'invite',
    capabilities: {
      can_scan: isOrganizer && trip.status !== 'locked',
      can_choose_flight: isOrganizer && trip.status !== 'locked',
      can_compose_hotel: trip.status === 'locked',
      can_view_confirmation: false,
    },
    pipeline: {
      flight: trip.status === 'locked' ? 'selected' : 'none',
      hotel: 'none',
    },
    planned_trip: trip,
    updated_at: trip.updated_at || trip.created_at,
  }
}

/** Uniquement si ce n’est pas mon voyage — « par Moi » est omis (évident). */
function byOrganizerLabel(workspace: TravelWorkspace): string | null {
  if (workspace.is_organizer) return null
  const trip = workspace.planned_trip
  const name =
    trip?.organizer?.full_name?.trim() ||
    (trip?.member_names?.[0] &&
    trip.member_names[0] !== 'Organisateur' &&
    trip.member_names[0] !== 'Organizer'
      ? trip.member_names[0].trim()
      : '')
  return name ? `par ${name}` : 'par l’organisateur'
}

type TripGalleryDensity = 'solo' | 'duo' | 'multi'

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

function TripsGallery({
  workspaces,
  cityGroups,
  currentUserId,
  onOpen,
  onCreate,
}: {
  workspaces: TravelWorkspace[]
  cityGroups: CityAirportGroup[]
  currentUserId: string | null
  onOpen: (workspace: TravelWorkspace) => void
  onCreate?: () => void
}) {
  const { t } = useI18n()
  const counts = useMemo(
    () => ({
      organize: workspaces.filter((w) => hubMatches(w, 'organize')).length,
      upcoming: workspaces.filter((w) => hubMatches(w, 'upcoming')).length,
      past: workspaces.filter((w) => hubMatches(w, 'past')).length,
    }),
    [workspaces],
  )
  const [filter, setFilter] = useState<HubFilter>('upcoming')
  const didInitFilter = useRef(false)
  useEffect(() => {
    if (didInitFilter.current || !workspaces.length) return
    didInitFilter.current = true
    if (counts.upcoming > 0) setFilter('upcoming')
    else if (counts.organize > 0) setFilter('organize')
    else if (counts.past > 0) setFilter('past')
  }, [counts, workspaces.length])

  const filtered = useMemo(
    () => workspaces.filter((w) => hubMatches(w, filter)),
    [workspaces, filter],
  )
  const density: TripGalleryDensity =
    filtered.length === 1 ? 'solo' : filtered.length === 2 ? 'duo' : 'multi'
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

  const enrichWorkspace = (workspace: TravelWorkspace): TravelWorkspace => {
    const trip = workspace.planned_trip
    if (
      !trip ||
      !currentUserId ||
      trip.organizer_id !== currentUserId ||
      !selfProfile
    ) {
      return workspace
    }
    const apiName = trip.organizer?.full_name?.trim()
    const apiAvatar = trip.organizer?.avatar_url?.trim()
    const fullName = selfProfile.name || apiName || 'User'
    // Prefer live auth photo (Google) over a stale profile row.
    const avatarUrl = selfProfile.avatarUrl || apiAvatar || null
    const names = [...(trip.member_names || [])]
    if (names.length > 0) {
      const first = names[0]
      if (!first || first === 'Organisateur' || first === 'Organizer') {
        names[0] = fullName
      }
    }
    return {
      ...workspace,
      planned_trip: {
        ...trip,
        member_names: names.length ? names : [fullName],
        organizer: {
          id: currentUserId,
          full_name: fullName,
          avatar_url: avatarUrl,
        },
      },
    }
  }

  const cards = filtered.map(enrichWorkspace)
  const empty = PLANNER_HUB_EMPTY_FR[filter]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {PLANNER_HUB_TABS.map(({ key, labelFr }) => {
          const active = filter === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                active
                  ? 'bg-slate-900 text-white'
                  : 'bg-white/80 text-slate-600 ring-1 ring-slate-200 hover:bg-white'
              }`}
            >
              {labelFr} · {counts[key]}
            </button>
          )
        })}
      </div>

      {cards.length === 0 ? (
        <div className="relative overflow-hidden rounded-[28px] border border-orange-100 bg-white p-8 text-center shadow-lg sm:p-10">
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-br from-orange-50/80 to-transparent"
          />
          <div className="relative">
            <p className="mb-2 text-2xl font-black tracking-tight text-slate-900">
              {empty.title}
            </p>
            <p className="mx-auto mb-6 max-w-sm text-sm leading-relaxed text-slate-500">
              {empty.body}
            </p>
            {filter === 'organize' && onCreate ? (
              <button
                type="button"
                onClick={onCreate}
                className="rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#E85A28] px-6 py-3 font-bold text-white shadow-md shadow-orange-500/25"
              >
                {t('planner.create')}
              </button>
            ) : null}
          </div>
        </div>
      ) : density === 'solo' ? (
        <motion.div layout className="w-full">
          <TripListCard
            workspace={cards[0]}
            cityGroups={cityGroups}
            density="solo"
            index={0}
            onOpen={onOpen}
          />
        </motion.div>
      ) : density === 'duo' ? (
        <motion.div
          layout
          className="grid min-h-[min(70vh,640px)] grid-cols-1 gap-5 sm:gap-6 md:grid-cols-2 md:items-stretch"
        >
          {cards.map((workspace, index) => (
            <TripListCard
              key={workspace.workspace_id}
              workspace={workspace}
              cityGroups={cityGroups}
              density="duo"
              index={index}
              onOpen={onOpen}
            />
          ))}
        </motion.div>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3"
        >
          {cards.map((workspace, index) => (
            <TripListCard
              key={workspace.workspace_id}
              workspace={workspace}
              cityGroups={cityGroups}
              density="multi"
              index={index}
              onOpen={onOpen}
            />
          ))}
        </motion.div>
      )}
    </div>
  )
}

function TripListCard({
  workspace,
  cityGroups,
  density,
  index,
  onOpen,
}: {
  workspace: TravelWorkspace
  cityGroups: CityAirportGroup[]
  density: TripGalleryDensity
  index: number
  onOpen: (workspace: TravelWorkspace) => void
}) {
  const { t } = useI18n()
  const trip = workspace.planned_trip || null
  const destIata = workspace.dest_iata || trip?.arrival_airport || null
  const originIata = workspace.origin_iata || trip?.departure_airport || null
  const arrival = arrivalDisplayLabel(destIata, cityGroups)
  const codes = arrival.isAny ? [] : arrival.codes.split(' · ').filter(Boolean)
  const cityLabel = (() => {
    const raw = String(workspace.city || '').split(',')[0]?.split('(')[0]?.trim()
    if (raw && !/^[A-Z]{3}$/.test(raw)) return raw
    if (!arrival.isAny && arrival.city && arrival.city !== arrival.codes) {
      return arrival.city
    }
    const iata = codes[0] || parseAirportCodes(destIata)[0]
    if (iata) return cityDisplayNameFr(iata) || iata
    if (raw) return raw
    return arrival.isAny ? 'Destination libre' : 'Destination'
  })()
  const photo = resolveTripImageUrl({
    city: cityLabel,
    iata: codes[0] || parseAirportCodes(destIata)[0] || null,
    imageUrl: workspace.image_url,
  })
  const outDate = workspace.out_date || trip?.dates_depart?.[0]?.date
  const retDate =
    workspace.ret_date ||
    trip?.dates_retour?.[trip.dates_retour.length - 1]?.date

  const [orgAvatarBroken, setOrgAvatarBroken] = useState(false)
  const organizerName =
    trip?.organizer?.full_name?.trim() ||
    (trip?.member_names?.[0] &&
    trip.member_names[0] !== 'Organisateur' &&
    trip.member_names[0] !== 'Organizer'
      ? trip.member_names[0]
      : null)
  const organizerAvatar = trip?.organizer?.avatar_url?.trim() || null

  const memberNames = useMemo(() => {
    const names = [...(trip?.member_names || [])]
    if (organizerName && names.length > 0) {
      const first = names[0]
      if (!first || first === 'Organisateur' || first === 'Organizer') {
        names[0] = organizerName
      }
    } else if (organizerName && names.length === 0) {
      names.push(organizerName)
    }
    return names
  }, [trip?.member_names, organizerName])

  const maxShown = density === 'multi' ? 3 : density === 'duo' ? 4 : 5
  const shownMembers = memberNames.slice(0, maxShown)
  const extraMembers = Math.max(0, memberNames.length - shownMembers.length)
  const withLabel = shownMembers.map(firstNameOf).filter(Boolean).join(', ')
  const byLabel = byOrganizerLabel(workspace)

  useEffect(() => {
    setOrgAvatarBroken(false)
  }, [organizerAvatar])

  const travelersBlock =
    shownMembers.length > 0 ? (
      <div
        className={`flex items-center gap-2.5 min-w-0 ${
          density === 'solo' ? 'mt-5' : 'mt-3'
        }`}
      >
        <div className="flex -space-x-2 shrink-0">
          {shownMembers.map((name, i) => {
            const isOrganizerChip =
              i === 0 && !!organizerAvatar && !orgAvatarBroken
            return (
              <span
                key={`${name}-${i}`}
                className={`relative w-7 h-7 rounded-full border-2 border-white text-white text-[10px] font-black flex items-center justify-center shadow-sm overflow-hidden ${
                  isOrganizerChip
                    ? 'bg-slate-100'
                    : MEMBER_CHIP_COLORS[i % MEMBER_CHIP_COLORS.length]
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
        {trip?.passengers ? (
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-[#FFF3EC] text-[#8B2E0E]">
            {trip.passengers} voy.
          </span>
        ) : null}
        {trip?.route_ok === false ? (
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-50 text-amber-800">
            Route à mettre à jour
          </span>
        ) : null}
        {(trip?.proposals_count ?? 0) > 0 ? (
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-[#FFE8DC] text-[#E85A28]">
            {trip?.proposals_count} prop.
          </span>
        ) : null}
        <span
          className={`text-xs font-semibold px-3 py-1.5 rounded-full ${PHASE_CHIP_CLASS[workspace.phase]}`}
        >
          {PHASE_LABEL[workspace.phase]}
        </span>
        {workspace.is_invitee ? (
          <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-violet-50 text-violet-800 ring-1 ring-violet-200">
            {t('planner.tag.invitee')}
          </span>
        ) : null}
      </div>
      {outDate && retDate ? (
        <p className="text-sm font-semibold text-slate-600 mt-3">
          {formatTripDateRangeFr(outDate, retDate)}
        </p>
      ) : null}
      <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-slate-500">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            workspace.pipeline.flight === 'booked'
              ? 'bg-emerald-500'
              : workspace.pipeline.flight === 'none'
                ? 'bg-slate-300'
                : 'bg-primary-500'
          }`}
        />
        Vol
        {workspace.pipeline.flight === 'booked' ? (
          <span className="text-emerald-700">réservé</span>
        ) : null}
        <span className="w-4 h-px bg-slate-200" />
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            workspace.pipeline.hotel === 'booked'
              ? 'bg-emerald-500'
              : workspace.pipeline.hotel === 'none'
                ? 'bg-slate-300'
                : 'bg-primary-500'
          }`}
        />
        Hôtel
        {workspace.pipeline.hotel === 'booked' ? (
          <span className="text-emerald-700">réservé</span>
        ) : null}
      </div>
      {travelersBlock}
    </>
  )

  if (density === 'solo') {
    return (
      <motion.button
        type="button"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => onOpen(workspace)}
        className="group w-full text-left bg-white rounded-[32px] border border-orange-100/70 shadow-lg hover:shadow-2xl transition-all overflow-hidden"
      >
        <div className="grid lg:grid-cols-5 min-h-[min(72vh,560px)]">
          <div className="relative lg:col-span-3 h-64 sm:h-80 lg:h-auto min-h-[280px] overflow-hidden">
            {photo ? (
              <img
                src={photo}
                alt={cityLabel}
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-primary-100 to-slate-200" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-black/10 lg:to-black/40" />
            <div className="absolute top-5 right-5 flex flex-col items-end gap-1.5">
              <span
                className={`text-[11px] font-bold px-3 py-1.5 rounded-full backdrop-blur-sm ${PHASE_CHIP_CLASS[workspace.phase]}`}
              >
                {PHASE_LABEL[workspace.phase]}
              </span>
              {workspace.is_invitee ? (
                <span className="text-[11px] font-bold px-3 py-1.5 rounded-full backdrop-blur-sm bg-violet-500/90 text-white">
                  {t('planner.tag.invitee')}
                </span>
              ) : null}
            </div>
            <div className="absolute bottom-6 left-6 right-6 lg:hidden">
              <p className="text-white text-4xl font-black tracking-tight">
                {cityLabel}
              </p>
              <div className="flex items-center gap-2 mt-2 text-white font-bold text-sm tracking-wide">
                <span>{departureRouteLabel(originIata)}</span>
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
                {workspace.title}
              </h3>
              {byLabel ? (
                <p className="mt-1.5 text-sm font-semibold text-slate-500">
                  {byLabel}
                </p>
              ) : null}
              <p className="hidden lg:block text-2xl font-bold text-slate-700 mt-3 tracking-tight">
                {cityLabel}
              </p>
              <div className="hidden lg:flex items-center gap-2 mt-2 text-slate-500 font-bold text-sm tracking-wide">
                <span>{departureRouteLabel(originIata)}</span>
                <span className="w-7 h-0.5 rounded bg-slate-300" />
                <span>{arrival.isAny ? 'ANY' : codes[0]}</span>
                {codes.length > 1 ? (
                  <span className="text-slate-400 font-semibold text-xs">
                    +{codes.length - 1}
                  </span>
                ) : null}
              </div>
              <div className="mt-6">{meta}</div>
            </div>
            <div className="mt-8 pt-5 border-t border-orange-50 flex items-center justify-between">
              <span className="text-base font-bold text-[#FF6B35]">
                {PHASE_ACTION[workspace.phase]}
              </span>
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
      onClick={() => onOpen(workspace)}
      className={`group w-full text-left bg-white rounded-[28px] border border-orange-100/70 shadow-md hover:shadow-2xl hover:-translate-y-0.5 transition-all overflow-hidden h-full flex flex-col ${
        density === 'duo' ? 'min-h-[420px]' : ''
      }`}
    >
      <div className={`relative ${imageH} shrink-0 overflow-hidden`}>
        {photo ? (
          <img
            src={photo}
            alt={cityLabel}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary-100 to-slate-200" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/20" />
        <div className="absolute top-4 right-4 flex flex-col items-end gap-1.5">
          <span
            className={`text-[11px] font-bold px-3 py-1.5 rounded-full backdrop-blur-sm ${PHASE_CHIP_CLASS[workspace.phase]}`}
          >
            {PHASE_LABEL[workspace.phase]}
          </span>
          {workspace.is_invitee ? (
            <span className="text-[11px] font-bold px-3 py-1.5 rounded-full backdrop-blur-sm bg-violet-500/90 text-white">
              {t('planner.tag.invitee')}
            </span>
          ) : null}
        </div>
        <div className="absolute bottom-4 left-5 right-5">
          <p
            className={`text-white font-black tracking-tight ${
              density === 'duo' ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl'
            }`}
          >
            {cityLabel}
          </p>
          <div className="flex items-center gap-2 mt-2 text-white font-bold text-sm tracking-wide">
            <span>{departureRouteLabel(originIata)}</span>
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
      <div
        className={`flex-1 flex flex-col ${
          density === 'duo' ? 'p-6 sm:p-7' : 'p-5'
        }`}
      >
        <h3
          className={`font-bold text-slate-900 tracking-tight group-hover:text-[#E85A28] transition-colors ${
            density === 'duo' ? 'text-2xl' : 'text-xl'
          }`}
        >
          {workspace.title}
        </h3>
        {byLabel ? (
          <p className="mt-1 text-sm font-semibold text-slate-500">{byLabel}</p>
        ) : null}
        <div className="mt-3 flex-1">{meta}</div>
        <div className="mt-4 pt-3 border-t border-orange-50 flex items-center justify-between">
          <span className="text-sm font-semibold text-[#FF6B35]">
            {PHASE_ACTION[workspace.phase]}
          </span>
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
  const navigate = useNavigate()
  const { tripId: tripIdParam } = useParams<{ tripId?: string }>()
  const [searchParams] = useSearchParams()
  const [userId, setUserId] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [workspaces, setWorkspaces] = useState<TravelWorkspace[]>([])
  const [airports, setAirports] = useState<Airport[]>([])
  const shellReady = useShellReady()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [autoScanTripId, setAutoScanTripId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const selectedTripId =
    tripIdParam && tripIdParam !== 'invite' ? tripIdParam : null

  const cityGroups = useMemo(() => groupAirportsByCity(airports), [airports])

  useEffect(() => {
    void loadAirportsOnce()
      .then((list) => setAirports(list))
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

  // Legacy deep link /planner?trip={id} → /planner/{id}
  useEffect(() => {
    const tripQ = searchParams.get('trip')
    if (!tripQ) return
    navigate(`/planner/${encodeURIComponent(tripQ)}`, { replace: true })
  }, [searchParams, navigate])

  const load = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    if (!userId) {
      setWorkspaces([])
      setLoading(false)
      return
    }
    const silent = Boolean(opts?.silent)
    const force = Boolean(opts?.force)
    const peeked = peekTravelWorkspacesCache()
    if (peeked?.length) {
      setWorkspaces(peeked.filter(workspaceVisibleInPlanner))
      if (!force) setLoading(false)
    }
    if (!silent && !peeked?.length) {
      setLoading(true)
      setError(null)
    } else if (!silent) {
      setError(null)
    }
    try {
      try {
        const list = await listTravelWorkspacesCached({ force })
        setWorkspaces(
          (Array.isArray(list) ? list : []).filter(workspaceVisibleInPlanner),
        )
      } catch {
        const legacy = await getApiClient().listPlannedTrips()
        setWorkspaces(
          (Array.isArray(legacy) ? legacy : []).map((t) =>
            tripAsWorkspace(t, userId),
          ),
        )
      }
    } catch (e) {
      if (!silent) {
        setError(e instanceof Error ? e.message : t('app.error'))
        setWorkspaces([])
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [userId, t])

  const openWorkspace = useCallback(
    (workspace: TravelWorkspace) => {
      if (workspace.planned_trip_id) {
        navigate(`/planner/${encodeURIComponent(workspace.planned_trip_id)}`)
        return
      }
      // Séjour perso → promote to planner (vol + hôtel préchargés), not /trip.
      if (workspace.draft_token) {
        void (async () => {
          try {
            const created = await getApiClient().createPlannedTripFromMyTrip({
              draft_token: workspace.draft_token!,
              name: workspace.city || workspace.title || undefined,
            })
            invalidateTravelWorkspacesCache()
            setToast(PLANNER_PROMOTE_TOAST_FR)
            navigate(`/planner/${encodeURIComponent(created.id)}`)
            void load({ silent: true })
          } catch {
            navigate(`/trip/${encodeURIComponent(workspace.draft_token!)}`)
          }
        })()
        return
      }
      if (workspace.hotel_booking_id) {
        navigate(
          `/bookings?id=${encodeURIComponent(workspace.hotel_booking_id)}`,
        )
      }
    },
    [navigate, load, setToast],
  )

  useEffect(() => {
    if (!shellReady) return
    void load()
  }, [shellReady, load])

  // Soft refresh when tab becomes visible again (respects 60s cache).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void load({ silent: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
    }
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
          setAutoScanTripId(null)
          navigate('/planner')
          void load()
        }}
        onDeleted={() => {
          setAutoScanTripId(null)
          navigate('/planner')
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
          <p className="app-kicker mb-1.5">{t('nav.planner')}</p>
          <h2 className="app-title">{t('planner.title')}</h2>
          <p className="app-subtitle mt-1.5">{t('planner.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="app-btn-primary shrink-0"
        >
          <span className="text-lg leading-none">+</span>
          {t('planner.create')}
        </button>
      </div>

      {loading ? (
        <div
          className="space-y-4"
          aria-busy="true"
          aria-label={t('planner.loading')}
        >
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-9 w-24 rounded-full bg-white/80 border border-orange-100 animate-pulse"
              />
            ))}
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[28px] border border-orange-100 bg-white p-5 sm:p-6 shadow-lg animate-pulse"
            >
              <div className="flex gap-4">
                <div className="h-20 w-20 rounded-2xl bg-orange-50 shrink-0" />
                <div className="flex-1 space-y-3 py-1">
                  <div className="h-5 w-2/3 rounded bg-orange-50" />
                  <div className="h-4 w-1/2 rounded bg-orange-50" />
                  <div className="h-4 w-1/3 rounded bg-orange-50" />
                </div>
              </div>
            </div>
          ))}
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
      ) : workspaces.length === 0 ? (
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
              {t('planner.emptyTitle')}
            </p>
            <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto leading-relaxed">
              {t('planner.emptyBody')}
            </p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="bg-gradient-to-br from-[#FF6B35] to-[#E85A28] text-white font-bold px-6 py-3 rounded-2xl shadow-md shadow-orange-500/25"
            >
              {t('planner.create')}
            </button>
          </div>
        </div>
      ) : (
        <TripsGallery
          workspaces={workspaces}
          cityGroups={cityGroups}
          currentUserId={userId}
          onOpen={openWorkspace}
          onCreate={() => setShowCreate(true)}
        />
      )}

      {showCreate ? (
        <CreateTripModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            invalidateTravelWorkspacesCache()
            setShowCreate(false)
            void load()
            setAutoScanTripId(id)
            navigate(`/planner/${encodeURIComponent(id)}`)
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
  const { t, language } = useI18n()
  const [trip, setTrip] = useState<PlannedTripDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [originFilter, setOriginFilter] = useState<Set<string> | null>(null)
  const [acting, setActing] = useState<string | null>(null)
  const [membersBusy, setMembersBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [newFirstName, setNewFirstName] = useState('')
  const [newLastName, setNewLastName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [scanEmpty, setScanEmpty] = useState<{
    reason: 'budget' | 'no_flights'
    budget: number
    cheapest?: number | null
  } | null>(null)
  const [editBudget, setEditBudget] = useState(150)
  const [editPassengers, setEditPassengers] = useState(1)
  const [editDirect, setEditDirect] = useState(false)
  const [editDatesDepart, setEditDatesDepart] = useState<DateAvecHoraire[]>([])
  const [editDatesRetour, setEditDatesRetour] = useState<DateAvecHoraire[]>([])
  const [editPreset, setEditPreset] = useState<DatePreset>('next-weekend')
  const [showEditFlexible, setShowEditFlexible] = useState(false)
  const [showModalities, setShowModalities] = useState(false)
  const [savingCriteria, setSavingCriteria] = useState(false)
  const [reopeningFlight, setReopeningFlight] = useState(false)
  const [skippingFlight, setSkippingFlight] = useState(false)
  const [skippingHotel, setSkippingHotel] = useState(false)
  const [hotelBusy, setHotelBusy] = useState(false)
  const [invoiceBusy, setInvoiceBusy] = useState(false)
  const [invoiceDone, setInvoiceDone] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [flightDraft, setFlightDraft] = useState<MyTripDraft | null>(null)
  const [workspace, setWorkspace] = useState<TravelWorkspace | null>(null)
  const [flightBookingBusy, setFlightBookingBusy] = useState(false)
  const [askFlightBooked, setAskFlightBooked] = useState(false)
  const [plannerActivitiesEnabled, setPlannerActivitiesEnabled] = useState(false)
  const [activityItems, setActivityItems] = useState<{ status?: string | null }[]>([])
  const onActivityItemsChange = useCallback(
    (items: { status?: string | null }[]) => {
      setActivityItems((prev) => {
        if (items.length === 0 && prev.length > 0) return prev
        if (
          prev.length === items.length &&
          prev.every((p, i) => p.status === items[i]?.status)
        ) {
          return prev
        }
        return items
      })
    },
    [],
  )
  const autoScanStarted = useRef(false)
  const leftForFlight = useRef(false)
  const leftForFlightAt = useRef(0)
  const navigate = useNavigate()

  useEffect(() => {
    void getAppConfig()
      .then((cfg) => {
        if (!cfg) return
        setPlannerActivitiesEnabled(cfg.planner_activities_enabled === true)
      })
      .catch(() => undefined)
  }, [])

  const syncEditFromTrip = useCallback((detail: PlannedTripDetail) => {
    setEditBudget(detail.budget_max || 150)
    setEditPassengers(Math.max(1, detail.passengers || 1))
    setEditDirect(Boolean(detail.direct))
    setEditDatesDepart(detail.dates_depart || [])
    setEditDatesRetour(detail.dates_retour || [])
    setEditPreset('flexible')
  }, [])

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent)
    if (!silent) setError(null)
    try {
      const [detail, workspaces] = await Promise.all([
        getApiClient().getPlannedTrip(tripId),
        // Soft refresh keeps the 60s hub cache; mutations invalidate explicitly.
        listTravelWorkspacesCached({ force: false }),
      ])
      setTrip(detail)
      syncEditFromTrip(detail)
      try {
        const matched =
          workspaces.find((item) => item.planned_trip_id === tripId) || null
        setWorkspace(matched)
        const acceptedId =
          detail.accepted_proposal?.id ||
          (detail.proposals || []).find((p) => p.status === 'accepted')?.id ||
          null
        const withWorkspaceBooked = (draft: MyTripDraft): MyTripDraft => {
          if (matched?.pipeline?.flight !== 'booked') return draft
          const payload = (draft.payload || {}) as Record<string, unknown>
          if (
            draft.flight_booked_at ||
            payload.flight_booked ||
            draft.flight_booking_status === 'user_confirmed' ||
            draft.flight_booking_status === 'partner_confirmed'
          ) {
            return draft
          }
          const now = new Date().toISOString()
          return {
            ...draft,
            flight_booked_at: now,
            flight_booking_status: 'user_confirmed',
            payload: {
              ...payload,
              flight_booked: true,
              flight_booked_at: now,
              flight_booking_status: 'user_confirmed',
            },
          }
        }
        if (matched?.draft_token) {
          setFlightDraft(
            withWorkspaceBooked(
              await getApiClient().getMyTrip(matched.draft_token),
            ),
          )
        } else if (acceptedId) {
          // Chosen flight is in DB — ensure séjour draft exists and keep it.
          try {
            const draft =
              await getApiClient().getOrCreateExecutionDraft(acceptedId)
            setFlightDraft(withWorkspaceBooked(draft))
          } catch {
            setFlightDraft((prev) => prev)
          }
        } else {
          // Keep a locally confirmed draft — don't wipe "J’ai réservé".
          setFlightDraft((prev) => {
            const booked = Boolean(
              prev?.flight_booked_at ||
                prev?.flight_booking_status === 'user_confirmed' ||
                prev?.flight_booking_status === 'partner_confirmed',
            )
            return booked ? prev : null
          })
        }
      } catch {
        // Keep current draft/workspace on transient workspace errors.
      }
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [tripId, t, syncEditFromTrip])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void load({ silent: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  useEffect(() => {
    setActivityItems([])
  }, [tripId])

  useEffect(() => {
    const token = flightDraft?.draft_token || workspace?.draft_token
    if ((!tripId && !token) || !plannerActivitiesEnabled) return
    let cancelled = false
    const asActivityRows = (items: Record<string, unknown>[]) =>
      items
        .filter((i) => {
          const t = String(i.item_type || 'activity')
          return t === 'activity'
        })
        .map((i) => ({ status: (i.status as string | null | undefined) ?? null }))

    void (async () => {
      try {
        let items: Record<string, unknown>[] = []
        if (tripId) {
          const res = await listTripItemsCached({ planned_trip_id: tripId })
          if (cancelled) return
          items = res.items || []
        }
        // Fallback: ideas still attached to the exécution draft.
        if (!items.length && token) {
          const res = await listTripItemsCached({ draft_token: token })
          if (cancelled) return
          items = res.items || []
        }
        if (cancelled) return
        const rows = asActivityRows(items)
        if (rows.length === 0) return
        onActivityItemsChange(rows)
      } catch {
        // Keep previous parcours state on transient errors.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    tripId,
    flightDraft?.draft_token,
    workspace?.draft_token,
    plannerActivitiesEnabled,
    flightDraft?.hotel_booked_at,
    flightDraft?.flight_booked_at,
    onActivityItemsChange,
  ])

  const isOrganizer = trip?.organizer_id === userId
  const pending = (trip?.proposals || []).filter((p) => p.status === 'pending')
  const accepted = (trip?.proposals || []).find((p) => p.status === 'accepted')
  const pax = Math.max(trip?.passengers || 1, (trip?.members || []).length || 1)

  const activityProgress = useMemo(
    () => activityStepProgress(activityItems),
    [activityItems],
  )

  const draftPayload = (flightDraft?.payload || {}) as Record<string, unknown>
  const draftFlight = (draftPayload.flight || {}) as Record<string, unknown>
  const draftHotel =
    (flightDraft?.hotel as Record<string, unknown> | null | undefined) ||
    (draftPayload.hotel as Record<string, unknown> | null | undefined) ||
    null
  const flightBookingStatus =
    flightDraft?.flight_booking_status ||
    (draftPayload.flight_booking_status as FlightBookingStatus | undefined) ||
    workspace?.flight_booking_status ||
    null
  const externalFlight = Boolean(
    draftPayload.flight_external || draftPayload.external_flight,
  )
  const externalHotel = Boolean(
    draftPayload.hotel_external || draftPayload.external_hotel,
  )
  const flightBooked = Boolean(
    flightDraft?.flight_booked_at ||
      draftPayload.flight_booked ||
      draftPayload.flight_booked_at ||
      (flightBookingStatus && FLIGHT_BOOKED_STATUSES.has(flightBookingStatus)) ||
      workspace?.pipeline.flight === 'booked' ||
      externalFlight,
  )
  const hotelBooked = Boolean(
    flightDraft?.hotel_booked_at ||
      draftPayload.hotel_booked ||
      draftPayload.hotel_booked_at ||
      externalHotel ||
      workspace?.pipeline.hotel === 'booked',
  )
  const hasHotel = Boolean(draftHotel || workspace?.hotel_booking_id)
  const hotelBookingId = String(
    workspace?.hotel_booking_id ||
      draftPayload.hotel_booking_id ||
      (flightDraft?.payload as Record<string, unknown> | undefined)
        ?.hotel_booking_id ||
      '',
  ).trim()
  const hotelInvoiceReady = Boolean(
    hotelBooked &&
      !externalHotel &&
      hotelBookingId &&
      ['confirmed', 'payment_succeeded', 'booking_pending'].includes(
        String(
          workspace?.hotel_booking_status ||
            draftPayload.hotel_booking_status ||
            'confirmed',
        ).toLowerCase(),
      ),
  )
  const stayParty = useMemo(() => {
    const flightPp = externalFlight
      ? 0
      : Number(accepted?.trip_data?.prix_total) ||
        Number(draftFlight.price_pp) ||
        Number(draftPayload.price_per_person) ||
        0
    const bd = (draftPayload.price_breakdown || {}) as Record<string, unknown>
    const rawHotelTotal =
      draftPayload.hotel_charged_total != null &&
      Number(draftPayload.hotel_charged_total) > 0
        ? Number(draftPayload.hotel_charged_total)
        : draftHotel?.public_hotel_price != null
          ? Number(draftHotel.public_hotel_price)
          : bd.hotel_public_total != null
            ? Number(bd.hotel_public_total)
            : draftHotel?.hotel_pp != null
              ? Number(draftHotel.hotel_pp) * pax
              : 0
    const includeHotel =
      hasHotel && !externalHotel && Number(rawHotelTotal) > 0
    return computeTripPartyPrice({
      adults: pax,
      flightPp,
      hotelTotal: includeHotel ? rawHotelTotal : 0,
    })
  }, [
    accepted?.trip_data?.prix_total,
    draftFlight.price_pp,
    draftHotel,
    draftPayload.hotel_charged_total,
    draftPayload.price_breakdown,
    draftPayload.price_per_person,
    externalFlight,
    externalHotel,
    hasHotel,
    pax,
  ])
  const stayPriceIncludesHotel = stayParty.hotelTotal > 0
  const canSkipFlight =
    !externalFlight &&
    !hotelBooked &&
    !externalHotel &&
    !flightDraft?.flight_booked_at &&
    !(
      flightBookingStatus && FLIGHT_BOOKED_STATUSES.has(flightBookingStatus)
    )
  const canSkipHotel =
    Boolean(trip) &&
    !externalHotel &&
    !hotelBooked &&
    !flightDraft?.hotel_booked_at

  const pipelineForUi = useMemo(() => {
    const flight = resolveFlightStepStatus({
      hasFlightPayload: Boolean(
        accepted || draftFlight.origin_iata || externalFlight,
      ),
      flightBooked: flightBooked && !externalFlight,
      externalFlight,
      bookingUrl:
        (draftFlight.booking_url as string | undefined) ||
        (draftPayload.booking_url as string | undefined) ||
        null,
    })
    const hotel = resolveHotelStepStatus({
      hasHotel,
      hotelBooked: hotelBooked && !externalHotel,
      externalHotel,
    })
    return buildStayPipeline({
      flight,
      hotel,
      focus:
        hotelBooked || externalHotel
          ? undefined
          : accepted || flight !== 'none' || externalFlight
            ? 'hotel'
            : 'flight',
      activitiesEnabled: plannerActivitiesEnabled,
      activitiesDone: activityProgress.done,
      activitiesPartial: activityProgress.partial,
      activitiesHint: activityProgress.hint,
      restaurantsEnabled: false,
    }).filter((s) => s.id !== 'restaurants')
  }, [
    accepted,
    activityProgress,
    draftFlight.booking_url,
    draftFlight.origin_iata,
    draftPayload.booking_url,
    externalFlight,
    externalHotel,
    flightBooked,
    hasHotel,
    hotelBooked,
    plannerActivitiesEnabled,
  ])

  const bookSelectedFlight = async () => {
    if (!accepted || flightBookingBusy) return
    const popup = window.open('about:blank', '_blank')
    if (!popup) {
      onToast('Autorise les fenêtres pour ouvrir le site de réservation')
      return
    }
    popup.opener = null
    setFlightBookingBusy(true)
    setAskFlightBooked(false)
    try {
      // Always resolve a single-airport deeplink (never multi CDG,ORY,BVA).
      const tripForBook = {
        ...accepted.trip_data,
        aller: {
          ...accepted.trip_data.aller,
          origin: primaryAirportCode(accepted.trip_data.aller?.origin),
          destination: primaryAirportCode(
            accepted.trip_data.aller?.destination ||
              accepted.trip_data.destination_code,
          ),
        },
        destination_code: primaryAirportCode(
          accepted.trip_data.destination_code ||
            accepted.trip_data.aller?.destination,
        ),
      }
      const preview = resolveTripPriceSource(tripForBook, pax, language)
      const isTravelpayouts = preview.partnerId === 'aviasales'
      let draft =
        flightDraft?.draft_token
          ? flightDraft
          : null
      // Travelpayouts needs draft id in SubID — await only then. Ryanair opens now.
      if (isTravelpayouts && !draft) {
        draft = await getApiClient().getOrCreateExecutionDraft(accepted.id)
        setFlightDraft(draft)
      }
      const source = openPartnerBookSync({
        trip: tripForBook,
        passengers: pax,
        language,
        draftId: draft?.id || workspace?.draft_id || null,
        draftToken:
          draft?.draft_token || workspace?.draft_token || null,
        targetWindow: popup,
        // Planner owns return ask — never Search PostBook (hôtel / continuer).
        awaitingReturnPrompt: false,
        skipReturnBanner: true,
        source: 'planner',
      })
      clearPendingHotelUpsell()
      const token =
        draft?.draft_token || workspace?.draft_token || null
      if (!isTravelpayouts) {
        leftForFlight.current = true
        leftForFlightAt.current = Date.now()
        // Persist immediately (planned trip id) so closing FW still restores ask.
        markFlightReturnAsk({
          draftToken: token,
          plannedTripId: tripId,
          promptOnReturn: true,
        })
      } else {
        clearFlightReturnAsk(token, tripId)
      }
      // Draft + status off the critical path (partner tab already open).
      void (async () => {
        try {
          let d = draft
          if (!d?.draft_token) {
            d = await getApiClient().getOrCreateExecutionDraft(accepted.id)
            setFlightDraft(d)
            if (!isTravelpayouts) {
              markFlightReturnAsk({
                draftToken: d.draft_token,
                plannedTripId: tripId,
                promptOnReturn: true,
              })
            }
          }
          const status: FlightBookingStatus = isTravelpayouts
            ? 'pending_partner'
            : 'redirected'
          const updated = await getApiClient().updateMyTripFlightBookingStatus(
            d.draft_token,
            { status, provider: source.partnerId },
          )
          setFlightDraft(updated)
          if (!isTravelpayouts) {
            markFlightReturnAsk({
              draftToken: updated.draft_token || d.draft_token,
              plannedTripId: tripId,
              promptOnReturn: true,
            })
          }
        } catch {
          /* non-blocking — confirm can recreate draft */
        }
      })()
    } catch (e) {
      try {
        popup.close()
      } catch {
        /* ignore */
      }
      onToast(
        e instanceof Error && e.message
          ? e.message
          : 'Impossible d’ouvrir la réservation. Réessaie.',
      )
    } finally {
      setFlightBookingBusy(false)
    }
  }

  const confirmAirlineFlight = async () => {
    if (flightBookingBusy) return
    setFlightBookingBusy(true)
    setAskFlightBooked(false)
    leftForFlight.current = false
    try {
      let token = flightDraft?.draft_token || workspace?.draft_token || null
      if (!token && accepted) {
        const draft = await getApiClient().getOrCreateExecutionDraft(accepted.id)
        token = draft.draft_token
        setFlightDraft(draft)
      }
      if (!token) {
        onToast('Impossible de rattacher la réservation. Réessaie.')
        return
      }
      clearFlightReturnAsk(token, tripId)
      clearPendingHotelUpsell()
      const nowIso = new Date().toISOString()
      // Optimistic UI — load() must not wipe a successful confirm.
      setFlightDraft((prev) => {
        const base = prev || ({ draft_token: token, payload: {} } as MyTripDraft)
        const prevPayload = (base.payload || {}) as Record<string, unknown>
        return {
          ...base,
          draft_token: token,
          flight_booked_at: nowIso,
          flight_booking_status: 'user_confirmed',
          payload: {
            ...prevPayload,
            flight_booked: true,
            flight_booked_at: nowIso,
            flight_booking_status: 'user_confirmed',
          },
        }
      })
      setWorkspace((prev) =>
        prev
          ? {
              ...prev,
              draft_token: prev.draft_token || token,
              flight_booking_status: 'user_confirmed',
              pipeline: { ...prev.pipeline, flight: 'booked' },
            }
          : prev,
      )
      const updated = await getApiClient().updateMyTripFlightBookingStatus(
        token,
        { status: 'user_confirmed', provider: 'ryanair' },
      )
      setFlightDraft(updated)
      onToast('Vol confirmé. Ton voyage est à jour.')
      void load({ silent: true })
    } catch {
      onToast('Impossible de confirmer le vol. Réessaie.')
      void load({ silent: true })
    } finally {
      setFlightBookingBusy(false)
    }
  }

  const dismissFlightBookAsk = () => {
    setAskFlightBooked(false)
    leftForFlight.current = false
    clearFlightReturnAsk(
      flightDraft?.draft_token || workspace?.draft_token || null,
      tripId,
    )
    clearPendingHotelUpsell()
  }

  useEffect(() => {
    const token = flightDraft?.draft_token || workspace?.draft_token || null
    if (flightBooked) {
      setAskFlightBooked(false)
      clearFlightReturnAsk(token, tripId)
      return
    }
    const maybeAsk = () => {
      // Only when the planner tab is visible — never while the airline tab is focused.
      if (document.visibilityState !== 'visible') return
      const persisted = consumeFlightReturnAsk({
        draftToken: token,
        plannedTripId: tripId,
        alreadyBooked: flightBooked,
      })
      if (persisted) {
        leftForFlight.current = false
        clearPendingHotelUpsell()
        setAskFlightBooked(true)
        return
      }
      if (!leftForFlight.current) return
      if (Date.now() - leftForFlightAt.current < 1200) return
      leftForFlight.current = false
      clearPendingHotelUpsell()
      setAskFlightBooked(true)
    }
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return
      maybeAsk()
    }
    maybeAsk()
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('focus', onReturn)
    return () => {
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('focus', onReturn)
    }
  }, [flightBooked, flightDraft?.draft_token, workspace?.draft_token, tripId])

  const reservationToken =
    flightDraft?.draft_token || workspace?.draft_token || null
  const stayExtrasRef = useRef<HTMLDivElement | null>(null)

  const openReservations = () => {
    if (!reservationToken) return
    navigate(`/trip/${encodeURIComponent(reservationToken)}`)
  }

  const downloadHotelInvoice = useCallback(() => {
    if (!hotelBookingId || invoiceBusy) return
    setInvoiceBusy(true)
    setInvoiceDone(false)
    void openHotelInvoicePdf({
      filename: `facture-hotel-${hotelBookingId}.pdf`,
      fetchBlob: () =>
        getApiClient().downloadHotelBookingInvoice(hotelBookingId, {
          draft_token: reservationToken,
        }),
    })
      .then(() => {
        setInvoiceDone(true)
        window.setTimeout(() => setInvoiceDone(false), 2500)
      })
      .catch(() => onToast('Facture indisponible pour le moment'))
      .finally(() => setInvoiceBusy(false))
  }, [hotelBookingId, invoiceBusy, onToast, reservationToken])

  const openReservation = (compose = false) => {
    if (hotelBusy) return
    if (flightDraft?.draft_token) {
      navigate(
        `/trip/${flightDraft.draft_token}${compose && !hotelBooked ? '?compose=1' : ''}`,
      )
      return
    }
    if (externalFlight || !accepted) {
      if (canSkipFlight) {
        void skipFlight()
        return
      }
      onToast(
        externalFlight
          ? 'Impossible d’ouvrir le séjour. Réessaie.'
          : 'Choisis d’abord un vol, ou indique que tu as déjà un avion',
      )
      return
    }
    setHotelBusy(true)
    void getApiClient()
      .getOrCreateExecutionDraft(accepted.id)
      .then((draft) => {
        setFlightDraft(draft)
        navigate(
          `/trip/${draft.draft_token}${compose && !hotelBooked ? '?compose=1' : ''}`,
        )
      })
      .catch(() => onToast('Impossible d’ouvrir la réservation. Réessaie.'))
      .finally(() => setHotelBusy(false))
  }

  const onHotelBlockCta = () => {
    if (hotelBooked || externalHotel) {
      openReservations()
      return
    }
    // Selected but unpaid → compose / payer ; sinon choisir.
    openReservation(true)
  }

  const hotelBlockCtaLabel = hotelBusy
    ? 'Ouverture…'
    : hotelBooked || externalHotel
      ? HOTEL_CTA_FR.view
      : hasHotel
        ? HOTEL_CTA_FR.pay
        : HOTEL_CTA_FR.choose

  const onPipelineStep = (id: StayStepId) => {
    if (id === 'hotel') {
      onHotelBlockCta()
      return
    }
    if (id === 'flight') {
      if (flightBooked || externalFlight) {
        openReservations()
        return
      }
      if (accepted) void bookSelectedFlight()
      return
    }
    if (id === 'activities' && plannerActivitiesEnabled) {
      stayExtrasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const proposalOrigins = useMemo(() => {
    const set = new Set<string>()
    for (const p of pending) {
      const o = (p.trip_data?.aller?.origin || '').trim().toUpperCase()
      if (o.length === 3) set.add(o)
    }
    return [...set].sort()
  }, [pending])

  const visiblePending = useMemo(() => {
    if (!originFilter || originFilter.size === 0) return pending
    return pending.filter((p) =>
      originFilter.has((p.trip_data?.aller?.origin || '').toUpperCase()),
    )
  }, [pending, originFilter])

  useEffect(() => {
    setOriginFilter(null)
  }, [pending.length, trip?.id])

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
    setOriginFilter(null)
    // Hide previous proposals immediately (parity with Search clear-on-search)
    setTrip((prev) =>
      prev
        ? {
            ...prev,
            proposals: (prev.proposals || []).filter((p) => p.status !== 'pending'),
            proposals_count: 0,
          }
        : prev,
    )
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
      // Resync en arrière-plan — ne pas bloquer l’UI (Search parity)
      void load()
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
    const nextPassengers = Math.min(6, Math.max(1, editPassengers))
    const patch: UpdatePlannedTripRequest = {}
    if (nextBudget !== trip.budget_max) patch.budget_max = nextBudget
    if (nextPassengers !== trip.passengers) patch.passengers = nextPassengers
    if (Boolean(editDirect) !== Boolean(trip.direct)) patch.direct = editDirect
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
        const updated = await getApiClient().updatePlannedTrip(tripId, patch)
        setTrip((prev) =>
          prev
            ? {
                ...prev,
                ...updated,
                budget_max: nextBudget,
                passengers: nextPassengers,
                direct: editDirect,
                dates_depart: editDatesDepart,
                dates_retour: editDatesRetour,
                proposals: prev.proposals,
                members: prev.members,
              }
            : prev,
        )
        setEditBudget(nextBudget)
        setEditPassengers(nextPassengers)
      } else if (trip.status === 'locked') {
        await getApiClient().reopenPlannedTripFlight(tripId)
      }
      setShowModalities(false)
      setFlightDraft(null)
      setWorkspace(null)
      await scan()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setSavingCriteria(false)
    }
  }

  const changeFlightChoice = async () => {
    if (!trip || reopeningFlight) return
    if (
      !window.confirm(
        'Changer de vol ? Les propositions actuelles seront remplacées par un nouveau scan.',
      )
    ) {
      return
    }
    setReopeningFlight(true)
    setError(null)
    try {
      await getApiClient().reopenPlannedTripFlight(tripId)
      setShowModalities(false)
      setFlightDraft(null)
      setWorkspace(null)
      await scan()
      onToast('Vol réouvert. Nouveau scan lancé.')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setReopeningFlight(false)
    }
  }

  const removeSelectedFlight = async () => {
    if (!trip || reopeningFlight) return
    if (
      !window.confirm(
        'Supprimer ce vol ? Le voyage repasse en planification. Tu pourras en choisir un autre.',
      )
    ) {
      return
    }
    setReopeningFlight(true)
    setError(null)
    try {
      await getApiClient().reopenPlannedTripFlight(tripId)
      setShowModalities(false)
      setAskFlightBooked(false)
      setFlightDraft(null)
      setWorkspace(null)
      clearFlightReturnAsk(
        flightDraft?.draft_token || workspace?.draft_token || null,
        tripId,
      )
      clearPendingHotelUpsell()
      invalidateTravelWorkspacesCache()
      await load({ silent: true })
      onToast('Vol supprimé')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setReopeningFlight(false)
    }
  }

  const startRename = () => {
    if (!trip || !isOrganizer) return
    setNameDraft(trip.name)
    setEditingName(true)
  }

  const cancelRename = () => {
    setEditingName(false)
    setNameDraft(trip?.name || '')
  }

  const saveRename = async () => {
    if (!trip || !isOrganizer || savingName) return
    const next = nameDraft.trim()
    if (next.length < 2 || next.length > 80) {
      onToast('Nom entre 2 et 80 caractères')
      return
    }
    if (next === trip.name) {
      setEditingName(false)
      return
    }
    const prevName = trip.name
    setTrip((prev) => (prev ? { ...prev, name: next } : prev))
    setEditingName(false)
    setSavingName(true)
    setError(null)
    try {
      const updated = await getApiClient().updatePlannedTrip(tripId, { name: next })
      setTrip((prev) =>
        prev ? { ...prev, name: updated.name || next } : prev,
      )
      invalidateTravelWorkspacesCache()
    } catch (e) {
      setTrip((prev) => (prev ? { ...prev, name: prevName } : prev))
      setNameDraft(prevName)
      onToast(e instanceof Error ? e.message : 'Impossible de renommer')
    } finally {
      setSavingName(false)
    }
  }

  const skipFlight = async () => {
    if (!trip || skippingFlight || !canSkipFlight) return
    if (!trip.arrival_airport) {
      onToast('Choisis d’abord une destination')
      return
    }
    if (!trip.dates_depart?.[0] || !trip.dates_retour?.[0]) {
      onToast('Dates aller/retour requises')
      return
    }
    setSkippingFlight(true)
    setError(null)
    try {
      const draft = await getApiClient().skipPlannedTripFlight(tripId)
      setFlightDraft(draft)
      onToast('Vol ailleurs. Compose ton hôtel.')
      navigate(`/trip/${draft.draft_token}?compose=1`)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setSkippingFlight(false)
    }
  }

  const skipHotel = async () => {
    if (!trip || skippingHotel) return
    setSkippingHotel(true)
    setError(null)
    const nowIso = new Date().toISOString()
    setFlightDraft((prev) => {
      const token = prev?.draft_token || workspace?.draft_token || ''
      const base: MyTripDraft =
        prev ||
        ({
          id: '',
          draft_token: token,
          status: 'draft',
          payload: {},
        } as MyTripDraft)
      const prevPayload = (base.payload || {}) as Record<string, unknown>
      return {
        ...base,
        hotel_booked_at: nowIso,
        payload: {
          ...prevPayload,
          hotel_external: true,
          external_hotel: true,
          hotel_booked: true,
          hotel_booked_at: nowIso,
        },
      }
    })
    try {
      const draft = await getApiClient().skipPlannedTripHotel(tripId)
      setFlightDraft(draft)
      onToast('Hôtel ailleurs. Séjour à jour.')
      void load()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
      onToast(
        e instanceof Error ? e.message : 'Impossible de marquer l’hôtel',
      )
      void load()
    } finally {
      setSkippingHotel(false)
    }
  }

  // Création → scan immédiat (ne pas attendre le getTrip / isOrganizer)
  useEffect(() => {
    if (!autoScan || autoScanStarted.current) return
    autoScanStarted.current = true
    setScanning(true)
    void scan().finally(() => onAutoScanDone?.())
  }, [autoScan, scan, onAutoScanDone])

  const accept = async (id: string) => {
    setActing(id)
    setError(null)
    try {
      await getApiClient().acceptProposal(id)
      // Show boarding pass immediately — chosen flight is locked in DB.
      setTrip((prev) => {
        if (!prev) return prev
        const proposals = (prev.proposals || []).map((p) =>
          p.id === id
            ? { ...p, status: 'accepted' as const }
            : p.status === 'pending' || p.status === 'accepted'
              ? { ...p, status: 'rejected' as const }
              : p,
        )
        const chosen =
          proposals.find((p) => p.id === id) || prev.accepted_proposal || null
        return {
          ...prev,
          status: 'locked',
          accepted_proposal: chosen,
          proposals,
        }
      })
      setShowModalities(false)
      // Persist séjour draft + turn Vol green in parcours immediately.
      try {
        const draft = await getApiClient().getOrCreateExecutionDraft(id)
        setFlightDraft(draft)
        setWorkspace((prev) => {
          const base =
            prev ||
            (trip
              ? tripAsWorkspace(
                  {
                    ...trip,
                    status: 'locked',
                    accepted_proposal:
                      (trip.proposals || []).find((p) => p.id === id) ||
                      trip.accepted_proposal ||
                      null,
                  },
                  userId,
                )
              : null)
          if (!base) return prev
          return {
            ...base,
            draft_token: draft.draft_token || base.draft_token,
            proposal_id: id,
            phase:
              base.phase === 'booked' || base.phase === 'past'
                ? base.phase
                : 'flight_selected',
            pipeline: {
              ...base.pipeline,
              flight: base.pipeline.flight === 'booked' ? 'booked' : 'selected',
            },
            capabilities: {
              ...base.capabilities,
              can_scan: false,
              can_choose_flight: false,
              can_compose_hotel: true,
            },
          }
        })
      } catch (draftErr) {
        console.warn('[planner] execution draft after accept', draftErr)
      }
      await load({ silent: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
      void load({ silent: true })
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

  const doComplete = async () => {
    if (!trip) return
    if (
      !window.confirm(
        t('planner.archiveConfirm').replace('{name}', trip.name),
      )
    ) {
      return
    }
    setDeleting(true)
    setError(null)
    try {
      const updated = await getApiClient().completePlannedTrip(tripId)
      setTrip((prev) => (prev ? { ...prev, ...updated, status: 'completed' } : prev))
      setWorkspace((prev) => (prev ? { ...prev, phase: 'past' } : prev))
      invalidateTravelWorkspacesCache()
      onToast(t('planner.archiveDone'))
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    } finally {
      setDeleting(false)
    }
  }

  const doDelete = async () => {
    if (!trip) return
    if (
      !window.confirm(
        t('planner.deleteConfirm').replace('{name}', trip.name),
      )
    ) {
      return
    }
    setDeleting(true)
    setError(null)
    try {
      await getApiClient().deletePlannedTrip(tripId)
      invalidateTravelWorkspacesCache()
      onToast(t('planner.deleteDone'))
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
      onToast('Destination retirée. Mode inspire.')
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
    }
  }

  if (loading && !trip) {
    if (scanning || autoScan) {
      return (
        <div className="w-full space-y-6">
          <button type="button" onClick={onBack} className="text-sm font-bold text-primary-600">
            ← {t('nav.planner')}
          </button>
          <PlannerScanPanel fromLabel="…" toLabel="inspire" />
        </div>
      )
    }
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

  const statusLabel =
    (workspace?.phase && PHASE_LABEL[workspace.phase]) ||
    (trip.status === 'locked'
      ? PHASE_LABEL.flight_selected
      : PHASE_LABEL.planning)
  const reservationOrigin =
    (draftFlight.origin_iata as string | undefined) ||
    workspace?.origin_iata ||
    trip.departure_airport
  const reservationDest =
    (draftFlight.destination_iata as string | undefined) ||
    workspace?.dest_iata ||
    trip.arrival_airport
  const routeLine = `${departureRouteLabel(reservationOrigin)}${
    reservationDest
      ? ` → ${String(reservationDest).replace(/,/g, ' · ')}`
      : ' · inspire'
  }`
  const outDate =
    workspace?.out_date ||
    flightDraft?.out_date ||
    (draftPayload.dates as { outbound?: string } | undefined)?.outbound ||
    trip.dates_depart[0]?.date
  const retDate =
    workspace?.ret_date ||
    flightDraft?.ret_date ||
    (draftPayload.dates as { inbound?: string } | undefined)?.inbound ||
    trip.dates_retour[trip.dates_retour.length - 1]?.date
  const dateLine =
    outDate && retDate
      ? formatTripDateRangeFr(outDate, retDate)
      : null
  const destinationCode =
    parseAirportCodes(reservationDest)[0] ||
    parseAirportCodes(trip.arrival_airport)[0] ||
    ''
  const destinationName = (() => {
    const raw = String(
      workspace?.city ||
        (draftPayload.city as string | undefined) ||
        flightDraft?.city_name ||
        '',
    )
      .split(',')[0]
      ?.split('(')[0]
      ?.trim()
    if (raw && !/^[A-Z]{3}$/.test(raw)) return raw
    if (destinationCode) return cityDisplayNameFr(destinationCode) || raw || destinationCode
    return (
      trip.name.replace(/^(Weekend|Voyage|Séjour)\s+/i, '') ||
      t('destination.fallback')
    )
  })()
  const destinationImage = resolveTripImageUrl({
    city: destinationName,
    iata: destinationCode || null,
    imageUrl:
      workspace?.image_url ||
      (draftPayload.image_url as string | undefined) ||
      null,
  })
  const hotelPhoto = String(
    (draftHotel as { photo?: string; main_photo?: string; image?: string } | null)
      ?.photo ||
      (draftHotel as { main_photo?: string } | null)?.main_photo ||
      (draftHotel as { image?: string } | null)?.image ||
      '',
  ).trim()
  const hotelBlockImage =
    (hotelBooked || hasHotel) && hotelPhoto ? hotelPhoto : destinationImage
  const hotelName = String(
    (draftHotel as { name?: string } | null)?.name || 'Mon hôtel',
  )
  const hotelId = String(
    (draftHotel as { id?: string | number; hotel_id?: string | number } | null)
      ?.id ||
      (draftHotel as { hotel_id?: string | number } | null)?.hotel_id ||
      '',
  ).trim()
  const hotelSeedPhotos = (() => {
    const raw = (draftHotel as { photos?: unknown } | null)?.photos
    if (!Array.isArray(raw)) return hotelPhoto ? [hotelPhoto] : []
    const urls = raw
      .map((p) =>
        typeof p === 'string'
          ? p
          : p && typeof p === 'object' && 'url' in p
            ? String((p as { url?: string }).url || '')
            : '',
      )
      .map((u) => u.trim())
      .filter(Boolean)
    if (hotelPhoto && !urls.includes(hotelPhoto)) urls.unshift(hotelPhoto)
    return urls
  })()
  const showHotelGallery =
    Boolean(hotelBooked || hasHotel) && Boolean(hotelId) && hotelId !== 'primary'

  return (
    <div className="w-full space-y-6 pb-10">
      <section className="relative isolate overflow-hidden rounded-[32px] min-h-[min(42vh,360px)] shadow-xl shadow-orange-950/10 border border-orange-100/60">
        <img
          src={destinationImage}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover scale-[1.02]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#140c08]/92 via-[#1a100c]/45 to-black/25" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#140c08]/55 via-transparent to-transparent" />
        <div className="relative flex min-h-[min(42vh,360px)] flex-col justify-between p-5 sm:p-7 lg:p-9">
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center rounded-full bg-white/15 px-3.5 py-2 text-sm font-bold text-white backdrop-blur-md ring-1 ring-white/20 hover:bg-white/25 min-h-[40px]"
            >
              ← {t('nav.planner')}
            </button>
            <span
              className={`rounded-full text-[11px] font-bold px-3 py-1.5 backdrop-blur-md ${
                workspace?.phase === 'booked'
                  ? 'bg-emerald-400/20 text-emerald-50 ring-1 ring-emerald-200/30'
                  : 'bg-white/90 text-slate-800'
              }`}
            >
              {statusLabel}
            </span>
          </div>
          <div className="max-w-2xl">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-300">
              {destinationName}
            </p>
            {editingName ? (
              <form
                className="mt-2 flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveRename()
                }}
              >
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      cancelRename()
                    }
                  }}
                  maxLength={80}
                  disabled={savingName}
                  className="min-w-0 flex-1 rounded-2xl border border-white/30 bg-white/15 px-4 py-2.5 text-2xl sm:text-3xl font-black text-white tracking-tight placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/40"
                  placeholder="Nom du voyage"
                  aria-label="Nom du voyage"
                />
                <button
                  type="submit"
                  disabled={savingName}
                  className="rounded-2xl bg-white px-4 py-2.5 text-sm font-extrabold text-[#D94D1B] disabled:opacity-60 min-h-[44px]"
                >
                  {savingName ? '…' : 'OK'}
                </button>
                <button
                  type="button"
                  disabled={savingName}
                  onClick={cancelRename}
                  className="rounded-2xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60 min-h-[44px]"
                >
                  Annuler
                </button>
              </form>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.05]">
                  {trip.name}
                </h2>
                {isOrganizer ? (
                  <button
                    type="button"
                    onClick={startRename}
                    aria-label="Renommer"
                    title="Renommer"
                    className="inline-flex items-center justify-center rounded-full border border-white/25 bg-white/10 w-9 h-9 text-white/95 hover:bg-white/20 backdrop-blur-md"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                ) : null}
              </div>
            )}
            <p className="mt-3 text-sm sm:text-base font-semibold text-white/80">
              {routeLine}
              {trip.direct ? ' · directs' : ''}
            </p>
            {dateLine ? (
              <p className="mt-1 text-sm text-white/65">{dateLine}</p>
            ) : null}
            {workspace?.phase ? (
              <p className="mt-2 text-sm text-white/55">{PHASE_HINT[workspace.phase]}</p>
            ) : null}
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {isOrganizer && trip.status !== 'locked' ? (
                <button
                  type="button"
                  disabled={scanning}
                  onClick={() => void scan()}
                  className="inline-flex items-center rounded-2xl bg-[#FF6B35] px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-orange-950/30 hover:bg-[#E85A28] disabled:opacity-60 min-h-[48px]"
                >
                  {scanning ? t('planner.scanning') : t('planner.scan')}
                </button>
              ) : null}
              {reservationToken ? (
                <button
                  type="button"
                  onClick={openReservations}
                  className="inline-flex items-center rounded-2xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-bold text-white hover:bg-white/20 min-h-[48px] backdrop-blur-md"
                >
                  {HOTEL_CTA_FR.view}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="relative isolate overflow-hidden rounded-[28px] border border-orange-200/70 bg-gradient-to-br from-[#FFE8D6] via-[#FFDFC8] to-[#F5D5C0] px-3.5 sm:px-5 py-4 sm:py-5 shadow-soft">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-6 -top-10 h-36 w-36 rounded-full bg-[#FF6B35]/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-10 bottom-[-2rem] h-28 w-28 rounded-full bg-[#E8A87C]/25 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-8 top-1/2 h-px bg-[linear-gradient(90deg,transparent,rgba(217,77,27,0.28),transparent)]"
        />
        <div className="relative mb-3 flex items-end justify-between gap-3 px-0.5">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#D94D1B]">
              Ton parcours
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-[#6B4535]">
              {[
                pipelineForUi.find((s) => s.state === 'current')?.label,
                pipelineForUi.find((s) => s.state === 'current')?.hint,
              ]
                .filter(Boolean)
                .join(' · ') || 'Compose ton séjour étape par étape'}
            </p>
          </div>
          <p className="shrink-0 rounded-full bg-[#FFF6EE]/90 px-2.5 py-1 text-[11px] font-bold text-[#8A5A45] ring-1 ring-orange-200/80">
            {pipelineForUi.filter((s) => s.state === 'done').length}/
            {pipelineForUi.filter((s) => s.state !== 'off').length || pipelineForUi.length}
          </p>
        </div>
        <StayPipelineStepper
          steps={pipelineForUi}
          onStepPress={onPipelineStep}
          variant="journey"
        />
      </section>

      {trip.route_ok === false ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-2">
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

      {error ? <p className="text-red-600 text-sm font-medium">{error}</p> : null}

      {/* Next action */}
      {scanning ? (
        <PlannerScanPanel
          fromLabel={departureRouteLabel(reservationOrigin)}
          toLabel={
            reservationDest
              ? String(reservationDest).replace(/,/g, ' · ')
              : 'inspire'
          }
        />
      ) : accepted || externalFlight ? (
        <section className="space-y-6">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary-700 mb-1">
              Étape séjour
            </p>
            <h3 className="font-extrabold text-2xl text-ink tracking-tight">
              {externalFlight
                ? 'Vol ailleurs. Place à l’hôtel.'
                : flightBooked
                  ? 'Vol réservé. Complète ton séjour.'
                  : 'Vol choisi. Compose ton hôtel.'}
            </h3>
          </div>
          {externalFlight ? (
            <div className="rounded-3xl border border-line bg-white p-5 shadow-soft">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">
                Vol
              </p>
              <p className="mt-1 font-extrabold text-lg text-ink tracking-tight">
                Déjà réservé ailleurs
              </p>
              <p className="text-sm text-ink-soft mt-1 leading-relaxed">
                Tu continues directement sur l’hôtel pour {destinationName}.
              </p>
            </div>
          ) : null}
          <div className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:items-stretch">
            {accepted && !externalFlight ? (
              <div className="min-h-[280px] min-w-0 h-full">
                <SelectedFlightBoardingPass
                  trip={sanitizeTripAirports(accepted.trip_data)}
                  passengers={pax}
                  pricePerPerson={stayParty.flightPp || stayParty.perPerson}
                  priceCaption="Prix du vol"
                  bookingStatus={flightBookingStatus || undefined}
                  flightBooked={flightBooked}
                  bookingBusy={flightBookingBusy}
                  askBooked={askFlightBooked}
                  canEditModalities={isOrganizer && !flightBooked && !hotelBooked}
                  showModalities={showModalities}
                  modalitiesBusy={reopeningFlight || savingCriteria || scanning}
                  onToggleModalities={() => setShowModalities((v) => !v)}
                  onBook={() => void bookSelectedFlight()}
                  onConfirm={() => void confirmAirlineFlight()}
                  onDismissAsk={dismissFlightBookAsk}
                />
              </div>
            ) : null}
            {externalHotel ? (
              <div
                className={`min-w-0 bg-white rounded-3xl border border-line shadow-soft p-5 ${
                  externalFlight && !accepted ? 'lg:col-span-2' : ''
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Hôtel
                </p>
                <p className="mt-0.5 font-extrabold text-ink text-lg tracking-tight">
                  Déjà réservé ailleurs
                </p>
                <p className="text-sm text-ink-soft mt-1 leading-relaxed">
                  Tu as sauté l’étape hôtel FlightWatcher pour {destinationName}.
                </p>
              </div>
            ) : (
              <div
                className={`group relative isolate flex h-full min-h-[280px] min-w-0 overflow-hidden rounded-[28px] border border-orange-100/70 shadow-xl shadow-orange-950/10 ${
                  externalFlight && !accepted ? 'lg:col-span-2' : ''
                }`}
              >
                {showHotelGallery ? (
                  <HotelPhotoGallery
                    variant="hero"
                    className="h-full w-full"
                    hotelId={hotelId}
                    seedPhoto={hotelPhoto || null}
                    seedPhotos={hotelSeedPhotos}
                    alt={hotelName}
                    hotelName={hotelName}
                    cityLabel={destinationName}
                    overlay={
                      <div className="flex flex-col text-left">
                        <p
                          className={`text-[11px] font-black uppercase tracking-[0.18em] ${
                            hotelBooked || hasHotel
                              ? 'text-emerald-200'
                              : 'text-orange-300'
                          }`}
                        >
                          {hotelBooked || hasHotel ? 'Hôtel' : 'Prochaine étape'}
                        </p>
                        <p className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
                          {hotelBooked || hasHotel
                            ? hotelName
                            : HOTEL_CTA_FR.choose}
                        </p>
                        <p className="mt-2 max-w-md text-sm text-white/75 leading-relaxed">
                          {hotelBooked || hasHotel
                            ? `Séjour à ${destinationName}.`
                            : `Compare les chambres à ${destinationName}.`}
                        </p>
                        <div className="mt-5 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={hotelBusy || skippingHotel}
                            onClick={onHotelBlockCta}
                            className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-[#D94D1B] shadow-lg min-h-[48px] disabled:opacity-60"
                          >
                            {hotelBlockCtaLabel}
                            <span aria-hidden>›</span>
                          </button>
                          {hotelInvoiceReady ? (
                            <button
                              type="button"
                              disabled={invoiceBusy}
                              aria-busy={invoiceBusy}
                              onClick={() => downloadHotelInvoice()}
                              className="inline-flex items-center rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/20 disabled:opacity-60 min-h-[48px] backdrop-blur-md"
                            >
                              {invoiceBusy ? (
                                <InvoiceBusyLabel label="Préparation…" />
                              ) : invoiceDone ? (
                                'Facture ✓'
                              ) : (
                                'Facture'
                              )}
                            </button>
                          ) : null}
                          {canSkipHotel ? (
                            <button
                              type="button"
                              disabled={skippingHotel || hotelBusy}
                              onClick={() => void skipHotel()}
                              className="inline-flex items-center rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/20 disabled:opacity-60 min-h-[48px] backdrop-blur-md"
                            >
                              {skippingHotel ? '…' : 'J’ai déjà un hôtel'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    }
                  />
                ) : (
                  <div className="relative flex h-full w-full min-h-[280px] flex-col justify-end p-6 sm:p-7 text-left">
                    <img
                      src={hotelBlockImage}
                      alt=""
                      aria-hidden
                      className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#140c08]/95 via-[#1a100c]/55 to-black/20" />
                    <div className="relative z-[1] flex flex-col">
                      <p
                        className={`text-[11px] font-black uppercase tracking-[0.18em] ${
                          hotelBooked || hasHotel
                            ? 'text-emerald-200'
                            : 'text-orange-300'
                        }`}
                      >
                        {hotelBooked || hasHotel ? 'Hôtel' : 'Prochaine étape'}
                      </p>
                      <p className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
                        {hotelBooked || hasHotel
                          ? hotelName
                          : HOTEL_CTA_FR.choose}
                      </p>
                      <p className="mt-2 max-w-md text-sm text-white/75 leading-relaxed">
                        {hotelBooked || hasHotel
                          ? `Séjour à ${destinationName}.`
                          : `Compare les chambres à ${destinationName}.`}
                      </p>
                      <div className="mt-5 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={hotelBusy || skippingHotel}
                          onClick={onHotelBlockCta}
                          className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-extrabold text-[#D94D1B] shadow-lg min-h-[48px] disabled:opacity-60"
                        >
                          {hotelBlockCtaLabel}
                          <span aria-hidden>›</span>
                        </button>
                        {hotelInvoiceReady ? (
                          <button
                            type="button"
                            disabled={invoiceBusy}
                            aria-busy={invoiceBusy}
                            onClick={() => downloadHotelInvoice()}
                            className="inline-flex items-center rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/20 disabled:opacity-60 min-h-[48px] backdrop-blur-md"
                          >
                            {invoiceBusy ? (
                              <InvoiceBusyLabel label="Préparation…" />
                            ) : invoiceDone ? (
                              'Facture ✓'
                            ) : (
                              'Facture'
                            )}
                          </button>
                        ) : null}
                        {canSkipHotel ? (
                          <button
                            type="button"
                            disabled={skippingHotel || hotelBusy}
                            onClick={() => void skipHotel()}
                            className="inline-flex items-center rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/20 disabled:opacity-60 min-h-[48px] backdrop-blur-md"
                          >
                            {skippingHotel ? '…' : 'J’ai déjà un hôtel'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {accepted &&
          !externalFlight &&
          isOrganizer &&
          !flightBooked &&
          !hotelBooked &&
          showModalities ? (
            <div className="rounded-3xl border border-line bg-white p-5 sm:p-6 shadow-soft space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-line bg-slate-50/70 px-4 pt-4 pb-2">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
                    Dates
                  </p>
                  <DatePresets
                    selected={editPreset}
                    onChange={onEditPreset}
                    onFlexibleClick={() => {
                      setEditPreset('flexible')
                      setShowEditFlexible(true)
                    }}
                  />
                  {editDatesDepart[0] && editDatesRetour[0] ? (
                    <p className="text-sm text-ink-soft font-medium pb-2 mt-2">
                      {formatTripDateRangeFr(
                        editDatesDepart[0].date,
                        editDatesRetour[editDatesRetour.length - 1].date,
                      )}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-2xl border border-line bg-slate-50/70 px-4 py-4 space-y-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-muted mb-2">
                      Budget max / pers.
                    </p>
                    <BudgetSlider value={editBudget} onChange={setEditBudget} />
                  </div>
                  <div>
                    <PassengerStepper
                      value={editPassengers}
                      onChange={setEditPassengers}
                      label="Voyageurs"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <input
                      type="checkbox"
                      checked={editDirect}
                      onChange={(e) => setEditDirect(e.target.checked)}
                      className="rounded border-line"
                    />
                    Vols directs uniquement
                  </label>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={scanning || savingCriteria || reopeningFlight}
                  onClick={() => void updateCriteriaAndScan()}
                  className="inline-flex items-center rounded-xl bg-primary-500 text-white px-3.5 py-2 text-sm font-bold hover:bg-primary-600 disabled:opacity-60 min-h-[40px]"
                >
                  {savingCriteria || scanning
                    ? 'Scan…'
                    : 'Enregistrer et rescanner'}
                </button>
                <button
                  type="button"
                  disabled={scanning || savingCriteria || reopeningFlight}
                  onClick={() => void changeFlightChoice()}
                  className="inline-flex items-center rounded-xl border border-line px-3.5 py-2 text-sm font-bold text-ink hover:bg-slate-50 disabled:opacity-60 min-h-[40px]"
                >
                  {reopeningFlight ? 'Ouverture…' : 'Choisir un autre vol'}
                </button>
                <button
                  type="button"
                  disabled={scanning || savingCriteria || reopeningFlight}
                  onClick={() => void removeSelectedFlight()}
                  className="inline-flex items-center rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-bold text-red-600 hover:bg-red-100 disabled:opacity-60 min-h-[40px]"
                >
                  {reopeningFlight ? 'Suppression…' : 'Supprimer le vol'}
                </button>
                {canSkipFlight ? (
                  <button
                    type="button"
                    disabled={skippingFlight || scanning || savingCriteria}
                    onClick={() => void skipFlight()}
                    className="inline-flex items-center rounded-xl border border-line px-3.5 py-2 text-sm font-bold text-ink hover:bg-slate-50 disabled:opacity-60 min-h-[40px]"
                  >
                    {skippingFlight ? 'Ouverture…' : 'J’ai déjà un vol'}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          </div>
          {!isOrganizer ? (
            <p className="text-sm text-muted">
              Tu peux réserver ton vol et composer ton hôtel pour toi. Seul
              l’organisateur décide pour tout le monde.
            </p>
          ) : null}
        </section>
      ) : pending.length > 0 ? (
        <section className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary-700 mb-1">
                Étape 1
              </p>
              <h3 className="font-extrabold text-2xl text-ink tracking-tight">
                {t('planner.proposals')} ({visiblePending.length}
                {visiblePending.length !== pending.length
                  ? `/${pending.length}`
                  : ''}
                )
              </h3>
            </div>
            {proposalOrigins.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {proposalOrigins.map((code) => {
                  const active = !originFilter || originFilter.has(code)
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => {
                        setOriginFilter((prev) => {
                          const base = prev ?? new Set(proposalOrigins)
                          const next = new Set(base)
                          if (next.has(code)) {
                            if (next.size <= 1) return next
                            next.delete(code)
                          } else {
                            next.add(code)
                          }
                          if (next.size === proposalOrigins.length) return null
                          return next
                        })
                      }}
                      className={`px-3 py-1.5 rounded-xl text-sm font-bold border min-h-[36px] ${
                        active
                          ? 'bg-primary-500 text-white border-primary-500'
                          : 'bg-white text-slate-600 border-slate-200'
                      }`}
                    >
                      {code}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {visiblePending.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                passengers={pax}
                isOrganizer={!!isOrganizer}
                busy={acting === p.id}
                onAccept={() => void accept(p.id)}
                onReject={() => void reject(p.id)}
                t={t}
              />
            ))}
          </div>
          {canSkipFlight ? (
            <div className="rounded-3xl border border-line bg-white p-5 shadow-soft flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="font-extrabold text-ink">J’ai déjà un vol</p>
                <p className="text-sm text-ink-soft mt-0.5">
                  Passe directement à l’hôtel si tu as réservé l’avion ailleurs.
                </p>
              </div>
              <button
                type="button"
                disabled={skippingFlight}
                onClick={() => void skipFlight()}
                className="inline-flex items-center justify-center rounded-xl border border-line px-3.5 py-2 text-sm font-bold text-ink hover:bg-slate-50 disabled:opacity-60 min-h-[40px] shrink-0"
              >
                {skippingFlight ? 'Ouverture…' : 'Passer à l’hôtel'}
              </button>
            </div>
          ) : null}
        </section>
      ) : scanEmpty ? (
        <div
          className={`rounded-[28px] border px-6 py-8 sm:px-10 sm:py-10 ${
            scanEmpty.reason === 'budget'
              ? 'border-amber-200 bg-amber-50'
              : 'border-orange-100 bg-white shadow-soft'
          }`}
        >
          <div className="text-center max-w-xl mx-auto">
            <p
              className={`font-extrabold text-xl ${
                scanEmpty.reason === 'budget' ? 'text-amber-950' : 'text-slate-900'
              }`}
            >
              {scanEmpty.reason === 'budget'
                ? t('planner.scan.emptyBudget', { budget: scanEmpty.budget })
                : t('planner.scan.emptyNone')}
            </p>
            {scanEmpty.reason === 'budget' ? (
              <p className="text-sm text-amber-900/80 mt-2 leading-relaxed">
                {scanEmpty.cheapest
                  ? t('planner.scan.emptyBudgetHint', {
                      price: Math.ceil(scanEmpty.cheapest),
                    })
                  : t('planner.scan.emptyBudgetNoPrice')}
              </p>
            ) : null}
          </div>
          {isOrganizer ? (
            <div className="mt-8 max-w-2xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-5 text-left">
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
                    {formatTripDateRangeFr(
                      editDatesDepart[0].date,
                      editDatesRetour[editDatesRetour.length - 1].date,
                    )}
                  </p>
                ) : null}
              </div>
              <div className="rounded-2xl bg-white border border-slate-100 px-4 pt-4 pb-2 shadow-sm space-y-3">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                  {t('planner.scan.editBudget')}
                </p>
                {suggestedBudget && suggestedBudget > scanEmpty.budget ? (
                  <button
                    type="button"
                    onClick={() => setEditBudget(suggestedBudget)}
                    className="text-xs font-bold px-3 py-1.5 rounded-full border border-orange-300 bg-white text-[#E85A28] hover:bg-[#FFF3EC]"
                  >
                    {t('planner.scan.useCheapest', { price: suggestedBudget })}
                  </button>
                ) : null}
                <BudgetSlider value={editBudget} onChange={setEditBudget} />
                <button
                  type="button"
                  disabled={scanning || savingCriteria}
                  onClick={() => void updateCriteriaAndScan()}
                  className="w-full app-btn-primary rounded-2xl py-3 disabled:opacity-60"
                >
                  {savingCriteria || scanning
                    ? t('planner.scanning')
                    : t('planner.scan.updateAndScan')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <section className="rounded-[28px] border border-line bg-white p-7 sm:p-9 shadow-soft">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted mb-2">
            Étape 1
          </p>
          <h3 className="font-extrabold text-2xl text-ink tracking-tight">Trouver un vol</h3>
          <p className="text-base text-muted mt-2 max-w-xl leading-relaxed">
            {isOrganizer
              ? 'Scanne les prix dans ton budget, puis accepte une proposition.'
              : 'L’organisateur scanne et choisit le vol pour tout le monde.'}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {isOrganizer ? (
              <button
                type="button"
                disabled={scanning}
                onClick={() => void scan()}
                className="app-btn-primary rounded-2xl px-6 py-3 disabled:opacity-60"
              >
                {scanning ? t('planner.scanning') : t('planner.scan')}
              </button>
            ) : null}
            {canSkipFlight ? (
              <button
                type="button"
                disabled={skippingFlight || scanning}
                onClick={() => void skipFlight()}
                className="inline-flex items-center rounded-2xl border border-line px-5 py-3 text-sm font-bold text-ink hover:bg-slate-50 disabled:opacity-60"
              >
                {skippingFlight ? 'Ouverture…' : 'J’ai déjà un vol'}
              </button>
            ) : null}
          </div>
        </section>
      )}

      {!scanning && trip && plannerActivitiesEnabled ? (
        <div ref={stayExtrasRef}>
          <PlannerStayExtras
            tripId={tripId}
            trip={trip}
            draftToken={flightDraft?.draft_token || workspace?.draft_token || null}
            activitiesEnabled={plannerActivitiesEnabled}
            onActivityItemsChange={onActivityItemsChange}
          />
        </div>
      ) : null}

      {!scanning &&
      stayPriceIncludesHotel &&
      stayParty.perPerson > 0 ? (
        <aside
          className="overflow-hidden rounded-[24px] border border-orange-100/70 bg-white shadow-lg shadow-orange-950/5"
          aria-label="Prix du séjour"
        >
          <header className="border-b border-orange-50 bg-[#FFF8F3] px-5 py-3.5 sm:px-6">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#E85A28]">
              Récapitulatif
            </p>
            <h3 className="mt-0.5 text-lg sm:text-xl font-black tracking-tight text-ink">
              {flightBooked && hotelBooked
                ? 'Séjour réservé'
                : 'Prix du séjour'}
            </h3>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              Vol + hôtel · par personne
            </p>
          </header>

          <div className="px-5 py-4 sm:px-6 sm:py-5">
            <dl className="space-y-3">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-sm font-semibold text-slate-500">
                  Vol{' '}
                  <span className="font-medium text-slate-400">
                    (hors options)
                  </span>
                </dt>
                <dd className="text-sm font-bold tabular-nums text-ink">
                  {stayParty.flightPp}&nbsp;€
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-sm font-semibold text-slate-500">Hôtel</dt>
                <dd className="text-sm font-bold tabular-nums text-ink">
                  {stayParty.hotelPp}&nbsp;€
                </dd>
              </div>
            </dl>

            <div className="mt-5 flex items-end justify-between gap-4 border-t border-orange-50 pt-4">
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink">Par personne</p>
                {pax > 1 ? (
                  <p className="mt-1 text-xs font-medium text-slate-500 tabular-nums">
                    Soit {stayParty.total}&nbsp;€ pour {pax} personnes
                  </p>
                ) : null}
              </div>
              <p className="shrink-0 text-3xl font-black tracking-tight tabular-nums leading-none text-[#FF6B35]">
                {stayParty.perPerson}
                <span className="ml-0.5 text-xl font-bold">€</span>
              </p>
            </div>
          </div>
        </aside>
      ) : null}

      <section className="space-y-5">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-primary-700 mb-1">
            Séjour
          </p>
          <h3 className="font-extrabold text-2xl text-ink tracking-tight">Qui part</h3>
        </div>
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
        {isOrganizer ? (
          <div className="space-y-2">
            {!scanning ? (
              <button
                type="button"
                onClick={() => void doShare()}
                className="w-full text-left bg-white rounded-3xl border border-line shadow-soft p-5 sm:p-6 hover:bg-slate-50/80 transition-colors"
              >
                <span className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-muted">
                      {PLANNER_SHARE_EYEBROW_FR}
                    </span>
                    <span className="mt-0.5 block text-lg font-extrabold tracking-tight text-ink">
                      {PLANNER_SHARE_TITLE_FR}
                    </span>
                    <span className="mt-1 block text-sm text-ink-soft">
                      {PLANNER_SHARE_HINT_FR}.
                    </span>
                  </span>
                  <span className="inline-flex shrink-0 items-center justify-center rounded-xl bg-primary-500 text-white px-3.5 py-2 text-sm font-bold min-h-[40px]">
                    {PLANNER_SHARE_ACTION_FR}
                  </span>
                </span>
              </button>
            ) : null}
            <div className="flex flex-col items-start gap-0.5">
              {trip.status !== 'completed' ? (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void doComplete()}
                  className="text-sm font-bold text-ink-soft hover:text-ink px-1 py-1.5 disabled:opacity-50"
                >
                  {deleting ? '…' : t('planner.archive')}
                </button>
              ) : null}
              <button
                type="button"
                disabled={deleting}
                onClick={() => void doDelete()}
                className="text-sm font-bold text-red-600 hover:text-red-700 px-1 py-1.5 disabled:opacity-50"
              >
                {deleting ? '…' : t('planner.delete')}
              </button>
            </div>
          </div>
        ) : null}
      </section>

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

    </div>
  )
}

function PlannerStayExtras({
  tripId,
  trip,
  draftToken = null,
  activitiesEnabled,
  onActivityItemsChange,
}: {
  tripId: string
  trip: PlannedTripDetail
  draftToken?: string | null
  activitiesEnabled: boolean
  onActivityItemsChange?: (items: { status?: string | null }[]) => void
}) {
  const arrivalCode = parseAirportCodes(trip.arrival_airport)[0] || ''
  const cityLabel = arrivalCode
    ? cityDisplayNameFr(arrivalCode)
    : trip.name?.replace(/^Weekend\s+/i, '') || 'ta ville'
  const citySlug = resolveActivityCitySlug({
    cityLabel: cityLabel !== 'ta ville' ? cityLabel : null,
    destIata: arrivalCode || null,
  })
  const cityImage = cityImageUrl(cityLabel, arrivalCode || undefined)

  if (!activitiesEnabled) return null

  return (
    <div className="space-y-4">
      <section className="group relative isolate flex h-full min-w-0 flex-col overflow-hidden rounded-[24px] border border-orange-100/70 bg-white shadow-lg shadow-orange-950/5">
        <div className="relative h-28 sm:h-32 shrink-0 overflow-hidden">
          <img
            src={cityImage}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#140c08]/90 via-[#140c08]/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 px-4 py-3 sm:px-5 sm:py-3.5">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-300">
              À vivre sur place
            </p>
            <h3 className="mt-0.5 text-lg sm:text-xl font-black tracking-tight text-white">
              Activités à {cityLabel}
            </h3>
            <p className="mt-0.5 text-xs text-white/70 line-clamp-1">
              Transforme le séjour en souvenirs.
            </p>
          </div>
        </div>
        <div className="flex flex-1 flex-col p-3.5 sm:p-4">
          <ActivityStepPanel
            draftToken={draftToken}
            plannedTripId={tripId}
            citySlug={citySlug}
            enabled={activitiesEnabled}
            surface="planner"
            onItemsChange={onActivityItemsChange}
          />
        </div>
      </section>
    </div>
  )
}

const MODALITIES_TIP =
  'Tant que le vol n’est pas réservé, tu peux changer dates, budget, qui part ou relancer un scan.'

function ModalitiesInfoTip({
  text,
  className = '',
}: {
  text: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-label={text}
        aria-expanded={open}
        title={text}
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          setOpen((v) => !v)
        }}
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-[11px] font-black text-slate-500 hover:border-slate-300 hover:text-slate-800"
      >
        i
      </button>
      {open ? (
        <span
          role="tooltip"
          className="absolute z-30 bottom-[calc(100%+8px)] right-0 w-56 rounded-xl border border-line bg-white px-3 py-2.5 text-[11px] font-medium leading-snug text-ink shadow-lift"
          onClick={(e) => e.stopPropagation()}
        >
          {text}
        </span>
      ) : null}
    </span>
  )
}

function SelectedFlightBoardingPass({
  trip,
  passengers,
  pricePerPerson,
  priceCaption,
  priceHint,
  bookingStatus,
  flightBooked,
  bookingBusy,
  askBooked,
  canEditModalities,
  showModalities,
  modalitiesBusy,
  onToggleModalities,
  onBook,
  onConfirm,
  onDismissAsk,
}: {
  trip: EnrichedTripResponse
  passengers: number
  /** Pack €/pers when hotel included; falls back to flight prix_total. */
  pricePerPerson?: number
  priceCaption?: string
  priceHint?: string
  bookingStatus?: FlightBookingStatus
  flightBooked?: boolean
  bookingBusy: boolean
  askBooked?: boolean
  canEditModalities?: boolean
  showModalities?: boolean
  modalitiesBusy?: boolean
  onToggleModalities?: () => void
  onBook: () => void
  onConfirm: () => void
  onDismissAsk?: () => void
}) {
  const formatBoardingDate = (value: string) =>
    new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    })
      .format(new Date(value))
      .replace('.', '')

  const formatBoardingTime = (value: string) =>
    new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))

  const safe = sanitizeTripAirports(trip)
  const airline = formatAirlineLabel(safe)
  const originCode = primaryAirportCode(safe.aller.origin)
  const destCode = primaryAirportCode(
    safe.aller.destination || safe.destination_code,
  )
  const destinationCity = cityDisplayNameFr(
    destCode,
    safe.aller.destinationFull,
  )
  const ticketImage = resolveTripImageUrl({
    city: destinationCity,
    iata: destCode || null,
    imageUrl: safe.image_url,
  })
  const isTravelpayouts = /travelpayouts|aviasales/i.test(
    `${safe.provider || ''} ${safe.booking_url || ''}`,
  )
  const isConfirmed =
    Boolean(flightBooked) ||
    bookingStatus === 'user_confirmed' ||
    bookingStatus === 'partner_confirmed'

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      className="group relative isolate flex h-full min-h-[280px] overflow-hidden rounded-[28px] border border-white/20 bg-slate-950 shadow-xl shadow-slate-950/15"
    >
      <div className="grid h-full min-h-[280px] w-full grid-cols-1 lg:grid-cols-[minmax(0,1fr)_148px]">
        <div className="relative z-[1] flex min-h-[280px] min-w-0 flex-col justify-between gap-6 p-5 sm:p-6 lg:min-h-0">
          <img
            src={ticketImage}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B1220]/95 via-[#101827]/78 to-[#101827]/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B1220]/90 via-transparent to-black/20" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-300">
                Carte d’embarquement
              </p>
              <p className="mt-1 truncate text-sm font-extrabold text-white">
                {airline}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-emerald-300/25 bg-emerald-400/20 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-100 backdrop-blur-md">
              Vol choisi
            </span>
          </div>

          <div className="relative flex items-center gap-2 sm:gap-4">
            <div className="min-w-0">
              <p className="text-3xl sm:text-4xl font-black tracking-[-0.05em] text-white drop-shadow-lg">
                {originCode || '—'}
              </p>
              <p className="mt-1 max-w-[110px] truncate text-xs font-semibold text-white/65">
                {cityDisplayNameFr(originCode, safe.aller.originFull)}
              </p>
            </div>
            <div className="flex min-w-[56px] flex-1 items-center" aria-hidden>
              <span className="h-px flex-1 border-t border-dashed border-white/35" />
              <span className="mx-1.5 inline-flex h-9 w-9 rotate-12 items-center justify-center rounded-full border border-white/20 bg-white/15 text-lg text-orange-200 backdrop-blur-md">
                ✈
              </span>
              <span className="h-px flex-1 border-t border-dashed border-white/35" />
            </div>
            <div className="min-w-0 text-right">
              <p className="text-3xl sm:text-4xl font-black tracking-[-0.05em] text-orange-300 drop-shadow-lg">
                {destCode || '—'}
              </p>
              <p className="mt-1 ml-auto max-w-[110px] truncate text-xs font-semibold text-white/65">
                {destinationCity}
              </p>
            </div>
          </div>

          <div className="relative grid grid-cols-2 gap-2.5">
            {[
              { label: 'Aller', flight: safe.aller },
              { label: 'Retour', flight: safe.retour },
            ].map(({ label, flight }) => (
              <div
                key={label}
                className="rounded-2xl border border-white/15 bg-white/95 px-3.5 py-3 shadow-lg backdrop-blur-md"
              >
                <p className="text-[10px] font-black uppercase tracking-wider text-primary-600">
                  {label}
                </p>
                <p className="mt-1 text-sm font-extrabold text-slate-900">
                  {formatBoardingDate(String(flight.departureTime || ''))}
                </p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-lg font-black text-slate-950">
                    {formatBoardingTime(String(flight.departureTime || ''))}
                  </span>
                  <span className="truncate font-mono text-[10px] font-bold text-slate-500">
                    {String(flight.flightNumber || '—')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-[1] flex flex-row items-center justify-between gap-4 border-t border-dashed border-slate-300/90 bg-[#FFFCF8] p-4 sm:p-5 lg:h-full lg:flex-col lg:items-stretch lg:justify-center lg:gap-4 lg:border-l lg:border-t-0">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
              {priceCaption || 'Prix par personne'}
            </p>
            <p className="mt-1 text-3xl font-black tracking-tight text-slate-950">
              {Math.round(
                pricePerPerson != null
                  ? pricePerPerson
                  : Number(safe.prix_total) || 0,
              )}
              €
              <span className="ml-1 text-sm font-bold text-slate-500">/pers.</span>
            </p>
            {priceHint ? (
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                {priceHint}
              </p>
            ) : (
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                {passengers === 1 ? '1 personne' : `${passengers} personnes`}
              </p>
            )}
          </div>
          <div
            aria-hidden
            className="hidden h-8 w-full opacity-50 lg:block"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg,#111827 0,#111827 2px,transparent 2px,transparent 5px)',
            }}
          />
          <div className="flex shrink-0 flex-col gap-2 lg:w-full">
            {bookingStatus === 'pending_partner' && isTravelpayouts ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-[10px] font-black uppercase tracking-wide text-amber-800">
                  Paiement à confirmer
                </p>
                <p className="mt-0.5 text-[10px] font-semibold leading-snug text-amber-700">
                  Mise à jour automatique dès validation par Travelpayouts.
                </p>
              </div>
            ) : null}
            {askBooked && !isConfirmed && !isTravelpayouts ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 space-y-2">
                <p className="text-[11px] font-black text-emerald-900">
                  Ton vol est réservé ?
                </p>
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    onClick={onConfirm}
                    disabled={bookingBusy}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-black text-white disabled:opacity-60"
                  >
                    {bookingBusy ? '…' : 'Oui, c’est réservé'}
                  </button>
                  <button
                    type="button"
                    onClick={onDismissAsk}
                    disabled={bookingBusy}
                    className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-[11px] font-bold text-emerald-900 disabled:opacity-60"
                  >
                    Pas encore
                  </button>
                </div>
              </div>
            ) : null}
            <div className="flex items-stretch gap-2 lg:w-full">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onBook()
                }}
                disabled={bookingBusy || isConfirmed}
                className={`min-h-[44px] flex-1 rounded-xl px-4 py-3 text-xs font-extrabold text-white shadow-lg transition ${
                  isConfirmed
                    ? 'cursor-default bg-emerald-600'
                    : 'bg-slate-950 hover:bg-primary-600 disabled:opacity-60'
                }`}
              >
                {isConfirmed
                  ? 'Vol confirmé ✓'
                  : bookingBusy
                    ? 'Ouverture…'
                    : bookingStatus === 'pending_partner'
                      ? 'Revoir la réservation'
                      : bookingStatus === 'redirected'
                        ? 'Retourner sur le site'
                        : 'Réserver'}
              </button>
              {canEditModalities ? (
                <>
                  <button
                    type="button"
                    disabled={modalitiesBusy}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleModalities?.()
                    }}
                    aria-label={
                      showModalities
                        ? 'Fermer les modalités'
                        : 'Modifier les modalités'
                    }
                    title={
                      showModalities
                        ? 'Fermer les modalités'
                        : 'Modifier les modalités'
                    }
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
                  >
                    {showModalities ? (
                      <span className="text-base font-bold leading-none" aria-hidden>
                        ×
                      </span>
                    ) : (
                      <PencilIcon className="w-4 h-4" />
                    )}
                  </button>
                  <ModalitiesInfoTip text={MODALITIES_TIP} />
                </>
              ) : null}
            </div>
            {!askBooked && bookingStatus === 'redirected' && !isTravelpayouts ? (
              <button
                type="button"
                onClick={onConfirm}
                disabled={bookingBusy}
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] font-black text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
              >
                J’ai réservé mon vol
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </motion.article>
  )
}

function ProposalCard({
  proposal,
  passengers,
  isOrganizer,
  busy,
  onAccept,
  onReject,
  t,
}: {
  proposal: TripProposal
  passengers: number
  isOrganizer: boolean
  busy: boolean
  onAccept: () => void
  onReject: () => void
  t: (k: string) => string
}) {
  return (
    <DestinationCard
      trip={proposal.trip_data}
      passengers={passengers}
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
      if (data?.full_name?.trim() && !name) name = data.full_name.trim()
      if (data?.avatar_url && !avatarUrl) avatarUrl = data.avatar_url
      // Always prefer live Google / auth metadata for the signed-in user.
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
  const partyMode = partyModeFromCount(Math.max(seatTotal, count, 1))
  const partyTitle = partyModeTitleFr(partyMode)
  const partyKicker = partyModeKickerFr(partyMode)
  const partySubtitle = partyModeSubtitleFr(partyMode)
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
    <section className="relative overflow-hidden rounded-[28px] border border-orange-100/80 bg-gradient-to-br from-white via-white to-[#FFF7F1] shadow-xl shadow-orange-950/5">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-10 w-44 h-44 rounded-full bg-[#FF6B35]/10 blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -left-12 w-40 h-40 rounded-full bg-[#FFB088]/15 blur-2xl"
      />

      <div className="relative p-4 sm:p-5 space-y-5">
        <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#161D2A] via-[#24202A] to-[#6B2A16] p-5 sm:p-6 text-white shadow-xl">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full border border-white/10"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute right-10 -bottom-16 h-40 w-40 rounded-full bg-orange-400/15 blur-2xl"
          />
          <div className="relative flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-orange-300 mb-1">
                {partyKicker}
              </p>
              <h3 className="font-extrabold text-2xl text-white tracking-tight">
                {partyTitle}
              </h3>
              <p className="text-sm text-white/60 mt-1">
                {partyMode === 'solo'
                  ? partySubtitle
                  : t('planner.members.seats', { count, seats: seatTotal })}
              </p>
            </div>
            {isOrganizer && !full ? (
              <button
                type="button"
                disabled={busy}
                onClick={onOpenAdd}
                className="shrink-0 inline-flex items-center gap-1.5 text-sm font-extrabold text-[#D94D1B] bg-white hover:bg-orange-50 px-4 py-3 rounded-2xl shadow-lg shadow-black/20 disabled:opacity-50 transition-all hover:-translate-y-0.5"
              >
                <span className="text-lg leading-none">+</span>
                {t('planner.members.addShort')}
              </button>
            ) : null}
            {isOrganizer && full ? (
              <span className="shrink-0 text-xs font-bold text-white bg-white/15 border border-white/15 px-3 py-2 rounded-2xl backdrop-blur-md">
                {t('planner.members.full')}
              </span>
            ) : null}
          </div>

          <div className="relative mt-5">
            <div className="flex items-center justify-between text-[11px] font-bold text-white/45 mb-2">
              <span>{t('planner.members.places')}</span>
              <span className="text-white">
                {count}/{seatTotal}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-white/10 overflow-hidden ring-1 ring-white/10">
              <motion.div
                initial={false}
                animate={{ width: `${progress}%` }}
                transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                className="h-full rounded-full bg-gradient-to-r from-[#FF6B35] via-[#FF8A5B] to-[#FFC07D] shadow-[0_0_16px_rgba(255,107,53,0.5)]"
              />
            </div>
          </div>
        </div>

        {sorted.length === 0 && !addOpen ? (
          <div className="rounded-3xl border border-dashed border-orange-200 bg-white/80 px-4 py-10 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-2xl">
              👋
            </div>
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
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  className="group flex items-center gap-3 rounded-3xl border border-slate-100 bg-white px-4 py-4 shadow-md shadow-slate-900/5 hover:border-orange-200 hover:shadow-lg transition-shadow"
                >
                  <div
                    className={`relative w-12 h-12 rounded-full overflow-hidden flex items-center justify-center text-white font-black text-sm shrink-0 shadow-md ring-4 ring-orange-50 ${
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
                      {!isOrg && m.email ? (
                        <span className="text-[11px] font-medium text-slate-500 truncate max-w-full">
                          {m.email}
                        </span>
                      ) : (
                        <span
                          className={`text-[11px] font-semibold ${
                            isOrg || onApp
                              ? 'text-emerald-700'
                              : 'text-slate-400'
                          }`}
                        >
                          {isOrg
                            ? t('planner.members.organizer')
                            : onApp
                              ? t('planner.members.onApp')
                              : t('planner.members.offApp')}
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
                      className="w-full h-full min-h-[80px] flex items-center justify-center gap-2 rounded-3xl border border-dashed border-orange-200 bg-white/60 text-slate-400 hover:border-orange-400 hover:bg-white hover:text-[#E85A28] hover:shadow-md transition-all disabled:opacity-50 px-3 py-3"
                    >
                      <span className="w-10 h-10 rounded-full border border-dashed border-current flex items-center justify-center text-xl font-light">
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
