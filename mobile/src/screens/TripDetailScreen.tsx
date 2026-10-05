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
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { PlannedTripDetail, TripProposal } from '@flightwatcher/shared'
import { formatDateFr } from '@flightwatcher/shared'
import { getApi, plannerInviteUrl } from '../lib/client'
import { useAuth } from '../context/AuthContext'
import {
  acceptGuestProposal,
  getGuestTrip,
  rejectGuestProposal,
  scanGuestTrip,
} from '../dev/guestPreview'
import { DestinationCard } from '../components/DestinationCard'
import { Button } from '../components/ui/Button'
import type { RootStackParamList } from '../../App'
import { colors, fonts, shadow, spacing } from '../theme'

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
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const detail =
        __DEV__ && isGuest ? getGuestTrip(tripId) : await getApi().getPlannedTrip(tripId)
      if (!detail) throw new Error('Voyage introuvable')
      setTrip(detail)
      navigation.setOptions({ title: detail.name || 'Voyage' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible')
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
    try {
      if (__DEV__ && isGuest) scanGuestTrip(tripId)
      else await getApi().scanPlannedTrip(tripId)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan échoué')
    } finally {
      setScanning(false)
    }
  }

  const accept = async (id: string) => {
    setActing(id)
    try {
      if (__DEV__ && isGuest) acceptGuestProposal(id)
      else await getApi().acceptProposal(id)
      await load()
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Acceptation échouée')
    } finally {
      setActing(null)
    }
  }

  const reject = async (id: string) => {
    setActing(id)
    try {
      if (__DEV__ && isGuest) rejectGuestProposal(id)
      else await getApi().rejectProposal(id)
      await load()
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

  if (loading && !trip) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!trip) {
    return (
      <View style={[styles.centered, { padding: 24 }]}>
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
    <ScrollView
      style={styles.root}
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
          {trip.departure_airport}
          {trip.arrival_airport ? ` → ${trip.arrival_airport}` : ' · inspire'}
        </Text>
        <Text style={styles.meta}>
          {trip.passengers} voyageur{trip.passengers > 1 ? 's' : ''} · max {trip.budget_max}€/pers
        </Text>
        {trip.dates_depart[0] && trip.dates_retour[0] ? (
          <Text style={styles.meta}>
            {formatDateFr(trip.dates_depart[0].date)} →{' '}
            {formatDateFr(trip.dates_retour[trip.dates_retour.length - 1].date)}
          </Text>
        ) : null}
        <Text style={styles.status}>Statut : {trip.status}</Text>
        <Text style={styles.meta}>
          {(trip.members || []).length} membre{(trip.members || []).length > 1 ? 's' : ''}
        </Text>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {isOrganizer && trip.status !== 'locked' ? (
        <Button
          label={scanning ? 'Scan en cours…' : 'Scanner les prix'}
          onPress={() => void scan()}
          loading={scanning}
          disabled={scanning}
        />
      ) : null}

      {accepted ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Proposition acceptée</Text>
          <DestinationCard trip={accepted.trip_data} passengers={trip.passengers} />
          {isOrganizer ? (
            <Button label="Partager l’invitation" onPress={() => void shareInvite()} />
          ) : null}
        </View>
      ) : null}

      {pending.length > 0 ? (
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

      {trip.status === 'locked' && isOrganizer ? (
        <Button label="Partager l’invitation" onPress={() => void shareInvite()} variant="secondary" />
      ) : null}
    </ScrollView>
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
    <View style={styles.proposalWrap}>
      <DestinationCard trip={proposal.trip_data} passengers={passengers} />
      {isOrganizer ? (
        <View style={styles.actions}>
          <Pressable
            onPress={onReject}
            disabled={busy}
            style={[styles.btnReject, busy && { opacity: 0.5 }]}
          >
            <Text style={styles.btnRejectText}>Refuser</Text>
          </Pressable>
          <Pressable
            onPress={onAccept}
            disabled={busy}
            style={[styles.btnAccept, busy && { opacity: 0.5 }]}
          >
            {busy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.btnAcceptText}>Accepter</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
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
  proposalWrap: { gap: 10, marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 10 },
  btnReject: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  btnRejectText: { fontFamily: fonts.bold, color: colors.muted },
  btnAccept: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  btnAcceptText: { fontFamily: fonts.bold, color: colors.white },
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
})
