import React, { useCallback, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Airport, PlannedTrip, TravelWorkspace } from '@flightwatcher/shared'
import {
  cityDisplayNameFr,
  destinationsToAirports,
  encodeAirportCodes,
  encodeArrivalCodes,
  formatTripDateRangeFr,
  generateDatesFromPreset,
  normalizeDestinations,
  parseAirportCodes,
  PARTY_MODE_OPTIONS,
  partyModeCreateHintFr,
  partyModeDefaultPassengers,
  partyModeKickerFr,
  partyModeMaxPassengers,
  partyModeMinPassengers,
  translate,
  type DatePresetId,
  type FlexibleDates,
  type PartyMode,
} from '@flightwatcher/shared'
import { peekCachedAirports, subscribeAirports } from '../lib/airportsCache'
import { getApi } from '../lib/client'
import { useAuth } from '../context/AuthContext'
import { addGuestTrip, listGuestTrips } from '../dev/guestPreview'
import { CityAirportPicker } from '../components/CityAirportPicker'
import { CityPicker } from '../components/CityPicker'
import { BudgetSlider } from '../components/BudgetSlider'
import { PassengerStepper } from '../components/PassengerStepper'
import { FlexibleDatesModal } from '../components/FlexibleDatesModal'
import { Button } from '../components/ui/Button'
import { GuestAuthLanding } from '../components/GuestAuthLanding'
import { ScreenBackground } from '../components/ScreenBackground'
import { JourneyCard, type JourneyDensity } from '../components/JourneyCard'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, shadow, spacing } from '../theme'

const PRESETS: { id: DatePresetId; label: string }[] = [
  { id: 'next-weekend', label: 'Weekend prochain' },
  { id: 'flexible', label: 'Dates libres' },
]

const TRIPS_STALE_MS = 60_000
type HubFilter = 'organize' | 'upcoming' | 'past'

const HUB_TABS: { key: HubFilter; label: string }[] = [
  { key: 'upcoming', label: 'À venir' },
  { key: 'organize', label: 'En cours' },
  { key: 'past', label: 'Passés' },
]

const HUB_EMPTY: Record<
  HubFilter,
  { title: string; body: string; cta?: string }
