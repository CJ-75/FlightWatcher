import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Image,
  ActivityIndicator,
  Share,
  Modal,
  FlatList,
  Alert,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ACTIVITY_BACK_TO_PLANNER_FR,
  ACTIVITY_TRANSFER_CTA_FR,
  activityStepProgress,
  resolveActivityCitySlug,
  boardLabelFr,
  buildStayPipeline,
  distantAirportLine,
  hotelCancelConfirmBodyFr,
  hotelCancelLabel,
  hotelCancelSuccessBodyFr,
  resolveHotelCancelGate,
  hotelStarsLabel,
  primaryAirportCode,
  resolveCarrierBooking,
  resolveDraftPartyPrice,
  resolveFlightStepStatus,
  resolveHotelStepStatus,
  resolveNextStayAction,
  pickTripItemOwner,
  type HotelGalleryPhoto,
  type MyTripDraft,
  type StayStepId,
} from '@flightwatcher/shared'
import {
  clearFlightReturnAsk,
  markFlightReturnAsk,
} from '../lib/partnerBook'
import { StayPipelineStepper } from '../components/StayPipelineStepper'
import { ActivityStepPanel } from '../components/ActivityStepPanel'
import { ActivitySurfaceBanner } from '../components/ActivitySurfaceBanner'
import { getApi, getWebOrigin } from '../lib/client'
import { openInAppBrowser } from '../lib/openInApp'
import { rememberTrip } from '../lib/tripRecovery'
import { toUpsellHotel } from '../lib/hotelUpsell'
import { HotelComposeDetailSheet } from '../components/HotelComposeDetailSheet'
import { ScreenBackground } from '../components/ScreenBackground'
import {
  BedIcon,
  CalendarIcon,
  CardIcon,
  CheckIcon,
  IconLabel,
  PlaneIcon,
  ShareIcon,
  TicketIcon,
  UsersIcon,
} from '../components/UiIcons'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, shadow, spacing } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'TripSummary'>

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

function formatDistance(m?: number | null) {
  if (m == null || Number.isNaN(Number(m))) return null
  const n = Number(m)
  if (n < 1000) return `${Math.round(n)} m du centre`
  return `${(n / 1000).toFixed(1)} km du centre`
}

