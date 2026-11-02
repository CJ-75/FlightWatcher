import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type {
  DealRevalidateResponse,
  MyTripDraft,
  StayNextAction,
  TravelDeal,
} from '@flightwatcher/shared'
import {
  ACTIVITY_BACK_TO_PLANNER_FR,
  activityStepProgress,
  resolveCarrierBooking,
  resolveNextStayAction,
  restaurantStepProgress,
} from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { openInAppBrowser } from '../lib/openInApp'
import { rememberTrip } from '../lib/tripRecovery'
import { ScreenBackground } from '../components/ScreenBackground'
import {
  CardIcon,
  PlaneIcon,
  TipIcon,
  UsersIcon,
} from '../components/UiIcons'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, spacing } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'DealCheckout'>

function buildDealFromMyTrip(d: MyTripDraft): TravelDeal | null {
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
  const cityName = String(d.city_name || pl.city || 'Séjour')
  const flightPp =
    fl.price_pp != null
      ? Number(fl.price_pp)
      : pl.price_breakdown?.flight_pp != null
        ? Number(pl.price_breakdown.flight_pp)
        : 0
  const hotelTotal =
    hRaw?.public_hotel_price != null
      ? Number(hRaw.public_hotel_price)
      : pl.price_breakdown?.hotel_public_total != null
        ? Number(pl.price_breakdown.hotel_public_total)
        : 0
  const perPerson =
    Number(pl.price_per_person) || Math.round(flightPp + hotelTotal / pax) || 0
  const key =
    String(d.deal_key || pl.deal_key || '').trim() || `mytrip-${d.draft_token}`
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
        distance_m: hRaw.distance_m != null ? Number(hRaw.distance_m) : undefined,
        photo: photo ? String(photo) : undefined,
        board: hRaw.board != null ? String(hRaw.board) : undefined,
        refundable:
          typeof hRaw.refundable === 'boolean' ? hRaw.refundable : undefined,
        cancel_deadline: hRaw.cancel_deadline ? String(hRaw.cancel_deadline) : null,
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
      d.origin_iata || pl.origin_iata || fl.origin_iata || '',
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
      String(d.origin_iata || pl.origin_iata || fl.origin_iata || '') || undefined,
    destination:
      String(d.dest_iata || pl.destination || fl.destination_iata || '') ||
      undefined,
    flight: {
      price_pp: flightPp,
      airline: fl.airline || fl.carrier,
      booking_url: fl.booking_url || pl.booking_url,
      origin_iata:
        fl.origin_iata || d.origin_iata || pl.origin_iata || pl.departure_airport,
      destination_iata:
        fl.destination_iata || d.dest_iata || pl.destination || pl.destination_iata,
      outbound_local: fl.outbound_local || fl.out_dep_local || out,
      inbound_local: fl.inbound_local || fl.ret_dep_local || inn,
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
}

export function DealCheckoutScreen({ route, navigation }: Props) {
  const { dealId, draftToken, hotelId, payResult } = route.params
  const [deal, setDeal] = useState<TravelDeal | null>(null)
  const [reval, setReval] = useState<DealRevalidateResponse | null>(null)
  const [step, setStep] = useState<
    'load' | 'confirm' | 'guests' | 'pay' | 'done' | 'error'
  >('load')
  const [error, setError] = useState<string | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [payMeta, setPayMeta] = useState<{
    secret_key: string
    payment_public_key: string
    liteapi_env?: string
  } | null>(null)
  const [paying, setPaying] = useState(false)
  const [doneNext, setDoneNext] = useState<StayNextAction | null>(null)
  const [plannerTripId, setPlannerTripId] = useState<string | null>(null)
  const [flightBookUrl, setFlightBookUrl] = useState<string | null>(null)

  const refreshDoneNext = async () => {
    if (!draftToken) {
      setDoneNext(
        resolveNextStayAction({
          flightBooked: false,
          hotelBooked: true,
          hasHotelSelected: true,
        }),
      )
      return
    }
    try {
      const [trip, cfg, itemsRes] = await Promise.all([
        getApi().getMyTrip(draftToken),
        getApi().getConfig().catch(() => null),
        getApi()
          .listTripItems({ draft_token: draftToken })
          .catch(() => ({ items: [] as { item_type?: string; status?: string }[] })),
      ])
      const payload = (trip.payload || {}) as Record<string, unknown>
      const fl = (payload.flight || {}) as Record<string, unknown>
      const status = String(
        trip.flight_booking_status || payload.flight_booking_status || '',
      )
      const flightBooked = Boolean(
        trip.flight_booked_at ||
          payload.flight_booked ||
          payload.flight_booked_at ||
          status === 'user_confirmed' ||
          status === 'partner_confirmed' ||
          payload.flight_external ||
          payload.external_flight,
      )
      const items = (itemsRes.items || []) as {
        item_type?: string
        status?: string
      }[]
      const act = activityStepProgress(
        items.filter((i) => i.item_type === 'activity'),
      )
      const resto = restaurantStepProgress(
        items.filter((i) => i.item_type === 'restaurant'),
      )
      const plannerId = trip.source_planned_trip_id
        ? String(trip.source_planned_trip_id)
        : null
      setPlannerTripId(plannerId)
      setDoneNext(
        resolveNextStayAction({
          flightBooked,
          hotelBooked: true,
          hasHotelSelected: true,
          activitiesEnabled: cfg?.planner_activities_enabled === true,
          activitiesDone: act.done,
          restaurantsEnabled: cfg?.planner_restaurants_enabled === true,
          restaurantsDone: resto.done || resto.skipped,
          hasPlanner: Boolean(plannerId),
        }),
      )
      const resolved = resolveCarrierBooking({
        airline: String(fl.airline || '') || undefined,
        provider: String(fl.provider || '') || undefined,
        bookingUrl: String(fl.booking_url || payload.booking_url || ''),
        originIata:
          String(
            fl.origin_iata || trip.origin_iata || payload.origin_iata || '',
          ).toUpperCase() || undefined,
        destIata:
          String(
            fl.destination_iata || trip.dest_iata || payload.destination || '',
          ).toUpperCase() || undefined,
        outDate: String(trip.out_date || '').slice(0, 10) || undefined,
        retDate: String(trip.ret_date || '').slice(0, 10) || undefined,
        adults: Math.max(1, Number(trip.adults || 2)),
        language: 'fr',
      })
      setFlightBookUrl(String(resolved.url || '').trim() || null)
    } catch {
      setDoneNext(
        resolveNextStayAction({
          flightBooked: false,
          hotelBooked: true,
          hasHotelSelected: true,
        }),
      )
    }
  }

  const goBackToTrip = () => {
    if (draftToken) {
      // Pop HotelCompose / checkout and land on summary with reserved hotel.
      // Clear any stale seed so TripSummary always re-fetches booked status.
      navigation.navigate({
        name: 'TripSummary',
        params: { draftToken, seed: undefined },
        merge: true,
      })
      return
    }
    navigation.navigate('Bookings')
  }

  useEffect(() => {
    if (step !== 'done' || !draftToken) return
    const unsub = navigation.addListener('beforeRemove', (e) => {
      const type = e.data?.action?.type
      if (type !== 'GO_BACK' && type !== 'POP') return
      // Back after booking → trip summary (reserved), not hotel picker.
      e.preventDefault()
      navigation.navigate({
        name: 'TripSummary',
        params: { draftToken },
        merge: true,
      })
    })
    return unsub
  }, [step, draftToken, navigation])

  useEffect(() => {
    if (!payResult?.confirmation) return
    setConfirmation(payResult.confirmation)
    setStep('done')
    if (!draftToken) {
      void refreshDoneNext()
      return
    }
    void rememberTrip({
      draft_token: draftToken,
      booking_id: payResult.bookingId,
      city: deal?.city,
    })
    ;(async () => {
      try {
        let charged: number | null = null
        if (payResult.bookingId) {
          const b = await getApi().getHotelBooking(payResult.bookingId, {
            draft_token: draftToken,
          })
          charged =
            b.charged_price != null
              ? Number(b.charged_price)
              : b.displayed_price != null
                ? Number(b.displayed_price)
                : null
        }
        await getApi().markMyTripHotelBooked(draftToken, {
          booking_id: payResult.bookingId || null,
          confirmation_code: payResult.confirmation || null,
          charged_price: charged,
        })
      } catch {
        /* best-effort lock of paid hotel total */
      }
      await refreshDoneNext()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when payResult arrives
  }, [payResult, draftToken, deal?.city])

  useEffect(() => {
    // Returning from HotelPay with payResult: skip revalidate, stay on « done ».
    if (payResult?.confirmation) return
    let cancelled = false
    ;(async () => {
      try {
        let d: TravelDeal | null = null
        if (draftToken) {
          const trip = await getApi().getMyTrip(draftToken)
          if (cancelled) return
          const key = String(trip.deal_key || '').trim()
          if (key && !key.startsWith('mytrip-')) {
            try {
              d = await getApi().getDeal(key)
            } catch {
              d = null
            }
          }
          if (!d) d = buildDealFromMyTrip(trip)
          if (d && draftToken && !String(d.deal_key || '').startsWith('mytrip-')) {
            const mk = `mytrip-${draftToken}`
            d = { ...d, id: mk, deal_key: mk }
          } else if (d && draftToken && !d.deal_key) {
            const mk = `mytrip-${draftToken}`
            d = { ...d, id: mk, deal_key: mk }
          }
        } else if (dealId) {
          d = await getApi().getDeal(dealId)
        }
        if (cancelled) return
        if (!d) throw new Error('Offre introuvable')
        setDeal(d)

        const body = {
          hotel_id: hotelId || d.hotel?.id,
          displayed_price_pp: d.price_per_person,
          draft_token: draftToken || undefined,
        }
        const r = draftToken
          ? await getApi().revalidateMyTripHotel(draftToken, body)
          : await getApi().revalidateDeal(d.deal_key || d.id, body)
        if (cancelled) return
        setReval(r)
        setStep(r.action === 'confirm' || r.hotel_switched ? 'confirm' : 'guests')
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Erreur')
          setStep('error')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dealId, draftToken, hotelId, payResult?.confirmation])

  const startPrebook = async () => {
    if (!deal || !reval?.offer_id || !reval.hotel_id) return
    setError(null)
    setPaying(true)
    try {
      const key =
        draftToken && !String(deal.deal_key || '').startsWith('mytrip-')
          ? `mytrip-${draftToken}`
          : deal.deal_key || deal.id || (draftToken ? `mytrip-${draftToken}` : '')
      const hotelCharge =
        reval.public_hotel_price ??
        deal.price_breakdown?.hotel_public_total ??
        reval.revalidated_price_pp ??
        0
      const baseSnap = (reval.deal_snapshot || deal) as TravelDeal
      const snapHotel = {
        ...(baseSnap.hotel || {}),
        refundable: reval.refundable ?? baseSnap.hotel?.refundable ?? null,
        cancel_deadline:
          reval.cancel_deadline ?? baseSnap.hotel?.cancel_deadline ?? null,
      }
      const pb = await getApi().prebookHotel({
        deal_key: key,
        offer_id: reval.offer_id,
        hotel_id: reval.hotel_id,
        displayed_price: hotelCharge,
        charged_price: hotelCharge,
        margin_pct_used: reval.margin_pct_used,
        ssp_at_booking: reval.ssp_total,
        deal_snapshot: {
          ...baseSnap,
          hotel: snapHotel,
          refundable: snapHotel.refundable,
          cancel_deadline: snapHotel.cancel_deadline,
        } as TravelDeal,
        draft_token: draftToken || undefined,
      })
      setBookingId(pb.booking_id)
      if (pb.secret_key && pb.payment_public_key) {
        setPayMeta({
          secret_key: pb.secret_key,
          payment_public_key: pb.payment_public_key,
          liteapi_env: pb.liteapi_env,
        })
        setStep('pay')
        navigation.navigate('HotelPayWebView', {
          bookingId: pb.booking_id,
          publicKey: pb.payment_public_key,
          secretKey: pb.secret_key,
          draftToken: draftToken || undefined,
          firstName,
          lastName,
          email,
          liteapiEnv: pb.liteapi_env,
          returnDealId: dealId,
          returnHotelId: hotelId,
        })
      } else if (pb.liteapi_env === 'sandbox') {
        await sandboxBook(pb.booking_id)
      } else {
        throw new Error('Paiement indisponible — réessaie')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setStep('error')
    } finally {
      setPaying(false)
    }
  }

  const sandboxBook = async (id: string) => {
    let booked = await getApi().bookHotel(id, {
      holder: { firstName, lastName, email },
      guests: [{ firstName, lastName, email, occupancyNumber: 1 }],
      payment_status: 'succeeded',
      draft_token: draftToken || undefined,
      sandbox_simulate: true,
    })
    if (booked.status === 'booking_pending') {
      await new Promise((r) => setTimeout(r, 1500))
      booked = await getApi().getHotelBooking(id, {
        draft_token: draftToken || undefined,
      })
    }
    if (draftToken) {
      try {
        const charged =
          booked.charged_price != null
            ? Number(booked.charged_price)
            : booked.displayed_price != null
              ? Number(booked.displayed_price)
              : null
        await getApi().markMyTripHotelBooked(draftToken, {
          booking_id: booked.id || id,
          confirmation_code: booked.confirmation_code || null,
          holder_email: email,
          charged_price: charged,
        })
      } catch {
        /* non-blocking */
      }
      await rememberTrip({
        draft_token: draftToken,
        booking_id: booked.id || id,
        city: deal?.city,
      })
    }
    setConfirmation(booked.confirmation_code || booked.status)
    setBookingId(booked.id || id)
    setStep('done')
    void refreshDoneNext()
  }

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <ScrollView contentContainerStyle={styles.content}>
        {step === 'load' ? <ActivityIndicator color={colors.primary} /> : null}

        {step === 'confirm' && reval ? (
          <View style={styles.card}>
            <Text style={styles.title}>Nouveau prix</Text>
            <Text style={styles.body}>
              Le tarif vient de bouger : {Math.round(reval.displayed_price_pp || 0)} € →{' '}
              {Math.round(reval.revalidated_price_pp || 0)} € par personne.
            </Text>
            <Pressable style={styles.btn} onPress={() => setStep('guests')}>
              <Text style={styles.btnText}>Continuer</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 'guests' ? (
          <View style={styles.card}>
            <View style={styles.titleRow}>
              <UsersIcon size={18} />
              <Text style={styles.title}>Tes infos</Text>
            </View>
            <View style={styles.noticeRow}>
              <TipIcon size={15} />
              <Text style={styles.notice}>
                Ici tu paies seulement l’hôtel. Le vol, tu le réserves ensuite sur
                le site de la compagnie.
              </Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Prénom"
              value={firstName}
              onChangeText={setFirstName}
            />
            <TextInput
              style={styles.input}
              placeholder="Nom"
              value={lastName}
              onChangeText={setLastName}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Pressable
              style={[
                styles.btn,
                (!firstName || !lastName || !email || paying) && styles.btnDisabled,
              ]}
              disabled={!firstName || !lastName || !email || paying}
              onPress={() => void startPrebook()}
            >
              <View style={styles.btnInner}>
                <CardIcon size={16} color={colors.white} />
                <Text style={styles.btnText}>
                  {paying ? '…' : 'Payer l’hôtel'}
                </Text>
              </View>
            </Pressable>
          </View>
        ) : null}

        {step === 'pay' ? (
          <View style={styles.card}>
            <View style={styles.titleRow}>
              <CardIcon size={18} />
              <Text style={styles.title}>Payer l’hôtel</Text>
            </View>
            <Text style={styles.body}>
              Entre ta carte pour confirmer la chambre. Si tu as fermé l’écran,
              rouvre-le ci-dessous.
            </Text>
            {payMeta && bookingId ? (
              <Pressable
                style={styles.btn}
                onPress={() =>
                  navigation.navigate('HotelPayWebView', {
                    bookingId,
                    publicKey: payMeta.payment_public_key,
                    secretKey: payMeta.secret_key,
                    draftToken: draftToken || undefined,
                    firstName,
                    lastName,
                    email,
                    liteapiEnv: payMeta.liteapi_env,
                    returnDealId: dealId,
                    returnHotelId: hotelId,
                  })
                }
              >
                <Text style={styles.btnText}>Reprendre le paiement</Text>
              </Pressable>
            ) : null}
            {payMeta?.liteapi_env === 'sandbox' && bookingId ? (
              <Pressable
                style={styles.btnSecondary}
                onPress={() => void sandboxBook(bookingId)}
              >
                <Text style={styles.btnSecondaryText}>
                  Simuler un paiement (sandbox)
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {step === 'done' ? (
          <View style={styles.card}>
            <Text style={styles.title}>Hôtel réservé ✓</Text>
            <Text style={styles.body}>
              {confirmation
                ? `N° de réservation : ${confirmation}`
                : 'Ta chambre est confirmée et enregistrée sur ton voyage.'}
            </Text>
            {doneNext?.id === 'flight' && flightBookUrl ? (
              <Pressable
                style={styles.btn}
                onPress={() =>
                  openInAppBrowser(navigation, flightBookUrl, 'Réserver le vol')
                }
              >
                <View style={styles.btnInner}>
                  <PlaneIcon size={15} color={colors.white} />
                  <Text style={styles.btnText}>{doneNext.label}</Text>
                </View>
              </Pressable>
            ) : doneNext?.id === 'planner' && plannerTripId ? (
              <Pressable
                style={styles.btn}
                onPress={() =>
                  navigation.navigate('TripDetail', { tripId: plannerTripId })
                }
              >
                <Text style={styles.btnText}>{ACTIVITY_BACK_TO_PLANNER_FR}</Text>
              </Pressable>
            ) : doneNext?.id === 'bookings' ? (
              <Pressable
                style={styles.btn}
                onPress={() => navigation.navigate('Bookings')}
              >
                <Text style={styles.btnText}>{doneNext.label}</Text>
              </Pressable>
            ) : draftToken ? (
              <Pressable style={styles.btn} onPress={goBackToTrip}>
                <Text style={styles.btnText}>
                  {doneNext?.label || 'Voir mon voyage'}
                </Text>
              </Pressable>
            ) : null}
            {draftToken ? (
              <Pressable style={styles.btnSecondary} onPress={goBackToTrip}>
                <Text style={styles.btnSecondaryText}>
                  Retour au voyage (hôtel réservé)
                </Text>
              </Pressable>
            ) : null}
            {plannerTripId && doneNext?.id !== 'planner' ? (
              <Pressable
                style={styles.btnSecondary}
                onPress={() =>
                  navigation.navigate('TripDetail', { tripId: plannerTripId })
                }
              >
                <Text style={styles.btnSecondaryText}>
                  {ACTIVITY_BACK_TO_PLANNER_FR}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.btnSecondary}
              onPress={() => navigation.navigate('Bookings')}
            >
              <Text style={styles.btnSecondaryText}>Mes réservations</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 'error' ? (
          <View style={styles.card}>
            <Text style={styles.error}>{error}</Text>
            <Pressable style={styles.btn} onPress={() => navigation.goBack()}>
              <Text style={styles.btnText}>Retour</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.xl, paddingBottom: 40 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  title: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkSoft, marginBottom: 16 },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
  },
  notice: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
  },
  btnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  btnDisabled: { backgroundColor: colors.line },
  btnText: { fontFamily: fonts.bold, color: colors.white, fontSize: 15 },
  btnSecondary: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
  },
  btnSecondaryText: { fontFamily: fonts.bold, color: colors.ink },
  error: { fontFamily: fonts.medium, color: '#b91c1c', marginBottom: 12 },
})
