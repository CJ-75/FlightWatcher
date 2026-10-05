import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  ScrollView,
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
import { BudgetSlider } from '../components/BudgetSlider'
import { PassengerStepper } from '../components/PassengerStepper'
import { FlexibleDatesModal } from '../components/FlexibleDatesModal'
import { ExcludeDestinationsModal } from '../components/ExcludeDestinationsModal'
import { HoursSheet } from '../components/HoursSheet'
import { Button } from '../components/ui/Button'
import { colors, fonts, shadow } from '../theme'

const PRESETS: { id: DatePresetId; label: string; hint: string }[] = [
  { id: 'weekend', label: 'Ce weekend', hint: 'Sam → Dim' },
  { id: 'next-weekend', label: 'Weekend prochain', hint: 'Samedi suivant' },
  { id: 'next-week', label: 'Semaine prochaine', hint: '3 jours (lun–sam)' },
  { id: 'flexible', label: 'Dates libres', hint: 'Je choisis' },
]

const LOADING_MESSAGES = ['On scanne Ryanair…', 'On croise les prix…', 'Presque là…']

export function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const insets = useSafeAreaInsets()

  const [airport, setAirport] = useState('BVA')
  const [budget, setBudget] = useState(150)
  const [passengers, setPassengers] = useState(1)
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
  const [showHoursList, setShowHoursList] = useState(false)
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
    if (preset !== 'flexible') setPresetDates(generateDatesFromPreset(preset))
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
      setDestinations(normalizeDestinations(raw as never))
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

  const datesSummary = useMemo(() => {
    if (preset === 'flexible') {
      const a = flexibleDates.dates_depart.length
      const r = flexibleDates.dates_retour.length
      if (a === 0 && r === 0) return 'Choisir les dates'
      return `${a} aller · ${r} retour`
    }
    const first = presetDates.dates_depart[0]?.date
    const last = presetDates.dates_retour[presetDates.dates_retour.length - 1]?.date
    if (!first || !last) return '—'
    return `${formatDateFr(first)} → ${formatDateFr(last)}`
  }, [preset, presetDates, flexibleDates])

  const onSearch = async () => {
    setError(null)
    if (!airport || airport.length !== 3 || !isValidAirport) {
      setError(translate('fr', 'search.departureError') || 'Choisis un aéroport valide')
      return
    }
    if (activeDates.dates_depart.length === 0 || activeDates.dates_retour.length === 0) {
      setError('Ajoute au moins une date aller et une date retour')
      if (preset === 'flexible') setShowFlexible(true)
      return
    }

    setLoading(true)
    setLoadingMsg(LOADING_MESSAGES[0])
    try {
      const result = await getApi().inspire({
        budget,
        date_preset: preset,
        departure: airport.trim().toUpperCase(),
        passengers,
        flexible_dates: {
          dates_depart: activeDates.dates_depart,
          dates_retour: activeDates.dates_retour,
        },
        ...(excluded.length > 0 ? { destinations_exclues: excluded } : {}),
      })

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
        /* non-bloquant */
      }

      navigation.navigate('Results', {
        trips: result.resultats as EnrichedTripResponse[],
        title: `${airport} · ${budget}€ · ${passengers}p`,
        searchInfo: {
          airport,
          budget,
          passengers,
          datePreset: preset,
          datesDepart: activeDates.dates_depart,
          datesRetour: activeDates.dates_retour,
          excludedDestinations: excluded,
          searchEventId,
        },
      })
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e)
      if (/timeout|timed out|aborted|network request failed|trop de temps/i.test(raw)) {
        setError(
          'La recherche a pris trop de temps. Vérifie que le backend tourne (python run.py), ou réduis les dates.',
        )
      } else {
        setError(raw || translate('fr', 'app.error'))
      }
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingTitle}>{loadingMsg}</Text>
        <Text style={styles.loadingSub}>
          {airport} · {budget}€
        </Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={['#FFE8DC', '#FFF9F5']}
        locations={[0, 0.35]}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={[
          styles.screen,
          { paddingTop: insets.top + 8, paddingBottom: 10 },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logoMark}>
              <Text style={styles.logoLetter}>F</Text>
            </View>
            <View>
              <Text style={styles.brandName}>FlightWatcher</Text>
              <Text style={styles.brandTag}>Vols bas prix</Text>
            </View>
          </View>
          <Text style={styles.hero}>
            Weekend{'\n'}
            <Text style={styles.heroAccent}>pas cher</Text>
          </Text>
        </View>

        <View style={styles.cardArea}>
          <View style={[styles.card, shadow.soft]}>
            <BudgetSlider value={budget} onChange={setBudget} />

            <View style={styles.divider} />

            <PassengerStepper value={passengers} onChange={setPassengers} />

            <View style={styles.divider} />

            <Text style={styles.label}>Départ</Text>
            <AirportPicker compact airports={airports} value={airport} onChange={setAirport} />

            <View style={styles.divider} />

            <Text style={styles.label}>Quand</Text>
            <View style={styles.presetGrid}>
              {PRESETS.map((p) => {
                const active = preset === p.id
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      setPreset(p.id)
                      if (p.id === 'flexible') setShowFlexible(true)
                    }}
                    style={[styles.presetCard, active && styles.presetCardActive]}
                  >
                    <Text
                      style={[styles.presetLabel, active && styles.presetLabelActive]}
                      numberOfLines={1}
                    >
                      {p.label}
                    </Text>
                    <Text
                      style={[styles.presetHint, active && styles.presetHintActive]}
                      numberOfLines={1}
                    >
                      {p.hint}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <Pressable
              onPress={() => {
                if (preset === 'flexible') setShowFlexible(true)
                else setShowHoursList(true)
              }}
              style={styles.datesRow}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.datesLabel}>
                  {preset === 'flexible' ? 'Dates choisies' : 'Dates & horaires'}
                </Text>
                <Text style={styles.datesValue} numberOfLines={1}>
                  {datesSummary}
                </Text>
              </View>
              <Text style={styles.datesChevron}>›</Text>
            </Pressable>

            <Pressable onPress={() => setShowExclude(true)} style={styles.advRow}>
              <Text style={styles.advLabel}>Exclusions</Text>
              <Text style={[styles.advValue, excluded.length > 0 && styles.advValueActive]}>
                {excluded.length > 0 ? `${excluded.length}` : 'Aucune'} ›
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.footer}>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.error} numberOfLines={2}>
                {error}
              </Text>
            </View>
          ) : null}
          <Button label="Lancer la recherche" onPress={onSearch} style={styles.cta} />
        </View>
      </View>

      {/* Hours list sheet */}
      <Modal
        visible={showHoursList}
        animationType="slide"
        transparent
        onRequestClose={() => setShowHoursList(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setShowHoursList(false)} />
        <View style={[styles.hoursSheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.hoursSheetTitle}>Horaires</Text>
          <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
            {presetDates.dates_depart.map((d, i) => (
              <Pressable
                key={`d-${d.date}`}
                onPress={() => {
                  setShowHoursList(false)
                  setTimeout(() => setHoursEdit({ type: 'depart', index: i }), 250)
                }}
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
                onPress={() => {
                  setShowHoursList(false)
                  setTimeout(() => setHoursEdit({ type: 'retour', index: i }), 250)
                }}
                style={styles.hoursRow}
              >
                <Text style={[styles.hoursTag, styles.hoursTagRetour]}>Retour</Text>
                <Text style={styles.hoursDate}>{formatDateFr(d.date)}</Text>
                <Text style={styles.hoursTime}>
                  {d.heure_min}–{d.heure_max}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </Modal>

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
  screen: {
    flex: 1,
    paddingHorizontal: 18,
  },
  header: {
    marginBottom: 2,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    lineHeight: 22,
    color: colors.white,
    includeFontPadding: false,
  },
  brandName: {
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 18,
    color: colors.ink,
    letterSpacing: -0.2,
    includeFontPadding: false,
  },
  brandTag: {
    fontFamily: fonts.medium,
    fontSize: 11,
    lineHeight: 14,
    color: colors.muted,
    marginTop: 1,
    includeFontPadding: false,
  },
  hero: {
    fontFamily: fonts.extrabold,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -1.2,
    color: colors.ink,
    includeFontPadding: false,
  },
  heroAccent: {
    color: colors.primary,
  },
  cardArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    marginTop: 8,
  },
  loadingRoot: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingTitle: {
    marginTop: 18,
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.ink,
    includeFontPadding: false,
  },
  loadingSub: {
    marginTop: 6,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    includeFontPadding: false,
  },
  card: {
    width: '100%',
    backgroundColor: colors.white,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
    letterSpacing: 0.3,
    marginBottom: 8,
    textTransform: 'uppercase',
    includeFontPadding: false,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginVertical: 12,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetCard: {
    width: '48%',
    flexGrow: 1,
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  presetCardActive: {
    backgroundColor: colors.primary,
  },
  presetLabel: {
    fontFamily: fonts.bold,
    fontSize: 13,
    lineHeight: 17,
    color: colors.ink,
    includeFontPadding: false,
  },
  presetLabelActive: { color: colors.white },
  presetHint: {
    fontFamily: fonts.medium,
    fontSize: 11,
    lineHeight: 14,
    color: colors.muted,
    marginTop: 2,
    includeFontPadding: false,
  },
  presetHintActive: { color: 'rgba(255,255,255,0.85)' },
  datesRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  datesLabel: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.muted,
    includeFontPadding: false,
  },
  datesValue: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.ink,
    marginTop: 1,
    includeFontPadding: false,
  },
  datesChevron: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.primary,
    includeFontPadding: false,
  },
  advRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  advLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.inkSoft,
    includeFontPadding: false,
  },
  advValue: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.muted,
    includeFontPadding: false,
  },
  advValueActive: { color: colors.primary },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
    fontSize: 12,
    lineHeight: 17,
    includeFontPadding: false,
  },
  cta: { minHeight: 52 },
  sheetBackdrop: { flex: 1, backgroundColor: colors.overlay },
  hoursSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    marginBottom: 12,
  },
  hoursSheetTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.ink,
    marginBottom: 12,
    includeFontPadding: false,
  },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 6,
  },
  hoursTag: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.white,
    backgroundColor: colors.primary,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    includeFontPadding: false,
  },
  hoursTagRetour: { backgroundColor: colors.success },
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
})
