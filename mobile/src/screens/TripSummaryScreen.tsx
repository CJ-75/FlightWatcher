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
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { MyTripDraft } from '@flightwatcher/shared'
import { getApi, getWebOrigin } from '../lib/client'
import { openInAppBrowser } from '../lib/openInApp'
import { rememberTrip } from '../lib/tripRecovery'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../../App'
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

export function TripSummaryScreen({ route, navigation }: Props) {
  const { draftToken } = route.params
  const insets = useSafeAreaInsets()
  const [draft, setDraft] = useState<MyTripDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [askFlight, setAskFlight] = useState(false)
  const [marking, setMarking] = useState(false)
  const leftForFlight = useRef(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const row = await getApi().getMyTrip(draftToken)
      setDraft(row)
      await rememberTrip({
        draft_token: draftToken,
        city: row.city_name || null,
      })
      void getApi().trackMyTripEvent(draftToken, 'trip_view', { source: 'mobile' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setDraft(null)
    } finally {
      setLoading(false)
    }
  }, [draftToken])

  useEffect(() => {
    void load()
  }, [load])

  useFocusEffect(
    useCallback(() => {
      if (leftForFlight.current) {
        leftForFlight.current = false
        setAskFlight(true)
      }
      void load()
    }, [load]),
  )

  const pl = (draft?.payload || {}) as Record<string, any>
  const fl = (pl.flight || {}) as Record<string, any>
  const hotel =
    (pl.hotel as Record<string, any> | undefined) ||
    (draft?.hotel as Record<string, any> | undefined) ||
    null

  const city = String(draft?.city_name || pl.city || 'Séjour')
  const out = String(draft?.out_date || pl.dates?.outbound || '').slice(0, 10)
  const inn = String(draft?.ret_date || pl.dates?.inbound || '').slice(0, 10)
  const adults = Math.max(1, Number(draft?.adults || pl.adults || 2))
  const flightUrl = String(fl.booking_url || pl.booking_url || '')
  const hotelId = hotel ? String(hotel.id || hotel.hotel_id || '') : ''
  const hotelPhoto = hotel
    ? String(hotel.photo || hotel.thumbnail || '')
    : ''
  const hotelName = hotel ? String(hotel.name || 'Hôtel') : ''
  const hotelPp =
    hotel?.hotel_pp != null
      ? Math.round(Number(hotel.hotel_pp))
      : hotel?.public_hotel_price != null
        ? Math.round(Number(hotel.public_hotel_price) / adults)
        : null

  const flightBooked = Boolean(
    draft?.flight_booked_at || pl.flight_booked || pl.flight_booked_at,
  )
  const hotelBooked = Boolean(
    draft?.hotel_booked_at || pl.hotel_booked || pl.hotel_booked_at,
  )

  const sticky = useMemo(() => {
    if (hotelBooked && flightBooked) {
      return { label: 'Voir mes réservations', action: 'bookings' as const }
    }
    if (hotelId && !hotelBooked) {
      return { label: 'Payer l’hôtel', action: 'pay' as const }
    }
    if (!hotelId) {
      return { label: 'Choisir un hôtel', action: 'compose' as const }
    }
    if (!flightBooked && flightUrl) {
      return { label: 'Réserver le vol', action: 'flight' as const }
    }
    return { label: 'Terminé', action: 'bookings' as const }
  }, [hotelBooked, flightBooked, hotelId, flightUrl])

  const markFlight = async (yes: boolean) => {
    setAskFlight(false)
    if (!yes) {
      void getApi().trackMyTripEvent(draftToken, 'flight_booked_no')
      return
    }
    setMarking(true)
    try {
      const row = await getApi().markMyTripFlightBooked(draftToken)
      setDraft(row)
      void getApi().trackMyTripEvent(draftToken, 'flight_booked_yes')
    } catch {
      /* non-blocking */
    } finally {
      setMarking(false)
    }
  }

  const openFlight = () => {
    if (!flightUrl) return
    leftForFlight.current = true
    void getApi().trackMyTripEvent(draftToken, 'flight_cta')
    openInAppBrowser(navigation, flightUrl, 'Réserver le vol')
  }

  const onSticky = () => {
    if (sticky.action === 'compose') {
      navigation.navigate('HotelCompose', { draftToken })
    } else if (sticky.action === 'pay') {
      navigation.navigate('DealCheckout', {
        draftToken,
        hotelId: hotelId || undefined,
      })
    } else if (sticky.action === 'flight') {
      openFlight()
    } else {
      navigation.navigate('Bookings')
    }
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
            <Text style={styles.kicker}>Mon voyage</Text>
            <Text style={styles.title}>{city}</Text>
            <Text style={styles.sub}>
              {formatDate(out)} → {formatDate(inn)} · {adults} pers.
            </Text>
          </View>
          <Pressable onPress={() => void share()} hitSlop={8}>
            <Text style={styles.share}>Partager</Text>
          </Pressable>
        </View>

        <View style={[styles.card, shadow.soft]}>
          <Text style={styles.cardLabel}>Vol</Text>
          <Text style={styles.cardBody}>
            {[fl.airline, fl.origin_iata || draft.origin_iata, '→', fl.destination_iata || draft.dest_iata]
              .filter(Boolean)
              .join(' ')}
          </Text>
          {fl.price_pp != null ? (
            <Text style={styles.cardMeta}>{Math.round(Number(fl.price_pp))} € / pers.</Text>
          ) : null}
          <Text style={styles.badge}>
            {flightBooked ? 'Vol marqué réservé' : 'À réserver chez le transporteur'}
          </Text>
          {flightUrl && !flightBooked ? (
            <Pressable style={styles.secondaryBtn} onPress={openFlight}>
              <Text style={styles.secondaryBtnText}>Ouvrir la réservation vol</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.card, shadow.soft]}>
          <Text style={styles.cardLabel}>Hôtel</Text>
          {hotelId ? (
            <View style={styles.hotelRow}>
              {hotelPhoto ? (
                <Image source={{ uri: hotelPhoto }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.cardBody} numberOfLines={2}>
                  {hotelName}
                </Text>
                {hotelPp != null ? (
                  <Text style={styles.cardMeta}>{hotelPp} € / pers.</Text>
                ) : null}
                <Text style={styles.badge}>
                  {hotelBooked ? 'Hôtel réservé' : 'Paiement à finaliser'}
                </Text>
              </View>
            </View>
          ) : (
            <Text style={styles.cardMeta}>Aucun hôtel choisi pour l’instant</Text>
          )}
          <View style={styles.hotelActions}>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => navigation.navigate('HotelCompose', { draftToken })}
            >
              <Text style={styles.secondaryBtnText}>
                {hotelId ? 'Changer d’hôtel' : 'Choisir un hôtel'}
              </Text>
            </Pressable>
            {hotelId && !hotelBooked ? (
              <Pressable
                style={styles.secondaryBtn}
                onPress={() =>
                  navigation.navigate('DealCheckout', {
                    draftToken,
                    hotelId,
                  })
                }
              >
                <Text style={styles.secondaryBtnText}>Payer l’hôtel</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable style={styles.btn} onPress={onSticky} disabled={marking}>
          <Text style={styles.btnText}>{sticky.label}</Text>
        </Pressable>
      </View>

      <Modal visible={askFlight} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, shadow.soft]}>
            <Text style={styles.modalTitle}>As-tu réservé ton vol ?</Text>
            <Text style={styles.modalBody}>
              Dis-nous pour suivre ton voyage — tu pourras toujours changer d’avis.
            </Text>
            <Pressable style={styles.btn} onPress={() => void markFlight(true)}>
              <Text style={styles.btnText}>Oui</Text>
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
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.primary,
    marginBottom: 4,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 28,
    color: colors.ink,
    letterSpacing: -0.8,
  },
  sub: { marginTop: 4, fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  share: { fontFamily: fonts.bold, color: colors.primary, marginTop: 8 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 14,
    gap: 8,
  },
  cardLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  cardBody: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  cardMeta: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  badge: { fontFamily: fonts.medium, fontSize: 12, color: colors.primary },
  hotelRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumb: { width: 64, height: 64, borderRadius: radius.md },
  thumbEmpty: { backgroundColor: colors.line },
  hotelActions: { gap: 8, marginTop: 4 },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  secondaryBtnText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
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
