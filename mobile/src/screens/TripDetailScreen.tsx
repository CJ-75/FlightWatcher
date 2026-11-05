import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Alert,
  RefreshControl,
  ImageBackground,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type {
  MyTripDraft,
  PlannedTripDetail,
  TravelWorkspace,
  TripMember,
  TripProposal,
} from '@flightwatcher/shared'
import {
  resolveActivityCitySlug,
  activityStepProgress,
  buildStayPipeline,
  cityDisplayNameFr,
  cityImageUrl,
  resolveTripImageUrl,
  formatAirlineLabel,
  formatTripDateRangeFr,
  parseAirportCodes,
  primaryAirportCode,
  sanitizeTripAirports,
  resolveFlightStepStatus,
  resolveHotelStepStatus,
  type AddTripMemberRequest,
  type EnrichedTripResponse,
  type StayStepId,
} from '@flightwatcher/shared'
import { ActivityStepPanel } from '../components/ActivityStepPanel'
import { HotelPhotoGallery } from '../components/HotelPhotoGallery'
import { getApi } from '../lib/client'
import { useAuth } from '../context/AuthContext'
import {
  acceptGuestProposal,
  addGuestTripMember,
  deleteGuestTrip,
  getGuestTrip,
  rejectGuestProposal,
  removeGuestTripMember,
  scanGuestTrip,
  updateGuestTripArrival,
  updateGuestTripName,
} from '../dev/guestPreview'
import { DestinationCard } from '../components/DestinationCard'
import { StayPipelineStepper } from '../components/StayPipelineStepper'
import { TravelersSection } from '../components/TravelersSection'
import { Button } from '../components/ui/Button'
import {
  createMyTripComposeFromTrip,
  clearFlightReturnAsk,
  consumeFlightReturnAsk,
  markFlightReturnAsk,
  preparePartnerBook,
  resolveTripPriceSource,
} from '../lib/partnerBook'
import { openInAppBrowser } from '../lib/openInApp'
import { rememberTrip } from '../lib/tripRecovery'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, shadow, spacing } from '../theme'
import Svg, { Path } from 'react-native-svg'

