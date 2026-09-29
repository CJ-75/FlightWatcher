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
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Airport, DateAvecHoraire, EnrichedTripResponse } from '@flightwatcher/shared'
import { normalizeAirports, translate } from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import type { RootStackParamList } from '../../App'
import { Button } from '../components/ui/Button'
import { colors, fonts, radius, shadow, spacing, type } from '../theme'

const PRESETS = [
  { id: 'weekend', labelKey: 'search.preset.weekend' },
  { id: 'next-weekend', labelKey: 'search.preset.nextWeekend' },
  { id: 'next-week', labelKey: 'search.preset.nextWeek' },
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
    >
      <ScrollView
        style={styles.root}
        contentContainerStyle={{
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: spacing.xl,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.kicker}>FlightWatcher</Text>
        <Text style={styles.hero}>{translate('fr', 'app.subtitle')}</Text>

        <View style={[styles.card, shadow.soft]}>
          <Text style={styles.label}>{translate('fr', 'search.budget')}</Text>
          <View style={styles.budgetRow}>
            <Pressable
              onPress={() => bumpBudget(-10)}
              style={({ pressed }) => [styles.budgetBtn, pressed && styles.budgetBtnPressed]}
            >
              <Text style={styles.budgetBtnText}>−</Text>
            </Pressable>
            <View style={styles.budgetCenter}>
              <Text style={styles.budgetValue}>{budget}</Text>
              <Text style={styles.budgetCurrency}>€</Text>
            </View>
            <Pressable
              onPress={() => bumpBudget(10)}
              style={({ pressed }) => [styles.budgetBtn, pressed && styles.budgetBtnPressed]}
            >
              <Text style={styles.budgetBtnText}>+</Text>
            </Pressable>
          </View>
          <Text style={styles.budgetHint}>{translate('fr', 'search.budget.total')}</Text>

          <View style={styles.separator} />

          <Text style={styles.label}>{translate('fr', 'search.departure')}</Text>
          <TextInput
            style={styles.input}
            value={airport}
            onChangeText={setAirport}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="BVA, CDG, ORY…"
            placeholderTextColor={colors.faint}
            maxLength={3}
          />
          {airportsCount > 0 ? (
            <Text style={styles.meta}>{airportsCount} aéroports Ryanair</Text>
          ) : null}

          <Text style={[styles.label, { marginTop: spacing.xxl }]}>{translate('fr', 'search.when')}</Text>
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
                    {translate('fr', p.labelKey)}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label={loading ? translate('fr', 'search.inProgress') : translate('fr', 'search.launch')}
            onPress={onSearch}
            loading={loading}
            style={{ marginTop: spacing.xxl }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  kicker: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primary,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  hero: {
    ...type.hero,
    fontSize: 32,
    lineHeight: 38,
    marginBottom: spacing.xxl,
    maxWidth: 320,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  label: { ...type.section, marginBottom: spacing.md },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    color: colors.primary,
    marginTop: -2,
  },
  budgetCenter: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  budgetValue: {
    fontFamily: fonts.extrabold,
    fontSize: 48,
    letterSpacing: -1.5,
    color: colors.ink,
    lineHeight: 52,
  },
  budgetCurrency: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.primary,
    marginBottom: 8,
  },
  budgetHint: { ...type.caption, textAlign: 'center', marginTop: spacing.sm },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginVertical: spacing.xxl,
  },
  input: {
    backgroundColor: colors.canvas,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 16 : 14,
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.ink,
    letterSpacing: 2,
  },
  meta: { ...type.caption, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: colors.white,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  chipText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.inkSoft,
  },
  chipTextActive: { color: colors.primaryInk },
  error: {
    fontFamily: fonts.medium,
    color: colors.danger,
    marginTop: spacing.lg,
    fontSize: 13,
  },
})