> = {
  upcoming: {
    title: 'Aucun voyage à venir',
    body: 'Dès qu’un vol est choisi ou que le séjour est composé, le voyage apparaît ici.',
  },
  organize: {
    title: 'Rien en cours',
    body: 'Ici : les voyages encore à construire. Crée un voyage, scanne les prix, puis invite tes proches.',
    cta: 'Créer un voyage',
  },
  past: {
    title: 'Aucun voyage passé',
    body: 'Les séjours terminés restent ici, pour les retrouver facilement.',
  },
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

export function PlannerScreen() {
  const insets = useSafeAreaInsets()
  const { viewUser, isGuest } = useAuth()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const [workspaces, setWorkspaces] = useState<TravelWorkspace[]>([])
  const [filter, setFilter] = useState<HubFilter>('upcoming')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const lastFetchAtRef = useRef(0)
  const workspacesLenRef = useRef(0)
  workspacesLenRef.current = workspaces.length

  const load = useCallback(
    async (opts?: { refresh?: boolean; force?: boolean }) => {
      const isRefresh = Boolean(opts?.refresh)
      const force = Boolean(opts?.force)
      if (!viewUser) {
        setWorkspaces([])
        setLoading(false)
        setRefreshing(false)
        return
      }
      if (
        !force &&
        !isRefresh &&
        lastFetchAtRef.current > 0 &&
        Date.now() - lastFetchAtRef.current < TRIPS_STALE_MS
      ) {
        return
      }
      if (isRefresh) setRefreshing(true)
      else if (workspacesLenRef.current === 0) setLoading(true)
      setError(null)
      try {
        const uid = viewUser?.id || null
        if (__DEV__ && isGuest) {
          setWorkspaces(listGuestTrips().map((t) => tripAsWorkspace(t, uid)))
        } else {
          try {
            const list = await getApi().listTravelWorkspaces()
            // Planned trips + séjours with hôtel sélectionné / résa entamée.
            setWorkspaces(
              (Array.isArray(list) ? list : []).filter((w) => {
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
              }),
            )
          } catch {
            const legacy = await getApi().listPlannedTrips()
            setWorkspaces(
              (Array.isArray(legacy) ? legacy : []).map((t) =>
                tripAsWorkspace(t, uid),
              ),
            )
          }
        }
        lastFetchAtRef.current = Date.now()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Impossible de charger les voyages')
        if (workspacesLenRef.current === 0) setWorkspaces([])
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [viewUser, isGuest],
  )

  useFocusEffect(
    useCallback(() => {
      // Always re-sync phase / pipeline (vol·hôtel réservés) when coming back
      // from TripDetail / séjour — ignore the 60s stale window.
      void load({ force: true })
    }, [load]),
  )

  const counts = useMemo(
    () => ({
      organize: workspaces.filter((w) => w.phase === 'planning').length,
      upcoming: workspaces.filter((w) => w.phase !== 'planning' && w.phase !== 'past').length,
      past: workspaces.filter((w) => w.phase === 'past').length,
    }),
    [workspaces],
  )
  const filteredWorkspaces = useMemo(
    () =>
      workspaces.filter((workspace) =>
        filter === 'organize'
          ? workspace.phase === 'planning'
          : filter === 'upcoming'
            ? workspace.phase !== 'planning' && workspace.phase !== 'past'
            : workspace.phase === 'past',
      ),
    [filter, workspaces],
  )

  // Pick a useful default once — never yank the user off an empty tab they chose.
  const didInitFilter = useRef(false)
  React.useEffect(() => {
    if (didInitFilter.current || !workspaces.length) return
    didInitFilter.current = true
    if (counts.upcoming > 0) setFilter('upcoming')
    else if (counts.organize > 0) setFilter('organize')
    else if (counts.past > 0) setFilter('past')
  }, [counts, workspaces.length])

  const openWorkspace = (workspace: TravelWorkspace) => {
    if (workspace.planned_trip_id) {
      navigation.navigate('TripDetail', { tripId: workspace.planned_trip_id })
      return
    }
    // Séjour perso → promote to planner (vol + hôtel), pas TripSummary.
    if (workspace.draft_token) {
      void (async () => {
        try {
          if (__DEV__ && isGuest) {
            const { addGuestTripFromMyTripDraft } = await import(
              '../dev/guestPreview'
            )
            const draft = await getApi().getMyTrip(workspace.draft_token!)
            const created = addGuestTripFromMyTripDraft({
              draft,
              city: workspace.city,
            })
            navigation.navigate('TripDetail', { tripId: created.id })
            void load({ force: true })
            return
          }
          const created = await getApi().createPlannedTripFromMyTrip({
            draft_token: workspace.draft_token!,
            name: workspace.city || workspace.title || undefined,
          })
          navigation.navigate('TripDetail', { tripId: created.id })
          void load({ force: true })
        } catch {
          navigation.navigate('TripSummary', {
            draftToken: workspace.draft_token!,
          })
        }
      })()
      return
    }
    if (workspace.hotel_booking_id) {
      navigation.navigate('Bookings')
    }
  }

  const density: JourneyDensity =
    filteredWorkspaces.length <= 1
      ? 'solo'
      : filteredWorkspaces.length === 2
        ? 'duo'
        : 'groupe'

  if (!viewUser) {
    return <PlannerGuestLanding insetsTop={insets.top} insetsBottom={insets.bottom} />
  }

  return (
    <View style={styles.root}>
      <ScreenBackground />

      {loading && workspaces.length === 0 ? (
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Chargement des voyages…</Text>
        </View>
      ) : (
        <FlatList
          key={`planner-${density}`}
          data={filteredWorkspaces}
          keyExtractor={(item) => item.workspace_id}
          numColumns={density === 'duo' ? 2 : 1}
          columnWrapperStyle={density === 'duo' ? styles.duoRow : undefined}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: insets.top + 8,
            // Leave room for the FAB; tab bar clearance is already on the scene.
            paddingBottom: 88,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load({ refresh: true, force: true })}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.kicker}>VOYAGES</Text>
              <Text style={styles.title}>Tout ton parcours</Text>
              <Text style={styles.subtitle}>
                Crée, scanne les prix, invite tes proches.
              </Text>
              <View style={styles.hubTabs}>
                {HUB_TABS.map(({ key, label }) => (
                  <Pressable
                    key={key}
                    onPress={() => setFilter(key)}
                    style={[styles.hubTab, filter === key && styles.hubTabActive]}
                  >
                    <Text style={[styles.hubTabText, filter === key && styles.hubTabTextActive]}>
                      {label} · {counts[key]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={[styles.emptyCard, shadow.soft]}>
              {error ? (
                <>
                  <Text style={styles.emptyTitle}>Oups</Text>
                  <Text style={styles.emptyBody}>{error}</Text>
                  <Pressable
                    onPress={() => void load({ force: true })}
                    style={styles.retryBtn}
                  >
                    <Text style={styles.retryText}>Réessayer</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={styles.emptyIconWrap}>
                    <LinearGradient
                      colors={[colors.primary, colors.primaryDeep]}
                      style={styles.emptyIcon}
                    >
                      <Text style={styles.emptyIconText}>✈</Text>
                    </LinearGradient>
                  </View>
                  <Text style={styles.emptyTitle}>
                    {workspaces.length
                      ? HUB_EMPTY[filter].title
                      : 'Ton premier voyage'}
                  </Text>
                  <Text style={styles.emptyBody}>
                    {workspaces.length
                      ? HUB_EMPTY[filter].body
                      : 'Choisis une ville, trouve un vol, puis compose tout le séjour.'}
                  </Text>
                  {!workspaces.length || HUB_EMPTY[filter].cta ? (
                    <Pressable
                      onPress={() => setShowCreate(true)}
                      style={({ pressed }) => [
                        styles.emptyCta,
                        pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] },
                      ]}
                    >
                      <Text style={styles.emptyCtaText}>
                        {workspaces.length
                          ? HUB_EMPTY[filter].cta || 'Créer un voyage'
                          : 'Créer un voyage'}
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <JourneyCard
              workspace={item}
              density={density}
              onPress={() => openWorkspace(item)}
            />
          )}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Pressable
        onPress={() => setShowCreate(true)}
        accessibilityRole="button"
        accessibilityLabel="Nouveau voyage"
        style={({ pressed }) => [
          styles.fab,
          // Scene already has tabClearance paddingBottom — don't add insets again.
          pressed && { opacity: 0.92, transform: [{ scale: 0.97 }] },
        ]}
      >
        <Text style={styles.fabPlus}>+</Text>
        <Text style={styles.fabLabel}>Nouveau</Text>
      </Pressable>

      <CreateTripModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(id) => {
          setShowCreate(false)
          void load({ force: true })
          navigation.navigate('TripDetail', { tripId: id, autoScan: true })
        }}
      />
    </View>
  )
}

function PlannerGuestLanding({
  insetsTop,
  insetsBottom,
}: {
  insetsTop: number
  insetsBottom: number
}) {
  const { signInWithGoogle } = useAuth()
  const [loginLoading, setLoginLoading] = useState(false)
  const t = (key: string) => translate('fr', key as never)

  const onLogin = async () => {
    setLoginLoading(true)
    const { error: err } = await signInWithGoogle()
    if (err && __DEV__) console.warn('[auth] signIn', err.message)
    setLoginLoading(false)
  }

  return (
    <GuestAuthLanding
      insetsTop={insetsTop}
      insetsBottom={insetsBottom}
      kicker="PLANNER"
      title={t('planner.guest.title')}
      lead={t('planner.guest.lead')}
      steps={[
        { title: t('planner.guest.step1'), detail: t('planner.guest.step1.detail') },
        { title: t('planner.guest.step2'), detail: t('planner.guest.step2.detail') },
        { title: t('planner.guest.step3'), detail: t('planner.guest.step3.detail') },
      ]}
      ctaLabel={t('planner.guest.cta')}
      hint={t('planner.guest.hint')}
      loginLoading={loginLoading}
      onLogin={() => void onLogin()}
      preview={
        <View style={[styles.mockTicket, shadow.soft]}>
          <LinearGradient
            colors={['#1A120E', '#2A1A12', '#3D2418']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.mockTicketInner}
          >
            <View style={styles.mockRow}>
              <View>
                <Text style={styles.mockLabel}>Départ</Text>
                <Text style={styles.mockCode}>{t('planner.guest.mock.from')}</Text>
              </View>
              <View style={styles.mockLineWrap}>
                <View style={styles.mockLine} />
                <Text style={styles.mockPlane}>✈</Text>
                <Text style={styles.mockPrice}>{t('planner.guest.mock.price')}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.mockLabel}>Arrivée</Text>
                <Text style={styles.mockCode}>{t('planner.guest.mock.to')}</Text>
              </View>
            </View>
            <View style={styles.mockChips}>
              <Text style={styles.mockChip}>{t('planner.guest.mock.chip1')}</Text>
              <Text style={styles.mockChip}>{t('planner.guest.mock.chip2')}</Text>
              <Text style={styles.mockChip}>{t('planner.guest.mock.chip3')}</Text>
              <Text style={[styles.mockChip, styles.mockChipAccent]}>
                {t('planner.guest.mock.chipAccent')}
              </Text>
            </View>
          </LinearGradient>
        </View>
      }
    />
  )
}

function CreateTripModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { isGuest } = useAuth()
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState<1 | 2>(1)
  const [partyMode, setPartyMode] = useState<PartyMode | null>(null)
  const [name, setName] = useState('')
  const [departure, setDeparture] = useState('BVA')
  const [arrivalCityKey, setArrivalCityKey] = useState('')
  const [arrivalCodes, setArrivalCodes] = useState<string[]>([])
  const [passengers, setPassengers] = useState(2)
  const [budget, setBudget] = useState(150)
  const [directOnly, setDirectOnly] = useState(false)
  const [preset, setPreset] = useState<DatePresetId>('next-weekend')
  const [presetDates, setPresetDates] = useState<FlexibleDates>(() => {
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
  })
  const [flexibleDates, setFlexibleDates] = useState<FlexibleDates>({
    dates_depart: [],
    dates_retour: [],
  })
  const [showFlexible, setShowFlexible] = useState(false)
  const [airports, setAirports] = useState<Airport[]>(() => peekCachedAirports())
  const [arrivalAirports, setArrivalAirports] = useState<Airport[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  React.useEffect(() => {
    if (!visible) return
    setStep(1)
    setPartyMode(null)
    setError(null)
    return subscribeAirports(setAirports)
  }, [visible])

  React.useEffect(() => {
    const origins = parseAirportCodes(departure)
    if (!visible || !origins.length) {
      if (!origins.length) setArrivalAirports([])
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const lists = await Promise.all(
          origins.map(async (code) => {
            try {
              return normalizeDestinations(await getApi().getDestinations(code))
            } catch {
              return []
            }
          }),
        )
        if (cancelled) return
        const seen = new Set<string>()
        const merged = []
        for (const list of lists) {
          for (const d of list) {
            const code = (d?.code || '').toUpperCase()
            if (!code || seen.has(code)) continue
            seen.add(code)
            merged.push(d)
          }
        }
        const next = destinationsToAirports(merged)
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
      } catch {
        if (!cancelled) setArrivalAirports([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [visible, departure])

  React.useEffect(() => {
    if (preset !== 'flexible') {
      const d = generateDatesFromPreset(preset)
      setPresetDates({
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
      })
    }
  }, [preset])

  const dates =
    preset === 'flexible'
      ? flexibleDates
      : presetDates

  const selectParty = (mode: PartyMode) => {
    if (!name.trim()) {
      setError('Donne un nom au voyage')
      return
    }
    setPartyMode(mode)
    setPassengers(partyModeDefaultPassengers(mode))
    setError(null)
    setStep(2)
  }

  const submit = async () => {
    if (!partyMode) {
      setStep(1)
      setError('Choisis Solo, Duo ou Groupe')
      return
    }
    if (!name.trim()) {
      setError('Donne un nom au voyage')
      return
    }
    if (!dates.dates_depart.length || !dates.dates_retour.length) {
      setError('Choisis des dates aller et retour')
      return
    }
    const depEncoded = encodeAirportCodes(parseAirportCodes(departure))
    if (!depEncoded) {
      setError('Choisis une ville / aéroport de départ')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name: name.trim(),
        departure_airport: depEncoded,
        arrival_airport: encodeArrivalCodes(arrivalCodes),
        passengers,
        dates_depart: dates.dates_depart,
        dates_retour: dates.dates_retour,
        budget_max: budget,
        direct: directOnly,
      }
      const trip =
        __DEV__ && isGuest
          ? addGuestTrip(payload)
          : await getApi().createPlannedTrip(payload)
      onCreated(trip.id)
      setName('')
      setArrivalCityKey('')
      setArrivalCodes([])
      setStep(1)
      setPartyMode(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Création échouée')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityLabel="Fermer" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            styles.sheetPanel,
            styles.sheetPanelTall,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={styles.modalHeader}>
            <Pressable
              onPress={() => {
                if (step === 2) {
                  setStep(1)
                  setError(null)
                  return
                }
                onClose()
              }}
            >
              <Text style={styles.modalCancel}>{step === 2 ? 'Retour' : 'Annuler'}</Text>
            </Pressable>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text style={styles.modalStep}>Étape {step}/2</Text>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {step === 1
                  ? 'Nouveau voyage'
                  : partyMode
                    ? `Voyage · ${partyModeKickerFr(partyMode)}`
                    : 'Nouveau voyage'}
              </Text>
            </View>
            <View style={{ width: 60 }} />
          </View>

          {step === 1 ? (
            <ScrollView
              contentContainerStyle={styles.partyStepBody}
              keyboardShouldPersistTaps="handled"
              bounces={false}
            >
              <View>
                <Text style={styles.fieldLabel}>Nom du voyage</Text>
                <TextInput
                  value={name}
                  onChangeText={(v) => {
                    setName(v)
                    if (error) setError(null)
                  }}
                  placeholder="Weekend Lisbonne"
                  placeholderTextColor={colors.faint}
                  style={styles.input}
                  autoFocus
                />
              </View>
              <View>
                <Text style={styles.fieldLabel}>Avec qui tu voyages ?</Text>
                <Text style={styles.partyIntro}>
                  Solo, duo ou groupe — ça fixe les places.
                </Text>
              </View>
              <View style={styles.partyGrid}>
                {PARTY_MODE_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.mode}
                    onPress={() => selectParty(opt.mode)}
                    style={({ pressed }) => [
                      styles.partyCard,
                      pressed && { opacity: 0.92 },
                    ]}
                  >
                    <Text style={styles.partyEmoji}>{opt.emoji}</Text>
                    <Text style={styles.partyHint}>{opt.label}</Text>
                    <Text style={styles.partyLead}>{opt.hint}</Text>
                  </Pressable>
                ))}
              </View>
              {error ? <Text style={styles.formError}>{error}</Text> : null}
            </ScrollView>
          ) : (
            <ScrollView
              contentContainerStyle={{ padding: spacing.xl, paddingBottom: 24, gap: 16 }}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: '100%' }}
            >
              <View style={styles.nameSummary}>
                <Text style={styles.nameSummaryKicker}>NOM DU VOYAGE</Text>
                <Text style={styles.nameSummaryValue} numberOfLines={1}>
                  {name.trim() || '—'}
                </Text>
              </View>

              <View>
                <Text style={styles.fieldLabel}>Départ</Text>
                <CityAirportPicker airports={airports} value={departure} onChange={setDeparture} />
              </View>

              <View>
                <Text style={styles.fieldLabel}>Arrivée (optionnel)</Text>
                <CityPicker
                  airports={arrivalAirports}
                  valueKey={arrivalCityKey}
                  onChange={(group) => {
                    if (!group) {
                      setArrivalCityKey('')
                      setArrivalCodes([])
                      return
                    }
                    setArrivalCityKey(group.key)
                    setArrivalCodes(group.airports.map((a) => a.code))
                    if (!name.trim()) {
                      setName(`Weekend ${group.city}`)
                    }
                  }}
                />
              </View>

              {partyMode === 'groupe' ? (
                <PassengerStepper
                  value={passengers}
                  onChange={setPassengers}
                  min={partyModeMinPassengers('groupe')}
                  max={partyModeMaxPassengers('groupe')}
                  label="Taille du groupe"
                />
              ) : (
                <View style={styles.partySummary}>
                  <Text style={styles.partySummaryTitle}>
                    {partyMode ? partyModeKickerFr(partyMode) : 'Voyageurs'}
                  </Text>
                  <Text style={styles.partySummaryBody}>
                    {partyMode ? partyModeCreateHintFr(partyMode) : `${passengers} place(s)`}
                  </Text>
                </View>
              )}

              <Pressable
                style={styles.directRow}
                onPress={() => setDirectOnly((v) => !v)}
                hitSlop={8}
              >
                <View style={[styles.directBox, directOnly && styles.directBoxOn]}>
                  {directOnly ? <Text style={styles.directCheck}>✓</Text> : null}
                </View>
                <Text style={styles.directLabel}>Vols directs uniquement</Text>
              </Pressable>

              <BudgetSlider value={budget} onChange={setBudget} />

              <View>
                <Text style={styles.fieldLabel}>Dates</Text>
                <View style={styles.presetRow}>
                  {PRESETS.map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => {
                        setPreset(p.id)
                        if (p.id === 'flexible') setShowFlexible(true)
                      }}
                      style={[styles.presetChip, preset === p.id && styles.presetChipOn]}
                    >
                      <Text
                        style={[
                          styles.presetChipText,
                          preset === p.id && styles.presetChipTextOn,
                        ]}
                      >
                        {p.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {dates.dates_depart[0] && dates.dates_retour[0] ? (
                  <Text style={styles.datesHint}>
                    {formatTripDateRangeFr(
                      dates.dates_depart[0].date,
                      dates.dates_retour[dates.dates_retour.length - 1].date,
                    )}
                  </Text>
                ) : (
                  <Text style={styles.datesHint}>Choisis tes dates libres</Text>
                )}
              </View>

              <Button label="Créer" onPress={() => void submit()} loading={saving} />
              {error ? <Text style={styles.formError}>{error}</Text> : null}
            </ScrollView>
          )}

          <FlexibleDatesModal
            visible={showFlexible}
            value={flexibleDates}
            onChange={setFlexibleDates}
            onClose={() => setShowFlexible(false)}
          />
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  duoRow: {
    justifyContent: 'space-between',
    gap: 12,
  },
  header: { marginBottom: 22, gap: 4 },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.primary,
    marginBottom: 2,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 34,
    color: colors.ink,
    letterSpacing: -1,
    lineHeight: 40,
  },
  subtitle: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.muted,
    lineHeight: 22,
    marginTop: 2,
  },
  hubTabs: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 14,
  },
  hubTab: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  hubTabActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  hubTabText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.muted,
    textAlign: 'center',
  },
  hubTabTextActive: { color: colors.white },
  loadingText: { fontFamily: fonts.medium, color: colors.muted, marginTop: 8 },
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: 28,
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    marginTop: 8,
  },
  emptyIconWrap: { marginBottom: 4 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconText: { fontSize: 26, color: colors.white },
  emptyTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 20,
    color: colors.ink,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 260,
  },
  emptyCta: {
    marginTop: 10,
    backgroundColor: colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 16,
  },
  emptyCtaText: { fontFamily: fonts.bold, color: colors.white, fontSize: 15 },
  retryBtn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryText: { fontFamily: fonts.bold, color: colors.white },
  tripCard: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    marginBottom: 20,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  tripHero: {
    height: 210,
    backgroundColor: colors.line,
  },
  tripHeroImage: {
    width: '100%',
    height: '100%',
  },
  tripHeroCaption: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 16,
  },
  tripHeroCity: {
    fontFamily: fonts.extrabold,
    fontSize: 30,
    color: colors.white,
    letterSpacing: -0.8,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  routeCode: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.white,
    letterSpacing: 0.4,
  },
  routeDash: {
    width: 28,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  routeMore: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  tripBody: { padding: 18, gap: 10 },
  tripName: {
    fontFamily: fonts.bold,
    fontSize: 19,
    color: colors.ink,
    letterSpacing: -0.35,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipAccent: {
    backgroundColor: '#FFE8DC',
  },
  chipText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.primaryInk,
  },
  chipTextAccent: {
    color: colors.primaryDeep,
  },
  tripDates: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.inkSoft,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  openHint: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primary,
  },
  openArrow: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.primary,
    lineHeight: 24,
  },
  statusPill: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusPlanning: {
    backgroundColor: 'rgba(255,243,236,0.96)',
  },
  statusScanning: {
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  statusLocked: {
    backgroundColor: 'rgba(232,248,241,0.96)',
  },
  statusText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primaryInk,
  },
  statusTextLocked: { color: colors.success },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    zIndex: 30,
    elevation: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingLeft: 14,
    paddingRight: 18,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primary,
    ...shadow.soft,
  },
  fabPlus: {
    fontFamily: fonts.bold,
    fontSize: 24,
    color: colors.white,
    marginTop: -2,
  },
  fabLabel: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.white,
  },
  badge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  badgeOnHero: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  badgeLocked: { backgroundColor: colors.successSoft },
  badgePlanning: { backgroundColor: '#FFF0E6' },
  badgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.primaryInk,
  },
  badgeTextLocked: { color: colors.success },
  routeBadge: {
    width: 52,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  routeFrom: {
    fontFamily: fonts.extrabold,
    fontSize: 11,
    color: colors.primary,
    includeFontPadding: false,
  },
  routeArrow: { fontSize: 9, color: colors.faint, lineHeight: 12 },
  routeTo: {
    fontFamily: fonts.extrabold,
    fontSize: 11,
    color: colors.ink,
    includeFontPadding: false,
  },
  tripTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tripMeta: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
  },
  tripHeroRoute: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 3,
  },
  fabText: {
    fontFamily: fonts.bold,
    fontSize: 30,
    color: colors.white,
    marginTop: -2,
  },
  mockTicket: {
    borderRadius: 22,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  mockTicketInner: {
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  mockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mockLabel: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1,
    color: 'rgba(255,220,190,0.65)',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  mockCode: {
    fontFamily: fonts.extrabold,
    fontSize: 28,
    color: colors.white,
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
  mockLineWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  mockLine: {
    height: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,180,120,0.45)',
  },
  mockPlane: {
    marginTop: -10,
    fontSize: 14,
    color: '#FFB088',
  },
  mockPrice: {
    marginTop: 8,
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: 'rgba(255,230,210,0.85)',
  },
  mockChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 14,
  },
  mockChip: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: 'rgba(255,230,210,0.8)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  mockChipAccent: {
    backgroundColor: 'rgba(255,107,53,0.35)',
    color: '#FFE8DC',
  },
  sheetRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  sheetPanel: {
    width: '100%',
    backgroundColor: colors.canvas,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
  },
  sheetPanelTall: {
    maxHeight: '92%',
    minHeight: '58%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  nameSummary: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: 'rgba(248,250,252,0.9)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
  },
  nameSummaryKicker: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.muted,
  },
  nameSummaryValue: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  modalCancel: { fontFamily: fonts.medium, color: colors.muted, width: 60 },
  modalStep: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  modalTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  partyStepBody: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    gap: 14,
  },
  partyIntro: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'left',
    lineHeight: 18,
    marginTop: 4,
  },
  partyGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  partyCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    gap: 3,
    alignItems: 'center',
  },
  partyEmoji: {
    fontSize: 20,
    lineHeight: 24,
    textAlign: 'center',
  },
  partyHint: {
    fontFamily: fonts.extrabold,
    fontSize: 13,
    color: colors.ink,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  partyLead: {
    fontFamily: fonts.medium,
    fontSize: 10,
    color: colors.inkSoft,
    textAlign: 'center',
    lineHeight: 13,
  },
  partySummary: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    gap: 2,
  },
  partySummaryTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  partySummaryBody: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
  },
  fieldLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  directRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  directBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directBoxOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  directCheck: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.white,
    includeFontPadding: false,
  },
  directLabel: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
    includeFontPadding: false,
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fonts.medium,
    fontSize: 16,
    color: colors.ink,
  },
  presetRow: { flexDirection: 'row', gap: 8 },
  presetChip: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 10,
    alignItems: 'center',
  },
  presetChipOn: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  presetChipText: { fontFamily: fonts.bold, fontSize: 13, color: colors.muted },
  presetChipTextOn: { color: colors.primaryInk },
  datesHint: {
    marginTop: 8,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.inkSoft,
  },
  formError: { fontFamily: fonts.medium, color: colors.danger, fontSize: 13 },
})
