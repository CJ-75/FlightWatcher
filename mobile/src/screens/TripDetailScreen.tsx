import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Share,
  Alert,
  RefreshControl,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { PlannedTripDetail, TripMember, TripProposal } from '@flightwatcher/shared'
import {
  activityCitySlugFromLabel,
  buildStayPipeline,
  cityDisplayNameFr,
  formatDateFr,
  parseAirportCodes,
  type AddTripMemberRequest,
  type EnrichedTripResponse,
  type StayStepId,
} from '@flightwatcher/shared'
import { ActivityStepPanel } from '../components/ActivityStepPanel'
import { RestaurantStepPanel } from '../components/RestaurantStepPanel'
import { getApi, plannerInviteUrl } from '../lib/client'
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
} from '../dev/guestPreview'
import { DestinationCard } from '../components/DestinationCard'
import { StayPipelineStepper } from '../components/StayPipelineStepper'
import { TravelersSection } from '../components/TravelersSection'
import { Button } from '../components/ui/Button'
import { createMyTripComposeFromTrip, preparePartnerBook } from '../lib/partnerBook'
import { openInAppBrowser } from '../lib/openInApp'
import { rememberTrip } from '../lib/tripRecovery'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, shadow, spacing } from '../theme'

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
  const [scanEmpty, setScanEmpty] = useState<{
    reason: 'budget' | 'no_flights'
    budget: number
    cheapest?: number | null
  } | null>(null)
  const [editBudget, setEditBudget] = useState(150)
  const [savingCriteria, setSavingCriteria] = useState(false)
  const [plannerActivitiesEnabled, setPlannerActivitiesEnabled] = useState(false)
  const [plannerRestaurantsEnabled, setPlannerRestaurantsEnabled] = useState(false)
  const extrasRef = useRef<View>(null)

  useEffect(() => {
    void getApi()
      .getConfig()
      .then((cfg) => {
        setPlannerActivitiesEnabled(cfg.planner_activities_enabled === true)
        setPlannerRestaurantsEnabled(cfg.planner_restaurants_enabled === true)
      })
      .catch(() => undefined)
  }, [])

  const load = useCallback(async () => {
    setError(null)
    try {
      const detail =
        __DEV__ && isGuest ? getGuestTrip(tripId) : await getApi().getPlannedTrip(tripId)
      if (!detail) throw new Error('Voyage introuvable')
      setTrip(detail)
      setWatchInterval(Math.max(900, detail.auto_scan_interval_seconds || 3600))
      navigation.setOptions({ title: detail.name || 'Voyage' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible')
      setTrip(null)
    } finally {
      setLoading(false)
    }
  }, [tripId, navigation, isGuest])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      void load()
    }, [load]),
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
        const scanRes = await getApi().scanPlannedTrip(tripId)
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
        void load()
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
        await load()
      }
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Acceptation échouée')
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

  const shareInvite = async () => {
    if (!trip) return
    const url = plannerInviteUrl(trip.invite_token)
    const appLink = `flightwatcher://planner/invite/${trip.invite_token}`
    try {
      await Share.share({
        message: `Rejoins mon voyage « ${trip.name} » sur FlightWatcher :\n${url}\n\nSi tu as l’app : ${appLink}`,
        url,
      })
    } catch {
      /* cancelled */
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

  const addHotelFromTrip = async (tripData: EnrichedTripResponse) => {
    if (!trip) return
    if (hotelBusy) return
    setHotelBusy(true)
    try {
      const pax = Math.max(trip.passengers || 1, (trip.members || []).length || 1)
      const draft = await createMyTripComposeFromTrip({
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

  const confirmDelete = () => {
    if (!trip) return
    Alert.alert(
      'Supprimer le voyage',
      `Supprimer « ${trip.name} » ? Cette action est définitive.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => void doDelete(),
        },
      ],
    )
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
  const cityLabel = arrivalCode
    ? cityDisplayNameFr(arrivalCode)
    : trip?.name?.replace(/^Weekend\s+/i, '') || 'ta ville'
  const citySlug = activityCitySlugFromLabel(cityLabel)
  const dateIso = trip?.dates_depart?.[0]?.date || null

  const pipelineForUi = useMemo(() => {
    if (!accepted) {
      return buildStayPipeline({
        flight: 'none',
        hotel: 'none',
        focus: 'flight',
        activitiesEnabled: plannerActivitiesEnabled,
        restaurantsEnabled: plannerRestaurantsEnabled,
      })
    }
    return buildStayPipeline({
      flight: 'selected_fw',
      hotel: 'none',
      focus: 'hotel',
      activitiesEnabled: plannerActivitiesEnabled,
      restaurantsEnabled: plannerRestaurantsEnabled,
    })
  }, [accepted, plannerActivitiesEnabled, plannerRestaurantsEnabled])

  const onPipelineStep = (id: StayStepId) => {
    if (id === 'hotel') {
      if (accepted) void addHotelFromTrip(accepted.trip_data)
      else {
        Alert.alert(
          'Hôtel',
          'Choisis d’abord un vol (étape 1), ou tu pourras composer l’hôtel dès qu’un vol est accepté.',
        )
      }
      return
    }
    if (id === 'flight' && accepted) {
      void preparePartnerBook({
        trip: accepted.trip_data,
        passengers: pax,
      }).then((ps) => {
        openInAppBrowser(navigation, ps.primaryUrl, 'Réserver le vol')
      })
      return
    }
    if (
      (id === 'activities' && plannerActivitiesEnabled) ||
      (id === 'restaurants' && plannerRestaurantsEnabled)
    ) {
      Alert.alert(
        id === 'activities' ? 'Activités' : 'Adresses',
        'Plus bas sur cette fiche : ajoute tes idées (liens Maps / Instagram).',
      )
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
        style={styles.scroll}
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: insets.bottom + 40,
          gap: 16,
        }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.primary} />
        }
      >
      <View style={styles.hero}>
        <Text style={styles.kicker}>MON SÉJOUR</Text>
        <Text style={styles.name}>{trip.name}</Text>
        <Text style={styles.meta}>
          {departureRouteLabel(trip.departure_airport)}
          {trip.arrival_airport
            ? ` → ${trip.arrival_airport.replace(/,/g, ' · ')}`
            : ' · inspire'}
          {trip.direct ? ' · directs' : ''}
          {' · '}
          max {trip.budget_max}€/pers
        </Text>
        {trip.dates_depart[0] && trip.dates_retour[0] ? (
          <Text style={styles.meta}>
            {formatDateFr(trip.dates_depart[0].date)} →{' '}
            {formatDateFr(trip.dates_retour[trip.dates_retour.length - 1].date)}
          </Text>
        ) : null}
      </View>

      <View style={[styles.pipelineCard, shadow.soft]}>
        <Text style={styles.pipelineTitle}>Ton parcours</Text>
        <Text style={styles.pipelineSub}>
          Vol → Hôtel
          {plannerActivitiesEnabled ? ' → Activités' : ''}
          {plannerRestaurantsEnabled ? ' → Adresses' : ''}
          {!plannerActivitiesEnabled && !plannerRestaurantsEnabled
            ? '. Activités & adresses bientôt.'
            : '.'}
        </Text>
        <StayPipelineStepper steps={pipelineForUi} onStepPress={onPipelineStep} />
      </View>

      {/* Next-step callout — makes hotel link obvious */}
      {accepted && !scanning ? (
        <Pressable
          onPress={() => void addHotelFromTrip(accepted.trip_data)}
          disabled={hotelBusy}
          style={({ pressed }) => [
            styles.nextStepCard,
            shadow.soft,
            pressed && { opacity: 0.94 },
            hotelBusy && { opacity: 0.6 },
          ]}
        >
          <View style={styles.nextStepBadge}>
            <Text style={styles.nextStepBadgeText}>ÉTAPE 2</Text>
          </View>
          <Text style={styles.nextStepTitle}>Composer ton hôtel</Text>
          <Text style={styles.nextStepBody}>
            Vol choisi. Continue ton séjour : photos, avis, prix réels, paiement
            sécurisé.
          </Text>
          <Text style={styles.nextStepCta}>
            {hotelBusy ? 'Ouverture…' : 'Voir les hôtels →'}
          </Text>
        </Pressable>
      ) : !scanning && pending.length === 0 && !scanEmpty ? (
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
              : 'L’organisateur scanne et choisit le vol pour le groupe.'}
          </Text>
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

      {accepted && !scanning ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1 · Vol choisi</Text>
          <DestinationCard
            trip={accepted.trip_data}
            passengers={pax}
            addHotelBusy={hotelBusy}
            onBook={() => {
              void preparePartnerBook({
                trip: accepted.trip_data,
                passengers: pax,
              }).then((ps) => {
                openInAppBrowser(navigation, ps.primaryUrl, 'Réserver le vol')
              })
            }}
            onAddHotel={() => void addHotelFromTrip(accepted.trip_data)}
          />
          {!isOrganizer ? (
            <Text style={styles.roleHint}>
              Tu peux réserver ton vol et composer ton hôtel pour toi. Seul
              l’organisateur décide pour le groupe.
            </Text>
          ) : null}
        </View>
      ) : null}

      {!scanning && (plannerActivitiesEnabled || plannerRestaurantsEnabled) ? (
        <View ref={extrasRef} style={styles.section}>
          {plannerActivitiesEnabled ? (
            <View style={[styles.extrasCard, shadow.soft]}>
              <Text style={styles.sectionTitle}>Activités</Text>
              <ActivityStepPanel
                plannedTripId={tripId}
                citySlug={citySlug}
                enabled={plannerActivitiesEnabled}
                surface="planner"
              />
            </View>
          ) : null}
          {plannerRestaurantsEnabled ? (
            <View style={[styles.extrasCard, shadow.soft, { marginTop: 12 }]}>
              <Text style={styles.sectionTitle}>④ Adresses</Text>
              <Text style={styles.roleHint}>
                Colle tes liens Maps / Instagram — même avant le vol.
              </Text>
              <RestaurantStepPanel
                plannedTripId={tripId}
                citySlug={citySlug}
                cityLabel={cityLabel}
                dateIso={dateIso}
                enabled={plannerRestaurantsEnabled}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      <TravelersSection
        members={trip.members || []}
        seats={trip.passengers}
        currentUserId={viewUser?.id}
        isOrganizer={!!isOrganizer}
        busy={membersBusy}
        onAdd={addMember}
        onRemove={removeMember}
      />

      {isOrganizer && !scanning ? (
        <Pressable
          onPress={() => void shareInvite()}
          style={[styles.shareEarly, shadow.soft]}
        >
          <Text style={styles.shareEarlyTitle}>Inviter des amis</Text>
          <Text style={styles.shareEarlyBody}>
            Ils voient le parcours. Toi tu décides du vol — chacun peut ensuite
            composer son hôtel.
          </Text>
        </Pressable>
      ) : null}

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
          </View>
        ) : (
          <View style={[styles.empty, shadow.soft]}>
            <Text style={styles.emptyTitle}>Pas encore de propositions</Text>
            <Text style={styles.emptyBody}>
              {isOrganizer
                ? 'Lance un scan pour trouver des vols dans ton budget.'
                : 'L’organisateur n’a pas encore scanné de vols.'}
            </Text>
          </View>
        )
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
            <Text style={styles.deleteText}>Supprimer le voyage</Text>
          )}
        </Pressable>
      ) : null}
    </ScrollView>

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
          On guette les vols sous {budget}€/pers et on prévient le groupe à la moindre
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
        Activez la surveillance : on scanne vos dates en continu et on email tout le
        groupe dès qu’un vol passe sous {budget}€/pers.
      </Text>
      {(
        [
          'Scan automatique, même quand l’app est fermée',
          'Alerte email à tous les voyageurs',
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
  hero: { gap: 6, marginBottom: 4 },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.primary,
  },
  name: {
    fontFamily: fonts.extrabold,
    fontSize: 28,
    color: colors.ink,
    letterSpacing: -0.8,
  },
  meta: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted, lineHeight: 20 },
  pipelineCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  pipelineTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 16,
    color: colors.ink,
    letterSpacing: -0.3,
    paddingHorizontal: 4,
  },
  pipelineSub: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  nextStepCard: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    padding: 18,
    gap: 6,
  },
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
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FFDCC8',
    gap: 10,
  },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
  sectionMuted: { fontFamily: fonts.medium, fontSize: 13, color: colors.faint },
  roleHint: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    marginTop: 4,
  },
  shareEarly: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 16,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  shareEarlyTitle: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  shareEarlyBody: { fontFamily: fonts.regular, fontSize: 13, color: colors.muted, lineHeight: 18 },
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
