import React, { useCallback, useState } from 'react'
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
import type { Airport, PlannedTrip } from '@flightwatcher/shared'
import {
  generateDatesFromPreset,
  formatDateFr,
  normalizeAirports,
  type DatePresetId,
  type FlexibleDates,
} from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { useAuth } from '../context/AuthContext'
import { AirportPicker } from '../components/AirportPicker'
import { BudgetSlider } from '../components/BudgetSlider'
import { PassengerStepper } from '../components/PassengerStepper'
import { FlexibleDatesModal } from '../components/FlexibleDatesModal'
import { Button } from '../components/ui/Button'
import type { RootStackParamList } from '../../App'
import { colors, fonts, shadow, spacing } from '../theme'

const PRESETS: { id: DatePresetId; label: string }[] = [
  { id: 'next-weekend', label: 'Weekend prochain' },
  { id: 'flexible', label: 'Dates libres' },
]

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  scanning: 'Scan…',
  planning: 'Propositions',
  locked: 'Confirmé',
}

export function PlannerScreen() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const [trips, setTrips] = useState<PlannedTrip[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(
    async (isRefresh = false) => {
      if (!user) {
        setTrips([])
        setLoading(false)
        setRefreshing(false)
        return
      }
      if (isRefresh) setRefreshing(true)
      else setLoading(true)
      setError(null)
      try {
        const list = await getApi().listPlannedTrips()
        setTrips(Array.isArray(list) ? list : [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Impossible de charger les voyages')
        setTrips([])
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [user],
  )

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  if (!user) {
    return <PlannerGuestLanding insetsTop={insets.top} insetsBottom={insets.bottom} />
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#FFE8DC', '#FFF9F5']}
        locations={[0, 0.35]}
        style={StyleSheet.absoluteFill}
      />

      {loading && trips.length === 0 ? (
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Chargement des voyages…</Text>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 120,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>Planner</Text>
              <Text style={styles.subtitle}>Voyages collaboratifs · scan · invite</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={[styles.emptyCard, shadow.soft]}>
              {error ? (
                <>
                  <Text style={styles.emptyTitle}>Oups</Text>
                  <Text style={styles.emptyBody}>{error}</Text>
                  <Pressable onPress={() => void load()} style={styles.retryBtn}>
                    <Text style={styles.retryText}>Réessayer</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.emptyTitle}>Aucun voyage</Text>
                  <Text style={styles.emptyBody}>Crée ton premier voyage collaboratif.</Text>
                </>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate('TripDetail', { tripId: item.id })}
              style={({ pressed }) => [styles.tripCard, shadow.soft, pressed && { opacity: 0.92 }]}
            >
              <View style={styles.routeBadge}>
                <Text style={styles.routeFrom}>{item.departure_airport}</Text>
                <Text style={styles.routeArrow}>↓</Text>
                <Text style={styles.routeTo}>{item.arrival_airport || 'ANY'}</Text>
              </View>
              <View style={styles.tripBody}>
                <View style={styles.tripTop}>
                  <Text style={styles.tripName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View
                    style={[
                      styles.badge,
                      item.status === 'locked' && styles.badgeLocked,
                      item.status === 'planning' && styles.badgePlanning,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        item.status === 'locked' && styles.badgeTextLocked,
                      ]}
                    >
                      {STATUS_LABEL[item.status] || item.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.tripMeta}>
                  {item.passengers} voy. · max {item.budget_max}€
                  {(item.proposals_count ?? 0) > 0
                    ? ` · ${item.proposals_count} prop.`
                    : ''}
                </Text>
              </View>
            </Pressable>
          )}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Pressable
        onPress={() => setShowCreate(true)}
        style={[styles.fab, { bottom: insets.bottom + 88 }]}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <CreateTripModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(id) => {
          setShowCreate(false)
          void load()
          navigation.navigate('TripDetail', { tripId: id })
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

  const onLogin = async () => {
    setLoginLoading(true)
    const { error: err } = await signInWithGoogle()
    if (err && __DEV__) console.warn('[auth] signIn', err.message)
    setLoginLoading(false)
  }

  const steps = [
    { title: 'Crée le voyage', detail: 'Dates, budget et voyageurs' },
    { title: 'Scanne les prix', detail: 'Accepte la meilleure offre' },
    { title: 'Invite tes potes', detail: 'Un lien, tout le monde rejoint' },
  ]

  return (
    <View style={[styles.root, { paddingTop: insetsTop, paddingBottom: insetsBottom + 24 }]}>
      <LinearGradient
        colors={['#FFD8C4', '#FFE8DC', '#FFF9F5']}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.guestOrbA} />
      <View style={styles.guestOrbB} />
      <ScrollView
        contentContainerStyle={styles.guestContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.guestKicker}>PLANNER</Text>
        <Text style={styles.guestTitle}>Organise un voyage à plusieurs</Text>
        <Text style={styles.guestBody}>
          Crée un projet, scanne les prix, choisis la proposition, puis envoie un lien à tes potes.
        </Text>

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
                <Text style={styles.mockCode}>BVA</Text>
              </View>
              <View style={styles.mockLineWrap}>
                <View style={styles.mockLine} />
                <Text style={styles.mockPlane}>✈</Text>
                <Text style={styles.mockPrice}>à partir de 48€</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.mockLabel}>Arrivée</Text>
                <Text style={styles.mockCode}>LIS</Text>
              </View>
            </View>
            <View style={styles.mockChips}>
              <Text style={styles.mockChip}>Weekend</Text>
              <Text style={styles.mockChip}>2 voy.</Text>
              <Text style={[styles.mockChip, styles.mockChipAccent]}>Lien prêt</Text>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.steps}>
          {steps.map((step, i) => (
            <View key={step.title} style={[styles.stepCard, shadow.soft]}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDetail}>{step.detail}</Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable
          onPress={() => void onLogin()}
          disabled={loginLoading}
          style={({ pressed }) => [
            styles.googleBtn,
            pressed && { opacity: 0.92, transform: [{ scale: 0.985 }] },
          ]}
        >
          {loginLoading ? (
            <ActivityIndicator color={colors.ink} />
          ) : (
            <>
              <View style={styles.gMark}>
                <Text style={styles.gLetter}>G</Text>
              </View>
              <Text style={styles.googleLabel}>Continuer avec Google</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.guestHint}>Gratuit · tes voyages restent privés</Text>
      </ScrollView>
    </View>
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
  const insets = useSafeAreaInsets()
  const [name, setName] = useState('')
  const [departure, setDeparture] = useState('BVA')
  const [arrival, setArrival] = useState('')
  const [passengers, setPassengers] = useState(2)
  const [budget, setBudget] = useState(150)
  const [preset, setPreset] = useState<DatePresetId>('next-weekend')
  const [presetDates, setPresetDates] = useState<FlexibleDates>(() =>
    generateDatesFromPreset('next-weekend'),
  )
  const [flexibleDates, setFlexibleDates] = useState<FlexibleDates>({
    dates_depart: [],
    dates_retour: [],
  })
  const [showFlexible, setShowFlexible] = useState(false)
  const [airports, setAirports] = useState<Airport[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  React.useEffect(() => {
    if (!visible) return
    getApi()
      .getAirports()
      .then((raw) => setAirports(normalizeAirports(raw as Airport[] | { airports: Airport[] })))
      .catch(() => undefined)
  }, [visible])

  React.useEffect(() => {
    if (preset !== 'flexible') setPresetDates(generateDatesFromPreset(preset))
  }, [preset])

  const dates =
    preset === 'flexible'
      ? flexibleDates
      : presetDates

  const submit = async () => {
    if (!name.trim()) {
      setError('Donne un nom au voyage')
      return
    }
    if (!dates.dates_depart.length || !dates.dates_retour.length) {
      setError('Choisis des dates aller et retour')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const trip = await getApi().createPlannedTrip({
        name: name.trim(),
        departure_airport: departure,
        arrival_airport: arrival.trim() ? arrival.trim().toUpperCase() : null,
        passengers,
        dates_depart: dates.dates_depart,
        dates_retour: dates.dates_retour,
        budget_max: budget,
      })
      onCreated(trip.id)
      setName('')
      setArrival('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Création échouée')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.canvas }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.modalHeader, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose}>
            <Text style={styles.modalCancel}>Annuler</Text>
          </Pressable>
          <Text style={styles.modalTitle}>Nouveau voyage</Text>
          <View style={{ width: 60 }} />
        </View>
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40, gap: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <Text style={styles.fieldLabel}>Nom</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Weekend Lisbonne"
              placeholderTextColor={colors.faint}
              style={styles.input}
            />
          </View>

          <View>
            <Text style={styles.fieldLabel}>Départ</Text>
            <AirportPicker airports={airports} value={departure} onChange={setDeparture} compact />
          </View>

          <View>
            <Text style={styles.fieldLabel}>Arrivée (optionnel)</Text>
            <AirportPicker
              airports={airports}
              value={arrival}
              onChange={setArrival}
              compact
              allowEmpty
              emptyLabel="Toutes destinations"
            />
          </View>

          <PassengerStepper value={passengers} onChange={setPassengers} />
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
                  <Text style={[styles.presetChipText, preset === p.id && styles.presetChipTextOn]}>
                    {p.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {dates.dates_depart[0] && dates.dates_retour[0] ? (
              <Text style={styles.datesHint}>
                {formatDateFr(dates.dates_depart[0].date)} →{' '}
                {formatDateFr(dates.dates_retour[dates.dates_retour.length - 1].date)}
              </Text>
            ) : (
              <Text style={styles.datesHint}>Choisis tes dates libres</Text>
            )}
          </View>

          {error ? <Text style={styles.formError}>{error}</Text> : null}

          <Button label="Créer" onPress={() => void submit()} loading={saving} />
        </ScrollView>

        <FlexibleDatesModal
          visible={showFlexible}
          value={flexibleDates}
          onChange={setFlexibleDates}
          onClose={() => setShowFlexible(false)}
        />
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  header: { marginBottom: 18, gap: 4 },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 28,
    color: colors.ink,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  loadingText: { fontFamily: fonts.medium, color: colors.muted, marginTop: 8 },
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
  emptyBody: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
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
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
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
  tripBody: { flex: 1, gap: 4, minWidth: 0 },
  tripTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tripName: { flex: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  badge: {
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgePlanning: { backgroundColor: '#FFF3EC' },
  badgeLocked: { backgroundColor: colors.successSoft },
  badgeText: { fontFamily: fonts.bold, fontSize: 11, color: colors.primaryInk },
  badgeTextLocked: { color: colors.success },
  tripMeta: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  fab: {
    position: 'absolute',
    right: 22,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.soft,
  },
  fabText: {
    fontFamily: fonts.bold,
    fontSize: 30,
    color: colors.white,
    marginTop: -2,
  },
  guestOrbA: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,107,53,0.14)',
  },
  guestOrbB: {
    position: 'absolute',
    bottom: 80,
    left: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,176,136,0.22)',
  },
  guestContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  guestKicker: {
    fontFamily: fonts.extrabold,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 10,
  },
  guestTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.7,
    color: colors.ink,
    textAlign: 'center',
    includeFontPadding: false,
  },
  guestBody: {
    marginTop: 10,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
    includeFontPadding: false,
    paddingHorizontal: 4,
  },
  mockTicket: {
    marginTop: 22,
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
  steps: { alignSelf: 'stretch', marginTop: 18, gap: 8 },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  stepNum: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.white },
  stepTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
    includeFontPadding: false,
  },
  stepDetail: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    includeFontPadding: false,
  },
  googleBtn: {
    marginTop: 20,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    paddingHorizontal: 18,
  },
  gMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gLetter: {
    fontFamily: fonts.extrabold,
    color: '#4285F4',
    fontSize: 14,
    lineHeight: 18,
    includeFontPadding: false,
  },
  googleLabel: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
    includeFontPadding: false,
  },
  guestHint: {
    marginTop: 14,
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.faint,
    textAlign: 'center',
    includeFontPadding: false,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  modalCancel: { fontFamily: fonts.medium, color: colors.muted, width: 60 },
  modalTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
  fieldLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
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
