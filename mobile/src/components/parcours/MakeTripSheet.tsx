import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  arrivalCodesForCitySlug,
  citySlugDisplayNameFr,
  encodeAirportCodes,
  generateDatesFromPreset,
  parseAirportCodes,
  partyModeDefaultPassengers,
  suggestedParcoursDates,
  type Itinerary,
  type PartyMode,
} from '@flightwatcher/shared'
import { getApi } from '../../lib/client'
import { useAuth } from '../../context/AuthContext'
import { fonts, colors, spacing } from '../../theme'

type Props = {
  visible: boolean
  itinerary: Itinerary
  onClose: () => void
  onCreated: (tripId: string) => void
}

export function MakeTripSheet({
  visible,
  itinerary,
  onClose,
  onCreated,
}: Props) {
  const insets = useSafeAreaInsets()
  const { user, signInWithGoogle } = useAuth()
  const suggested = useMemo(
    () => suggestedParcoursDates(itinerary),
    [itinerary],
  )
  const [departure, setDeparture] = useState('CDG,ORY')
  const [partyMode, setPartyMode] = useState<PartyMode>('duo')
  const [passengers, setPassengers] = useState(2)
  const [outbound, setOutbound] = useState(suggested.outbound)
  const [inbound, setInbound] = useState(suggested.inbound)
  const [budget, setBudget] = useState('200')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setPassengers(partyModeDefaultPassengers(partyMode))
  }, [partyMode])

  useEffect(() => {
    setOutbound(suggested.outbound)
    setInbound(suggested.inbound)
  }, [suggested])

  const cityLabel =
    citySlugDisplayNameFr(itinerary.city_slug) ||
    itinerary.city_slug ||
    ''

  const submit = async () => {
    setError(null)
    if (!user) {
      const { error: authErr } = await signInWithGoogle()
      if (authErr) {
        setError(authErr.message || 'Connexion requise')
        return
      }
    }
    const dep = encodeAirportCodes(parseAirportCodes(departure))
    if (!dep) {
      setError('Indique un aéroport de départ (ex. CDG,ORY)')
      return
    }
    setSaving(true)
    try {
      const api = getApi()
      const arrival = arrivalCodesForCitySlug(itinerary.city_slug)
      const trip = await api.createPlannedTrip({
        name: itinerary.title || `Week-end ${cityLabel}`,
        departure_airport: dep,
        arrival_airport: arrival || null,
        passengers,
        dates_depart: [
          { date: outbound, heure_min: '00:00', heure_max: '23:59' },
        ],
        dates_retour: [
          { date: inbound, heure_min: '00:00', heure_max: '23:59' },
        ],
        budget_max: Number(budget) || 200,
        direct: false,
      })
      await api.applyItinerary(itinerary.id, { planned_trip_id: trip.id })
      void api
        .trackActivityEvent({
          domain: 'itinerary',
          event: 'itinerary_make_trip',
          surface: 'parcours',
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
          meta: { itinerary_id: itinerary.id, trip_id: trip.id },
        })
        .catch(() => {})
      onCreated(trip.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Création impossible')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <Text style={[styles.title, { marginTop: 8 }]}>En faire mon voyage</Text>
          <Text style={styles.sub}>
            {itinerary.title}
            {cityLabel ? ` · ${cityLabel}` : ''}
          </Text>

          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Qui voyage ?</Text>
            <View style={styles.row}>
              {(
                [
                  { id: 'solo' as const, label: 'Solo' },
                  { id: 'duo' as const, label: 'Duo' },
                  { id: 'groupe' as const, label: 'Groupe' },
                ] as const
              ).map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => setPartyMode(p.id)}
                  style={[styles.pill, partyMode === p.id && styles.pillOn]}
                >
                  <Text
                    style={[
                      styles.pillText,
                      partyMode === p.id && styles.pillTextOn,
                    ]}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Voyageurs · {passengers}</Text>
            <View style={styles.row}>
              <Pressable
                style={styles.stepBtn}
                onPress={() => setPassengers((n) => Math.max(1, n - 1))}
              >
                <Text style={styles.stepBtnText}>−</Text>
              </Pressable>
              <Pressable
                style={styles.stepBtn}
                onPress={() => setPassengers((n) => Math.min(9, n + 1))}
              >
                <Text style={styles.stepBtnText}>+</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Départ (IATA)</Text>
            <TextInput
              value={departure}
              onChangeText={setDeparture}
              autoCapitalize="characters"
              placeholder="CDG,ORY"
              style={styles.input}
            />

            <Text style={styles.label}>Aller</Text>
            <TextInput
              value={outbound}
              onChangeText={setOutbound}
              placeholder="YYYY-MM-DD"
              style={styles.input}
            />
            <Text style={styles.label}>Retour</Text>
            <TextInput
              value={inbound}
              onChangeText={setInbound}
              placeholder="YYYY-MM-DD"
              style={styles.input}
            />
            <Pressable
              onPress={() => {
                const d = generateDatesFromPreset('next-weekend')
                if (d.dates_depart[0]?.date) setOutbound(d.dates_depart[0].date)
                if (d.dates_retour[0]?.date) setInbound(d.dates_retour[0].date)
              }}
            >
              <Text style={styles.link}>Week-end prochain</Text>
            </Pressable>

            <Text style={styles.label}>Budget max / pers. (€)</Text>
            <TextInput
              value={budget}
              onChangeText={setBudget}
              keyboardType="number-pad"
              style={styles.input}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </ScrollView>

          <Pressable
            style={[styles.cta, saving && { opacity: 0.6 }]}
            disabled={saving}
            onPress={() => void submit()}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>Créer le voyage</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: spacing.xl,
    paddingTop: 10,
    gap: 10,
  },
  title: { fontFamily: fonts.extrabold, fontSize: 20, color: colors.ink },
  sub: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted, marginBottom: 8 },
  label: {
    marginTop: 10,
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  pill: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 10,
    alignItems: 'center',
  },
  pillOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  pillText: { fontFamily: fonts.bold, fontSize: 13, color: colors.muted },
  pillTextOn: { color: '#F5EFEA' },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F7F4EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  link: {
    marginTop: 8,
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.primary,
  },
  error: { marginTop: 8, fontFamily: fonts.semibold, color: colors.danger },
  cta: {
    marginTop: 12,
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: { color: '#fff', fontFamily: fonts.bold, fontSize: 15 },
})
