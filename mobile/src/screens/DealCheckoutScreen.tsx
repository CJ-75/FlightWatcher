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
import type { DealRevalidateResponse, TravelDeal } from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../../App'
import { colors, fonts, radius, spacing } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'DealCheckout'>

export function DealCheckoutScreen({ route, navigation }: Props) {
  const { dealId, hotelId } = route.params
  const [deal, setDeal] = useState<TravelDeal | null>(null)
  const [reval, setReval] = useState<DealRevalidateResponse | null>(null)
  const [step, setStep] = useState<'load' | 'confirm' | 'guests' | 'done' | 'error'>('load')
  const [error, setError] = useState<string | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [confirmation, setConfirmation] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const d = await getApi().getDeal(dealId)
        if (cancelled) return
        setDeal(d)
        const key = d.deal_key || d.id
        const r = await getApi().revalidateDeal(key, {
          hotel_id: hotelId || d.hotel?.id,
          displayed_price_pp: d.price_per_person,
        })
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
  }, [dealId, hotelId])

  const payAndBook = async () => {
    if (!deal || !reval?.offer_id || !reval.hotel_id) return
    setError(null)
    try {
      const key = deal.deal_key || deal.id
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
      // Sandbox: skip card SDK, simulate payment success
      const booked = await getApi().bookHotel(pb.booking_id, {
        holder: { firstName, lastName, email },
        guests: [{ firstName, lastName, email, occupancyNumber: 1 }],
        payment_status: 'succeeded',
      })
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
