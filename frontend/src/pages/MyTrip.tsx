import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { MyTripDraft, TravelDeal } from '@flightwatcher/shared'
import {
  ACTIVITY_TRANSFER_CTA_FR,
  activitiesCityPath,
  activityStepProgress,
  resolveActivityCitySlug,
  airportDisplayNameFr,
  ACTIVITY_BACK_TO_PLANNER_FR,
  buildStayPipeline,
  cityDisplayNameFr,
  HOTEL_CTA_FR,
  primaryAirportCode,
  distantAirportLine,
  hotelCancelLabel,
  resolveCarrierBooking,
  resolveDraftPartyPrice,
  resolveFlightStepStatus,
  resolveHotelStepStatus,
  resolveNextStayAction,
  pickTripItemOwner,
  type StayStepId,
} from '@flightwatcher/shared'
import { StayPipelineStepper } from '../components/StayPipelineStepper'
import { ActivityStepPanel } from '../components/ActivityStepPanel'
import { ActivitySurfaceBanner } from '../components/ActivitySurfaceBanner'
import { getApiClient } from '../utils/apiClient'
import { getAppConfig } from '../utils/configCache'
import { listTripItemsCached } from '../utils/tripItemsCache'
import { getCurrentSession } from '../lib/supabase'
import { rememberTrip } from '../utils/tripRecovery'
import {
  clearFlightReturnAsk,
  consumeFlightReturnAsk,
  markFlightReturnAsk,
} from '../utils/partnerBook'
import { PaymentCardMarks } from '../components/PaymentCardMarks'
import { MyTripHotelPanel } from '../components/MyTripHotelPanel'

const MyTripHotelCompose = lazy(() =>
  import('../components/MyTripHotelCompose').then((m) => ({
    default: m.MyTripHotelCompose,
  })),
)
const DealCheckoutFlow = lazy(() =>
  import('../components/DealCheckoutFlow').then((m) => ({
    default: m.DealCheckoutFlow,
  })),
)

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatTimeLocal(iso?: string | null): string {
  if (!iso) return ''
  const m = String(iso).match(/(\d{2}):(\d{2})/)
  if (m) return `${m[1]}:${m[2]}`
  try {
    return new Date(iso).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

async function shareTrip(city: string, url: string) {
  const title = `Week-end à ${city}`
  const text = `Mon week-end à ${city} sur FlightWatcher`
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, text, url })
      return 'shared' as const
    } catch {
      /* cancelled */
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied' as const
  } catch {
    return 'failed' as const
  }
}

/**
 * Lot A–D — conversion-first Mon voyage:
 * party price, layout, carrier CTA, guest hotel checkout (§5).
 */
