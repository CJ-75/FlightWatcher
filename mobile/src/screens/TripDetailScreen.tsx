import React, { useCallback, useState } from 'react'
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
import type { EnrichedTripResponse, PlannedTripDetail, TripMember, TripProposal } from '@flightwatcher/shared'
import { cityDisplayNameFr, formatDateFr, parseAirportCodes } from '@flightwatcher/shared'
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
import { TravelersSection } from '../components/TravelersSection'
import { BookingSheet } from '../components/BookingSheet'
import { Button } from '../components/ui/Button'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../../App'
import { colors, fonts, shadow, spacing } from '../theme'

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

  const [trip, setTrip] = useState<PlannedTripDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const [membersBusy, setMembersBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [bookingTrip, setBookingTrip] = useState<EnrichedTripResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [watchBusy, setWatchBusy] = useState(false)
  const [watchInterval, setWatchInterval] = useState(3600)

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

  const scan = async () => {
    setScanning(true)
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
      } else {
        const scanRes = await getApi().scanPlannedTrip(tripId)
        // Affiche immédiatement les propositions persistées, puis resync
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
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan échoué')
      Alert.alert('Scan', e instanceof Error ? e.message : 'Scan échoué')
    } finally {
      setScanning(false)
    }
  }

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
    try {
      await Share.share({
        message: `Rejoins mon voyage « ${trip.name} » sur FlightWatcher : ${url}`,
        url,
      })
    } catch {
      /* cancelled */
    }
  }

  const addMember = async (displayName: string) => {
    setMembersBusy(true)
    try {
      if (__DEV__ && isGuest) {
        const updated = addGuestTripMember(tripId, displayName)
        if (!updated) throw new Error('Voyage introuvable')
        setTrip(updated)
      } else {
        await getApi().addTripMember(tripId, { display_name: displayName })
        await load()
      }
    } finally {
      setMembersBusy(false)
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

  if (loading && !trip) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ScreenBackground />
        <ActivityIndicator size="large" color={colors.primary} />
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

  const pending = (trip.proposals || []).filter((p) => p.status === 'pending')
  const accepted = (trip.proposals || []).find((p) => p.status === 'accepted')
  const others = (trip.proposals || []).filter(
    (p) => p.status !== 'pending' && p.status !== 'accepted',
  )

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
      <View style={[styles.summary, shadow.soft]}>
        <Text style={styles.name}>{trip.name}</Text>
        <Text style={styles.meta}>
          {departureRouteLabel(trip.departure_airport)}
          {trip.arrival_airport
            ? ` → ${trip.arrival_airport.replace(/,/g, ' · ')}`
            : ' · inspire'}
          {trip.direct ? ' · directs' : ''}
        </Text>
        <Text style={styles.meta}>
          max {trip.budget_max}€/pers
        </Text>
        {trip.dates_depart[0] && trip.dates_retour[0] ? (
          <Text style={styles.meta}>
            {formatDateFr(trip.dates_depart[0].date)} →{' '}
            {formatDateFr(trip.dates_retour[trip.dates_retour.length - 1].date)}
          </Text>
        ) : null}
        <Text style={styles.status}>
          Statut :{' '}
          {trip.status === 'locked'
            ? 'Confirmé'
            : trip.status === 'scanning'
              ? 'Scan…'
              : 'Créé'}
        </Text>
      </View>

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

      <TravelersSection
        members={trip.members || []}
        seats={trip.passengers}
        currentUserId={viewUser?.id}
        isOrganizer={!!isOrganizer}
        busy={membersBusy}
        onAdd={addMember}
        onRemove={removeMember}
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {isOrganizer && trip.status !== 'locked' ? (
        <>
          <Button
            label={scanning ? 'Scan en cours…' : 'Scanner les prix'}
            onPress={() => void scan()}
            loading={scanning}
            disabled={scanning}
          />
          <PriceWatchBanner
            enabled={!!trip.auto_scan_enabled}
            budget={trip.budget_max}
            intervalSeconds={trip.auto_scan_interval_seconds || watchInterval}
            watchInterval={watchInterval}
            busy={watchBusy}
            onIntervalChange={setWatchInterval}
            onToggle={() => void setPriceWatch(!trip.auto_scan_enabled)}
          />
        </>
      ) : null}

      {accepted && !scanning ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Proposition acceptée</Text>
          <DestinationCard
            trip={accepted.trip_data}
            passengers={trip.passengers}
            onBook={() => setBookingTrip(accepted.trip_data)}
          />
        </View>
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
          <Text style={styles.sectionTitle}>Propositions ({pending.length})</Text>
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
        <View style={[styles.empty, shadow.soft]}>
          <Text style={styles.emptyTitle}>Pas encore de propositions</Text>
          <Text style={styles.emptyBody}>
            {isOrganizer
              ? 'Lance un scan pour trouver des vols dans ton budget.'
              : 'L’organisateur n’a pas encore scanné de vols.'}
          </Text>
        </View>
      ) : null}

      {others.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionMuted}>Refusées ({others.length})</Text>
        </View>
      ) : null}

      {isOrganizer && (trip.status === 'locked' || !!accepted) ? (
        <Button label="Partager l’invitation" onPress={() => void shareInvite()} />
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

      <BookingSheet
        trip={bookingTrip}
        passengers={trip.passengers}
        onClose={() => setBookingTrip(null)}
      />
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
  summary: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 18,
    gap: 6,
  },
  name: { fontFamily: fonts.extrabold, fontSize: 22, color: colors.ink },
  meta: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  status: { fontFamily: fonts.bold, fontSize: 13, color: colors.primaryInk, marginTop: 4 },
  section: { gap: 12 },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
  sectionMuted: { fontFamily: fonts.medium, fontSize: 13, color: colors.faint },
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
