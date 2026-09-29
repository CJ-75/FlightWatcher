import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type {
  Airport,
  DateAvecHoraire,
  Destination,
  EnrichedTripResponse,
} from '@flightwatcher/shared'
import {
  generateDatesFromPreset,
  formatDateFr,
  normalizeAirports,
  normalizeDestinations,
  translate,
  type DatePresetId,
  type FlexibleDates,
} from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import type { RootStackParamList } from '../../App'
import { AirportPicker } from '../components/AirportPicker'
import { FlexibleDatesModal } from '../components/FlexibleDatesModal'
import { ExcludeDestinationsModal } from '../components/ExcludeDestinationsModal'
import { HoursSheet } from '../components/HoursSheet'
import { Button } from '../components/ui/Button'
import { colors, fonts, shadow } from '../theme'

const PRESETS: { id: DatePresetId; label: string }[] = [
  { id: 'weekend', label: 'Ce\nweekend' },
  { id: 'next-weekend', label: 'Weekend\nprochain' },
  { id: 'next-week', label: '3 jours\nsem. pro' },
  { id: 'flexible', label: 'Dates\nflexibles' },
]

const LOADING_MESSAGES = [
  'On scanne Ryanair…',
  'On croise les prix…',
  'Presque là…',
]

export function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const insets = useSafeAreaInsets()

  const [airport, setAirport] = useState('BVA')
  const [budget, setBudget] = useState(150)
  const [preset, setPreset] = useState<DatePresetId>('next-weekend')
  const [presetDates, setPresetDates] = useState<FlexibleDates>(() =>
    generateDatesFromPreset('next-weekend'),
  )
  const [flexibleDates, setFlexibleDates] = useState<FlexibleDates>({
    dates_depart: [],
    dates_retour: [],
  })
  const [excluded, setExcluded] = useState<string[]>([])
  const [airports, setAirports] = useState<Airport[]>([])
  const [destinations, setDestinations] = useState<Destination[]>([])
  const [loadingDest, setLoadingDest] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState(LOADING_MESSAGES[0])
  const [error, setError] = useState<string | null>(null)

  const [showFlexible, setShowFlexible] = useState(false)
  const [showExclude, setShowExclude] = useState(false)
  const [hoursEdit, setHoursEdit] = useState<{
    type: 'depart' | 'retour'
    index: number
  } | null>(null)

  useEffect(() => {
    getApi()
      .getAirports()
      .then((raw) => setAirports(normalizeAirports(raw as Airport[] | { airports: Airport[] })))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (preset !== 'flexible') {
      setPresetDates(generateDatesFromPreset(preset))
    }
  }, [preset])

  useEffect(() => {
    if (!loading) return
    let i = 0
    const id = setInterval(() => {
      i = (i + 1) % LOADING_MESSAGES.length
      setLoadingMsg(LOADING_MESSAGES[i])
    }, 2200)
    return () => clearInterval(id)
  }, [loading])

  const loadDestinations = useCallback(async () => {
    if (!airport || airport.length !== 3) return
    setLoadingDest(true)
    try {
      const raw = await getApi().getDestinations(airport)
      setDestinations(normalizeDestinations(raw))
    } catch {
      setDestinations([])
    } finally {
      setLoadingDest(false)
    }
  }, [airport])

  useEffect(() => {
    setExcluded([])
    setDestinations([])
    if (airport.length === 3) void loadDestinations()
  }, [airport, loadDestinations])

  const activeDates = preset === 'flexible' ? flexibleDates : presetDates
  const isValidAirport = useMemo(
    () => airports.length === 0 || airports.some((a) => a.code === airport),
    [airports, airport],
  )

  const bumpBudget = (delta: number) => {
    setBudget((b) => Math.min(1000, Math.max(20, b + delta)))
  }

  const updatePresetDate = (type: 'depart' | 'retour', index: number, updated: DateAvecHoraire) => {
    setPresetDates((prev) => {
      const next = { ...prev }
      if (type === 'depart') {
        next.dates_depart = prev.dates_depart.map((d, i) => (i === index ? updated : d))
      } else {
        next.dates_retour = prev.dates_retour.map((d, i) => (i === index ? updated : d))
      }
      return next
    })
  }

  const hoursDate =
    hoursEdit == null
      ? null
      : hoursEdit.type === 'depart'
        ? presetDates.dates_depart[hoursEdit.index]
        : presetDates.dates_retour[hoursEdit.index]

  const onSearch = async () => {
    setError(null)
    if (!airport || airport.length !== 3 || !isValidAirport) {
      setError(translate('fr', 'search.departureError') || 'Choisis un aéroport valide')
      return
    }
    if (activeDates.dates_depart.length === 0 || activeDates.dates_retour.length === 0) {
      setError(
        preset === 'flexible'
          ? 'Ajoute au moins une date aller et une date retour'
          : 'Dates en cours de calcul…',
      )
      if (preset === 'flexible') setShowFlexible(true)
      return
    }

    setLoading(true)
    setLoadingMsg(LOADING_MESSAGES[0])
    try {
      const request = {
        budget,
        date_preset: preset,
        departure: airport.trim().toUpperCase(),
        flexible_dates: {
          dates_depart: activeDates.dates_depart,
          dates_retour: activeDates.dates_retour,
        },
        ...(excluded.length > 0 ? { destinations_exclues: excluded } : {}),
      }
      const result = await getApi().inspire(request)

      let searchEventId: string | null = null
      try {
        const data = (await getApi().trackSearchEvent({
          departure_airport: airport,
          date_preset: preset,
          budget,
          dates_depart: activeDates.dates_depart,
          dates_retour: activeDates.dates_retour,
          destinations_exclues: excluded,
          results_count: result.resultats.length,
          results: result.resultats.slice(0, 10),
          api_requests_count: result.nombre_requetes,
          source: 'mobile',
        })) as { status?: string; id?: string }
        if (data?.status === 'success' && data.id) searchEventId = data.id
      } catch {
        /* analytics non-bloquant */
      }

      navigation.navigate('Results', {
        trips: result.resultats as EnrichedTripResponse[],
        title: `${airport} · ${budget}€`,
        searchInfo: {
          airport,
          budget,
          datePreset: preset,
          datesDepart: activeDates.dates_depart,
          datesRetour: activeDates.dates_retour,
          excludedDestinations: excluded,
          searchEventId,
        },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : translate('fr', 'app.error'))
    } finally {
      setLoading(false)
    }
  }

  const fillPct = Math.max(8, Math.min(100, ((budget - 20) / 980) * 100))

  if (loading) {
    return (
      <View style={[styles.loadingRoot, { paddingTop: insets.top + 40 }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingTitle}>{loadingMsg}</Text>
        <Text style={styles.loadingSub}>
          {airport} · {budget}€ · {activeDates.dates_depart.length + activeDates.dates_retour.length}{' '}
          dates
        </Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={8}
    >
      <ScrollView
        style={styles.root}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingBottom: 24,
          paddingHorizontal: 20,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.kicker}>FLIGHTWATCHER</Text>
        <Text style={styles.hero}>Weekend pas cher</Text>

        <View style={[styles.card, shadow.soft]}>
          <Text style={styles.label}>Mon budget</Text>
          <View style={styles.budgetRow}>
            <Pressable
              onPress={() => bumpBudget(-10)}
              style={({ pressed }) => [styles.budgetBtn, pressed && styles.budgetBtnPressed]}
            >
              <Text style={styles.budgetBtnText}>−</Text>
            </Pressable>
            <View style={styles.budgetValueWrap}>
              <Text style={styles.budgetValue} numberOfLines={1} adjustsFontSizeToFit>
                {budget}€
              </Text>
            </View>
            <Pressable
              onPress={() => bumpBudget(10)}
              style={({ pressed }) => [styles.budgetBtn, pressed && styles.budgetBtnPressed]}
            >
              <Text style={styles.budgetBtnText}>+</Text>
            </Pressable>
          </View>
          <View style={styles.budgetTrack}>
            <LinearGradient
              colors={[colors.primaryMuted, colors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.budgetFill, { width: `${fillPct}%` }]}
            />
          </View>

          <View style={styles.divider} />

          <Text style={styles.label}>Départ</Text>
          <AirportPicker airports={airports} value={airport} onChange={setAirport} />
          {!isValidAirport && airport.length === 3 ? (
            <Text style={styles.fieldError}>Aéroport inconnu</Text>
          ) : null}

          <View style={styles.divider} />

          <Text style={styles.label}>Je pars</Text>
          <View style={styles.chips}>
            {PRESETS.map((p) => {
              const active = preset === p.id
              return (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    setPreset(p.id)
                    if (p.id === 'flexible') setShowFlexible(true)
                  }}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
                </Pressable>
              )
            })}
          </View>

          {preset !== 'flexible' ? (
            <View style={styles.hoursBlock}>
              <Text style={styles.hoursTitle}>Horaires</Text>
              {presetDates.dates_depart.map((d, i) => (
                <Pressable
                  key={`d-${d.date}`}
                  onPress={() => setHoursEdit({ type: 'depart', index: i })}
                  style={styles.hoursRow}
                >
                  <Text style={styles.hoursTag}>Aller</Text>
                  <Text style={styles.hoursDate}>{formatDateFr(d.date)}</Text>
                  <Text style={styles.hoursTime}>
                    {d.heure_min}–{d.heure_max}
                  </Text>
                </Pressable>
              ))}
              {presetDates.dates_retour.map((d, i) => (
                <Pressable
                  key={`r-${d.date}`}
                  onPress={() => setHoursEdit({ type: 'retour', index: i })}
                  style={styles.hoursRow}
                >
                  <Text style={[styles.hoursTag, styles.hoursTagRetour]}>Retour</Text>
                  <Text style={styles.hoursDate}>{formatDateFr(d.date)}</Text>
                  <Text style={styles.hoursTime}>
                    {d.heure_min}–{d.heure_max}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Pressable onPress={() => setShowFlexible(true)} style={styles.flexSummary}>
              <Text style={styles.flexSummaryText}>
                {flexibleDates.dates_depart.length} aller · {flexibleDates.dates_retour.length}{' '}
                retour — modifier
              </Text>
            </Pressable>
          )}

          <View style={styles.divider} />

          <Pressable onPress={() => setShowExclude(true)} style={styles.advRow}>
            <Text style={styles.advLabel}>Exclure des destinations</Text>
            <Text style={styles.advValue}>
              {excluded.length > 0 ? `${excluded.length}` : 'Aucune'} ›
            </Text>
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}

        <Button
          label="Lancer la recherche"
          onPress={onSearch}
          style={{ marginTop: 14 }}
        />
      </ScrollView>

      <HoursSheet
        visible={!!hoursEdit}
        date={hoursDate || null}
        type={hoursEdit?.type || 'depart'}
        onClose={() => setHoursEdit(null)}
        onUpdate={(updated) => {
          if (hoursEdit) updatePresetDate(hoursEdit.type, hoursEdit.index, updated)
        }}
      />

      <FlexibleDatesModal
        visible={showFlexible}
        value={flexibleDates}
        onChange={setFlexibleDates}
        onClose={() => setShowFlexible(false)}
      />

      <ExcludeDestinationsModal
        visible={showExclude}
        destinations={destinations}
        excluded={excluded}
        loading={loadingDest}
        onChange={setExcluded}
        onClose={() => setShowExclude(false)}
        onLoad={() => void loadDestinations()}
      />
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  loadingRoot: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingTitle: {
    marginTop: 20,
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.ink,
    textAlign: 'center',
    includeFontPadding: false,
  },
  loadingSub: {
    marginTop: 8,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
    includeFontPadding: false,
  },
  kicker: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    lineHeight: 14,
    color: colors.primary,
    letterSpacing: 1.8,
    marginBottom: 4,
    includeFontPadding: false,
  },
  hero: {
    fontFamily: fonts.extrabold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.8,
    color: colors.ink,
    marginBottom: 14,
    includeFontPadding: false,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
    marginBottom: 8,
    includeFontPadding: false,
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  budgetBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetBtnPressed: { backgroundColor: colors.primaryMuted },
  budgetBtnText: {
    fontFamily: fonts.bold,
    fontSize: 24,
    lineHeight: 28,
    color: colors.primary,
    includeFontPadding: false,
  },
  budgetValueWrap: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetValue: {
    fontFamily: fonts.extrabold,
    fontSize: 36,
    lineHeight: 44,
    color: colors.ink,
    includeFontPadding: false,
  },
  budgetTrack: {
    marginTop: 10,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primarySoft,
    overflow: 'hidden',
  },
  budgetFill: { height: '100%', borderRadius: 3 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginVertical: 14,
  },
  fieldError: {
    marginTop: 6,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.danger,
    includeFontPadding: false,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    width: '23%',
    flexGrow: 1,
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    paddingHorizontal: 4,
    paddingVertical: 8,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 15,
    color: colors.inkSoft,
    textAlign: 'center',
    includeFontPadding: false,
  },
  chipTextActive: { color: colors.primaryInk },
  hoursBlock: { marginTop: 12, gap: 6 },
  hoursTitle: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.muted,
    marginBottom: 2,
    includeFontPadding: false,
  },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.canvas,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  hoursTag: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.primaryInk,
    backgroundColor: colors.primarySoft,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    includeFontPadding: false,
  },
  hoursTagRetour: { backgroundColor: '#D1FAE5', color: '#065F46' },
  hoursDate: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.ink,
    includeFontPadding: false,
  },
  hoursTime: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    includeFontPadding: false,
  },
  flexSummary: {
    marginTop: 12,
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    padding: 12,
  },
  flexSummaryText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primaryInk,
    includeFontPadding: false,
  },
  advRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  advLabel: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
    includeFontPadding: false,
  },
  advValue: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.muted,
    includeFontPadding: false,
  },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    includeFontPadding: false,
  },
})
