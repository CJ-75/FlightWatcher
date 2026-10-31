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
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  boardLabelFr,
  hotelCancelLabel,
  resolveCarrierBooking,
  type HotelGalleryPhoto,
  type MyTripDraft,
} from '@flightwatcher/shared'
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

function formatDistance(m?: number | null) {
  if (m == null || Number.isNaN(Number(m))) return null
  const n = Number(m)
  if (n < 1000) return `${Math.round(n)} m du centre`
  return `${(n / 1000).toFixed(1)} km du centre`
}

export function TripSummaryScreen({ route, navigation }: Props) {
  const { draftToken } = route.params
  const insets = useSafeAreaInsets()
  const [draft, setDraft] = useState<MyTripDraft | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [askFlight, setAskFlight] = useState(false)
  const [marking, setMarking] = useState(false)
  const [hotelSheet, setHotelSheet] = useState(false)
  const [gallery, setGallery] = useState<HotelGalleryPhoto[]>([])
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
  const hotelRaw =
    (pl.hotel as Record<string, any> | undefined) ||
    (draft?.hotel as Record<string, any> | undefined) ||
    null
  const hotelOpt = toUpsellHotel(hotelRaw)

  const city = String(draft?.city_name || pl.city || 'Séjour')
  const out = String(draft?.out_date || pl.dates?.outbound || '').slice(0, 10)
  const inn = String(draft?.ret_date || pl.dates?.inbound || '').slice(0, 10)
  const adults = Math.max(1, Number(draft?.adults || pl.adults || 2))

  const carrier = useMemo(() => {
    return resolveCarrierBooking({
      airline: fl.airline,
      provider: fl.provider,
      bookingUrl: fl.booking_url || pl.booking_url,
      originIata: fl.origin_iata || draft?.origin_iata || undefined,
      destIata: fl.destination_iata || draft?.dest_iata || undefined,
      outDate: out || undefined,
      retDate: inn || undefined,
      outLocal: fl.outbound_local || fl.out_dep_local || out || undefined,
      inLocal: fl.inbound_local || fl.ret_dep_local || inn || undefined,
      adults,
      language: 'fr',
    })
  }, [fl, pl.booking_url, draft?.origin_iata, draft?.dest_iata, out, inn, adults])

  const flightUrl = String(
    fl.booking_url || pl.booking_url || carrier.url || '',
  ).trim()

  const hotelId = hotelOpt ? String(hotelOpt.id || hotelOpt.hotel_id || '') : ''
  const hotelPhoto = hotelOpt
    ? String(hotelOpt.photo || hotelOpt.thumbnail || '')
    : ''
  const hotelName = hotelOpt ? String(hotelOpt.name || 'Hôtel') : ''
  const hotelPp =
    hotelOpt?.hotel_pp != null
      ? Math.round(Number(hotelOpt.hotel_pp))
      : hotelOpt?.public_hotel_price != null
        ? Math.round(Number(hotelOpt.public_hotel_price) / adults)
        : null
  const boardFr = boardLabelFr(hotelOpt?.board)
  const cancelFr = hotelCancelLabel({
    refundable: hotelOpt?.refundable,
    cancel_deadline: hotelOpt?.cancel_deadline,
  })
  const distFr = formatDistance(hotelOpt?.distance_m ?? null)

  const flightBooked = Boolean(
    draft?.flight_booked_at || pl.flight_booked || pl.flight_booked_at,
  )
  const hotelBooked = Boolean(
    draft?.hotel_booked_at || pl.hotel_booked || pl.hotel_booked_at,
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
    if (hotelBooked && flightBooked) {
      return { label: 'Voir mes réservations', action: 'bookings' as const }
    }
    if (hotelId && !hotelBooked) {
      return { label: 'Payer ma chambre', action: 'pay' as const }
    }
    if (!hotelId) {
      return { label: 'Choisir mon hôtel', action: 'compose' as const }
    }
    if (!flightBooked && flightUrl) {
      return { label: 'Réserver mon vol', action: 'flight' as const }
    }
    return { label: 'Voir mes réservations', action: 'bookings' as const }
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
    void getApi().trackMyTripEvent(draftToken, 'flight_cta', {
      site: carrier.siteLabel,
    })
    openInAppBrowser(
      navigation,
      flightUrl,
      carrier.ctaLabel || 'Réserver le vol',
    )
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

        <View style={[styles.card, shadow.soft]}>
          <IconLabel
            section
            label="Vol"
            icon={<PlaneIcon size={14} />}
          />
          <Text style={styles.cardBody}>
            {[
              fl.airline || carrier.airlineName,
              fl.origin_iata || draft.origin_iata,
              '→',
              fl.destination_iata || draft.dest_iata,
            ]
              .filter(Boolean)
              .join(' ')}
          </Text>
          {fl.price_pp != null ? (
            <Text style={styles.cardMeta}>
              {Math.round(Number(fl.price_pp))} € / pers.
            </Text>
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
                <Text style={styles.cardBody} numberOfLines={2}>
                  {hotelOpt.stars
                    ? `${'★'.repeat(Math.min(5, Math.round(Number(hotelOpt.stars))))} `
                    : ''}
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
                  <Text style={styles.priceLine}>{hotelPp} € / pers.</Text>
                ) : null}
                <View style={styles.badgeRow}>
                  {hotelBooked ? (
                    <CheckIcon size={14} />
                  ) : (
                    <CardIcon size={14} />
                  )}
                  <Text style={hotelBooked ? styles.badgeOk : styles.badge}>
                    {hotelBooked
                      ? 'Chambre confirmée'
                      : 'Il reste à payer la chambre'}
                  </Text>
                </View>
                <Text style={styles.ficheLink}>Voir photos et détails →</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.cardMeta}>
              Pas encore d’hôtel — choisis-en un pour compléter ton séjour.
            </Text>
          )}
          <View style={styles.hotelActions}>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => navigation.navigate('HotelCompose', { draftToken })}
            >
              <BedIcon size={15} />
              <Text style={styles.secondaryBtnText}>
                {hotelId ? 'Changer d’hôtel' : 'Choisir mon hôtel'}
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
                <CardIcon size={15} />
                <Text style={styles.secondaryBtnText}>Payer ma chambre</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.sticky, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable style={styles.btn} onPress={onSticky} disabled={marking}>
          {sticky.action === 'flight' ? (
            <PlaneIcon size={16} color={colors.white} />
          ) : sticky.action === 'pay' ? (
            <CardIcon size={16} color={colors.white} />
          ) : sticky.action === 'compose' ? (
            <BedIcon size={16} color={colors.white} />
          ) : (
            <TicketIcon size={16} color={colors.white} />
          )}
          <Text style={styles.btnText}>{sticky.label}</Text>
        </Pressable>
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
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 18,
    marginBottom: 14,
    gap: 8,
  },
  cardBody: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  cardMeta: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted, lineHeight: 19 },
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
