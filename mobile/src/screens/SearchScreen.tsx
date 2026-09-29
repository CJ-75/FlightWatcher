import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Airport, DateAvecHoraire, EnrichedTripResponse } from '@flightwatcher/shared'
import { normalizeAirports, translate } from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import type { RootStackParamList } from '../../App'
import { Button } from '../components/ui/Button'
import { colors, fonts, radius, shadow, spacing } from '../theme'

const PRESETS = [
  { id: 'weekend', label: 'Ce weekend' },
  { id: 'next-weekend', label: 'Weekend prochain' },
  { id: 'next-week', label: '3 jours\nsemaine pro' },
] as const

function nextWeekendDates(): { dates_depart: DateAvecHoraire[]; dates_retour: DateAvecHoraire[] } {
  const now = new Date()
  const day = now.getDay()
  const toSat = (6 - day + 7) % 7 || 7
  const sat = new Date(now)
  sat.setDate(now.getDate() + toSat)
  const sun = new Date(sat)
  sun.setDate(sat.getDate() + 1)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return {
    dates_depart: [{ date: iso(sat), heure_min: '06:00', heure_max: '22:00' }],
    dates_retour: [{ date: iso(sun), heure_min: '06:00', heure_max: '23:59' }],
  }
}

export function SearchScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const insets = useSafeAreaInsets()
  const [airport, setAirport] = useState('BVA')
  const [budget, setBudget] = useState(150)
  const [preset, setPreset] = useState<(typeof PRESETS)[number]['id']>('next-weekend')
  const [airportsCount, setAirportsCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getApi()
      .getAirports()
      .then((raw) => setAirportsCount(normalizeAirports(raw as Airport[] | { airports: Airport[] }).length))
      .catch(() => undefined)
  }, [])

  const bumpBudget = (delta: number) => {
    setBudget((b) => Math.min(500, Math.max(30, b + delta)))
  }

  const onSearch = async () => {
    setLoading(true)
    setError(null)
    try {
      const dates = nextWeekendDates()
      const result = await getApi().inspire({
        budget,
        date_preset: preset,
        departure: airport.trim().toUpperCase(),
        flexible_dates: dates,
      })
      navigation.navigate('Results', {
        trips: result.resultats as EnrichedTripResponse[],
        title: `${airport.toUpperCase()} · ${budget}€`,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : translate('fr', 'app.error'))
    } finally {
      setLoading(false)
    }
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
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 110,
          paddingHorizontal: 20,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.kicker}>FLIGHTWATCHER</Text>
        <Text style={styles.hero}>Trouve ton{'\n'}weekend pas cher</Text>
        <Text style={styles.lead}>Budget, aéroport, dates — on s’occupe du reste.</Text>

        {/* Budget */}
        <View style={[styles.panel, shadow.soft]}>
          <Text style={styles.sectionLabel}>Mon budget</Text>
          <Text style={styles.sectionHint}>Maximum aller-retour</Text>

          <View style={styles.budgetBlock}>
            <Pressable
              onPress={() => bumpBudget(-10)}
              hitSlop={8}
              style={({ pressed }) => [styles.budgetBtn, pressed && styles.budgetBtnPressed]}
            >
              <Text style={styles.budgetBtnText}>−</Text>
            </Pressable>

            <View style={styles.budgetValueWrap}>
              <Text
                style={styles.budgetValue}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {budget}€
              </Text>
            </View>

            <Pressable
              onPress={() => bumpBudget(10)}
              hitSlop={8}
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
              style={[
                styles.budgetFill,
                { width: `${Math.max(8, Math.min(100, ((budget - 30) / 470) * 100))}%` },
              ]}
            />
          </View>
        </View>

        {/* Departure */}
        <View style={[styles.panel, shadow.soft]}>
          <Text style={styles.sectionLabel}>Départ</Text>
          <Text style={styles.sectionHint}>Code IATA de ton aéroport</Text>
          <TextInput
            style={styles.input}
            value={airport}
            onChangeText={(t) => setAirport(t.replace(/[^a-zA-Z]/g, '').toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="BVA"
            placeholderTextColor={colors.faint}
            maxLength={3}
          />
          {airportsCount > 0 ? (
            <Text style={styles.meta}>{airportsCount} aéroports disponibles</Text>
          ) : null}
        </View>

        {/* When */}
        <View style={[styles.panel, shadow.soft]}>
          <Text style={styles.sectionLabel}>Je pars</Text>
          <Text style={styles.sectionHint}>Choisis une période</Text>
          <View style={styles.chips}>
            {PRESETS.map((p) => {
              const active = preset === p.id
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setPreset(p.id)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {p.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}

        <Button
          label={loading ? 'Recherche…' : 'Lancer la recherche'}
          onPress={onSearch}
          loading={loading}
          style={styles.cta}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  kicker: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 16,
    color: colors.primary,
    letterSpacing: 2,
    marginBottom: 10,
    includeFontPadding: false,
  },
  hero: {
    fontFamily: fonts.extrabold,
    fontSize: 34,
    lineHeight: 42,
    letterSpacing: -1.1,
    color: colors.ink,
    marginBottom: 10,
    includeFontPadding: false,
  },
  lead: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    marginBottom: 24,
    includeFontPadding: false,
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'visible',
  },
  sectionLabel: {
    fontFamily: fonts.bold,
    fontSize: 17,
    lineHeight: 26,
    color: colors.ink,
    includeFontPadding: false,
  },
  sectionHint: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    marginTop: 2,
    marginBottom: 16,
    includeFontPadding: false,
  },
  budgetBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 72,
  },
  budgetBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetBtnPressed: { backgroundColor: colors.primaryMuted },
  budgetBtnText: {
    fontFamily: fonts.bold,
    fontSize: 28,
    lineHeight: 34,
    color: colors.primary,
    includeFontPadding: false,
    textAlign: 'center',
  },
  budgetValueWrap: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  budgetValue: {
    fontFamily: fonts.extrabold,
    fontSize: 44,
    lineHeight: 56,
    letterSpacing: -1.2,
    color: colors.ink,
    textAlign: 'center',
    includeFontPadding: false,
  },
  budgetTrack: {
    marginTop: 16,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primarySoft,
    overflow: 'hidden',
  },
  budgetFill: {
    height: '100%',
    borderRadius: 3,
  },
  input: {
    backgroundColor: colors.canvas,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 16 : 14,
    fontSize: 20,
    lineHeight: 26,
    fontFamily: fonts.bold,
    color: colors.ink,
    letterSpacing: 3,
    textAlign: 'center',
  },
  meta: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 18,
    color: colors.faint,
    marginTop: 10,
    textAlign: 'center',
    includeFontPadding: false,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  chipText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    textAlign: 'center',
    includeFontPadding: false,
  },
  chipTextActive: { color: colors.primaryInk },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 20,
    includeFontPadding: false,
  },
  cta: { marginTop: 10 },
})