function PencilIcon({
  size = 14,
  color = colors.ink,
}: {
  size?: number
  color?: string
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 20h9"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

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

export function TripDetailScreen() {
  const insets = useSafeAreaInsets()
  const route = useRoute<RouteProp<RootStackParamList, 'TripDetail'>>()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { viewUser, isGuest } = useAuth()
  const tripId = route.params.tripId
  const autoScan = Boolean(route.params.autoScan)
  const autoScanStarted = useRef(false)

  const [trip, setTrip] = useState<PlannedTripDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const [membersBusy, setMembersBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [watchBusy, setWatchBusy] = useState(false)
  const [watchInterval, setWatchInterval] = useState(3600)
  const [hotelBusy, setHotelBusy] = useState(false)
  const [gallerySwipeActive, setGallerySwipeActive] = useState(false)
  const [scanEmpty, setScanEmpty] = useState<{
    reason: 'budget' | 'no_flights'
    budget: number
    cheapest?: number | null
  } | null>(null)
  const [editBudget, setEditBudget] = useState(150)
  const [savingCriteria, setSavingCriteria] = useState(false)
  const [reopeningFlight, setReopeningFlight] = useState(false)
  const [skippingFlight, setSkippingFlight] = useState(false)
  const [skippingHotel, setSkippingHotel] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [showModalities, setShowModalities] = useState(false)
  const [plannerActivitiesEnabled, setPlannerActivitiesEnabled] = useState(false)
  const [workspace, setWorkspace] = useState<TravelWorkspace | null>(null)
  const [flightDraft, setFlightDraft] = useState<MyTripDraft | null>(null)
  const [flightBookingBusy, setFlightBookingBusy] = useState(false)
  const [activityItems, setActivityItems] = useState<{ status?: string | null }[]>([])
  const extrasRef = useRef<View>(null)
  const scrollRef = useRef<ScrollView>(null)
  const extrasOffsetY = useRef(0)
  const leftForFlight = useRef(false)
  const leftForFlightNeedsAsk = useRef(false)

  useEffect(() => {
    void getApi()
      .getConfig()
      .then((cfg) => {
        setPlannerActivitiesEnabled(cfg.planner_activities_enabled === true)
      })
      .catch(() => undefined)
  }, [])

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = Boolean(opts?.silent)
    if (!silent) setError(null)
    try {
      const detail =
        __DEV__ && isGuest ? getGuestTrip(tripId) : await getApi().getPlannedTrip(tripId)
      if (!detail) throw new Error('Voyage introuvable')
      setTrip(detail)
      setEditBudget(detail.budget_max || 150)
      setWatchInterval(Math.max(900, detail.auto_scan_interval_seconds || 3600))
      navigation.setOptions({ title: detail.name || 'Voyage' })
      if (!(__DEV__ && isGuest)) {
        try {
          const workspaces = await getApi().listTravelWorkspaces()
          const matched =
            workspaces.find((item) => item.planned_trip_id === tripId) || null
          setWorkspace(matched)
          const acceptedId =
            detail.accepted_proposal?.id ||
            (detail.proposals || []).find((p) => p.status === 'accepted')?.id ||
            null
          if (matched?.draft_token) {
            setFlightDraft(await getApi().getMyTrip(matched.draft_token))
          } else if (acceptedId) {
            // Chosen flight is in DB — ensure séjour draft exists and keep it.
            try {
              const draft = await getApi().getOrCreateExecutionDraft(acceptedId)
              setFlightDraft(draft)
            } catch {
              setFlightDraft((prev) => prev)
            }
          } else {
            // Keep a locally confirmed draft — don't wipe "Oui, c’est réservé".
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
      }
    } catch (e) {
      if (!silent) {
        setError(e instanceof Error ? e.message : 'Chargement impossible')
        setTrip(null)
      }
    } finally {
      setLoading(false)
    }
  }, [tripId, navigation, isGuest])

  const hasTripRef = useRef(false)
  hasTripRef.current = Boolean(trip)

  useFocusEffect(
    useCallback(() => {
      // Keep current UI while refreshing statuses after hotel/flight booking.
      if (hasTripRef.current) {
        void load({ silent: true })
        return
      }
      setLoading(true)
      void load()
    }, [load]),
  )

  useEffect(() => {
    const token = flightDraft?.draft_token || workspace?.draft_token
    if ((!tripId && !token) || !plannerActivitiesEnabled) {
      setActivityItems([])
      return
    }
    const owner = tripId
      ? { planned_trip_id: tripId }
      : { draft_token: token! }
    void getApi()
      .listTripItems(owner)
      .then((res) => {
        const items = res.items || []
        setActivityItems(items.filter((i) => i.item_type === 'activity'))
      })
      .catch(() => {
        setActivityItems([])
      })
  }, [
    tripId,
    flightDraft?.draft_token,
    workspace?.draft_token,
    plannerActivitiesEnabled,
    flightDraft?.hotel_booked_at,
    flightDraft?.flight_booked_at,
  ])

  const activityProgress = useMemo(
    () => activityStepProgress(activityItems),
    [activityItems],
  )

  const isOrganizer = !!viewUser && trip?.organizer_id === viewUser.id

  const scan = useCallback(async () => {
    setScanning(true)
    setScanEmpty(null)
    setError(null)
    // Clear previous pending proposals immediately (Search parity)
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
      if (__DEV__ && isGuest) {
        const updated = await scanGuestTrip(tripId)
        if (!updated) throw new Error('Voyage introuvable')
        setTrip(updated)
        navigation.setOptions({ title: updated.name || 'Voyage' })
        if (!(updated.proposals || []).some((p) => p.status === 'pending')) {
          setScanEmpty({
            reason: 'no_flights',
            budget: updated.budget_max || 150,
            cheapest: null,
          })
        }
      } else {
        // Live Search path on the API (same Ryanair+TP stack as /inspire).
        const scanRes = await getApi().scanPlannedTrip(tripId)
        const proposals = scanRes.proposals || []
        // Paint scan results, then resync full trip (accepted + draft) from DB.
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
        await load({ silent: true })
        if (proposals.length === 0) {
          const budget = scanRes.budget_max ?? 150
          const cheapest = scanRes.cheapest_found
          setScanEmpty({
            reason: scanRes.empty_reason === 'budget' ? 'budget' : 'no_flights',
            budget,
            cheapest,
          })
          if (cheapest != null) {
            setEditBudget(
              Math.min(1000, Math.max(budget, Math.ceil(cheapest / 10) * 10)),
            )
          } else {
            setEditBudget(budget)
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan échoué')
      Alert.alert('Scan', e instanceof Error ? e.message : 'Scan échoué')
    } finally {
      setScanning(false)
    }
  }, [tripId, isGuest, load, navigation])

  const bumpBudgetAndScan = async () => {
    if (!trip) return
    const next = Math.min(1000, Math.max(20, Math.round(editBudget / 10) * 10))
    setSavingCriteria(true)
    try {
      if (!(__DEV__ && isGuest)) {
        await getApi().updatePlannedTrip(tripId, { budget_max: next })
      }
      setTrip((prev) => (prev ? { ...prev, budget_max: next } : prev))
      setScanEmpty(null)
      await scan()
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Mise à jour échouée')
    } finally {
      setSavingCriteria(false)
    }
  }

  // Création → scan immédiat (ne pas attendre le getTrip)
  useEffect(() => {
    if (!autoScan || autoScanStarted.current) return
    autoScanStarted.current = true
    setScanning(true)
    navigation.setParams({ autoScan: undefined })
    void scan()
  }, [autoScan, scan, navigation])

  const accept = async (id: string) => {
    setActing(id)
    try {
      if (__DEV__ && isGuest) {
        const updated = acceptGuestProposal(id)
        if (updated) setTrip(updated)
        else await load()
      } else {
        await getApi().acceptProposal(id)
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
          const draft = await getApi().getOrCreateExecutionDraft(id)
          setFlightDraft(draft)
          setWorkspace((prev) => {
            if (!prev) {
              return {
                workspace_id: `planner:${tripId}`,
                planned_trip_id: tripId,
                proposal_id: id,
                draft_token: draft.draft_token,
                scope: 'collaborative',
                phase: 'flight_selected',
                title: trip?.name || 'Voyage',
                city: null,
                origin_iata: trip?.departure_airport || null,
                dest_iata: trip?.arrival_airport || null,
                out_date: trip?.dates_depart?.[0]?.date || null,
                ret_date:
                  trip?.dates_retour?.[trip.dates_retour.length - 1]?.date ||
                  null,
                is_organizer: true,
                capabilities: {
                  can_scan: false,
                  can_choose_flight: false,
                  can_compose_hotel: true,
                  can_view_confirmation: false,
                },
                pipeline: { flight: 'selected', hotel: 'none' },
                updated_at: new Date().toISOString(),
              }
            }
            return {
              ...prev,
              draft_token: draft.draft_token || prev.draft_token,
              proposal_id: id,
              phase:
                prev.phase === 'booked' || prev.phase === 'past'
                  ? prev.phase
                  : 'flight_selected',
              pipeline: {
                ...prev.pipeline,
                flight: prev.pipeline.flight === 'booked' ? 'booked' : 'selected',
              },
              capabilities: {
                ...prev.capabilities,
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
      }
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Acceptation échouée')
      void load({ silent: true })
    } finally {
      setActing(null)
    }
  }

  const reject = async (id: string) => {
    setActing(id)
    try {
      if (__DEV__ && isGuest) {
        const updated = rejectGuestProposal(id)
        if (updated) setTrip(updated)
        else await load()
      } else {
        await getApi().rejectProposal(id)
        await load()
      }
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Refus échoué')
    } finally {
      setActing(null)
    }
  }

  const addMember = async (body: AddTripMemberRequest) => {
    setMembersBusy(true)
    try {
      if (__DEV__ && isGuest) {
        const label =
          [body.first_name, body.last_name].filter(Boolean).join(' ').trim() ||
          body.display_name ||
          ''
        const updated = addGuestTripMember(tripId, label, body.email || undefined)
        if (!updated) throw new Error('Voyage introuvable')
        setTrip(updated)
      } else {
        await getApi().addTripMember(tripId, body)
        await load()
      }
    } finally {
      setMembersBusy(false)
    }
  }

  const addHotelFromTrip = async (
    tripData: EnrichedTripResponse,
    proposalId?: string,
  ) => {
    if (!trip) return
    if (hotelBusy) return
    setHotelBusy(true)
    try {
      const pax = Math.max(trip.passengers || 1, (trip.members || []).length || 1)
      const draft =
        proposalId && !(__DEV__ && isGuest)
          ? await getApi().getOrCreateExecutionDraft(proposalId)
          : await createMyTripComposeFromTrip({
              trip: tripData,
              passengers: pax,
              markFlightBooked: false,
            })
      const token = String(draft?.draft_token || '').trim()
      if (!token) {
        throw new Error('Brouillon hôtel introuvable — réessaie')
      }
      await rememberTrip({
        draft_token: token,
        city: cityDisplayNameFr(
          tripData.destination_code,
          tripData.aller?.destinationFull?.split(',')[0]?.trim(),
        ),
      })
      navigation.navigate('HotelCompose', { draftToken: token })
    } catch (e) {
      console.warn('[planner] addHotelFromTrip', e)
      Alert.alert(
        'Erreur',
        e instanceof Error ? e.message : 'Impossible de créer le séjour hôtel',
      )
    } finally {
      setHotelBusy(false)
    }
  }

  const removeMember = async (member: TripMember) => {
    setMembersBusy(true)
    try {
      if (__DEV__ && isGuest) {
        const updated = removeGuestTripMember(tripId, member.id)
        if (!updated) throw new Error('Voyage introuvable')
        setTrip(updated)
      } else {
        await getApi().removeTripMember(tripId, member.id)
        await load()
      }
    } finally {
      setMembersBusy(false)
    }
  }

  const clearStaleArrival = async () => {
    try {
      if (__DEV__ && isGuest) {
        const updated = updateGuestTripArrival(tripId, null)
        if (!updated) throw new Error('Voyage introuvable')
        setTrip(updated)
      } else {
        await getApi().updatePlannedTrip(tripId, { arrival_airport: null })
        await load()
      }
    } catch (e) {
      Alert.alert('Route', e instanceof Error ? e.message : 'Mise à jour échouée')
    }
  }

  const startRename = () => {
    if (!trip || !isOrganizer) return
    setNameDraft(trip.name)
    setEditingName(true)
  }

  const saveRename = async () => {
    if (!trip || !isOrganizer || savingName) return
    const next = nameDraft.trim()
    if (next.length < 2 || next.length > 80) {
      Alert.alert('Nom', 'Entre 2 et 80 caractères.')
      return
    }
    if (next === trip.name) {
      setEditingName(false)
      return
    }
    setSavingName(true)
    try {
      if (__DEV__ && isGuest) {
        const updated = updateGuestTripName(tripId, next)
        if (!updated) throw new Error('Impossible de renommer')
        setTrip(updated)
      } else {
        const updated = await getApi().updatePlannedTrip(tripId, { name: next })
        setTrip((prev) => (prev ? { ...prev, name: updated.name } : prev))
      }
      setEditingName(false)
    } catch (e) {
      Alert.alert(
        'Nom',
        e instanceof Error ? e.message : 'Impossible de renommer le voyage',
      )
    } finally {
      setSavingName(false)
    }
  }

  const setPriceWatch = async (enabled: boolean) => {
    if (__DEV__ && isGuest) {
      Alert.alert('Surveillance', 'Disponible avec un compte connecté.')
      return
    }
    const interval = Math.max(900, watchInterval || 3600)
    setWatchBusy(true)
    try {
      const updated = await getApi().updatePlannedTrip(tripId, {
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
    } catch (e) {
      Alert.alert('Surveillance', e instanceof Error ? e.message : 'Mise à jour échouée')
    } finally {
      setWatchBusy(false)
    }
  }

  const doDelete = async () => {
    setDeleting(true)
    try {
      if (__DEV__ && isGuest) {
        if (!deleteGuestTrip(tripId)) throw new Error('Voyage introuvable')
      } else {
        await getApi().deletePlannedTrip(tripId)
      }
      navigation.goBack()
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Suppression échouée')
    } finally {
      setDeleting(false)
    }
  }

  const accepted = (trip?.proposals || []).find((p) => p.status === 'accepted')
  const pending = (trip?.proposals || []).filter((p) => p.status === 'pending')
  const others = (trip?.proposals || []).filter(
    (p) => p.status !== 'pending' && p.status !== 'accepted',
  )
  const pax = Math.max(trip?.passengers || 1, (trip?.members || []).length || 1)

  const arrivalCode = parseAirportCodes(trip?.arrival_airport)[0] || ''
  const cityLabel = (() => {
    if (arrivalCode) return cityDisplayNameFr(arrivalCode) || arrivalCode
    const fromName = trip?.name?.replace(/^(Weekend|Voyage|Séjour)\s+/i, '')?.trim()
    return fromName || 'ta ville'
  })()
  const citySlug = resolveActivityCitySlug({
    cityLabel: cityLabel !== 'ta ville' ? cityLabel : null,
    destIata: arrivalCode || null,
  })
  const destinationImage = resolveTripImageUrl({
    city: cityLabel !== 'ta ville' ? cityLabel : null,
    iata: arrivalCode || null,
    imageUrl: workspace?.image_url || null,
  })

  const reservationFlags = useMemo(() => {
    const payload = (flightDraft?.payload || {}) as Record<string, unknown>
    const flight = (payload.flight || {}) as Record<string, unknown>
    const status = String(
      flightDraft?.flight_booking_status ||
        payload.flight_booking_status ||
        workspace?.flight_booking_status ||
        '',
    )
    const externalFlight = Boolean(
      payload.flight_external || payload.external_flight,
    )
    const externalHotel = Boolean(
      payload.hotel_external || payload.external_hotel,
    )
    const flightBooked = Boolean(
      flightDraft?.flight_booked_at ||
        payload.flight_booked ||
        payload.flight_booked_at ||
        status === 'user_confirmed' ||
        status === 'partner_confirmed' ||
        workspace?.pipeline.flight === 'booked' ||
        externalFlight,
    )
    const hotelBooked = Boolean(
      flightDraft?.hotel_booked_at ||
        payload.hotel_booked ||
        payload.hotel_booked_at ||
        externalHotel ||
        workspace?.pipeline.hotel === 'booked',
    )
    const hasHotel = Boolean(
      flightDraft?.hotel || payload.hotel || workspace?.hotel_booking_id,
    )
    const canSkipFlight =
      !externalFlight &&
      !hotelBooked &&
      !externalHotel &&
      !flightDraft?.flight_booked_at &&
      status !== 'user_confirmed' &&
      status !== 'partner_confirmed'
    const canSkipHotel =
      !externalHotel && !hotelBooked && !flightDraft?.hotel_booked_at
    // Réservations FlightWatcher (pas « ailleurs ») → archiver plutôt que supprimer.
    const hasInternalReservations = Boolean(
      (flightBooked && !externalFlight) ||
        (hotelBooked && !externalHotel) ||
        workspace?.hotel_booking_id,
    )
    return {
      payload,
      flight,
      externalFlight,
      externalHotel,
      flightBooked,
      hotelBooked,
      hasHotel,
      canSkipFlight,
      canSkipHotel,
      hasInternalReservations,
    }
  }, [flightDraft, workspace])

  const confirmDelete = () => {
    if (!trip) return
    const archive = reservationFlags.hasInternalReservations
    Alert.alert(
      archive ? 'Archiver le voyage' : 'Supprimer le voyage',
      archive
        ? `Archiver « ${trip.name} » ?\n\nLe Planner disparaît, tes réservations (vol / hôtel) sont conservées.`
        : `Supprimer « ${trip.name} » ?\n\nCette action est définitive.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: archive ? 'Archiver' : 'Supprimer',
          style: 'destructive',
          onPress: () => void doDelete(),
        },
      ],
    )
  }

  const pipelineForUi = useMemo(() => {
    const {
      flight,
      flightBooked,
      hotelBooked,
      hasHotel,
      payload,
      externalFlight,
      externalHotel,
    } = reservationFlags
    const flightStep = resolveFlightStepStatus({
      hasFlightPayload: Boolean(accepted || flight.origin_iata || externalFlight),
      flightBooked: flightBooked && !externalFlight,
      externalFlight,
      bookingUrl:
        (flight.booking_url as string | undefined) ||
        (payload.booking_url as string | undefined) ||
        null,
    })
    const hotelStep = resolveHotelStepStatus({
      hasHotel,
      hotelBooked: hotelBooked && !externalHotel,
      externalHotel,
    })
    // Adresses : non affichées / inactives pour le moment.
    return buildStayPipeline({
      flight: flightStep,
      hotel: hotelStep,
      focus:
        hotelBooked || externalHotel
          ? undefined
          : accepted || flightStep !== 'none' || externalFlight
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
    plannerActivitiesEnabled,
    reservationFlags,
  ])

  const changeFlightChoice = async () => {
    if (!trip || reopeningFlight || (__DEV__ && isGuest)) return
    Alert.alert(
      'Changer de vol',
      'Les propositions actuelles seront remplacées par un nouveau scan. Continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Rescanner',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setReopeningFlight(true)
              try {
                await getApi().reopenPlannedTripFlight(tripId)
                setShowModalities(false)
                setFlightDraft(null)
                setWorkspace(null)
                await scan()
              } catch (e) {
                Alert.alert(
                  'Erreur',
                  e instanceof Error ? e.message : 'Impossible de rouvrir le vol',
                )
              } finally {
                setReopeningFlight(false)
              }
            })()
          },
        },
      ],
    )
  }

  const updateBudgetAndRescan = async () => {
    if (!trip) return
    const next = Math.min(1000, Math.max(20, Math.round(editBudget / 10) * 10))
    setSavingCriteria(true)
    try {
      if (!(__DEV__ && isGuest)) {
        await getApi().updatePlannedTrip(tripId, { budget_max: next })
      }
      setTrip((prev) =>
        prev
          ? { ...prev, budget_max: next, status: 'planning' }
          : prev,
      )
      setShowModalities(false)
      setFlightDraft(null)
      setWorkspace(null)
      await scan()
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Mise à jour échouée')
    } finally {
      setSavingCriteria(false)
    }
  }

  const skipFlight = async () => {
    if (!trip || skippingFlight || (__DEV__ && isGuest)) return
    if (!trip.arrival_airport) {
      Alert.alert('Destination', 'Choisis d’abord une destination.')
      return
    }
    if (!trip.dates_depart?.[0] || !trip.dates_retour?.[0]) {
      Alert.alert('Dates', 'Dates aller/retour requises.')
      return
    }
    setSkippingFlight(true)
    try {
      const draft = await getApi().skipPlannedTripFlight(tripId)
      const token = String(draft?.draft_token || '').trim()
      if (!token) throw new Error('Brouillon introuvable')
      setFlightDraft(draft)
      navigation.navigate('HotelCompose', { draftToken: token })
    } catch (e) {
      Alert.alert(
        'Erreur',
        e instanceof Error ? e.message : 'Impossible de passer à l’hôtel',
      )
    } finally {
      setSkippingFlight(false)
    }
  }

  const skipHotel = async () => {
    if (!trip || skippingHotel) return
    if (__DEV__ && isGuest) {
      Alert.alert(
        'Connexion requise',
        'Connecte-toi pour indiquer que tu as déjà un hôtel.',
      )
      return
    }
    setSkippingHotel(true)
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
      const draft = await getApi().skipPlannedTripHotel(tripId)
      setFlightDraft(draft)
      Alert.alert('Hôtel ailleurs', 'Étape hôtel passée — séjour à jour.')
      await load({ silent: true })
    } catch (e) {
      Alert.alert(
        'Erreur',
        e instanceof Error ? e.message : 'Impossible de skipper l’hôtel',
      )
      await load({ silent: true })
    } finally {
      setSkippingHotel(false)
    }
  }

  const confirmAirlineFlight = async () => {
    if (flightBookingBusy) return
    setFlightBookingBusy(true)
    leftForFlight.current = false
    leftForFlightNeedsAsk.current = false
    try {
      let token = flightDraft?.draft_token || workspace?.draft_token || null
      // Draft may still be missing if user confirmed right after returning.
      if (!token && accepted && !(__DEV__ && isGuest)) {
        const draft = await getApi().getOrCreateExecutionDraft(accepted.id)
        token = draft.draft_token
        setFlightDraft(draft)
      }
      if (!token) {
        Alert.alert(
          'Erreur',
          'Impossible de rattacher la réservation à ce voyage — réessaie.',
        )
        return
      }
      void clearFlightReturnAsk(token)

      const nowIso = new Date().toISOString()
      setFlightDraft((prev) => {
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

      const updated = await getApi().updateMyTripFlightBookingStatus(token, {
        status: 'user_confirmed',
        provider: 'ryanair',
      })
      setFlightDraft(updated)
      Alert.alert('Vol confirmé', 'Ton voyage est à jour.')
      await load({ silent: true })
    } catch (e) {
      Alert.alert(
        'Erreur',
        e instanceof Error ? e.message : 'Impossible de confirmer le vol',
      )
      await load({ silent: true })
    } finally {
      setFlightBookingBusy(false)
    }
  }

  const bookSelectedFlight = async () => {
    if (!accepted || flightBookingBusy) return
    setFlightBookingBusy(true)
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
      let primaryUrl = ''
      let partnerId = 'ryanair'
      let isTravelpayouts = false
      try {
        const ps = await preparePartnerBook({
          trip: tripForBook,
          passengers: pax,
        })
        primaryUrl = String(ps.primaryUrl || '').trim()
        partnerId = ps.partnerId || partnerId
        isTravelpayouts = ps.partnerId === 'aviasales'
      } catch {
        // Resolve URL even if analytics / AsyncStorage fail.
        const ps = resolveTripPriceSource(tripForBook, pax, 'fr')
        primaryUrl = String(ps.primaryUrl || '').trim()
        partnerId = ps.partnerId || partnerId
        isTravelpayouts = ps.partnerId === 'aviasales'
      }

      if (!/^https?:\/\//i.test(primaryUrl)) {
        Alert.alert(
          'Réservation',
          'Lien de réservation indisponible pour ce vol.',
        )
        return
      }

      // Ensure execution draft exists before leaving — needed for "Oui, c’est réservé".
      let askToken =
        flightDraft?.draft_token || workspace?.draft_token || null
      if (!(__DEV__ && isGuest)) {
        try {
          const draft =
            flightDraft?.draft_token
              ? flightDraft
              : await getApi().getOrCreateExecutionDraft(accepted.id)
          setFlightDraft(draft)
          const updated = await getApi().updateMyTripFlightBookingStatus(
            draft.draft_token,
            {
              status: isTravelpayouts ? 'pending_partner' : 'redirected',
              provider: partnerId,
            },
          )
          setFlightDraft(updated)
          askToken = updated.draft_token || draft.draft_token
        } catch {
          /* still open partner — confirm will recreate draft if needed */
        }
      }

      leftForFlight.current = true
      leftForFlightNeedsAsk.current = !isTravelpayouts
      const token = askToken
      if (token) {
        void markFlightReturnAsk({
          draftToken: token,
          promptOnReturn: !isTravelpayouts,
        })
      }
      setFlightBookingBusy(false)

      await openInAppBrowser(navigation, primaryUrl, 'Réserver le vol')

      // expo-web-browser keeps this screen focused — ask after the sheet closes.
      if (
        leftForFlight.current &&
        leftForFlightNeedsAsk.current &&
        !reservationFlags.flightBooked
      ) {
        leftForFlight.current = false
        leftForFlightNeedsAsk.current = false
        Alert.alert(
          'Ton vol est réservé ?',
          'Tu reviens de Ryanair / la compagnie.',
          [
            {
              text: 'Pas encore',
              style: 'cancel',
              onPress: () => void clearFlightReturnAsk(token),
            },
            {
              text: 'Oui, c’est réservé',
              onPress: () => void confirmAirlineFlight(),
            },
          ],
        )
      } else {
        leftForFlight.current = false
        leftForFlightNeedsAsk.current = false
      }
    } catch (e) {
      leftForFlight.current = false
      leftForFlightNeedsAsk.current = false
      setFlightBookingBusy(false)
      Alert.alert(
        'Erreur',
        e instanceof Error ? e.message : 'Impossible d’ouvrir la réservation',
      )
    }
  }

  useFocusEffect(
    useCallback(() => {
      const token =
        flightDraft?.draft_token || workspace?.draft_token || null
      const askFromMemory =
        leftForFlight.current && leftForFlightNeedsAsk.current
      leftForFlight.current = false
      leftForFlightNeedsAsk.current = false
      if (reservationFlags.flightBooked) {
        void clearFlightReturnAsk(token)
        return
      }
      void (async () => {
        const persisted = await consumeFlightReturnAsk({
          draftToken: token,
          alreadyBooked: reservationFlags.flightBooked,
        })
        if (!askFromMemory && !persisted) return
        Alert.alert(
          'Ton vol est réservé ?',
          'Tu reviens de Ryanair / la compagnie.',
          [
            {
              text: 'Pas encore',
              style: 'cancel',
              onPress: () => void clearFlightReturnAsk(token),
            },
            {
              text: 'Oui, c’est réservé',
              onPress: () => void confirmAirlineFlight(),
            },
          ],
        )
      })()
    }, [
      flightDraft?.draft_token,
      reservationFlags.flightBooked,
      workspace?.draft_token,
    ]),
  )

  const reservationToken =
    flightDraft?.draft_token || workspace?.draft_token || null

  const draftHotel = useMemo(() => {
    const raw =
      (flightDraft?.hotel as Record<string, unknown> | null | undefined) ||
      (reservationFlags.payload.hotel as Record<string, unknown> | null | undefined) ||
      null
    return raw
  }, [flightDraft?.hotel, reservationFlags.payload.hotel])

  const hotelId = String(
    draftHotel?.id || draftHotel?.hotel_id || '',
  ).trim()
  const hotelName = String(draftHotel?.name || 'Mon hôtel')
  const hotelPhoto = String(
    draftHotel?.photo || draftHotel?.main_photo || draftHotel?.image || '',
  ).trim()
  const hotelSeedPhotos = useMemo(() => {
    const raw = draftHotel?.photos
    const urls: string[] = []
    if (Array.isArray(raw)) {
      for (const p of raw) {
        const u =
          typeof p === 'string'
            ? p
            : p && typeof p === 'object' && 'url' in p
              ? String((p as { url?: string }).url || '')
              : ''
        if (u.trim()) urls.push(u.trim())
      }
    }
    if (hotelPhoto && !urls.includes(hotelPhoto)) urls.unshift(hotelPhoto)
    return urls
  }, [draftHotel?.photos, hotelPhoto])
  const showHotelGallery =
    Boolean(reservationFlags.hotelBooked || reservationFlags.hasHotel) &&
    Boolean(hotelId) &&
    hotelId !== 'primary'

  const openReservations = () => {
    if (!reservationToken) return
    navigation.navigate('TripSummary', { draftToken: reservationToken })
  }

  const onPipelineStep = (id: StayStepId) => {
    if (id === 'hotel') {
      // Past incomplete stays stay composable; only booked/external hotel → résumé.
      if (
        reservationFlags.hotelBooked ||
        reservationFlags.externalHotel ||
        workspace?.phase === 'booked'
      ) {
        openReservations()
        return
      }
      if (reservationToken && workspace?.pipeline.hotel !== 'none') {
        navigation.navigate('HotelCompose', { draftToken: reservationToken })
        return
      }
      if (accepted) void addHotelFromTrip(accepted.trip_data, accepted.id)
      else {
        Alert.alert(
          'Hôtel',
          'Choisis d’abord un vol (étape 1), ou tu pourras composer l’hôtel dès qu’un vol est accepté.',
        )
      }
      return
    }
    if (id === 'flight') {
      if (reservationFlags.flightBooked || reservationFlags.externalFlight) {
        openReservations()
        return
      }
      if (accepted) void bookSelectedFlight()
      return
    }
    if (id === 'activities' && plannerActivitiesEnabled) {
      scrollRef.current?.scrollTo({
        y: Math.max(0, extrasOffsetY.current - 16),
        animated: true,
      })
    }
  }

  if (loading && !trip) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top, paddingHorizontal: 24 }]}>
        <ScreenBackground />
        <ActivityIndicator size="large" color={colors.primary} />
        {scanning || autoScan ? (
          <Text style={[styles.errorText, { marginTop: 16, color: colors.ink }]}>
            Scan en cours…
          </Text>
        ) : null}
      </View>
    )
  }

  if (!trip) {
    return (
      <View style={[styles.centered, { padding: 24 }]}>
        <ScreenBackground />
        <Text style={styles.errorText}>{error || 'Voyage introuvable'}</Text>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        scrollEnabled={!gallerySwipeActive}
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: insets.bottom + 40,
          gap: 16,
        }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.primary} />
        }
      >
      <ImageBackground
        source={{ uri: destinationImage }}
        style={[styles.hero, shadow.lift]}
        imageStyle={styles.heroImage}
      >
        <LinearGradient
          colors={['rgba(17,10,7,0.2)', 'rgba(24,13,8,0.92)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroContent}>
          <Text style={styles.kicker}>PROCHAIN DÉPART · {cityLabel.toUpperCase()}</Text>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={2}>
              {trip.name}
            </Text>
            {isOrganizer ? (
              <Pressable
                onPress={startRename}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Renommer"
                style={({ pressed }) => [
                  styles.renameChip,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <PencilIcon size={15} color={colors.white} />
              </Pressable>
            ) : null}
          </View>
          <View style={styles.heroChips}>
            <View style={styles.heroChip}>
              <Text style={styles.heroChipText}>
                {departureRouteLabel(trip.departure_airport)}
                {trip.arrival_airport
                  ? ` → ${trip.arrival_airport.replace(/,/g, ' · ')}`
                  : ' · inspire'}
              </Text>
            </View>
          </View>
          {trip.dates_depart[0] && trip.dates_retour[0] ? (
            <Text style={styles.meta}>
              {formatTripDateRangeFr(
                trip.dates_depart[0].date,
                trip.dates_retour[trip.dates_retour.length - 1].date,
              )}
            </Text>
          ) : null}
        </View>
      </ImageBackground>

      <View style={[styles.pipelineCard, shadow.soft]}>
        <Text style={styles.pipelineTitle}>Ton parcours</Text>
        <Text style={styles.pipelineSub}>
          Vol → Hôtel
          {plannerActivitiesEnabled ? ' → Activités' : ''}
          {plannerActivitiesEnabled ? '.' : '. Activités bientôt.'}
        </Text>
        <StayPipelineStepper steps={pipelineForUi} onStepPress={onPipelineStep} />
        {reservationToken ? (
          <Pressable
            onPress={openReservations}
            style={({ pressed }) => [
              styles.reservationsBtn,
              pressed && { opacity: 0.88 },
            ]}
          >
            <Text style={styles.reservationsBtnText}>Voir les réservations</Text>
          </Pressable>
        ) : null}
      </View>

      {!accepted && !scanning && pending.length === 0 && !scanEmpty ? (
        <View style={[styles.nextStepCardMuted, shadow.soft]}>
          <View style={[styles.nextStepBadge, styles.nextStepBadgeMuted]}>
            <Text style={[styles.nextStepBadgeText, styles.nextStepBadgeTextMuted]}>
              ÉTAPE 1
            </Text>
          </View>
          <Text style={styles.nextStepTitleDark}>Trouver un vol</Text>
          <Text style={styles.nextStepBodyDark}>
            {isOrganizer
              ? 'Scanne les prix dans ton budget, puis accepte une proposition.'
              : 'L’organisateur scanne et choisit le vol pour tout le monde.'}
          </Text>
          {reservationFlags.canSkipFlight && !(__DEV__ && isGuest) ? (
            <Pressable
              onPress={() => void skipFlight()}
              disabled={skippingFlight}
              style={({ pressed }) => [
                styles.flightSkipInCard,
                (skippingFlight || pressed) && { opacity: 0.7 },
              ]}
            >
              <Text style={styles.flightSkipInCardText}>
                {skippingFlight ? '…' : 'J’ai déjà un vol'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {trip.route_ok === false ? (
        <View style={[styles.routeWarn, shadow.soft]}>
          <Text style={styles.routeWarnTitle}>Route plus desservie</Text>
          <Text style={styles.routeWarnBody}>
            Plus de vols vers {(trip.invalid_arrival_codes || []).join(', ')} depuis{' '}
            {departureRouteLabel(trip.departure_airport)}.
          </Text>
          {isOrganizer ? (
            <Pressable
              onPress={() => void clearStaleArrival()}
              style={styles.routeWarnBtn}
            >
              <Text style={styles.routeWarnBtnText}>Passer en inspire</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {isOrganizer && trip.status !== 'locked' ? (
        <>
          <Button
            label={scanning ? 'Scan en cours…' : 'Scanner les prix'}
            onPress={() => void scan()}
            loading={scanning}
            disabled={scanning}
          />
          {/* Price watch / surveillance — masqué pour le moment */}
        </>
      ) : null}

      {reservationFlags.externalFlight && !scanning ? (
        <View style={[styles.skipFlightCard, shadow.soft]}>
          <Text style={styles.skipFlightTitle}>Vol ailleurs</Text>
          <Text style={styles.skipFlightBody}>
            Tu continues sur l’hôtel sans passer par FlightWatcher pour le vol.
          </Text>
          {reservationFlags.externalHotel ? (
            <Text style={styles.skipFlightBody}>Hôtel aussi réservé ailleurs.</Text>
          ) : (
            <>
              <Button
                label={hotelBusy ? 'Ouverture…' : 'Composer l’hôtel'}
                onPress={() => {
                  const token = flightDraft?.draft_token || workspace?.draft_token
                  if (token) navigation.navigate('HotelCompose', { draftToken: token })
                  else void skipFlight()
                }}
                loading={hotelBusy}
                disabled={hotelBusy || skippingHotel}
              />
              {reservationFlags.canSkipHotel ? (
                <Pressable
                  onPress={() => void skipHotel()}
                  disabled={skippingHotel}
                  style={styles.changeFlightBtn}
                >
                  <Text style={styles.changeFlightText}>
                    {skippingHotel ? '…' : 'J’ai déjà un hôtel'}
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      {accepted && !scanning && !reservationFlags.externalFlight ? (
        <View style={styles.section}>
          <MobileBoardingPass
            trip={sanitizeTripAirports(accepted.trip_data)}
            passengers={pax}
            bookingBusy={flightBookingBusy}
            canEditModalities={
              isOrganizer &&
              !reservationFlags.flightBooked &&
              !reservationFlags.hotelBooked
            }
            showModalities={showModalities}
            modalitiesBusy={reopeningFlight || savingCriteria || scanning}
            onToggleModalities={() => setShowModalities((v) => !v)}
            onBook={() => void bookSelectedFlight()}
          />
          {isOrganizer &&
          !reservationFlags.flightBooked &&
          !reservationFlags.hotelBooked &&
          showModalities ? (
            <View style={[styles.modalitiesCard, shadow.soft]}>
              <View style={styles.modalitiesEditor}>
                <Text style={styles.modalitiesLabel}>
                  Budget max · {editBudget} €/pers
                </Text>
                <View style={styles.budgetRow}>
                  <Pressable
                    onPress={() => setEditBudget((v) => Math.max(20, v - 10))}
                    style={styles.budgetBtn}
                  >
                    <Text style={styles.budgetBtnText}>−</Text>
                  </Pressable>
                  <Text style={styles.budgetValue}>{editBudget} €</Text>
                  <Pressable
                    onPress={() => setEditBudget((v) => Math.min(1000, v + 10))}
                    style={styles.budgetBtn}
                  >
                    <Text style={styles.budgetBtnText}>+</Text>
                  </Pressable>
                </View>
                <Button
                  label={
                    savingCriteria || scanning
                      ? 'Scan…'
                      : 'Enregistrer et rescanner'
                  }
                  onPress={() => void updateBudgetAndRescan()}
                  loading={savingCriteria || scanning}
                  disabled={savingCriteria || scanning || reopeningFlight}
                />
                <Pressable
                  onPress={() => void changeFlightChoice()}
                  disabled={reopeningFlight || scanning || savingCriteria}
                  style={styles.changeFlightBtn}
                >
                  <Text style={styles.changeFlightText}>
                    {reopeningFlight ? 'Ouverture…' : 'Choisir un autre vol'}
                  </Text>
                </Pressable>
                {reservationFlags.canSkipFlight ? (
                  <Pressable
                    onPress={() => void skipFlight()}
                    disabled={skippingFlight || scanning || savingCriteria}
                    style={styles.changeFlightBtn}
                  >
                    <Text style={styles.changeFlightText}>
                      {skippingFlight ? 'Ouverture…' : 'J’ai déjà un vol'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
          {reservationFlags.externalHotel ? (
            <View style={[styles.skipFlightCard, shadow.soft]}>
              <Text style={styles.skipFlightTitle}>Hôtel ailleurs</Text>
              <Text style={styles.skipFlightBody}>
                Tu as sauté l’étape hôtel FlightWatcher.
              </Text>
            </View>
          ) : null}
          {!reservationFlags.externalHotel ? (
            showHotelGallery ? (
              <View style={[styles.hotelGalleryCard, shadow.soft]}>
                <HotelPhotoGallery
                  hotelId={hotelId}
                  seedPhoto={hotelPhoto || null}
                  seedPhotos={hotelSeedPhotos}
                  alt={hotelName}
                  hotelName={hotelName}
                  cityLabel={cityLabel}
                  height={220}
                  onHorizontalGesture={setGallerySwipeActive}
                />
                <View style={styles.hotelGalleryActions}>
                  <Pressable
                    onPress={() => {
                      const token =
                        flightDraft?.draft_token || workspace?.draft_token
                      if (reservationFlags.hotelBooked) {
                        navigation.navigate('Bookings')
                        return
                      }
                      if (token) {
                        navigation.navigate('HotelCompose', {
                          draftToken: token,
                        })
                      }
                    }}
                    disabled={hotelBusy || skippingHotel}
                    style={({ pressed }) => [
                      styles.nextStepButton,
                      styles.hotelGalleryCta,
                      (pressed || hotelBusy) && { opacity: 0.88 },
                    ]}
                  >
                    <Text style={styles.nextStepButtonText}>
                      {hotelBusy ? 'Ouverture…' : 'Voir mon hôtel →'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={[styles.nextStepCard, shadow.soft]}>
                <ImageBackground
                  source={{
                    uri: hotelPhoto || destinationImage,
                  }}
                  style={styles.nextStepImage}
                  imageStyle={styles.nextStepImageRadius}
                >
                  <LinearGradient
                    colors={['rgba(31,16,9,0.15)', 'rgba(31,16,9,0.94)']}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.nextStepContent}>
                    <View style={styles.nextStepBadge}>
                      <Text style={styles.nextStepBadgeText}>
                        {reservationFlags.hotelBooked || reservationFlags.hasHotel
                          ? 'HÔTEL'
                          : 'PROCHAINE ÉTAPE'}
                      </Text>
                    </View>
                    <Text style={styles.nextStepTitle}>
                      {reservationFlags.hotelBooked || reservationFlags.hasHotel
                        ? hotelName
                        : 'Choisir mon hôtel'}
                    </Text>
                    <Text style={styles.nextStepBody}>
                      {reservationFlags.hotelBooked || reservationFlags.hasHotel
                        ? `Séjour à ${cityLabel}.`
                        : `Photos, avis et prix réels pour séjourner à ${cityLabel}.`}
                    </Text>
                    <Pressable
                      onPress={() => {
                        const token =
                          flightDraft?.draft_token || workspace?.draft_token
                        if (reservationFlags.hotelBooked) {
                          navigation.navigate('Bookings')
                          return
                        }
                        if (reservationFlags.hasHotel && token) {
                          navigation.navigate('HotelCompose', {
                            draftToken: token,
                          })
                          return
                        }
                        void addHotelFromTrip(accepted.trip_data, accepted.id)
                      }}
                      disabled={hotelBusy || skippingHotel}
                      style={({ pressed }) => [
                        styles.nextStepButton,
                        (pressed || hotelBusy) && { opacity: 0.88 },
                      ]}
                    >
                      <Text style={styles.nextStepButtonText}>
                        {hotelBusy
                          ? 'Ouverture…'
                          : reservationFlags.hotelBooked ||
                              reservationFlags.hasHotel
                            ? 'Voir mon hôtel →'
                            : 'Choisir mon hôtel →'}
                      </Text>
                    </Pressable>
                    {reservationFlags.canSkipHotel ? (
                      <Pressable
                        onPress={() => void skipHotel()}
                        disabled={skippingHotel || hotelBusy}
                        style={({ pressed }) => [
                          styles.hotelSkipInCard,
                          (skippingHotel || pressed) && { opacity: 0.7 },
                        ]}
                      >
                        <Text style={styles.hotelSkipInCardText}>
                          {skippingHotel ? '…' : 'J’ai déjà un hôtel'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </ImageBackground>
              </View>
            )
          ) : null}
          {!isOrganizer ? (
            <Text style={styles.roleHint}>
              Tu peux réserver ton vol et composer ton hôtel pour toi. Seul
              l’organisateur décide pour tout le monde.
            </Text>
          ) : null}
        </View>
      ) : null}

      {!scanning && plannerActivitiesEnabled ? (
        <View
          ref={extrasRef}
          style={styles.section}
          onLayout={(e) => {
            extrasOffsetY.current = e.nativeEvent.layout.y
          }}
        >
          <View style={[styles.extrasCard, shadow.soft]}>
            <ImageBackground
              source={{ uri: destinationImage }}
              style={styles.extrasHero}
              imageStyle={styles.extrasHeroImage}
            >
              <LinearGradient
                colors={['rgba(14,24,40,0.2)', 'rgba(14,24,40,0.92)']}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.extrasIcon}>🎟️</Text>
              <Text style={styles.extrasKicker}>À VIVRE SUR PLACE</Text>
              <Text style={styles.extrasTitle}>Activités à {cityLabel}</Text>
            </ImageBackground>
            <View style={styles.extrasBody}>
              <ActivityStepPanel
                draftToken={
                  __DEV__ && isGuest
                    ? null
                    : flightDraft?.draft_token || workspace?.draft_token
                }
                plannedTripId={tripId}
                citySlug={citySlug}
                enabled={plannerActivitiesEnabled}
                surface="planner"
                onItemsChange={setActivityItems}
              />
            </View>
          </View>
        </View>
      ) : null}

      <TravelersSection
        members={trip.members || []}
        seats={trip.passengers}
        currentUserId={viewUser?.id}
        isOrganizer={!!isOrganizer}
        busy={membersBusy}
        inviteToken={trip.invite_token}
        tripName={trip.name}
        onAdd={addMember}
        onRemove={removeMember}
      />

      {scanning ? (
        <View style={[styles.empty, shadow.soft]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.emptyTitle, { marginTop: 12 }]}>Scan en cours…</Text>
          <Text style={styles.emptyBody}>
            {departureRouteLabel(trip.departure_airport)}
            {trip.arrival_airport
              ? ` → ${trip.arrival_airport.replace(/,/g, ' · ')}`
              : ' → inspire'}
          </Text>
        </View>
      ) : null}

      {!scanning && pending.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1 · Choisir un vol ({pending.length})</Text>
          {pending.map((p) => (
            <ProposalBlock
              key={p.id}
              proposal={p}
              passengers={trip.passengers}
              isOrganizer={isOrganizer}
              busy={acting === p.id}
              onAccept={() => void accept(p.id)}
              onReject={() => void reject(p.id)}
            />
          ))}
          {reservationFlags.canSkipFlight && !(__DEV__ && isGuest) ? (
            <Pressable
              onPress={() => void skipFlight()}
              disabled={skippingFlight}
              style={styles.changeFlightBtn}
            >
              <Text style={styles.changeFlightText}>
                {skippingFlight ? 'Ouverture…' : 'J’ai déjà un vol'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {!accepted && pending.length === 0 && !scanning ? (
        scanEmpty ? (
          <View
            style={[
              styles.empty,
              shadow.soft,
              scanEmpty.reason === 'budget' && styles.emptyBudget,
            ]}
          >
            <Text style={styles.emptyTitle}>
              {scanEmpty.reason === 'budget'
                ? `Rien sous ${scanEmpty.budget} €/pers`
                : 'Aucun vol trouvé'}
            </Text>
            <Text style={styles.emptyBody}>
              {scanEmpty.reason === 'budget'
                ? scanEmpty.cheapest
                  ? `Le moins cher vu : ~${Math.ceil(scanEmpty.cheapest)} €/pers. Monte un peu le budget et relance.`
                  : 'Élargis le budget ou les dates, puis relance le scan.'
                : isOrganizer
                  ? 'Essaie d’autres dates ou un budget plus large.'
                  : 'L’organisateur n’a pas encore trouvé de vol.'}
            </Text>
            {isOrganizer && scanEmpty.reason === 'budget' ? (
              <View style={styles.budgetEdit}>
                <Text style={styles.budgetLabel}>
                  Nouveau budget : {Math.round(editBudget)} €/pers
                </Text>
                <View style={styles.budgetRow}>
                  {[
                    Math.max(scanEmpty.budget + 20, 80),
                    scanEmpty.cheapest
                      ? Math.ceil(scanEmpty.cheapest / 10) * 10
                      : scanEmpty.budget + 50,
                    scanEmpty.budget + 100,
                  ]
                    .filter((v, i, a) => a.indexOf(v) === i && v > scanEmpty.budget)
                    .slice(0, 3)
                    .map((v) => (
                      <Pressable
                        key={v}
                        onPress={() => setEditBudget(v)}
                        style={[
                          styles.budgetChip,
                          editBudget === v && styles.budgetChipOn,
                        ]}
                      >
                        <Text
                          style={[
                            styles.budgetChipText,
                            editBudget === v && styles.budgetChipTextOn,
                          ]}
                        >
                          {v} €
                        </Text>
                      </Pressable>
                    ))}
                </View>
                <Button
                  label={savingCriteria ? '…' : 'Mettre à jour et rescanner'}
                  onPress={() => void bumpBudgetAndScan()}
                  loading={savingCriteria}
                  disabled={savingCriteria}
                />
              </View>
            ) : isOrganizer ? (
              <Button label="Relancer le scan" onPress={() => void scan()} />
            ) : null}
            {reservationFlags.canSkipFlight && !(__DEV__ && isGuest) ? (
              <Pressable
                onPress={() => void skipFlight()}
                disabled={skippingFlight}
                style={({ pressed }) => [
                  styles.flightSkipInCard,
                  (skippingFlight || pressed) && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.flightSkipInCardText}>
                  {skippingFlight ? '…' : 'J’ai déjà un vol'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null
      ) : null}

      {others.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionMuted}>Refusées ({others.length})</Text>
        </View>
      ) : null}

      {isOrganizer ? (
        <Pressable
          onPress={confirmDelete}
          disabled={deleting}
          style={[styles.deleteBtn, deleting && { opacity: 0.5 }]}
        >
          {deleting ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <Text style={styles.deleteText}>
              {reservationFlags.hasInternalReservations
                ? 'Archiver le voyage'
                : 'Supprimer le voyage'}
            </Text>
          )}
        </Pressable>
      ) : null}
    </ScrollView>

      <Modal
        visible={editingName}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!savingName) setEditingName(false)
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.renameOverlay}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!savingName) setEditingName(false)
            }}
          />
          <View style={[styles.renameSheet, shadow.lift]}>
            <Text style={styles.renameTitle}>Nom du voyage</Text>
            <TextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              autoFocus
              maxLength={80}
              editable={!savingName}
              placeholder="Ex. Weekend Madrid"
              placeholderTextColor={colors.faint}
              style={styles.renameInput}
              returnKeyType="done"
              onSubmitEditing={() => void saveRename()}
            />
            <View style={styles.renameActions}>
              <Pressable
                onPress={() => setEditingName(false)}
                disabled={savingName}
                style={styles.renameCancel}
              >
                <Text style={styles.renameCancelText}>Annuler</Text>
              </Pressable>
              <Pressable
                onPress={() => void saveRename()}
                disabled={savingName}
                style={({ pressed }) => [
                  styles.renameSave,
                  (savingName || pressed) && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.renameSaveText}>
                  {savingName ? '…' : 'Enregistrer'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

function PriceWatchBanner({
  enabled,
  budget,
  intervalSeconds,
  watchInterval,
  busy,
  onIntervalChange,
  onToggle,
}: {
  enabled: boolean
  budget: number
  intervalSeconds: number
  watchInterval: number
  busy: boolean
  onIntervalChange: (n: number) => void
  onToggle: () => void
}) {
  if (enabled) {
    return (
      <View style={[styles.watchActive, shadow.soft]}>
        <View style={styles.watchLiveRow}>
          <View style={styles.watchLiveDot} />
          <Text style={styles.watchActiveKicker}>Surveillance en cours</Text>
        </View>
        <Text style={styles.watchActiveBody}>
          On guette les vols sous {budget}€/pers et on prévient tout le monde à la moindre
          bonne affaire.
        </Text>
        <Text style={styles.watchMeta}>
          Vérification toutes les {Math.floor((intervalSeconds || 3600) / 60)} min
        </Text>
        <Button
          label="Arrêter la surveillance"
          onPress={onToggle}
          loading={busy}
          disabled={busy}
          variant="secondary"
        />
      </View>
    )
  }

  return (
    <LinearGradient
      colors={['#FFF1E8', '#FFFFFF', '#FFE8DC']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.watchSell, shadow.soft]}
    >
      <Text style={styles.watchKicker}>Astuce voyage</Text>
      <Text style={styles.watchTitle}>Les prix baissent — on vous prévient</Text>
      <Text style={styles.watchHint}>
        Activez la surveillance : on scanne vos dates en continu et on prévient tout le
        monde dès qu’un vol passe sous {budget}€/pers.
      </Text>
      {(
        [
          'Scan automatique, même quand l’app est fermée',
          'Alerte email à tout le monde',
          'Uniquement si le prix bat votre budget',
        ] as const
      ).map((line) => (
        <View key={line} style={styles.watchBenefit}>
          <View style={styles.watchCheck}>
            <Text style={styles.watchCheckText}>✓</Text>
          </View>
          <Text style={styles.watchBenefitText}>{line}</Text>
        </View>
      ))}
      <Text style={styles.watchIntervalLabel}>Fréquence</Text>
      <View style={styles.intervalRow}>
        {(
          [
            [900, '15 min'],
            [3600, '1 h'],
            [21600, '6 h'],
            [86400, '24 h'],
          ] as const
        ).map(([sec, label]) => (
          <Pressable
            key={sec}
            onPress={() => onIntervalChange(sec)}
            style={[
              styles.intervalChip,
              watchInterval === sec && styles.intervalChipOn,
            ]}
          >
            <Text
              style={[
                styles.intervalChipText,
                watchInterval === sec && styles.intervalChipTextOn,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Button
        label="Activer la surveillance"
        onPress={onToggle}
        loading={busy}
        disabled={busy}
      />
    </LinearGradient>
  )
}

const MODALITIES_TIP =
  'Tant que le vol n’est pas réservé, tu peux changer budget, dates ou relancer un scan.'

function MobileBoardingPass({
  trip,
  passengers,
  bookingBusy,
  canEditModalities,
  showModalities,
  modalitiesBusy,
  onToggleModalities,
  onBook,
}: {
  trip: EnrichedTripResponse
  passengers: number
  bookingBusy?: boolean
  canEditModalities?: boolean
  showModalities?: boolean
  modalitiesBusy?: boolean
  onToggleModalities?: () => void
  onBook: () => void
}) {
  const safe = sanitizeTripAirports(trip)
  const originCode = primaryAirportCode(safe.aller.origin)
  const destCode = primaryAirportCode(
    safe.aller.destination || safe.destination_code,
  )
  const destination = cityDisplayNameFr(destCode, safe.aller.destinationFull)
  const image = resolveTripImageUrl({
    city: destination,
    iata: destCode || null,
    imageUrl: safe.image_url,
  })
  const formatTicketDate = (value: string) =>
    new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    })
      .format(new Date(value))
      .replace('.', '')
  const formatTicketTime = (value: string) =>
    new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))

  return (
    <View style={[styles.ticket, shadow.lift]}>
      <ImageBackground
        source={{ uri: image }}
        style={styles.ticketHero}
        imageStyle={styles.ticketHeroImage}
      >
        <LinearGradient
          colors={['rgba(10,17,29,0.45)', 'rgba(10,17,29,0.96)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.ticketTop}>
          <View>
            <Text style={styles.ticketKicker}>CARTE D’EMBARQUEMENT</Text>
            <Text style={styles.ticketAirline}>{formatAirlineLabel(safe)}</Text>
          </View>
          <View style={styles.ticketChosen}>
            <Text style={styles.ticketChosenText}>VOL CHOISI</Text>
          </View>
        </View>

        <View style={styles.ticketRoute}>
          <View>
            <Text style={styles.ticketCode}>{originCode || '—'}</Text>
            <Text style={styles.ticketCity} numberOfLines={1}>
              {cityDisplayNameFr(originCode, safe.aller.originFull)}
            </Text>
          </View>
          <View style={styles.ticketFlightLine}>
            <View style={styles.ticketDash} />
            <Text style={styles.ticketPlane}>✈</Text>
            <View style={styles.ticketDash} />
          </View>
          <View style={styles.ticketDestination}>
            <Text style={[styles.ticketCode, styles.ticketCodeAccent]}>
              {destCode || '—'}
            </Text>
            <Text style={styles.ticketCity} numberOfLines={1}>
              {destination}
            </Text>
          </View>
        </View>
      </ImageBackground>

      <View style={styles.ticketDetails}>
        {[
          { label: 'ALLER', flight: safe.aller },
          { label: 'RETOUR', flight: safe.retour },
        ].map(({ label, flight }) => (
          <View key={label} style={styles.ticketLeg}>
            <Text style={styles.ticketLegLabel}>{label}</Text>
            <Text style={styles.ticketLegDate}>
              {formatTicketDate(String(flight.departureTime || ''))}
            </Text>
            <View style={styles.ticketLegBottom}>
              <Text style={styles.ticketLegTime}>
                {formatTicketTime(String(flight.departureTime || ''))}
              </Text>
              <Text style={styles.ticketFlightNumber}>
                {String(flight.flightNumber || '—')}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.ticketStub}>
        <View style={styles.ticketPriceBlock}>
          <Text style={styles.ticketPriceLabel}>PRIX PAR PERSONNE</Text>
          <Text style={styles.ticketPrice}>{Math.round(Number(safe.prix_total) || 0)}€</Text>
          <Text style={styles.ticketPassengers}>
            {passengers === 1 ? '1 personne' : `${passengers} personnes`}
          </Text>
        </View>
        <View style={styles.ticketActions}>
          <Pressable
            onPress={onBook}
            disabled={bookingBusy}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Réserver le vol"
            style={({ pressed }) => [
              styles.ticketBook,
              (bookingBusy || pressed) && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.ticketBookText}>
              {bookingBusy ? 'Ouverture…' : 'Réserver'}
            </Text>
          </Pressable>
          {canEditModalities ? (
            <>
              <Pressable
                onPress={onToggleModalities}
                disabled={modalitiesBusy}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={
                  showModalities ? 'Fermer les modalités' : 'Modifier les modalités'
                }
                style={({ pressed }) => [
                  styles.ticketModifyBtn,
                  (modalitiesBusy || pressed) && { opacity: 0.55 },
                ]}
              >
                {showModalities ? (
                  <Text style={styles.ticketModifyClose}>×</Text>
                ) : (
                  <PencilIcon size={15} color={colors.inkSoft} />
                )}
              </Pressable>
              <Pressable
                onPress={() => Alert.alert('Modalités du vol', MODALITIES_TIP)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={MODALITIES_TIP}
                style={styles.ticketInfoBtn}
              >
                <Text style={styles.ticketInfoText}>i</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    </View>
  )
}

function ProposalBlock({
  proposal,
  passengers,
  isOrganizer,
  busy,
  onAccept,
  onReject,
}: {
  proposal: TripProposal
  passengers: number
  isOrganizer: boolean
  busy: boolean
  onAccept: () => void
  onReject: () => void
}) {
  return (
    <DestinationCard
      trip={proposal.trip_data}
      passengers={passengers}
      showBook={false}
      primaryAction={
        isOrganizer
          ? { label: busy ? '…' : 'Accepter', onPress: onAccept, disabled: busy }
          : undefined
      }
      secondaryAction={
        isOrganizer
          ? { label: 'Refuser', onPress: onReject, disabled: busy }
          : undefined
      }
    />
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
  hero: {
    height: 230,
    borderRadius: 26,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    marginBottom: 2,
  },
  heroImage: { borderRadius: 26 },
  heroContent: { padding: 20, gap: 7 },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: '#FDBA8C',
  },
  nameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  name: {
    flexShrink: 1,
    fontFamily: fonts.extrabold,
    fontSize: 30,
    color: colors.white,
    letterSpacing: -0.8,
  },
  renameChip: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  renameOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(20,12,8,0.45)',
  },
  renameSheet: {
    borderRadius: 20,
    backgroundColor: colors.white,
    padding: 18,
    gap: 12,
  },
  renameTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 17,
    color: colors.ink,
  },
  renameInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.canvas,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  renameCancel: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  renameCancelText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.muted,
  },
  renameSave: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: colors.primary,
  },
  renameSaveText: {
    fontFamily: fonts.extrabold,
    fontSize: 14,
    color: colors.white,
  },
  heroChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  heroChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  heroChipText: { fontFamily: fonts.bold, fontSize: 11, color: colors.white },
  meta: { fontFamily: fonts.medium, fontSize: 12, color: 'rgba(255,255,255,0.74)', lineHeight: 18 },
  pipelineCard: {
    backgroundColor: colors.white,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
  },
  pipelineTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 16,
    color: colors.ink,
    letterSpacing: -0.3,
    paddingHorizontal: 4,
  },
  pipelineSub: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  reservationsBtn: {
    marginTop: 10,
    marginHorizontal: 4,
    marginBottom: 8,
    minHeight: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,107,53,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,107,53,0.28)',
    paddingHorizontal: 14,
  },
  reservationsBtnText: {
    fontFamily: fonts.extrabold,
    fontSize: 14,
    color: '#D94D1B',
  },
  skipFlightCard: {
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: 16,
    gap: 10,
  },
  skipFlightTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 16,
    color: colors.ink,
  },
  skipFlightBody: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  modalitiesCard: {
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: 16,
    gap: 10,
  },
  modalitiesEditor: { gap: 12 },
  modalitiesLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  budgetBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  budgetBtnText: {
    fontFamily: fonts.extrabold,
    fontSize: 20,
    color: colors.primaryDeep,
  },
  budgetValue: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    color: colors.ink,
  },
  changeFlightBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  changeFlightText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.ink,
  },
  nextStepCard: {
    backgroundColor: '#21140D',
    borderRadius: 24,
    overflow: 'hidden',
  },
  hotelGalleryCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    overflow: 'hidden',
  },
  hotelGalleryActions: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  hotelGalleryCta: {
    alignSelf: 'flex-start',
  },
  nextStepImage: {
    minHeight: 210,
    justifyContent: 'flex-end',
    borderRadius: 24,
    overflow: 'hidden',
  },
  nextStepImageRadius: { borderRadius: 24 },
  nextStepContent: { padding: 18, gap: 6 },
  hotelSkipInCard: {
    alignSelf: 'flex-start',
    marginTop: 2,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  hotelSkipInCardText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.white,
  },
  flightSkipInCard: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.canvas,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  flightSkipInCardText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.inkSoft,
  },
  nextStepIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    marginBottom: 8,
  },
  nextStepIconText: { fontSize: 20 },
  nextStepCardMuted: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 18,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  nextStepBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 2,
  },
  nextStepBadgeMuted: { backgroundColor: colors.primarySoft },
  nextStepBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.white,
  },
  nextStepBadgeTextMuted: { color: colors.primaryInk },
  nextStepTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 20,
    color: colors.white,
    letterSpacing: -0.4,
  },
  nextStepBody: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: 'rgba(255,255,255,0.88)',
    lineHeight: 20,
  },
  nextStepCta: {
    marginTop: 8,
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.white,
  },
  nextStepButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  nextStepButtonText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.primaryDeep,
  },
  nextStepTitleDark: {
    fontFamily: fonts.extrabold,
    fontSize: 20,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  nextStepBodyDark: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  section: { gap: 12 },
  extrasCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFDCC8',
  },
  extrasCardMargin: { marginTop: 12 },
  extrasHero: { height: 138, justifyContent: 'flex-end', padding: 16 },
  extrasHeroImage: { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  extrasIcon: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 40,
    height: 40,
    textAlign: 'center',
    textAlignVertical: 'center',
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.17)',
    fontSize: 19,
  },
  extrasKicker: { fontFamily: fonts.bold, fontSize: 9, letterSpacing: 1.2, color: '#FDBA8C' },
  extrasTitle: { marginTop: 3, fontFamily: fonts.extrabold, fontSize: 20, color: colors.white },
  extrasBody: { padding: 16, gap: 10 },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
  sectionMuted: { fontFamily: fonts.medium, fontSize: 13, color: colors.faint },
  ticket: {
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: colors.white,
  },
  ticketHero: { minHeight: 190, padding: 18, justifyContent: 'space-between' },
  ticketHeroImage: { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  ticketTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  ticketKicker: {
    fontFamily: fonts.bold,
    fontSize: 9,
    letterSpacing: 1.5,
    color: '#FDBA8C',
  },
  ticketAirline: { marginTop: 4, fontFamily: fonts.bold, fontSize: 13, color: colors.white },
  ticketChosen: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: 'rgba(16,185,129,0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(167,243,208,0.35)',
  },
  ticketChosenText: { fontFamily: fonts.bold, fontSize: 8, letterSpacing: 0.8, color: '#D1FAE5' },
  ticketRoute: { flexDirection: 'row', alignItems: 'center', marginTop: 34 },
  ticketCode: { fontFamily: fonts.extrabold, fontSize: 38, letterSpacing: -1.5, color: colors.white },
  ticketCodeAccent: { color: '#FDBA8C', textAlign: 'right' },
  ticketCity: { maxWidth: 84, fontFamily: fonts.medium, fontSize: 10, color: 'rgba(255,255,255,0.62)' },
  ticketDestination: { alignItems: 'flex-end' },
  ticketFlightLine: { flex: 1, flexDirection: 'row', alignItems: 'center', marginHorizontal: 8 },
  ticketDash: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.28)' },
  ticketPlane: { marginHorizontal: 6, fontSize: 18, color: '#FDBA8C' },
  ticketDetails: { flexDirection: 'row', gap: 10, padding: 14, backgroundColor: '#FFFCF8' },
  ticketLeg: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  ticketLegLabel: { fontFamily: fonts.bold, fontSize: 9, letterSpacing: 0.8, color: colors.primaryDeep },
  ticketLegDate: { marginTop: 4, fontFamily: fonts.bold, fontSize: 12, color: colors.ink },
  ticketLegBottom: { marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  ticketLegTime: { fontFamily: fonts.extrabold, fontSize: 18, color: colors.ink },
  ticketFlightNumber: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 9, color: colors.muted },
  ticketStub: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    zIndex: 2,
    elevation: 2,
  },
  ticketPriceBlock: { flexShrink: 1 },
  ticketPriceLabel: { fontFamily: fonts.bold, fontSize: 8, letterSpacing: 1, color: colors.faint },
  ticketPrice: { marginTop: 1, fontFamily: fonts.extrabold, fontSize: 26, color: colors.ink },
  ticketPassengers: { fontFamily: fonts.medium, fontSize: 10, color: colors.muted },
  ticketActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexShrink: 0,
  },
  ticketBook: {
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: '#121826',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    elevation: 3,
  },
  ticketBookText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
  ticketModifyBtn: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
  },
  ticketModifyClose: {
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 24,
    color: colors.inkSoft,
    marginTop: -1,
  },
  ticketInfoBtn: {
    width: 44,
    height: 44,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketInfoText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 14,
  },
  roleHint: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    marginTop: 4,
  },
  empty: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 22,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  emptyBody: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  emptyBudget: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  budgetEdit: { width: '100%', gap: 12, marginTop: 12 },
  budgetLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.inkSoft,
    textAlign: 'center',
  },
  budgetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  budgetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  budgetChipOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  budgetChipText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  budgetChipTextOn: { color: colors.white },
  errorText: { fontFamily: fonts.medium, color: colors.danger, fontSize: 14 },
  routeWarn: {
    backgroundColor: '#FFFBEB',
    borderRadius: 18,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  routeWarnTitle: { fontFamily: fonts.bold, fontSize: 15, color: '#92400E' },
  routeWarnBody: { fontFamily: fonts.regular, fontSize: 13, color: '#78350F', lineHeight: 18 },
  routeWarnBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  routeWarnBtnText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
  deleteBtn: {
    marginTop: 48,
    marginBottom: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.dangerSoft || '#FECACA',
    backgroundColor: colors.dangerSoft || '#FFF0EE',
  },
  deleteText: { fontFamily: fonts.bold, fontSize: 15, color: colors.danger },
  watchSell: {
    borderRadius: 22,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: '#FDBA74',
    overflow: 'hidden',
  },
  watchActive: {
    backgroundColor: '#ECFDF5',
    borderRadius: 22,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  watchLiveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  watchLiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  watchActiveKicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#047857',
  },
  watchActiveBody: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.inkSoft,
    lineHeight: 20,
  },
  watchKicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  watchTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 20,
    color: colors.ink,
    letterSpacing: -0.4,
    lineHeight: 26,
  },
  watchHint: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
    marginBottom: 4,
  },
  watchBenefit: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  watchCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  watchCheckText: { color: colors.white, fontFamily: fonts.bold, fontSize: 11 },
  watchBenefitText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.ink,
    lineHeight: 18,
  },
  watchIntervalLabel: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.ink,
    marginTop: 4,
  },
  watchMeta: { fontFamily: fonts.semibold, fontSize: 12, color: '#047857' },
  intervalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  intervalChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  intervalChipOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  intervalChipText: { fontFamily: fonts.bold, fontSize: 12, color: colors.muted },
  intervalChipTextOn: { color: colors.white },
})