export default function MyTrip() {
  const { token } = useParams<{ token: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [draft, setDraft] = useState<MyTripDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [composeOpen, setComposeOpen] = useState(
    () => searchParams.get('compose') === '1',
  )
  const [showPriceAsk, setShowPriceAsk] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [checkId, setCheckId] = useState<string | null>(null)
  const [markingBooked, setMarkingBooked] = useState(false)
  const [shareHint, setShareHint] = useState<string | null>(null)
  const [askFlightBooked, setAskFlightBooked] = useState(false)
  const [copyDone, setCopyDone] = useState(false)
  const [checkoutDeal, setCheckoutDeal] = useState<TravelDeal | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  /** After compose → checkout, Précédent / fermer returns to compose (unless booked). */
  const [returnToCompose, setReturnToCompose] = useState(false)
  const hotelJustBookedRef = useRef(false)
  const [flightUnavailable, setFlightUnavailable] = useState(false)
  const [hotelUnavailable, setHotelUnavailable] = useState(false)
  const [switchingHotel, setSwitchingHotel] = useState(false)
  const [cancellingHotel, setCancellingHotel] = useState(false)
  const [cancelHotelError, setCancelHotelError] = useState<string | null>(null)
  const [plannerActivitiesEnabled, setPlannerActivitiesEnabled] = useState(false)
  const [hotelBookingEnabled, setHotelBookingEnabled] = useState(true)
  const [activityItems, setActivityItems] = useState<{ status?: string | null }[]>([])
  const [showActivities, setShowActivities] = useState(false)
  const activitiesSectionRef = useRef<HTMLElement | null>(null)
  const leftForFlight = useRef(false)
  const leftForFlightAt = useRef(0)
  const hotelSectionRef = useRef<HTMLElement | null>(null)
  const autoBookHotel = useRef(searchParams.get('book_hotel') === '1')
  const trackedView = useRef(false)
  /** One live hotel revalidate per token+hotel (avoid loop after persist). */
  const hotelLiveKey = useRef<string | null>(null)
  /** One live flight revalidate per token+route (avoid loop after persist). */
  const flightLiveKey = useRef<string | null>(null)

  const track = useCallback(
    (event: string, meta?: Record<string, unknown>) => {
      if (!token) return
      void getApiClient()
        .trackMyTripEvent(token, event, meta)
        .catch(() => undefined)
    },
    [token],
  )

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!token) return
    const silent = Boolean(opts?.silent)
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const row = await getApiClient().getMyTrip(token)
      setDraft(row)
      {
        const pl = (row.payload || {}) as Record<string, unknown>
        const fl = (pl.flight || {}) as Record<string, unknown>
        const resolvedCity = resolveActivityCitySlug({
          citySlug: typeof pl.city_slug === 'string' ? pl.city_slug : null,
          cityLabel:
            row.city_name ||
            (typeof pl.city === 'string' ? pl.city : null),
          destIata: String(
            fl.destination_iata ||
              pl.destination ||
              pl.dest_iata ||
              row.dest_iata ||
              '',
          ),
        })
        rememberTrip({
          draft_token: token,
          city: resolvedCity,
          booking_id:
            (pl.hotel_booking_id as string | undefined) || null,
        })
      }
      if (!trackedView.current) {
        trackedView.current = true
        void getApiClient()
          .trackMyTripEvent(token, 'view')
          .catch(() => undefined)
      }
    } catch (e) {
      // Silent refresh must keep optimistic / last-known reserved statuses.
      if (!silent) {
        setError(e instanceof Error ? e.message : 'Voyage introuvable')
        setDraft(null)
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [token])

  const refreshTripItems = useCallback(async () => {
    if (!token || !plannerActivitiesEnabled) return
    try {
      // Same XOR owner as ActivityStepPanel (planned_trip_id wins over draft).
      const owner = pickTripItemOwner({
        draftToken: token,
        plannedTripId: draft?.source_planned_trip_id || null,
      })
      if (!owner.draft_token && !owner.planned_trip_id) return
      const res = await listTripItemsCached(owner)
      const items = res.items || []
      setActivityItems(
        items.filter((i) => i.item_type === 'activity') as {
          status?: string | null
        }[],
      )
    } catch {
      /* keep previous step progress */
    }
  }, [token, plannerActivitiesEnabled, draft?.source_planned_trip_id])

  useEffect(() => {
    void load()
  }, [load])

  // After login (?claim=1) attach draft + hotel bookings to the account
  useEffect(() => {
    if (!token || searchParams.get('claim') !== '1') return
    let cancelled = false
    ;(async () => {
      try {
        const session = await getCurrentSession()
        if (!session?.user || cancelled) return
        await getApiClient().claimMyTrip(token)
        if (cancelled) return
        const next = new URLSearchParams(searchParams)
        next.delete('claim')
        setSearchParams(next, { replace: true })
        await load()
      } catch {
        /* guest / already claimed */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, searchParams, setSearchParams, load])

  const payload = (draft?.payload || {}) as Record<string, any>
  const flight = payload.flight || {}
  const hotel = payload.hotel || draft?.hotel
  const hotelObj = hotel && typeof hotel === 'object' ? (hotel as Record<string, any>) : null
  const city =
    draft?.city_name ||
    payload.city ||
    cityDisplayNameFr(
      String(
        flight.destination_iata ||
          payload.destination ||
          payload.dest_iata ||
          draft?.dest_iata ||
          '',
      ),
    ) ||
    'Destination'
  const activityCitySlug = useMemo(
    () =>
      resolveActivityCitySlug({
        citySlug:
          typeof payload.city_slug === 'string' ? payload.city_slug : null,
        cityLabel: city !== 'Destination' ? String(city) : null,
        destIata: String(
          flight.destination_iata ||
            payload.destination ||
            payload.dest_iata ||
            draft?.dest_iata ||
            '',
        ),
      }),
    [
      city,
      draft?.dest_iata,
      flight.destination_iata,
      payload.city_slug,
      payload.dest_iata,
      payload.destination,
    ],
  )
  const adults = Math.max(1, Number(draft?.adults || payload.adults || 2))
  const outDate = draft?.out_date || payload.dates?.outbound
  const retDate = draft?.ret_date || payload.dates?.inbound
  const hotelBookedEarly = Boolean(
    draft?.hotel_booked_at || payload.hotel_booked || payload.hotel_booked_at,
  )

  const party = useMemo(() => {
    return resolveDraftPartyPrice({
      adults,
      outDate,
      retDate,
      payload,
      hotelBooked: hotelBookedEarly,
      chargedHotelTotal:
        payload.hotel_charged_total != null
          ? Number(payload.hotel_charged_total)
          : null,
    })
  }, [adults, hotelBookedEarly, outDate, payload, retDate])

  const nights = party.nights || Number(payload.nights) || 0

  const originIata = primaryAirportCode(
    flight.origin_iata || payload.origin_iata || draft?.origin_iata || '',
  )
  const destIata = primaryAirportCode(
    flight.destination_iata || payload.destination || payload.dest_iata || '',
  )

  const originName = airportDisplayNameFr(originIata, null)
  const arrivalName = airportDisplayNameFr(destIata, city)
  const originLabel =
    payload.origin_airport_label ||
    (originName && originName.toUpperCase() !== originIata ? originName : null) ||
    'Départ'
  const arrivalLabel =
    payload.arrival_airport_label ||
    (arrivalName && arrivalName.toUpperCase() !== destIata ? arrivalName : null) ||
    city

  const outDep =
    flight.outbound_local ||
    flight.out_dep_local ||
    flight.aller?.departureTime ||
    payload.out_dep_local
  const retDep =
    flight.inbound_local ||
    flight.ret_dep_local ||
    flight.retour?.departureTime ||
    payload.ret_dep_local
  const outTime = formatTimeLocal(outDep)
  const retTime = formatTimeLocal(retDep)
  const outArrTime = formatTimeLocal(
    flight.outbound_arrival_local ||
      flight.out_arr_local ||
      flight.outbound_arr_local ||
      payload.out_arr_local,
  )
  const retArrTime = formatTimeLocal(
    flight.inbound_arrival_local ||
      flight.ret_arr_local ||
      flight.in_arr_local ||
      payload.ret_arr_local,
  )
  const outFlightNo = String(
    flight.outbound_flight_number ||
      flight.flight_number ||
      flight.aller?.flightNumber ||
      flight.aller?.flight_number ||
      '',
  ).trim()
  const retFlightNo = String(
    flight.inbound_flight_number ||
      flight.return_flight_number ||
      flight.retour?.flightNumber ||
      flight.retour?.flight_number ||
      '',
  ).trim()

  const carrier = useMemo(
    () =>
      resolveCarrierBooking({
        airline: flight.airline || flight.carrier || payload.airline,
        carrier: flight.carrier,
        provider: flight.provider || payload.provider,
        bookingUrl: flight.booking_url || payload.booking_url,
        originIata,
        destIata,
        outDate,
        retDate,
        outLocal: outDep,
        inLocal: retDep,
        adults,
        language: 'fr',
        originLabel,
        arrivalLabel,
      }),
    [
      adults,
      arrivalLabel,
      destIata,
      flight,
      originIata,
      originLabel,
      outDate,
      outDep,
      payload.airline,
      payload.booking_url,
      payload.provider,
      retDate,
      retDep,
    ],
  )

  const flightUrl = carrier.url
  const cta = carrier.ctaLabel
  const airlineName = carrier.airlineName
  const distanceLine =
    distantAirportLine(destIata, city) ||
    (typeof payload.route_hint === 'string' && /km/i.test(payload.route_hint)
      ? String(payload.route_hint)
      : null)
  const stopsLabel =
    flight.direct === true
      ? 'vol direct'
      : flight.transfers === 1 || flight.stops === 1
        ? '1 escale'
        : flight.direct === false ||
            (flight.transfers != null && Number(flight.transfers) > 0)
          ? `${Number(flight.transfers || flight.stops || 1)} escale${Number(flight.transfers || flight.stops || 1) > 1 ? 's' : ''}`
          : null
  const flightBookingStatus = String(
    draft?.flight_booking_status || payload.flight_booking_status || 'not_started',
  )
  const externalFlight = Boolean(payload.flight_external || payload.external_flight)
  const flightBooked = Boolean(
    draft?.flight_booked_at ||
      payload.flight_booked ||
      payload.flight_booked_at ||
      flightBookingStatus === 'user_confirmed' ||
      flightBookingStatus === 'partner_confirmed' ||
      externalFlight,
  )
  const isTravelpayouts = /travelpayouts|aviasales/i.test(
    `${flight.provider || payload.provider || ''} ${carrier.siteLabel || ''}`,
  )
  const hotelBooked = Boolean(
    draft?.hotel_booked_at || payload.hotel_booked || payload.hotel_booked_at,
  )
  const hotelConfirmation =
    payload.hotel_confirmation_code != null
      ? String(payload.hotel_confirmation_code)
      : null
  const hotelHolderEmail =
    payload.hotel_holder_email != null ? String(payload.hotel_holder_email) : null
  const vlevel =
    flight.verification_level ||
    payload.flags?.verification_level ||
    payload.verification_level ||
    'live'
  const isCached = vlevel === 'cached'
  const hotelPhoto = hotelObj?.photo || hotelObj?.thumbnail || payload.image_url || ''
  const hotelId = hotelObj?.id != null ? String(hotelObj.id) : null
  const wantsCompose =
    composeOpen || payload.compose_hotel === true || searchParams.get('compose') === '1'

  const activityProgress = useMemo(
    () => activityStepProgress(activityItems),
    [activityItems],
  )

  const pipelineSteps = useMemo(
    () =>
      buildStayPipeline({
        flight: resolveFlightStepStatus({
          hasFlightPayload: Boolean(
            flight && (flight.airline || flight.origin_iata || flight.price_pp),
          ),
          flightBooked,
          externalFlight,
          bookingUrl: String(flight.booking_url || payload.booking_url || ''),
        }),
        hotel: resolveHotelStepStatus({
          hasHotel: Boolean(hotelId),
          hotelBooked,
        }),
        // Don't pin focus on Activités once chosen — keeps the chip green (done).
        focus: wantsCompose
          ? 'hotel'
          : showActivities && !activityProgress.done
            ? 'activities'
            : undefined,
        activitiesEnabled: plannerActivitiesEnabled,
        activitiesDone: activityProgress.done,
        activitiesPartial: activityProgress.partial,
        activitiesHint: activityProgress.hint,
        restaurantsEnabled: false,
      }).filter((s) => s.id !== 'restaurants'),
    [
      flight,
      flightBooked,
      externalFlight,
      payload.booking_url,
      hotelId,
      hotelBooked,
      wantsCompose,
      showActivities,
      plannerActivitiesEnabled,
      activityProgress,
    ],
  )

  useEffect(() => {
    void getAppConfig()
      .then((cfg) => {
        if (!cfg) return
        setPlannerActivitiesEnabled(
          cfg.planner_activities_enabled === true ||
            cfg.activities_ui_enabled === true,
        )
        setHotelBookingEnabled(
          cfg.booking_enabled !== false && cfg.prod_readonly !== true,
        )
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (searchParams.get('activities') !== '1') return
    setShowActivities(true)
    const t = window.setTimeout(() => {
      activitiesSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }, 120)
    return () => window.clearTimeout(t)
  }, [searchParams])

  useEffect(() => {
    void refreshTripItems()
  }, [refreshTripItems, showActivities, hotelBooked, flightBooked])

  const from = searchParams.get('from')
  const plannerTripId = draft?.source_planned_trip_id || null
  const backHref = plannerTripId
    ? `/planner/${encodeURIComponent(plannerTripId)}`
    : from === 'recherche' || from === 'vols'
      ? '/vols'
      : from === 'planner'
        ? '/planner'
        : '/sejours'
  const backLabel = plannerTripId
    ? '← Planner'
    : from === 'recherche' || from === 'vols'
      ? '← Vols'
      : from === 'planner'
        ? '← Planner'
        : '← Séjours'

  const closeCompose = useCallback(() => {
    setComposeOpen(false)
    const next = new URLSearchParams(searchParams)
    next.delete('compose')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const openCompose = useCallback(() => {
    setComposeOpen(true)
    const next = new URLSearchParams(searchParams)
    next.set('compose', '1')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const onPipelineStep = (id: StayStepId) => {
    if (id === 'hotel') {
      if (hotelId && !hotelBooked) {
        hotelSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (!hotelId) {
        openCompose()
      }
      return
    }
    if (id === 'activities' && plannerActivitiesEnabled) {
      setShowActivities(true)
      setTimeout(() => {
        activitiesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
      return
    }
    if (id === 'flight' && flightUrl && !flightBooked) {
      leftForFlight.current = true
      leftForFlightAt.current = Date.now()
      window.open(flightUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const dismissHotelCheckout = useCallback(() => {
    setCheckoutDeal(null)
    // After a successful hotel booking, never dump the user back into compose.
    if (hotelJustBookedRef.current || hotelBooked) {
      hotelJustBookedRef.current = false
      setReturnToCompose(false)
      closeCompose()
      void load({ silent: true })
      void refreshTripItems()
      window.setTimeout(() => {
        hotelSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 80)
      return
    }
    if (!returnToCompose) return
    setReturnToCompose(false)
    openCompose()
  }, [closeCompose, hotelBooked, load, openCompose, refreshTripItems, returnToCompose])

  const handleHotelUnavailable = useCallback(() => {
    setCheckoutDeal(null)
    setHotelUnavailable(true)
    if (hotelJustBookedRef.current || hotelBooked) {
      hotelJustBookedRef.current = false
      setReturnToCompose(false)
      closeCompose()
      return
    }
    if (returnToCompose) {
      setReturnToCompose(false)
      openCompose()
    }
  }, [closeCompose, hotelBooked, openCompose, returnToCompose])

  const onFlightClick = async () => {
    leftForFlight.current = true
    leftForFlightAt.current = Date.now()
    if (token) {
      markFlightReturnAsk({
        draftToken: token,
        promptOnReturn: !isTravelpayouts,
      })
    }
    track('company_click', { airline: airlineName, site: carrier.siteLabel })
    if (!token) return
    try {
      const row = await getApiClient().updateMyTripFlightBookingStatus(token, {
        status: isTravelpayouts ? 'pending_partner' : 'redirected',
        provider: isTravelpayouts ? 'travelpayouts' : carrier.partnerId,
      })
      setDraft(row)
    } catch {
      /* The partner tab remains usable if status persistence is unavailable. */
    }
    if (!draft?.deal_key && !payload.deal_key) return
    try {
      const res = await getApiClient().recordFlightClick({
        deal_key: String(draft?.deal_key || payload.deal_key),
        verification_level: vlevel,
        displayed_pp: party.perPerson || party.flightPp,
        source: 'deals',
        draft_token: token,
        partner: flight.provider || null,
        outcome: 'unknown',
      })
      if (res?.check?.id) setCheckId(String(res.check.id))
    } catch {
      /* click still opens company tab */
    }
  }

  const scrollToHotel = () => {
    window.setTimeout(() => {
      hotelSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }

  const onFlightBooked = async () => {
    if (!token) return
    setMarkingBooked(true)
    setAskFlightBooked(false)
    leftForFlight.current = false
    clearFlightReturnAsk(token)
    const nowIso = new Date().toISOString()
    setDraft((prev) => {
      if (!prev) return prev
      const prevPayload = (prev.payload || {}) as Record<string, unknown>
      return {
        ...prev,
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
    try {
      const row = await getApiClient().updateMyTripFlightBookingStatus(token, {
        status: 'user_confirmed',
        provider: carrier.partnerId,
      })
      setDraft(row)
      scrollToHotel()
      if (isCached) setShowPriceAsk(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible d’enregistrer')
      void load({ silent: true })
    } finally {
      setMarkingBooked(false)
    }
  }

  const onFlightNotYet = () => {
    setAskFlightBooked(false)
    leftForFlight.current = false
    clearFlightReturnAsk(token)
    track('flight_booked_no')
  }

  useEffect(() => {
    const maybeAsk = () => {
      if (flightBooked) {
        setAskFlightBooked(false)
        clearFlightReturnAsk(token)
        return
      }
      const persisted = consumeFlightReturnAsk({
        draftToken: token,
        alreadyBooked: flightBooked,
      })
      if (persisted || leftForFlight.current) {
        if (
          leftForFlight.current &&
          Date.now() - leftForFlightAt.current < 1200 &&
          !persisted
        ) {
          return
        }
        if (!isTravelpayouts) setAskFlightBooked(true)
      }
    }
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return
      // Re-sync vol / hôtel / pipeline after partner tab or checkout.
      void load({ silent: true })
      void refreshTripItems()
      maybeAsk()
    }
    maybeAsk()
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('focus', onReturn)
    return () => {
      document.removeEventListener('visibilitychange', onReturn)
      window.removeEventListener('focus', onReturn)
    }
  }, [flightBooked, isTravelpayouts, load, refreshTripItems, token])

  const copyRouteHint = async () => {
    if (!carrier.copyHint) return
    try {
      await navigator.clipboard.writeText(carrier.copyHint.replace(/^À saisir :\s*/i, ''))
      setCopyDone(true)
      window.setTimeout(() => setCopyDone(false), 2000)
    } catch {
      /* ignore */
    }
  }

  const sendFeedback = async (feedback: 'same' | 'higher' | 'gone') => {
    try {
      await getApiClient().flightClickFeedback({
        feedback,
        check_id: checkId,
        draft_token: token,
        deal_key: draft?.deal_key || payload.deal_key,
      })
    } catch {
      /* ignore */
    }
    setFeedbackSent(true)
    setShowPriceAsk(false)
  }

  const onShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const result = await shareTrip(String(city), url)
    if (result === 'copied') {
      setShareHint('Lien copié')
      window.setTimeout(() => setShareHint(null), 2000)
    }
  }

  const buildDealFromMyTrip = useCallback(
    (d: MyTripDraft): TravelDeal | null => {
      const pl = (d.payload || {}) as Record<string, any>
      const fl = (pl.flight || {}) as Record<string, any>
      const hRaw =
        (pl.hotel as Record<string, any> | undefined) ||
        (d.hotel as Record<string, any> | undefined) ||
        null
      const out = String(d.out_date || pl.dates?.outbound || '').slice(0, 10)
      const inn = String(d.ret_date || pl.dates?.inbound || '').slice(0, 10)
      if (!out || !inn) return null
      const pax = Math.max(1, Number(d.adults || pl.adults || 2))
      const cityName = String(d.city_name || pl.city || city || 'Séjour')
      const flightPp =
        fl.price_pp != null
          ? Number(fl.price_pp)
          : pl.price_breakdown?.flight_pp != null
            ? Number(pl.price_breakdown.flight_pp)
            : Number(party.flightPp) || 0
      const hotelTotal =
        hRaw?.public_hotel_price != null
          ? Number(hRaw.public_hotel_price)
          : pl.price_breakdown?.hotel_public_total != null
            ? Number(pl.price_breakdown.hotel_public_total)
            : Number(party.hotelTotal) || 0
      const perPerson =
        Number(pl.price_per_person) ||
        Math.round(flightPp + hotelTotal / pax) ||
        Number(party.perPerson) ||
        0
      const key =
        String(d.deal_key || pl.deal_key || '').trim() ||
        `mytrip-${d.draft_token}`
      const photo = hRaw?.photo || hRaw?.thumbnail || pl.image_url || ''
      const nightCount =
        Number(pl.nights) ||
        Math.max(
          1,
          Math.round(
            (new Date(inn + 'T12:00:00').getTime() -
              new Date(out + 'T12:00:00').getTime()) /
              86400000,
          ),
        )
      const hotel = hRaw
        ? {
            id: String(hRaw.id || hRaw.hotel_id || ''),
            name: hRaw.name ? String(hRaw.name) : undefined,
            stars: hRaw.stars != null ? Number(hRaw.stars) : undefined,
            rating: hRaw.rating != null ? Number(hRaw.rating) : undefined,
            review_count:
              hRaw.review_count != null ? Number(hRaw.review_count) : undefined,
            distance_m:
              hRaw.distance_m != null ? Number(hRaw.distance_m) : undefined,
            photo: photo ? String(photo) : undefined,
            board: hRaw.board != null ? String(hRaw.board) : undefined,
            refundable:
              typeof hRaw.refundable === 'boolean' ? hRaw.refundable : undefined,
            cancel_deadline: hRaw.cancel_deadline
              ? String(hRaw.cancel_deadline)
              : null,
            public_hotel_price: hotelTotal || undefined,
          }
        : undefined
      if (hotel && !hotel.id) return null
      return {
        id: key,
        deal_key: key,
        title: `Week-end à ${cityName}`,
        city: cityName,
        country: '',
        image_url: photo ? String(photo) : '',
        price_per_person: perPerson,
        currency: 'EUR',
        nights: nightCount,
        departure_airport: String(
          d.origin_iata || pl.origin_iata || fl.origin_iata || originIata || '',
        ),
        dates: { outbound: out, inbound: inn },
        hotel_name: hotel?.name,
        hotel_stars: hotel?.stars,
        board: hotel?.board,
        highlights: [],
        description: '',
        provider: 'liteapi',
        booking_url: '',
        adults: pax,
        origin_iata:
          String(d.origin_iata || pl.origin_iata || fl.origin_iata || originIata || '') ||
          undefined,
        destination:
          String(d.dest_iata || pl.destination || fl.destination_iata || destIata || '') ||
          undefined,
        flight: {
          price_pp: flightPp,
          airline: fl.airline || fl.carrier,
          booking_url: fl.booking_url || pl.booking_url,
          origin_iata: fl.origin_iata,
          destination_iata: fl.destination_iata,
          direct: fl.direct,
          provider: fl.provider,
        },
        hotel,
        price_breakdown: {
          flight_pp: flightPp,
          hotel_public_total: hotelTotal,
          total_pp: perPerson,
        },
      } as TravelDeal
    },
    [city, destIata, originIata, party.flightPp, party.hotelTotal, party.perPerson],
  )

  const openHotelCheckout = useCallback(
    async (overrideDraft?: MyTripDraft | null) => {
      const d = overrideDraft || draft
      if (!d || hotelBooked) return
      if (!hotelBookingEnabled) {
        setError('Réservation hôtel temporairement fermée (phase calibration).')
        return
      }
      const pl = (d.payload || {}) as Record<string, unknown>
      const hotel =
        (pl.hotel as Record<string, unknown> | undefined) ||
        (d.hotel as Record<string, unknown> | undefined) ||
        null
      if (!hotel?.id && !hotel?.hotel_id) {
        setError('Choisis un hôtel avant de payer')
        return
      }
      setCheckoutLoading(true)
      setError(null)
      setHotelUnavailable(false)
      try {
        // Always from the live draft — skip community getDeal (slow + stale).
        let deal: TravelDeal | null = buildDealFromMyTrip(d)
        if (!deal) {
          setError('Impossible d’ouvrir la réservation hôtel')
          return
        }
        const draftTok = String(d.draft_token || token || '').trim()
        if (draftTok && !String(deal.deal_key || '').startsWith('mytrip-')) {
          const mk = `mytrip-${draftTok}`
          deal = { ...deal, id: mk, deal_key: mk }
        } else if (draftTok && !deal.deal_key) {
          const mk = `mytrip-${draftTok}`
          deal = { ...deal, id: mk, deal_key: mk }
        }
        const hid = String(hotel?.id || hotel?.hotel_id || deal.hotel?.id || '')
        const pub =
          hotel?.public_hotel_price != null
            ? Number(hotel.public_hotel_price)
            : deal.hotel?.public_hotel_price
        if (hid) {
          deal = {
            ...deal,
            hotel: {
              ...(deal.hotel || { id: hid }),
              id: hid,
              name: hotel?.name ? String(hotel.name) : deal.hotel?.name,
              stars:
                hotel?.stars != null ? Number(hotel.stars) : deal.hotel?.stars,
              rating:
                hotel?.rating != null
                  ? Number(hotel.rating)
                  : deal.hotel?.rating,
              photo: hotel?.photo
                ? String(hotel.photo)
                : deal.hotel?.photo,
              board: hotel?.board
                ? String(hotel.board)
                : deal.hotel?.board,
              refundable:
                typeof hotel?.refundable === 'boolean'
                  ? hotel.refundable
                  : deal.hotel?.refundable,
              cancel_deadline: hotel?.cancel_deadline
                ? String(hotel.cancel_deadline)
                : deal.hotel?.cancel_deadline ?? null,
              public_hotel_price: pub ?? deal.hotel?.public_hotel_price,
            },
            hotel_name: hotel?.name
              ? String(hotel.name)
              : deal.hotel_name,
            price_breakdown: {
              ...(deal.price_breakdown || { flight_pp: 0 }),
              hotel_public_total:
                pub ?? deal.price_breakdown?.hotel_public_total,
            },
          }
        }
        track('hotel_checkout_open', {
          deal_key: deal.deal_key || draftTok || null,
          draft_token: d.draft_token || null,
        })
        setCheckoutDeal(deal)
        const next = new URLSearchParams(searchParams)
        next.delete('book_hotel')
        setSearchParams(next, { replace: true })
      } finally {
        setCheckoutLoading(false)
      }
    },
    [
      buildDealFromMyTrip,
      draft,
      hotelBooked,
      hotelBookingEnabled,
      searchParams,
      setSearchParams,
      token,
      track,
    ],
  )

  /** Soft live flight price refresh on load (Bookings / Mon voyage). */
  useEffect(() => {
    if (!token || !draft || loading || flightBooked) return
    if (payload.flight_external || payload.external_flight) return
    const key = `${token}:${outDate}:${retDate}:${adults}`
    if (flightLiveKey.current === key) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await getApiClient().revalidateMyTripFlight(token)
        if (cancelled || !res?.ok) return
        flightLiveKey.current = key
        if (res.available === false) {
          setFlightUnavailable(true)
          return
        }
        setFlightUnavailable(false)
        if (res.draft) setDraft(res.draft as typeof draft)
      } catch {
        flightLiveKey.current = key
        /* soft fail — fall back to deal_key check for multi-pax */
        if (!draft.deal_key) return
        try {
          const res = await getApiClient().revalidateDealFlight(
            String(draft.deal_key),
            adults,
          )
          if (cancelled || !res?.ok) return
          if (res.available === false) setFlightUnavailable(true)
        } catch {
          /* soft */
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    adults,
    draft,
    flightBooked,
    loading,
    outDate,
    payload.external_flight,
    payload.flight_external,
    retDate,
    token,
  ])

  /**
   * Live hotel sync on trip load — price + refundable/cancel from LiteAPI
   * (same preference as checkout), then persist so panel matches checkout.
   */
  useEffect(() => {
    if (!token || !draft || loading || hotelBooked) return
    const hid = String(hotelObj?.id || hotelObj?.hotel_id || '').trim()
    if (!hid) return
    const key = `${token}:${hid}`
    if (hotelLiveKey.current === key) return

    let cancelled = false
    const run = async () => {
      try {
        const displayedPp =
          party.perPerson > 0
            ? party.perPerson
            : party.flightPp + (adults > 0 ? party.hotelTotal / adults : 0)
        const res = await getApiClient().revalidateMyTripHotel(token, {
          hotel_id: hid,
          displayed_price_pp: displayedPp || undefined,
          draft_token: token,
          soft: true,
        })
        if (cancelled) return
        if (!res?.ok) {
          setHotelUnavailable(true)
          return
        }
        setHotelUnavailable(false)

        const liveHotelTotal = Number(res.public_hotel_price)
        const liveRefundable = Boolean(res.refundable)
        const liveDeadline =
          res.cancel_deadline != null ? String(res.cancel_deadline) : null

        const row = await getApiClient().updateMyTripHotel(token, {
          hotel: {
            ...(hotelObj || {}),
            id: res.hotel_id || hid,
            hotel_id: res.hotel_id || hid,
            name: res.hotel_name || hotelObj?.name,
            board: res.board ?? hotelObj?.board,
            refundable: liveRefundable,
            cancel_deadline: liveDeadline,
            public_hotel_price: Number.isFinite(liveHotelTotal)
              ? liveHotelTotal
              : hotelObj?.public_hotel_price,
            excluded_fees:
              res.excluded_fees ?? hotelObj?.excluded_fees ?? null,
            offer_id: res.offer_id || hotelObj?.offer_id || null,
          },
          price_per_person: res.revalidated_price_pp ?? undefined,
        })
        if (cancelled) return
        hotelLiveKey.current = `${token}:${String(res.hotel_id || hid)}`
        setDraft(row)
      } catch {
        /* soft — keep snapshot */
      }
    }

    // After first paint — don't contend with getMyTrip / gallery.
    let idleId: number | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const ric = window.requestIdleCallback
    if (typeof ric === 'function') {
      idleId = ric(() => void run(), { timeout: 1800 })
    } else {
      timeoutId = setTimeout(() => void run(), 400)
    }

    return () => {
      cancelled = true
      if (idleId != null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId)
      }
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [
    adults,
    draft,
    hotelBooked,
    hotelObj,
    loading,
    party.flightPp,
    party.hotelTotal,
    party.perPerson,
    token,
  ])

  const altHotels = useMemo(() => {
    const raw = payload.alt_hotels
    if (!Array.isArray(raw)) return [] as Record<string, any>[]
    return raw.filter((h) => h && typeof h === 'object').slice(0, 2)
  }, [payload.alt_hotels])

  const pickAltHotel = async (hotel: Record<string, any>) => {
    if (!token || !hotel?.id) return
    hotelLiveKey.current = null
    setSwitchingHotel(true)
    try {
      const row = await getApiClient().updateMyTripHotel(token, {
        hotel: {
          id: String(hotel.id),
          name: hotel.name,
          public_hotel_price: hotel.public_hotel_price,
          refundable: hotel.refundable,
          cancel_deadline: hotel.cancel_deadline ?? null,
          board: hotel.board,
        },
      })
      setDraft(row)
      setHotelUnavailable(false)
    } catch {
      setHotelUnavailable(true)
    } finally {
      setSwitchingHotel(false)
    }
  }

  useEffect(() => {
    if (!autoBookHotel.current || !draft || hotelBooked || loading) return
    autoBookHotel.current = false
    void openHotelCheckout()
  }, [draft, hotelBooked, loading, openHotelCheckout])

  /** Sticky récap CTA — dynamique selon vol / hôtel / activités. */
  const nextAction = useMemo(() => {
    const base = resolveNextStayAction({
      flightBooked,
      hotelBooked,
      hasHotelSelected: Boolean(hotelObj?.id || hotelObj?.hotel_id),
      activitiesEnabled: plannerActivitiesEnabled,
      activitiesDone: activityProgress.done,
      restaurantsEnabled: false,
      hasPlanner: Boolean(plannerTripId),
    })
    if (base.id === 'hotel_pay' && party.hotelTotal > 0) {
      return {
        ...base,
        label: `${HOTEL_CTA_FR.pay} · ${Math.round(party.hotelTotal)} €`,
      }
    }
    if (base.id === 'hotel_pick') {
      return { ...base, label: HOTEL_CTA_FR.choose }
    }
    if (base.id === 'planner') {
      return { ...base, label: HOTEL_CTA_FR.backPlanner }
    }
    return base
  }, [
    activityProgress.done,
    flightBooked,
    hotelBooked,
    hotelObj,
    party.hotelTotal,
    plannerActivitiesEnabled,
    plannerTripId,
  ])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-[1080px] mx-auto px-4 py-8 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
          <div className="space-y-4">
            <div className="h-9 w-2/3 max-w-sm rounded-lg bg-slate-200 animate-pulse" />
            <div className="h-5 w-1/2 max-w-xs rounded bg-slate-200 animate-pulse" />
            <div className="h-48 rounded-2xl bg-slate-200 animate-pulse" />
            <div className="h-48 rounded-2xl bg-slate-200 animate-pulse" />
          </div>
          <div className="hidden lg:block">
            <div className="h-64 rounded-2xl bg-slate-200 animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !draft) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 px-4">
        <p className="text-slate-700 font-medium">{error || 'Voyage introuvable ou expiré'}</p>
        <Link to="/sejours" className="text-primary-600 font-bold underline">
          ← Séjours
        </Link>
      </div>
    )
  }

  const travelersLabel = adults === 1 ? '1 personne' : `${adults} personnes`
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
    `Mon week-end à ${city} : ${typeof window !== 'undefined' ? window.location.href : ''}`,
  )}`

  /** Hotel payment focus: never cite the flight in the sticky récap. */
  const hotelPaymentFocus =
    nextAction.id === 'hotel_pay' ||
    nextAction.id === 'hotel_pick' ||
    Boolean(checkoutDeal)
  const hotelRecapTotal = Math.round(Number(party.hotelTotal) || 0)
  const hotelRecapPp =
    adults > 1 && hotelRecapTotal > 0
      ? Math.round(hotelRecapTotal / adults)
      : hotelRecapTotal

  const priceBreakdown = hotelPaymentFocus ? (
    <>
      {adults === 1 ? (
        <p className="text-3xl font-black text-primary-600 tracking-tight">
          Hôtel {hotelRecapTotal} €
        </p>
      ) : (
        <>
          <p className="text-3xl font-black text-primary-600 tracking-tight">
            Hôtel {hotelRecapTotal} €{' '}
            <span className="text-lg font-bold text-slate-600">pour {adults}</span>
          </p>
          <p className="text-sm font-semibold text-slate-700 mt-1">
            {hotelRecapPp} € / pers.
          </p>
        </>
      )}
      <dl className="mt-3 space-y-1.5 text-sm text-slate-700">
        <div className="flex justify-between gap-3">
          <dt>
            Hôtel
            {nights > 0 ? (
              <span className="text-slate-400">
                {' '}
                ({nights} nuit{nights > 1 ? 's' : ''})
              </span>
            ) : null}
          </dt>
          <dd className="font-semibold tabular-nums">{hotelRecapTotal} €</dd>
        </div>
      </dl>
      {party.cityTax != null ? (
        <p className="text-xs text-slate-500 mt-2">
          + taxe de séjour à régler à l’hôtel : {party.cityTax} €
        </p>
      ) : (
        <p className="text-xs text-slate-500 mt-2">
          Taxe de séjour éventuelle à régler à l’hôtel
        </p>
      )}
    </>
  ) : (
    <>
      {adults === 1 ? (
        <p className="text-3xl font-black text-primary-600 tracking-tight">
          Total {party.total} €
        </p>
      ) : (
        <>
          <p className="text-3xl font-black text-primary-600 tracking-tight">
            Total {party.total} €{' '}
            <span className="text-lg font-bold text-slate-600">pour {adults}</span>
          </p>
          <p className="text-sm font-semibold text-slate-700 mt-1">
            {party.perPerson} € / pers.
          </p>
        </>
      )}
      <dl className="mt-3 space-y-1.5 text-sm text-slate-700">
        <div className="flex justify-between gap-3">
          <dt>
            Vol
            {adults > 1 ? (
              <span className="text-slate-400">
                {' '}
                ({party.flightPp} € × {adults})
              </span>
            ) : null}
          </dt>
          <dd className="font-semibold tabular-nums">{party.flightTotal} €</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>
            Hôtel
            {nights > 0 ? (
              <span className="text-slate-400">
                {' '}
                ({nights} nuit{nights > 1 ? 's' : ''})
              </span>
            ) : null}
          </dt>
          <dd className="font-semibold tabular-nums">{party.hotelTotal} €</dd>
        </div>
      </dl>
      {party.cityTax != null ? (
        <p className="text-xs text-slate-500 mt-2">
          + taxe de séjour à régler à l’hôtel : {party.cityTax} €
        </p>
      ) : (
        <p className="text-xs text-slate-500 mt-2">
          Taxe de séjour éventuelle à régler à l’hôtel
        </p>
      )}
      {payload.price_pax_note ? (
        <p className="text-xs text-amber-800 mt-1">{String(payload.price_pax_note)}</p>
      ) : null}
    </>
  )

  const nextActionButton = () => {
    const cls =
      'block w-full text-center bg-primary-500 hover:bg-primary-600 text-white font-bold py-3.5 rounded-xl min-h-[48px]'
    const secondaryCls =
      'block w-full text-center border border-slate-200 font-bold py-3 rounded-xl hover:bg-slate-50 min-h-[44px] text-slate-800'
    const primary = (() => {
      if (nextAction.id === 'flight' && flightUrl) {
        return (
          <a
            href={flightUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void onFlightClick()}
            className={cls}
          >
            {nextAction.label}
          </a>
        )
      }
      if (nextAction.id === 'hotel_pay') {
        if (!hotelBookingEnabled) {
          return (
            <div className="w-full space-y-2">
              <button type="button" disabled className={`${cls} opacity-60`}>
                Paiement hôtel bientôt disponible
              </button>
              <p className="text-xs text-center text-slate-500 leading-relaxed">
                Réservation hôtel temporairement fermée (phase calibration).
              </p>
            </div>
          )
        }
        return (
          <div className="w-full space-y-2">
            <button
              type="button"
              disabled={checkoutLoading}
              onClick={() => void openHotelCheckout()}
              className={cls}
            >
              {checkoutLoading ? '…' : nextAction.label}
            </button>
            <PaymentCardMarks />
          </div>
        )
      }
      if (nextAction.id === 'hotel_pick') {
        return (
          <button type="button" onClick={() => openCompose()} className={cls}>
            {nextAction.label}
          </button>
        )
      }
      if (nextAction.id === 'activities') {
        return (
          <button
            type="button"
            onClick={() => {
              setShowActivities(true)
              setTimeout(() => {
                activitiesSectionRef.current?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                })
              }, 50)
            }}
            className={cls}
          >
            {nextAction.label}
          </button>
        )
      }
      if (nextAction.id === 'planner' && plannerTripId) {
        return (
          <Link to={`/planner/${encodeURIComponent(plannerTripId)}`} className={cls}>
            {ACTIVITY_BACK_TO_PLANNER_FR}
          </Link>
        )
      }
      return (
        <Link to="/bookings" className={cls}>
          {nextAction.label}
        </Link>
      )
    })()
    return (
      <div className="w-full space-y-2">
        {primary}
        {plannerTripId && nextAction.id !== 'planner' ? (
          <Link
            to={`/planner/${encodeURIComponent(plannerTripId)}`}
            className={secondaryCls}
          >
            {ACTIVITY_BACK_TO_PLANNER_FR}
          </Link>
        ) : null}
      </div>
    )
  }

  const cancelLabel = hotelCancelLabel(
    hotelObj
      ? {
          refundable: hotelObj.refundable as boolean | null | undefined,
          cancel_deadline:
            hotelObj.cancel_deadline != null
              ? String(hotelObj.cancel_deadline)
              : null,
        }
      : null,
  )

  const hotelBookingId = String(
    payload.hotel_booking_id || draft?.payload?.hotel_booking_id || '',
  ).trim()

  const onCancelHotelBooking = useCallback(async () => {
    if (!token || cancellingHotel) return
    setCancelHotelError(null)
    let bookingId = hotelBookingId
    if (!bookingId) {
      try {
        const list = await getApiClient().listHotelBookings({
          draft_token: token,
        })
        const hit = (list || []).find((b) =>
          ['confirmed', 'booking_pending'].includes(
            String(b.status || '').toLowerCase(),
          ),
        )
        bookingId = hit?.id ? String(hit.id) : ''
      } catch {
        bookingId = ''
      }
    }
    if (!bookingId) {
      setCancelHotelError('Réservation introuvable pour ce voyage.')
      return
    }
    const policyHint = cancelLabel
      ? `\n\nConditions : ${cancelLabel}`
      : '\n\nSelon les conditions de l’hôtel, des frais peuvent s’appliquer.'
    if (
      !window.confirm(
        `Annuler la réservation d’hôtel ?${policyHint}\n\nTu pourras en choisir une autre ensuite.`,
      )
    ) {
      return
    }
    setCancellingHotel(true)
    try {
      const res = await getApiClient().cancelHotelBooking(bookingId, {
        draft_token: token,
      })
      if (res.draft) {
        setDraft(res.draft as MyTripDraft)
      } else {
        await load()
      }
      track('hotel_cancelled', {
        booking_id: bookingId,
        refund_amount: res.refund_amount ?? null,
        cancellation_fee: res.cancellation_fee ?? null,
      })
    } catch (e) {
      setCancelHotelError(
        e instanceof Error ? e.message : 'Annulation impossible — réessaie',
      )
    } finally {
      setCancellingHotel(false)
    }
  }, [cancelLabel, cancellingHotel, hotelBookingId, load, token, track])

  return (
    <div
      className={`min-h-screen bg-[#F7F7F7] pb-4 lg:pb-10`}
    >
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm">
        <div
          className={`max-w-[1500px] mx-auto h-14 flex items-center justify-between gap-3 ${
            wantsCompose
              ? 'w-full px-3 sm:w-[92%] sm:px-4'
              : 'w-[92%] px-2 sm:px-4'
          }`}
        >
          <Link
            to={backHref}
            className="text-sm font-bold text-slate-700 hover:text-primary-600 shrink-0 min-h-[44px] inline-flex items-center"
          >
            {backLabel}
          </Link>
          <span className="text-sm font-extrabold text-ink tracking-tight">FlightWatcher</span>
          <div className="flex items-center gap-1 shrink-0">
            {shareHint ? (
              <span className="text-xs font-semibold text-emerald-700 mr-1">{shareHint}</span>
            ) : null}
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              aria-label="Partager sur WhatsApp"
              title="WhatsApp"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            </a>
            <button
              type="button"
              onClick={() => void onShare()}
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Partager"
              title="Partager"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div
        className={`max-w-[1500px] mx-auto ${
          wantsCompose
            ? 'w-full px-3 sm:w-[92%] sm:px-4 py-3 sm:py-6'
            : 'w-[92%] px-2 sm:px-4 py-6 sm:py-8'
        }`}
      >
        <div className={`mb-5 lg:mb-7 ${wantsCompose ? 'hidden lg:block' : ''}`}>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            {flightBooked && hotelBooked
              ? `Ton voyage à ${city} est prêt`
              : `Ton week-end à ${city}`}
          </h1>
          <p className="text-slate-600 mt-1.5">
            {formatDate(outDate)} → {formatDate(retDate)}
            {nights > 0 ? ` · ${nights} nuit${nights > 1 ? 's' : ''}` : ''}
            {` · ${travelersLabel}`}
          </p>
          <StayPipelineStepper steps={pipelineSteps} onStepPress={onPipelineStep} />
          {outDate && outDate < new Date().toISOString().slice(0, 10) ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-bold">Dates passées</p>
              <p className="text-amber-900/80 mt-0.5 text-xs leading-relaxed">
                Le départ était le {formatDate(outDate)}. Les tarifs hôtel peuvent
                être indisponibles.
              </p>
            </div>
          ) : null}
          {externalFlight ? (
            <div className="mt-3 rounded-2xl border border-primary-100 bg-primary-50/80 px-4 py-3 text-sm text-primary-900">
              <p className="font-bold">Vol ailleurs</p>
              <p className="text-primary-800/80 mt-0.5 text-xs leading-relaxed">
                Tu peux composer et payer ton hôtel même si le vol n’est pas passé
                par FlightWatcher.
              </p>
            </div>
          ) : null}
        </div>

        {wantsCompose && token && draft ? (
          <Suspense
            fallback={
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
                Chargement de la composition hôtel…
              </div>
            }
          >
          <MyTripHotelCompose
            draft={draft}
            token={token}
            onUpdated={(row) => {
              hotelLiveKey.current = null
              setDraft(row)
            }}
            onDone={closeCompose}
            onHotelChosen={(row) => {
              hotelLiveKey.current = null
              setDraft(row)
              setReturnToCompose(true)
              closeCompose()
              void openHotelCheckout(row)
            }}
          />
          </Suspense>
        ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8 lg:items-start">
          {/* Colonne gauche */}
          <div className="space-y-6 min-w-0">
            {/* ① Vol */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold text-slate-900">① Ton vol</h2>
                {flightBooked ? (
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                    Réservé ✓
                  </span>
                ) : (
                  <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-1 rounded-lg">
                    À réserver
                  </span>
                )}
              </div>

              {flightUnavailable && !flightBooked ? (
                <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5 text-sm text-amber-950 space-y-2">
                  <p className="font-semibold">Ce vol n’apparaît plus au même prix</p>
                  <p className="text-xs text-amber-900/80">
                    Vérifie sur le site de la compagnie — le lien ci-dessous reste
                    disponible.
                  </p>
                  <Link
                    to="/sejours"
                    className="inline-block text-xs font-bold text-primary-700 underline-offset-2 hover:underline"
                  >
                    Voir d’autres dates
                  </Link>
                </div>
              ) : null}

              <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-3 text-sm text-slate-800 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-slate-900">
                    {airlineName || 'Compagnie'}
                    {stopsLabel ? (
                      <span className="font-semibold text-slate-600">
                        {' '}
                        · {stopsLabel}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs font-bold tabular-nums text-slate-500 shrink-0">
                    {originIata || '—'} → {destIata || '—'}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-primary-700">
                      Aller
                    </p>
                    <p className="mt-1 font-extrabold text-slate-900">
                      {formatDate(outDate)}
                    </p>
                    <div className="mt-1 flex items-baseline justify-between gap-2">
                      <span className="text-lg font-black tabular-nums text-slate-950">
                        {outTime || '—'}
                        {outArrTime ? (
                          <span className="text-sm font-bold text-slate-500">
                            {' '}
                            → {outArrTime}
                          </span>
                        ) : null}
                      </span>
                      {outFlightNo ? (
                        <span className="font-mono text-[11px] font-bold text-slate-500">
                          {outFlightNo}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-600 truncate">
                      {originLabel} → {arrivalLabel}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-primary-700">
                      Retour
                    </p>
                    <p className="mt-1 font-extrabold text-slate-900">
                      {formatDate(retDate)}
                    </p>
                    <div className="mt-1 flex items-baseline justify-between gap-2">
                      <span className="text-lg font-black tabular-nums text-slate-950">
                        {retTime || '—'}
                        {retArrTime ? (
                          <span className="text-sm font-bold text-slate-500">
                            {' '}
                            → {retArrTime}
                          </span>
                        ) : null}
                      </span>
                      {retFlightNo ? (
                        <span className="font-mono text-[11px] font-bold text-slate-500">
                          {retFlightNo}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-600 truncate">
                      {arrivalLabel} → {originLabel}
                    </p>
                  </div>
                </div>

                {payload.baggage_line ? (
                  <p className="text-xs text-slate-600 pt-1 border-t border-slate-200">
                    {String(payload.baggage_line)}
                  </p>
                ) : null}
                {distanceLine ? (
                  <p className="text-xs text-slate-500">{distanceLine}</p>
                ) : null}
              </div>

              {!flightBooked ? (
                <>

                  {distanceLine && plannerActivitiesEnabled ? (
                    <div className="mt-3">
                      <ActivitySurfaceBanner
                        surface="transfer"
                        citySlug={activityCitySlug}
                        title={ACTIVITY_TRANSFER_CTA_FR}
                        subtitle={distanceLine}
                      />
                    </div>
                  ) : null}

                  <a
                    href={flightUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => void onFlightClick()}
                    className="block w-full text-center bg-primary-500 hover:bg-primary-600 text-white font-bold py-3.5 rounded-xl min-h-[48px] lg:bg-white lg:text-primary-700 lg:border lg:border-primary-200 lg:hover:bg-primary-50"
                  >
                    {cta}
                  </a>

                  {carrier.copyHint && carrier.kind !== 'deeplink' ? (
                    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2">
                      <p className="text-xs text-slate-600 flex-1 leading-relaxed">
                        {carrier.copyHint}
                      </p>
                      <button
                        type="button"
                        onClick={() => void copyRouteHint()}
                        className="shrink-0 text-xs font-bold text-primary-700 border border-primary-200 bg-white hover:bg-primary-50 px-3 py-2 rounded-lg min-h-[44px]"
                      >
                        {copyDone ? 'Copié ✓' : 'Copier'}
                      </button>
                    </div>
                  ) : null}

                  {isTravelpayouts && flightBookingStatus === 'pending_partner' ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3">
                      <p className="text-sm font-bold text-amber-900">
                        Confirmation du paiement en attente
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-amber-800">
                        Travelpayouts mettra automatiquement ce voyage à jour après
                        validation de la réservation.
                      </p>
                    </div>
                  ) : null}

                  {askFlightBooked ? (
                    <div className="rounded-xl bg-emerald-50/80 border border-emerald-100 p-3 space-y-2">
                      <p className="text-sm font-semibold text-slate-800">
                        Ton vol est réservé ?
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void onFlightBooked()}
                          disabled={markingBooked}
                          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold min-h-[44px] disabled:opacity-60"
                        >
                          {markingBooked ? '…' : 'Oui'}
                        </button>
                        <button
                          type="button"
                          onClick={onFlightNotYet}
                          className="px-4 py-2 rounded-lg bg-white border border-slate-200 text-sm font-semibold text-slate-700 min-h-[44px]"
                        >
                          Pas encore
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}

              {showPriceAsk && isCached && !feedbackSent && flightBooked ? (
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-2">
                  <p className="text-sm font-medium text-slate-800">
                    Le prix était-il le même ?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(['same', 'higher', 'gone'] as const).map((fb) => (
                      <button
                        key={fb}
                        type="button"
                        onClick={() => void sendFeedback(fb)}
                        className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-sm font-semibold min-h-[44px]"
                      >
                        {fb === 'same'
                          ? 'Oui'
                          : fb === 'higher'
                            ? 'Plus cher'
                            : 'Plus disponible'}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            {/* ② Hôtel */}
            <section
              ref={hotelSectionRef}
              id="trip-hotel"
              className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm scroll-mt-20"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold text-slate-900">② Ton hôtel</h2>
                {hotelBooked ? (
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                    Réservé ✓
                  </span>
                ) : hotelId ? (
                  <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-1 rounded-lg">
                    À payer
                  </span>
                ) : (
                  <span className="text-xs font-bold text-amber-800 bg-amber-50 px-2 py-1 rounded-lg">
                    À choisir
                  </span>
                )}
              </div>
              {hotelObj?.name ? (
                <MyTripHotelPanel
                  hotel={hotelObj}
                  hotelId={hotelId}
                  cityLabel={String(city !== '—' ? city : '')}
                  nights={nights}
                  adults={adults}
                  hotelTotal={party.hotelTotal}
                  outLabel={formatDate(outDate)}
                  retLabel={formatDate(retDate)}
                  cancelLabel={cancelLabel}
                  booked={hotelBooked}
                  onChangeHotel={
                    !wantsCompose && !hotelBooked ? () => openCompose() : undefined
                  }
                />
              ) : (
                <p className="text-sm text-slate-600">Aucun hôtel sélectionné pour l’instant.</p>
              )}

              {hotelUnavailable && !hotelBooked ? (
                <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-3 space-y-3">
                  <p className="text-sm font-semibold text-amber-950">
                    Cet hôtel n’est plus disponible à ces dates
                  </p>
                  {altHotels.length > 0 ? (
                    <div className="space-y-2">
                      {altHotels.map((h) => {
                        const hid = String(h.id || h.hotel_id || '')
                        const price =
                          h.public_hotel_price != null
                            ? Math.round(Number(h.public_hotel_price))
                            : null
                        return (
                          <button
                            key={hid}
                            type="button"
                            disabled={switchingHotel || !hid}
                            onClick={() => void pickAltHotel(h)}
                            className="w-full text-left rounded-xl border border-slate-200 bg-white px-3 py-2.5 hover:border-primary-300 disabled:opacity-60"
                          >
                            <p className="text-sm font-bold text-slate-900 truncate">
                              {String(h.name || 'Hôtel')}
                            </p>
                            <p className="text-xs text-slate-600">
                              {price != null ? `${price} €` : 'Prix à confirmer'}
                              {h.stars != null ? ` · ${h.stars}★` : ''}
                            </p>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openCompose()}
                      className="text-sm font-bold text-primary-700 underline-offset-2 hover:underline"
                    >
                      Choisir un autre hôtel
                    </button>
                  )}
                </div>
              ) : null}

              {hotelBooked ? (
                <div className="rounded-xl bg-emerald-50/80 border border-emerald-100 px-3 py-3 text-sm space-y-3">
                  <div className="space-y-1">
                    <p className="font-bold text-emerald-900">Hôtel réservé ✓</p>
                    {hotelConfirmation ? (
                      <p className="text-slate-700">
                        N° : <strong>{hotelConfirmation}</strong>
                      </p>
                    ) : null}
                    {hotelHolderEmail ? (
                      <p className="text-slate-600 text-xs">
                        Confirmation envoyée à {hotelHolderEmail}
                      </p>
                    ) : null}
                    {cancelLabel ? (
                      <p className="text-slate-600 text-xs">{cancelLabel}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void onCancelHotelBooking()}
                    disabled={cancellingHotel}
                    className="w-full text-center border border-rose-200 bg-white hover:bg-rose-50 text-rose-800 font-bold py-3 rounded-xl min-h-[44px] disabled:opacity-60"
                  >
                    {cancellingHotel
                      ? 'Annulation…'
                      : 'Annuler la réservation'}
                  </button>
                  {cancelHotelError ? (
                    <p className="text-xs font-semibold text-rose-700">
                      {cancelHotelError}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {!hotelObj?.name && !hotelBooked && !hotelUnavailable ? (
                <button
                  type="button"
                  onClick={() => openCompose()}
                  className="w-full text-center bg-primary-500 hover:bg-primary-600 text-white font-bold py-3.5 rounded-xl min-h-[48px]"
                >
                  Choisir un hôtel
                </button>
              ) : null}
            </section>

            {plannerActivitiesEnabled ? (
              <section
                ref={activitiesSectionRef}
                className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-bold text-slate-900">③ Activités</h2>
                  <div className="flex items-center gap-3">
                    <Link
                      to={activitiesCityPath(activityCitySlug, {
                        draftToken: token,
                      })}
                      onClick={() => {
                        if (token) {
                          rememberTrip({
                            draft_token: token,
                            city: activityCitySlug,
                          })
                        }
                      }}
                      className="text-xs font-bold text-primary-700"
                    >
                      Catalogue
                    </Link>
                    <button
                      type="button"
                      className="text-xs font-bold text-slate-600"
                      onClick={() => setShowActivities(true)}
                    >
                      Gérer
                    </button>
                  </div>
                </div>
                <ActivityStepPanel
                  draftToken={token}
                  plannedTripId={plannerTripId}
                  citySlug={activityCitySlug}
                  enabled={plannerActivitiesEnabled}
                  surface="my_trip"
                  onItemsChange={setActivityItems}
                />
              </section>
            ) : null}

            <aside className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600 leading-relaxed shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">
                Réservation en 2 étapes
              </p>
              <p className="text-[12px] text-slate-600 mb-3 leading-snug">
                Pour le week-end complet, réserve les deux : le vol chez la compagnie, puis
                l’hôtel ici. Tu peux aussi ne prendre que l’hôtel si ton vol est déjà réglé.
              </p>
              <ol className="space-y-3">
                <li className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-slate-900 text-white text-[11px] font-black flex items-center justify-center">
                    1
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 text-[13px]">Vol auprès de la compagnie</p>
                    <p className="text-[12px] text-slate-600 mt-0.5 leading-snug">
                      Réserve et paie ton billet sur le site officiel de la compagnie aérienne
                      (conseillé en premier : les tarifs vols bougent plus vite).
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-slate-900 text-white text-[11px] font-black flex items-center justify-center">
                    2
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 text-[13px]">Hôtel sur FlightWatcher</p>
                    <p className="text-[12px] text-slate-600 mt-0.5 leading-snug">
                      Confirme ta chambre ici en quelques minutes. Paiement sécurisé, confirmation
                      immédiate.
                    </p>
                  </div>
                </li>
              </ol>
              <p className="mt-3.5 pt-3 border-t border-slate-100 text-[11px] text-slate-500 leading-snug">
                Vol et hôtel restent indépendants : une modification de vol par la compagnie
                n’annule pas ton hôtel — les conditions de l’établissement s’appliquent.
              </p>
            </aside>
          </div>

          {/* Récapitulatif — sticky desktop, flux mobile */}
          <aside className="mt-6 lg:mt-0">
            <div className="lg:sticky lg:top-20 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Récapitulatif
              </p>
              {priceBreakdown}
              {nextActionButton()}
            </div>
          </aside>
        </div>
        )}
      </div>

      {checkoutDeal && token ? (
        <Suspense fallback={null}>
        <DealCheckoutFlow
          deal={checkoutDeal}
          hotelId={hotelObj?.id ? String(hotelObj.id) : checkoutDeal.hotel?.id}
          draftToken={token}
          hotelTotalHint={party.hotelTotal}
          onClose={dismissHotelCheckout}
          onUnavailable={handleHotelUnavailable}
          onAccountCta={() => track('account_cta')}
          onBooked={(booking) => {
            hotelJustBookedRef.current = true
            setReturnToCompose(false)
            const nowIso = new Date().toISOString()
            setDraft((prev) => {
              if (!prev) return prev
              const prevPayload = (prev.payload || {}) as Record<string, unknown>
              return {
                ...prev,
                hotel_booked_at: nowIso,
                payload: {
                  ...prevPayload,
                  hotel_booked: true,
                  hotel_booked_at: nowIso,
                  hotel_booking_id: booking.id || prevPayload.hotel_booking_id,
                  hotel_confirmation_code:
                    booking.confirmation_code ||
                    prevPayload.hotel_confirmation_code,
                },
              }
            })
            void load({ silent: true })
            void refreshTripItems()
          }}
        />
        </Suspense>
      ) : null}
    </div>
  )
}