export function TripSummaryScreen({ route, navigation }: Props) {
  const { draftToken, seed } = route.params
  const insets = useSafeAreaInsets()
  const [draft, setDraft] = useState<MyTripDraft | null>(seed || null)
  const [loading, setLoading] = useState(!seed)
  const [error, setError] = useState<string | null>(null)
  const [askFlight, setAskFlight] = useState(false)
  const [marking, setMarking] = useState(false)
  const [hotelSheet, setHotelSheet] = useState(false)
  const [gallery, setGallery] = useState<HotelGalleryPhoto[]>([])
  const [flightRefreshing, setFlightRefreshing] = useState(false)
  const [flightUnavailable, setFlightUnavailable] = useState(false)
  const [flightPriceHint, setFlightPriceHint] = useState<string | null>(null)
  const [chargedHotelTotal, setChargedHotelTotal] = useState<number | null>(null)
  const [cancellingHotel, setCancellingHotel] = useState(false)
  const [invoiceBusy, setInvoiceBusy] = useState(false)
  const [liveCancelPolicy, setLiveCancelPolicy] = useState<{
    refundable?: boolean | null
    cancel_deadline?: string | null
  } | null>(null)
  const [plannerActivitiesEnabled, setPlannerActivitiesEnabled] = useState(false)
  const [activityItems, setActivityItems] = useState<{ status?: string | null }[]>([])
  const [showActivities, setShowActivities] = useState(false)
  const leftForFlight = useRef(false)
  const askFlightOnReturn = useRef(false)
  const seededRef = useRef(Boolean(seed))
  const flightLiveKey = useRef<string | null>(null)

  useEffect(() => {
    void getApi()
      .getConfig()
      .then((cfg) => {
        setPlannerActivitiesEnabled(
          cfg.planner_activities_enabled === true || cfg.activities_ui_enabled === true,
        )
      })
      .catch(() => undefined)
  }, [])

  const refreshTripItems = useCallback(async () => {
    if (!plannerActivitiesEnabled) return
    try {
      const owner = pickTripItemOwner({
        draftToken,
        plannedTripId: draft?.source_planned_trip_id || null,
      })
      if (!owner.draft_token && !owner.planned_trip_id) return
      const res = await getApi().listTripItems({
        draft_token: owner.draft_token,
        planned_trip_id: owner.planned_trip_id,
      })
      const items = res.items || []
      setActivityItems(items.filter((i) => i.item_type === 'activity'))
    } catch {
      /* keep previous progress */
    }
  }, [draftToken, plannerActivitiesEnabled, draft?.source_planned_trip_id])

  useEffect(() => {
    void refreshTripItems()
  }, [
    refreshTripItems,
    showActivities,
    draft?.hotel_booked_at,
    draft?.flight_booked_at,
  ])

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setError(null)
    try {
      const row = await getApi().getMyTrip(draftToken)
      setDraft(row)
      const pl = (row.payload || {}) as Record<string, unknown>
      const fl = (pl.flight || {}) as Record<string, unknown>
      const resolved = resolveActivityCitySlug({
        citySlug: typeof pl.city_slug === 'string' ? pl.city_slug : null,
        cityLabel: row.city_name || (typeof pl.city === 'string' ? pl.city : null),
        destIata: String(
          fl.destination_iata || pl.destination || pl.dest_iata || row.dest_iata || '',
        ),
      })
      void rememberTrip({
        draft_token: draftToken,
        city: resolved,
      })
      void getApi().trackMyTripEvent(draftToken, 'view', { source: 'mobile' })
    } catch (e) {
      if (!opts?.silent && !seededRef.current) {
        setError(e instanceof Error ? e.message : 'Erreur')
        setDraft(null)
      }
    } finally {
      setLoading(false)
    }
  }, [draftToken])

  useEffect(() => {
    // Seed paints instantly; refresh in background.
    void load({ silent: Boolean(seed) })
  }, [load, seed])

  useFocusEffect(
    useCallback(() => {
      if (leftForFlight.current) {
        leftForFlight.current = false
        if (askFlightOnReturn.current) {
          askFlightOnReturn.current = false
          setAskFlight(true)
        }
      }
      // Always re-sync statuses (vol / hôtel / pipeline) when returning
      // from checkout or partner browser — seed only skips the first paint.
      if (seededRef.current) {
        seededRef.current = false
        void load({ silent: true })
        void refreshTripItems()
        return
      }
      void load({ silent: true })
      void refreshTripItems()
    }, [load, refreshTripItems]),
  )

  const pl = (draft?.payload || {}) as Record<string, any>
  const fl = (pl.flight || {}) as Record<string, any>
  const hotelRaw =
    (pl.hotel as Record<string, any> | undefined) ||
    (draft?.hotel as Record<string, any> | undefined) ||
    null
  const hotelOpt = toUpsellHotel(hotelRaw)

  const city = String(draft?.city_name || pl.city || 'Séjour')
  const out = String(draft?.out_date || pl.dates?.outbound || '').slice(0, 10)
  const inn = String(draft?.ret_date || pl.dates?.inbound || '').slice(0, 10)
  const adults = Math.max(1, Number(draft?.adults || pl.adults || 2))

  const originIata = primaryAirportCode(
    fl.origin_iata ||
      pl.origin_iata ||
      pl.departure_airport ||
      draft?.origin_iata ||
      '',
  )
  const destIata = primaryAirportCode(
    fl.destination_iata ||
      pl.destination_iata ||
      pl.destination ||
      draft?.dest_iata ||
      '',
  )
  const activityCitySlug = useMemo(
    () =>
      resolveActivityCitySlug({
        citySlug: typeof pl.city_slug === 'string' ? pl.city_slug : null,
        cityLabel: city !== 'Séjour' ? city : null,
        destIata,
      }),
    [city, destIata, pl.city_slug],
  )

  const carrier = useMemo(() => {
    return resolveCarrierBooking({
      airline: fl.airline || fl.carrier || pl.airline,
      provider: fl.provider || pl.provider,
      bookingUrl: fl.booking_url || pl.booking_url,
      originIata: originIata || undefined,
      destIata: destIata || undefined,
      outDate: out || undefined,
      retDate: inn || undefined,
      outLocal: fl.outbound_local || fl.out_dep_local || out || undefined,
      inLocal: fl.inbound_local || fl.ret_dep_local || inn || undefined,
      adults,
      language: 'fr',
    })
  }, [
    fl,
    pl.airline,
    pl.provider,
    pl.booking_url,
    originIata,
    destIata,
    out,
    inn,
    adults,
  ])

  // Always prefer resolved deeplink (never trust stored homepage / incomplete select).
  const flightUrl = String(carrier.url || '').trim()
  const airlineName = String(
    fl.airline || fl.carrier || carrier.airlineName || '',
  ).trim()
  const outDep =
    fl.outbound_local ||
    fl.out_dep_local ||
    fl.aller?.departureTime ||
    pl.out_dep_local
  const retDep =
    fl.inbound_local ||
    fl.ret_dep_local ||
    fl.retour?.departureTime ||
    pl.ret_dep_local
  const outTime = formatTimeLocal(outDep)
  const retTime = formatTimeLocal(retDep)
  const outArrTime = formatTimeLocal(
    fl.outbound_arrival_local || fl.out_arr_local || fl.outbound_arr_local,
  )
  const retArrTime = formatTimeLocal(
    fl.inbound_arrival_local || fl.ret_arr_local || fl.in_arr_local,
  )
  const outFlightNo = String(
    fl.outbound_flight_number ||
      fl.flight_number ||
      fl.aller?.flightNumber ||
      fl.aller?.flight_number ||
      '',
  ).trim()
  const retFlightNo = String(
    fl.inbound_flight_number ||
      fl.return_flight_number ||
      fl.retour?.flightNumber ||
      fl.retour?.flight_number ||
      '',
  ).trim()
  const stopsLabel =
    fl.direct === true
      ? 'vol direct'
      : fl.transfers === 1 || fl.stops === 1
        ? '1 escale'
        : fl.transfers > 1 || fl.stops > 1
          ? `${Number(fl.transfers || fl.stops)} escales`
          : null

  const hotelId = hotelOpt ? String(hotelOpt.id || hotelOpt.hotel_id || '') : ''
  const hotelPhoto = hotelOpt
    ? String(hotelOpt.photo || hotelOpt.thumbnail || '')
    : ''
  const hotelName = hotelOpt ? String(hotelOpt.name || 'Hôtel') : ''
  const boardFr = boardLabelFr(hotelOpt?.board)
  const cancelFields = {
    refundable:
      liveCancelPolicy?.refundable ?? hotelOpt?.refundable ?? null,
    cancel_deadline:
      liveCancelPolicy?.cancel_deadline ??
      (hotelOpt?.cancel_deadline != null
        ? String(hotelOpt.cancel_deadline)
        : null),
  }
  const cancelFr = hotelCancelLabel(cancelFields)
  const cancelPolicyForAction = hotelCancelLabel(cancelFields, {
    includeNonRefundable: true,
  })
  const distFr = formatDistance(hotelOpt?.distance_m ?? null)

  const flightBookingStatus = String(
    draft?.flight_booking_status || pl.flight_booking_status || '',
  )
  const externalFlight = Boolean(pl.flight_external || pl.external_flight)
  const flightBooked = Boolean(
    draft?.flight_booked_at ||
      pl.flight_booked ||
      pl.flight_booked_at ||
      flightBookingStatus === 'user_confirmed' ||
      flightBookingStatus === 'partner_confirmed' ||
      externalFlight,
  )
  const hotelBooked = Boolean(
    draft?.hotel_booked_at || pl.hotel_booked || pl.hotel_booked_at,
  )
  const cancelGate = resolveHotelCancelGate(cancelFields, {
    checkIn: out ? String(out).slice(0, 10) : null,
    awaitingPolicy: Boolean(hotelBooked && liveCancelPolicy === null),
  })

  const party = useMemo(
    () =>
      resolveDraftPartyPrice({
        adults,
        outDate: out,
        retDate: inn,
        payload: pl,
        hotelBooked,
        chargedHotelTotal,
      }),
    [adults, chargedHotelTotal, hotelBooked, inn, out, pl],
  )
  const flightPp = party.flightPp > 0 ? party.flightPp : null
  const hotelPp =
    party.hotelTotal > 0 ? Math.round(party.hotelTotal / adults) : null

  /** Hydrate paid hotel total + live cancel policy for booked stays. */
  useEffect(() => {
    if (!hotelBooked || !draftToken) {
      setLiveCancelPolicy(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const list = await getApi().listHotelBookings({ draft_token: draftToken })
        if (cancelled || !Array.isArray(list) || !list.length) return
        const paid =
          list.find(
            (b) =>
              b.status === 'confirmed' ||
              b.status === 'booking_pending' ||
              b.status === 'payment_succeeded',
          ) || list[0]
        if (
          (pl.hotel_charged_total == null ||
            Number(pl.hotel_charged_total) <= 0) &&
          paid
        ) {
          const n =
            paid.charged_price != null
              ? Number(paid.charged_price)
              : paid.displayed_price != null
                ? Number(paid.displayed_price)
                : null
          if (n != null && n > 0) setChargedHotelTotal(n)
        }
        const bookingId = String(
          pl.hotel_booking_id || paid?.id || '',
        ).trim()
        if (!bookingId) return
        const b = await getApi().getHotelBooking(bookingId, {
          draft_token: draftToken,
          sync: true,
        })
        if (cancelled) return
        setLiveCancelPolicy({
          refundable: b.refundable ?? null,
          cancel_deadline:
            b.cancel_deadline != null ? String(b.cancel_deadline) : null,
        })
      } catch {
        /* soft */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [draftToken, hotelBooked, pl.hotel_booking_id, pl.hotel_charged_total])

  /** Soft live flight price refresh (Bookings → TripSummary). */
  useEffect(() => {
    if (!draft || loading || flightBooked || externalFlight) return
    const key = [
      draftToken,
      draft.origin_iata || fl.origin_iata || '',
      draft.dest_iata || fl.destination_iata || '',
      out,
      inn,
      adults,
    ].join(':')
    if (flightLiveKey.current === key) return

    let cancelled = false
    setFlightRefreshing(true)
    ;(async () => {
      try {
        const res = await getApi().revalidateMyTripFlight(draftToken)
        if (cancelled) return
        flightLiveKey.current = key
        if (res.available === false) {
          setFlightUnavailable(true)
          setFlightPriceHint(null)
          return
        }
        setFlightUnavailable(false)
        if (res.draft) setDraft(res.draft)
        if (res.revalidated && res.checked_pp != null) {
          const delta = res.delta_pct
          if (delta != null && Math.abs(delta) >= 1) {
            setFlightPriceHint(
              delta > 0
                ? `Prix actualisé (+${Math.round(Math.abs(delta))} %)`
                : `Prix actualisé (−${Math.round(Math.abs(delta))} %)`,
            )
          } else {
            setFlightPriceHint('Prix actualisé')
          }
        }
      } catch {
        /* soft — keep snapshot */
      } finally {
        if (!cancelled) setFlightRefreshing(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    adults,
    draft,
    draftToken,
    externalFlight,
    fl.destination_iata,
    fl.origin_iata,
    flightBooked,
    inn,
    loading,
    out,
  ])

  const activityProgress = useMemo(
    () => activityStepProgress(activityItems),
    [activityItems],
  )

  const pipelineSteps = useMemo(
    () =>
      buildStayPipeline({
        flight: resolveFlightStepStatus({
          hasFlightPayload: Boolean(fl && (fl.airline || fl.origin_iata || fl.price_pp)),
          flightBooked,
          externalFlight,
          bookingUrl: flightUrl,
        }),
        hotel: resolveHotelStepStatus({
          hasHotel: Boolean(hotelId),
          hotelBooked,
        }),
        focus:
          showActivities && !activityProgress.done ? 'activities' : undefined,
        activitiesEnabled: plannerActivitiesEnabled,
        activitiesDone: activityProgress.done,
        activitiesPartial: activityProgress.partial,
        activitiesHint: activityProgress.hint,
        restaurantsEnabled: false,
      }).filter((s) => s.id !== 'restaurants'),
    [
      fl,
      flightBooked,
      externalFlight,
      flightUrl,
      hotelId,
      hotelBooked,
      showActivities,
      plannerActivitiesEnabled,
      activityProgress,
    ],
  )

  useEffect(() => {
    if (!hotelId) {
      setGallery([])
      return
    }
    let cancelled = false
    const seed = hotelPhoto
      ? [{ url: hotelPhoto, thumb: hotelPhoto, order: 0 }]
      : []
    setGallery(seed)
    void getApi()
      .getHotelGallery(hotelId, { language: 'fr', fallback: hotelPhoto || undefined })
      .then((g) => {
        if (cancelled) return
        const photos = Array.isArray(g.photos) ? g.photos.filter((p) => p?.url) : []
        if (photos.length) setGallery(photos)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [hotelId, hotelPhoto])

  const sticky = useMemo(() => {
    const next = resolveNextStayAction({
      flightBooked,
      hotelBooked,
      hasHotelSelected: Boolean(hotelId),
      activitiesEnabled: plannerActivitiesEnabled,
      activitiesDone: activityProgress.done,
      restaurantsEnabled: false,
      hasPlanner: Boolean(draft?.source_planned_trip_id),
    })
    return { label: next.label, action: next.id }
  }, [
    activityProgress.done,
    draft?.source_planned_trip_id,
    flightBooked,
    hotelBooked,
    hotelId,
    plannerActivitiesEnabled,
  ])

  const markFlight = async (yes: boolean) => {
    if (!yes) {
      setAskFlight(false)
      void clearFlightReturnAsk(draftToken)
      void getApi().trackMyTripEvent(draftToken, 'flight_booked_no')
      return
    }
    setMarking(true)
    void clearFlightReturnAsk(draftToken)
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
    setAskFlight(false)
    try {
      const row = await getApi().updateMyTripFlightBookingStatus(draftToken, {
        status: 'user_confirmed',
      })
      setDraft(row)
      void getApi().trackMyTripEvent(draftToken, 'flight_booked_yes')
      void refreshTripItems()
    } catch (e) {
      Alert.alert(
        'Erreur',
        e instanceof Error ? e.message : 'Impossible de confirmer le vol',
      )
      void load()
    } finally {
      setMarking(false)
    }
  }

  const openFlight = () => {
    const resolved = resolveCarrierBooking({
      airline: fl.airline || fl.carrier || pl.airline,
      provider: fl.provider || pl.provider,
      bookingUrl: fl.booking_url || pl.booking_url,
      originIata: originIata || undefined,
      destIata: destIata || undefined,
      outDate: out || undefined,
      retDate: inn || undefined,
      outLocal: fl.outbound_local || fl.out_dep_local || out || undefined,
      inLocal: fl.inbound_local || fl.ret_dep_local || inn || undefined,
      adults,
      language: 'fr',
    })
    const url = String(resolved.url || flightUrl || '').trim()
    if (!url) return
    const isTravelpayouts = /travelpayouts|aviasales/i.test(
      `${resolved.partnerId || ''} ${fl.provider || pl.provider || ''} ${url}`,
    )
    leftForFlight.current = true
    askFlightOnReturn.current = !isTravelpayouts
    void markFlightReturnAsk({
      draftToken,
      promptOnReturn: !isTravelpayouts,
    })
    void getApi().trackMyTripEvent(draftToken, 'company_click', {
      site: resolved.siteLabel || carrier.siteLabel,
      source: 'mobile',
      booking_url: url,
    })
    openInAppBrowser(
      navigation,
      url,
      resolved.ctaLabel || carrier.ctaLabel || 'Réserver le vol',
    )
  }

  const onPipelineStep = (id: StayStepId) => {
    if (id === 'hotel') {
      if (hotelId && !hotelBooked) {
        navigation.navigate('DealCheckout', {
          draftToken,
          hotelId: hotelId || undefined,
        })
      } else if (!hotelId) {
        navigation.navigate('HotelCompose', { draftToken })
      }
      return
    }
    if (id === 'activities' && plannerActivitiesEnabled) {
      setShowActivities(true)
      return
    }
    if (id === 'flight' && flightUrl && !flightBooked) {
      openFlight()
    }
  }

  const onSticky = () => {
    if (sticky.action === 'hotel_pick') {
      navigation.navigate('HotelCompose', { draftToken })
    } else if (sticky.action === 'hotel_pay') {
      navigation.navigate('DealCheckout', {
        draftToken,
        hotelId: hotelId || undefined,
      })
    } else if (sticky.action === 'flight') {
      openFlight()
    } else if (sticky.action === 'activities') {
      setShowActivities(true)
    } else if (sticky.action === 'planner' && draft?.source_planned_trip_id) {
      navigation.navigate('TripDetail', {
        tripId: draft.source_planned_trip_id,
      })
    } else {
      navigation.navigate('Bookings')
    }
  }

  const goPlanner = () => {
    if (!draft?.source_planned_trip_id) return
    navigation.navigate('TripDetail', {
      tripId: draft.source_planned_trip_id,
    })
  }

  const share = async () => {
    const url = `${getWebOrigin()}/trip/${draftToken}`
    try {
      await Share.share({
        message: `Mon week-end à ${city} sur FlightWatcher : ${url}`,
        url,
      })
      void getApi().trackMyTripEvent(draftToken, 'share')
    } catch {
      /* cancelled */
    }
  }

  const hotelPaidTotal =
    chargedHotelTotal != null && chargedHotelTotal > 0
      ? chargedHotelTotal
      : party.hotelTotal > 0
        ? party.hotelTotal
        : pl.hotel_charged_total != null
          ? Number(pl.hotel_charged_total)
          : null

  const onDownloadHotelInvoice = useCallback(() => {
    if (invoiceBusy) return
    void (async () => {
      setInvoiceBusy(true)
      try {
        let bookingId = String(pl.hotel_booking_id || '').trim()
        if (!bookingId) {
          const list = await getApi().listHotelBookings({
            draft_token: draftToken,
          })
          const hit = (list || []).find((b) =>
            ['confirmed', 'booking_pending', 'payment_succeeded'].includes(
              String(b.status || '').toLowerCase(),
            ),
          )
          bookingId = hit?.id ? String(hit.id) : ''
        }
        if (!bookingId) {
          Alert.alert('Facture', 'Réservation introuvable pour ce voyage.')
          return
        }
        const url = await getApi().hotelBookingInvoiceUrl(bookingId, {
          draft_token: draftToken,
        })
        // Hand off ASAP — PDF may still stream in the in-app browser.
        setInvoiceBusy(false)
        await openInAppBrowser(navigation, url, 'Facture')
      } catch {
        Alert.alert(
          'Facture',
          'Impossible d’ouvrir la facture pour le moment. Réessaie dans quelques secondes.',
        )
        setInvoiceBusy(false)
      }
    })()
  }, [draftToken, invoiceBusy, navigation, pl.hotel_booking_id])

  const onCancelHotelBooking = useCallback(() => {
    if (cancellingHotel) return
    void (async () => {
      let bookingId = String(pl.hotel_booking_id || '').trim()
      let policy = cancelFields
      try {
        if (!bookingId) {
          const list = await getApi().listHotelBookings({
            draft_token: draftToken,
          })
          const hit = (list || []).find((b) =>
            ['confirmed', 'booking_pending'].includes(
              String(b.status || '').toLowerCase(),
            ),
          )
          bookingId = hit?.id ? String(hit.id) : ''
        }
        if (bookingId) {
          const b = await getApi().getHotelBooking(bookingId, {
            draft_token: draftToken,
            sync: true,
          })
          policy = {
            refundable: b.refundable ?? policy.refundable,
            cancel_deadline:
              b.cancel_deadline != null
                ? String(b.cancel_deadline)
                : policy.cancel_deadline,
          }
          setLiveCancelPolicy({
            refundable: policy.refundable,
            cancel_deadline: policy.cancel_deadline,
          })
        }
      } catch {
        /* snapshot */
      }
      if (!bookingId) {
        Alert.alert('Annulation', 'Réservation introuvable pour ce voyage.')
        return
      }
      const gate = resolveHotelCancelGate(policy, {
        checkIn: out ? String(out).slice(0, 10) : null,
      })
      if (!gate.canCancelFree) {
        Alert.alert(
          'Annulation',
          gate.blockedLabelFr || 'Annulation gratuite indisponible.',
        )
        return
      }
      const policyLabel =
        hotelCancelLabel(policy, { includeNonRefundable: true }) ||
        cancelPolicyForAction
      Alert.alert(
        'Annuler la réservation ?',
        hotelCancelConfirmBodyFr({
          paidTotal: hotelPaidTotal,
          policyLabel,
        }),
        [
          { text: 'Garder', style: 'cancel' },
          {
            text: 'Annuler la résa',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                setCancellingHotel(true)
                try {
                  const res = await getApi().cancelHotelBooking(bookingId, {
                    draft_token: draftToken,
                  })
                  if (res.draft) {
                    setDraft(res.draft as MyTripDraft)
                  } else {
                    const row = await getApi().getMyTrip(draftToken)
                    setDraft(row)
                  }
                  void getApi().trackMyTripEvent(
                    draftToken,
                    'hotel_cancelled',
                    {
                      booking_id: bookingId,
                      refund_amount: res.refund_amount ?? null,
                      cancellation_fee: res.cancellation_fee ?? null,
                    },
                  )
                  Alert.alert(
                    'C’est fait',
                    hotelCancelSuccessBodyFr({
                      refundAmount: res.refund_amount,
                      cancellationFee: res.cancellation_fee,
                    }),
                  )
                } catch (e) {
                  Alert.alert(
                    'Annulation',
                    e instanceof Error
                      ? e.message
                      : 'Annulation impossible — réessaie',
                  )
                } finally {
                  setCancellingHotel(false)
                }
              })()
            },
          },
        ],
      )
    })()
  }, [
    cancelFields.cancel_deadline,
    cancelFields.refundable,
    out,
    cancelPolicyForAction,
    cancellingHotel,
    draftToken,
    hotelPaidTotal,
    pl.hotel_booking_id,
  ])

  if (loading && !draft) {
    return (
      <View style={styles.root}>
        <ScreenBackground />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    )
  }

  if (error || !draft) {
    return (
      <View style={styles.root}>
        <ScreenBackground />
        <View style={styles.center}>
          <Text style={styles.error}>{error || 'Voyage introuvable'}</Text>
          <Pressable style={styles.btn} onPress={() => void load()}>
            <Text style={styles.btnText}>Réessayer</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  const flightCtaLabel = flightBooked
    ? 'Revoir mon billet'
    : carrier.siteLabel
      ? `Réserver sur ${carrier.siteLabel}`
      : 'Réserver mon vol'

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingBottom: insets.bottom + 100,
          paddingTop: 8,
        }}
      >
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{city}</Text>
            <View style={styles.metaRow}>
              <CalendarIcon size={14} color={colors.muted} />
              <Text style={styles.sub}>
                {formatDate(out)} → {formatDate(inn)}
              </Text>
              <UsersIcon size={14} color={colors.muted} />
              <Text style={styles.sub}>{adults} pers.</Text>
            </View>
          </View>
          <Pressable
            onPress={() => void share()}
            style={({ pressed }) => [styles.shareBtn, pressed && styles.sharePressed]}
            hitSlop={8}
          >
            <ShareIcon size={14} />
            <Text style={styles.share}>Partager</Text>
          </Pressable>
        </View>

        {draft.source_planned_trip_id ? (
          <Pressable
            onPress={() =>
              navigation.navigate('TripDetail', {
                tripId: draft.source_planned_trip_id!,
              })
            }
            style={({ pressed }) => [
              styles.plannerLink,
              pressed && { opacity: 0.82 },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.plannerLinkKicker}>VOYAGE DE GROUPE</Text>
              <Text style={styles.plannerLinkTitle}>Voir le séjour et qui part</Text>
            </View>
            <Text style={styles.plannerLinkArrow}>›</Text>
          </Pressable>
        ) : null}

        <StayPipelineStepper steps={pipelineSteps} onStepPress={onPipelineStep} />

        {out && out < new Date().toISOString().slice(0, 10) ? (
          <View style={styles.warnBanner}>
            <Text style={styles.warnTitle}>Dates passées</Text>
            <Text style={styles.warnBody}>
              Le départ était le {formatDate(out)}. Les tarifs hôtel peuvent être
              indisponibles — choisis d’autres dates si besoin.
            </Text>
          </View>
        ) : null}

        {externalFlight ? (
          <View style={styles.infoBanner}>
            <Text style={styles.infoTitle}>Vol ailleurs</Text>
            <Text style={styles.infoBody}>
              Tu as un vol hors FlightWatcher — tu peux quand même choisir et
              payer ton hôtel ici.
            </Text>
          </View>
        ) : null}

        <Text style={styles.legalSoft}>
          Vol et hôtel sont deux réservations distinctes. Les prix et dispo sont
          revalidés avant paiement — si un tarif a bougé, on te le dira.
        </Text>

        <View style={[styles.card, shadow.soft]}>
          <IconLabel
            section
            label="Vol"
            icon={<PlaneIcon size={14} />}
          />
          <View style={styles.flightHead}>
            <Text style={styles.cardBody} numberOfLines={1}>
              {airlineName || 'Compagnie'}
              {stopsLabel ? ` · ${stopsLabel}` : ''}
            </Text>
            <Text style={styles.flightRouteIata}>
              {originIata || '—'} → {destIata || '—'}
            </Text>
          </View>

          <View style={styles.flightLegs}>
            <View style={styles.flightLeg}>
              <Text style={styles.flightLegKicker}>Aller</Text>
              <Text style={styles.flightLegDate}>{formatDate(out)}</Text>
              <View style={styles.flightLegTimeRow}>
                <Text style={styles.flightLegTime}>
                  {outTime || '—'}
                  {outArrTime ? (
                    <Text style={styles.flightLegArr}> → {outArrTime}</Text>
                  ) : null}
                </Text>
                {outFlightNo ? (
                  <Text style={styles.flightNo}>{outFlightNo}</Text>
                ) : null}
              </View>
            </View>
            <View style={styles.flightLeg}>
              <Text style={styles.flightLegKicker}>Retour</Text>
              <Text style={styles.flightLegDate}>{formatDate(inn)}</Text>
              <View style={styles.flightLegTimeRow}>
                <Text style={styles.flightLegTime}>
                  {retTime || '—'}
                  {retArrTime ? (
                    <Text style={styles.flightLegArr}> → {retArrTime}</Text>
                  ) : null}
                </Text>
                {retFlightNo ? (
                  <Text style={styles.flightNo}>{retFlightNo}</Text>
                ) : null}
              </View>
            </View>
          </View>

          {flightPp != null ? (
            <Text style={styles.cardMeta}>
              {flightPp} €{adults > 1 ? ' / pers.' : ''}
              {adults > 1 ? ` · ${party.flightTotal} €` : ''}
              {flightRefreshing ? ' · actualisation…' : ''}
            </Text>
          ) : flightRefreshing ? (
            <Text style={styles.cardMeta}>Actualisation du prix…</Text>
          ) : null}
          {flightPriceHint && !flightUnavailable ? (
            <Text style={styles.priceHint}>{flightPriceHint}</Text>
          ) : null}
          {flightUnavailable && !flightBooked ? (
            <View style={styles.warnBanner}>
              <Text style={styles.warnTitle}>Tarif vol à vérifier</Text>
              <Text style={styles.warnBody}>
                Ce vol n’apparaît plus au même prix — confirme sur le site de la
                compagnie.
              </Text>
            </View>
          ) : null}
          {flightBooked ? (
            <View style={styles.badgeRow}>
              <CheckIcon size={14} />
              <Text style={styles.badgeOk}>Vol déjà réservé</Text>
            </View>
          ) : (
            <View style={styles.badgeRow}>
              <TicketIcon size={14} />
              <Text style={styles.badge}>
                À réserver sur le site de la compagnie
              </Text>
            </View>
          )}
          {flightUrl ? (
            <Pressable style={styles.primaryBtn} onPress={openFlight}>
              <PlaneIcon size={16} color={colors.white} />
              <Text style={styles.primaryBtnText}>{flightCtaLabel}</Text>
            </Pressable>
          ) : (
            <Text style={styles.cardMeta}>
              Le lien vers la compagnie n’est pas dispo pour ce vol.
            </Text>
          )}
        </View>

        <View style={[styles.card, shadow.soft]}>
          <IconLabel section label="Hôtel" icon={<BedIcon size={14} />} />
          {hotelId && hotelOpt ? (
            <>
              {gallery.length > 0 ? (
                <FlatList
                  horizontal
                  data={gallery.slice(0, 8)}
                  keyExtractor={(p, i) => p.url || `p-${i}`}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                  style={{ marginBottom: 4 }}
                  renderItem={({ item }) => (
                    <Pressable onPress={() => setHotelSheet(true)}>
                      <Image
                        source={{ uri: item.thumb || item.url }}
                        style={styles.galleryThumb}
                      />
                    </Pressable>
                  )}
                />
              ) : hotelPhoto ? (
                <Pressable onPress={() => setHotelSheet(true)}>
                  <Image source={{ uri: hotelPhoto }} style={styles.heroThumb} />
                </Pressable>
              ) : null}

              <Pressable onPress={() => setHotelSheet(true)}>
                {hotelStarsLabel(hotelOpt.stars) ? (
                  <Text style={styles.stars}>{hotelStarsLabel(hotelOpt.stars)}</Text>
                ) : null}
                <Text style={styles.cardBody} numberOfLines={2}>
                  {hotelName}
                </Text>
                <Text style={styles.cardMeta} numberOfLines={2}>
                  {[
                    hotelOpt.rating != null
                      ? `${Number(hotelOpt.rating).toFixed(1)}/10`
                      : null,
                    hotelOpt.review_count != null
                      ? `${hotelOpt.review_count} avis`
                      : null,
                    boardFr,
                    distFr,
                    cancelFr,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {hotelPp != null ? (
                  <Text style={styles.priceLine}>
                    {hotelBooked
                      ? `${party.hotelTotal} € payés`
                      : `${hotelPp} €${adults > 1 ? ' / pers.' : ''}`}
                    {!hotelBooked && adults > 1
                      ? ` · ${party.hotelTotal} €`
                      : ''}
                  </Text>
                ) : null}
                <View style={styles.badgeRow}>
                  {hotelBooked ? (
                    <CheckIcon size={14} />
                  ) : (
                    <CardIcon size={14} />
                  )}
                  <Text style={hotelBooked ? styles.badgeOk : styles.badge}>
                    {hotelBooked
                      ? 'Réservé ✓'
                      : 'Il reste à payer la chambre'}
                  </Text>
                </View>
                {hotelBooked &&
                (pl.hotel_confirmation_code || pl.hotel_booking_id) ? (
                  <Text style={styles.cardMeta}>
                    N°{' '}
                    {String(
                      pl.hotel_confirmation_code || pl.hotel_booking_id || '',
                    )}
                  </Text>
                ) : null}
                <Text style={styles.ficheLink}>Voir photos et détails →</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.cardMeta}>
              Pas encore d’hôtel — choisis-en un pour compléter ton séjour.
            </Text>
          )}
          <View style={styles.hotelActions}>
            {!hotelBooked ? (
              <Pressable
                style={styles.secondaryBtn}
                onPress={() =>
                  navigation.navigate('HotelCompose', { draftToken })
                }
              >
                <BedIcon size={15} />
                <Text style={styles.secondaryBtnText}>
                  {hotelId ? 'Changer d’hôtel' : 'Choisir mon hôtel'}
                </Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  style={[styles.invoiceBtn, invoiceBusy && { opacity: 0.6 }]}
                  disabled={invoiceBusy}
                  onPress={onDownloadHotelInvoice}
                  accessibilityState={{ busy: invoiceBusy }}
                >
                  {invoiceBusy ? (
                    <View style={styles.invoiceBusyRow}>
                      <ActivityIndicator color="#065F46" />
                      <Text style={styles.invoiceBtnText}>
                        Préparation…
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.invoiceBtnText}>Voir la facture</Text>
                  )}
                </Pressable>
                {cancelGate.canCancelFree ? (
                  <Pressable
                    style={[
                      styles.cancelHotelBtn,
                      cancellingHotel && { opacity: 0.6 },
                    ]}
                    disabled={cancellingHotel}
                    onPress={onCancelHotelBooking}
                  >
                    {cancellingHotel ? (
                      <ActivityIndicator color="#9F1239" />
                    ) : (
                      <Text style={styles.cancelHotelText}>
                        Annuler la réservation
                      </Text>
                    )}
                  </Pressable>
                ) : cancelGate.blockedLabelFr ? (
                  <Text style={styles.cancelBlockedText}>
                    {cancelGate.blockedLabelFr}
                  </Text>
                ) : null}
              </>
            )}
          </View>
        </View>

        {plannerActivitiesEnabled && distantAirportLine(destIata, city) ? (
          <ActivitySurfaceBanner
            surface="transfer"
            citySlug={activityCitySlug}
            title={ACTIVITY_TRANSFER_CTA_FR}
            subtitle={distantAirportLine(destIata, city) || undefined}
          />
        ) : null}

        {plannerActivitiesEnabled ? (
          <View style={[styles.card, shadow.soft]}>
            <IconLabel section label="Activités" icon={<TicketIcon size={14} />} />
            <ActivityStepPanel
              draftToken={draftToken}
              plannedTripId={draft?.source_planned_trip_id || null}
              citySlug={activityCitySlug}
              enabled={plannerActivitiesEnabled}
              surface="my_trip"
            />
          </View>
        ) : null}

        {party.total > 0 ? (
          <View style={[styles.card, shadow.soft]}>
            <IconLabel section label="Total séjour" icon={<CardIcon size={14} />} />
            <Text style={styles.priceLine}>
              {party.total} €
              {adults > 1 ? ` · ${party.perPerson} € / pers.` : ''}
            </Text>
            <Text style={styles.cardMeta}>
              {[
                party.flightTotal > 0 ? `Vol ${party.flightTotal} €` : null,
                party.hotelTotal > 0
                  ? `Hôtel ${party.hotelTotal} €${hotelBooked ? ' (payé)' : ''}`
                  : null,
              ]
                .filter(Boolean)
                .join(' + ')}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable style={styles.btn} onPress={onSticky} disabled={marking}>
          {sticky.action === 'flight' ? (
            <PlaneIcon size={16} color={colors.white} />
          ) : sticky.action === 'hotel_pay' ? (
            <CardIcon size={16} color={colors.white} />
          ) : sticky.action === 'hotel_pick' ? (
            <BedIcon size={16} color={colors.white} />
          ) : (
            <TicketIcon size={16} color={colors.white} />
          )}
          <Text style={styles.btnText}>
            {sticky.action === 'planner'
              ? ACTIVITY_BACK_TO_PLANNER_FR
              : sticky.label}
          </Text>
        </Pressable>
        {draft?.source_planned_trip_id && sticky.action !== 'planner' ? (
          <Pressable style={styles.stickySecondary} onPress={goPlanner}>
            <Text style={styles.stickySecondaryText}>
              {ACTIVITY_BACK_TO_PLANNER_FR}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <HotelComposeDetailSheet
        visible={hotelSheet && !!hotelOpt}
        hotel={hotelOpt}
        cityLabel={city}
        checkin={out}
        checkout={inn}
        adults={adults}
        onClose={() => setHotelSheet(false)}
        onConfirm={
          hotelId && !hotelBooked
            ? () => {
                setHotelSheet(false)
                navigation.navigate('DealCheckout', { draftToken, hotelId })
              }
            : undefined
        }
        confirmLabel="Payer ma chambre"
        closeLabel="Fermer"
      />

      <Modal visible={askFlight} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, shadow.soft]}>
            <Text style={styles.modalTitle}>Ton billet est bon ?</Text>
            <Text style={styles.modalBody}>
              Si tu as déjà réservé le vol, on le note pour suivre ton séjour.
            </Text>
            <Pressable style={styles.btn} onPress={() => void markFlight(true)}>
              <Text style={styles.btnText}>Oui, c’est réservé</Text>
            </Pressable>
            <Pressable style={styles.later} onPress={() => void markFlight(false)}>
              <Text style={styles.laterText}>Pas encore</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { fontFamily: fonts.medium, color: colors.ink, marginBottom: 12, textAlign: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.xl },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 26,
    color: colors.ink,
    letterSpacing: -0.8,
  },
  metaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  sub: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  warnBanner: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 14,
    gap: 4,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FDE68A',
  },
  warnTitle: { fontFamily: fonts.bold, fontSize: 14, color: '#92400E' },
  warnBody: { fontFamily: fonts.regular, fontSize: 13, color: '#78350F', lineHeight: 18 },
  infoBanner: {
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    padding: 14,
    gap: 4,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
  },
  infoTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.primaryInk },
  infoBody: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkSoft, lineHeight: 18 },
  legalSoft: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.faint,
    lineHeight: 17,
    marginBottom: 14,
  },
  shareBtn: {
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sharePressed: { backgroundColor: colors.primaryMuted },
  share: { fontFamily: fonts.semibold, fontSize: 13, color: colors.primaryDeep },
  plannerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    backgroundColor: '#1D1820',
    padding: 15,
    marginBottom: 14,
  },
  plannerLinkKicker: {
    fontFamily: fonts.bold,
    fontSize: 9,
    letterSpacing: 1.1,
    color: '#FDBA8C',
  },
  plannerLinkTitle: {
    marginTop: 3,
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.white,
  },
  plannerLinkArrow: { fontFamily: fonts.regular, fontSize: 28, color: colors.white },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 14,
    gap: 8,
  },
  addressesCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFDCC8',
  },
  stars: {
    fontFamily: fonts.bold,
    fontSize: 13,
    letterSpacing: 1,
    color: '#D97706',
  },
  cardBody: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  flightHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  flightRouteIata: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.muted,
    flexShrink: 0,
  },
  flightLegs: { gap: 8 },
  flightLeg: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  flightLegKicker: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.primaryDeep,
  },
  flightLegDate: {
    fontFamily: fonts.extrabold,
    fontSize: 14,
    color: colors.ink,
  },
  flightLegTimeRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  flightLegTime: {
    fontFamily: fonts.extrabold,
    fontSize: 20,
    color: colors.ink,
  },
  flightLegArr: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.muted,
  },
  flightNo: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 0.4,
  },
  cardMeta: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted, lineHeight: 19 },
  priceHint: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.primaryDeep,
  },
  priceLine: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink, marginTop: 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { fontFamily: fonts.medium, fontSize: 12, color: colors.primary, flexShrink: 1 },
  badgeOk: { fontFamily: fonts.medium, fontSize: 12, color: colors.success, flexShrink: 1 },
  ficheLink: {
    marginTop: 4,
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primaryDeep,
  },
  galleryThumb: {
    width: 108,
    height: 80,
    borderRadius: radius.sm,
    backgroundColor: colors.line,
  },
  heroThumb: {
    width: '100%',
    height: 140,
    borderRadius: radius.md,
    backgroundColor: colors.line,
  },
  hotelActions: { gap: 8, marginTop: 4 },
  invoiceBtn: {
    borderWidth: 1,
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  invoiceBusyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  invoiceBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: '#065F46',
  },
  cancelHotelBtn: {
    borderWidth: 1,
    borderColor: '#FECDD3',
    backgroundColor: '#FFF1F2',
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelHotelText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: '#9F1239',
  },
  cancelBlockedText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    textAlign: 'center',
    paddingVertical: 4,
  },
  primaryBtn: {
    marginTop: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryBtnText: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryBtnText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  stickySecondary: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 10,
  },
  stickySecondaryText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.inkSoft,
  },
  sticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: 10,
    backgroundColor: colors.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  later: { paddingVertical: 12, alignItems: 'center' },
  laterText: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,6,4,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 22,
    gap: 10,
  },
  modalTitle: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  modalBody: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, lineHeight: 20 },
})
