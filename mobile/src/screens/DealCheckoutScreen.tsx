import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Linking,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type {
  DealRevalidateResponse,
  MyTripDraft,
  TravelDeal,
} from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../../App'
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
      origin_iata: fl.origin_iata,
      destination_iata: fl.destination_iata,
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
  const { dealId, draftToken, hotelId } = route.params
  const [deal, setDeal] = useState<TravelDeal | null>(null)
  const [reval, setReval] = useState<DealRevalidateResponse | null>(null)
  const [step, setStep] = useState<'load' | 'confirm' | 'guests' | 'done' | 'error'>(
    'load',
  )
  const [error, setError] = useState<string | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [confirmation, setConfirmation] = useState<string | null>(null)

  useEffect(() => {
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
  }, [dealId, draftToken, hotelId])

  const payAndBook = async () => {
    if (!deal || !reval?.offer_id || !reval.hotel_id) return
    setError(null)
    try {
      const key =
        draftToken && !String(deal.deal_key || '').startsWith('mytrip-')
          ? `mytrip-${draftToken}`
          : deal.deal_key || deal.id || (draftToken ? `mytrip-${draftToken}` : '')
      const hotelCharge = reval.public_hotel_price ?? 0
      const pb = await getApi().prebookHotel({
        deal_key: key,
        offer_id: reval.offer_id,
        hotel_id: reval.hotel_id,
        displayed_price: hotelCharge,
        charged_price: hotelCharge,
        margin_pct_used: reval.margin_pct_used,
        ssp_at_booking: reval.ssp_total,
        deal_snapshot: reval.deal_snapshot || deal,
      })
      const booked = await getApi().bookHotel(pb.booking_id, {
        holder: { firstName, lastName, email },
        guests: [{ firstName, lastName, email, occupancyNumber: 1 }],
        payment_status: 'succeeded',
      })
      if (draftToken) {
        try {
          await getApi().markMyTripHotelBooked(draftToken, {
            booking_id: pb.booking_id,
            confirmation_code: booked.confirmation_code || null,
            holder_email: email,
          })
        } catch {
          /* non-blocking */
        }
      }
      setConfirmation(booked.confirmation_code || booked.status)
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setStep('error')
    }
  }

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <ScrollView contentContainerStyle={styles.content}>
        {step === 'load' ? <ActivityIndicator color={colors.primary} /> : null}

        {step === 'confirm' && reval ? (
          <View style={styles.card}>
            <Text style={styles.title}>Prix mis à jour</Text>
            <Text style={styles.body}>
              {Math.round(reval.displayed_price_pp || 0)} € →{' '}
              {Math.round(reval.revalidated_price_pp || 0)} € / pers.
            </Text>
            <Pressable style={styles.btn} onPress={() => setStep('guests')}>
              <Text style={styles.btnText}>Continuer</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 'guests' ? (
          <View style={styles.card}>
            <Text style={styles.title}>Coordonnées</Text>
            <Text style={styles.notice}>
              Deux réservations distinctes. Paiement sandbox = simulation après prebook.
            </Text>
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
              style={[styles.btn, (!firstName || !lastName || !email) && styles.btnDisabled]}
              disabled={!firstName || !lastName || !email}
              onPress={() => void payAndBook()}
            >
              <Text style={styles.btnText}>Prebook + payer (sandbox)</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 'done' ? (
          <View style={styles.card}>
            <Text style={styles.title}>Réservation enregistrée</Text>
            <Text style={styles.body}>{confirmation}</Text>
            {deal?.flight?.booking_url ? (
              <Pressable
                style={styles.btnSecondary}
                onPress={() => void Linking.openURL(deal.flight!.booking_url!)}
              >
                <Text style={styles.btnSecondaryText}>Réserver le vol</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.btn} onPress={() => navigation.navigate('Bookings')}>
              <Text style={styles.btnText}>Mes réservations</Text>
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
  title: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink, marginBottom: 8 },
  body: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkSoft, marginBottom: 16 },
  notice: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    marginBottom: 12,
    lineHeight: 18,
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
  },
  btnSecondaryText: { fontFamily: fonts.bold, color: colors.ink },
  error: { fontFamily: fonts.medium, color: '#b91c1c', marginBottom: 12 },
})
