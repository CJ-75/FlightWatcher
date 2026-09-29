import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useNavigation } from '@react-navigation/native'
import type { Airport, DateAvecHoraire, EnrichedTripResponse } from '@flightwatcher/shared'
import { normalizeAirports, translate } from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import type { RootStackParamList } from '../../App'
import { colors, radius, spacing } from '../theme'

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
  const [airport, setAirport] = useState('BVA')
  const [budget, setBudget] = useState(150)
  const [preset, setPreset] = useState<(typeof PRESETS)[number]['id']>('next-weekend')
  const [airports, setAirports] = useState<Airport[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getApi()
      .getAirports()
      .then((raw) => setAirports(normalizeAirports(raw as Airport[] | { airports: Airport[] })))
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.brand}>FlightWatcher</Text>
      <Text style={styles.tagline}>{translate('fr', 'app.subtitle')}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>{translate('fr', 'search.budget')}</Text>
        <View style={styles.budgetRow}>
          <Pressable style={styles.budgetBtn} onPress={() => bumpBudget(-10)}>
            <Text style={styles.budgetBtnText}>−</Text>
          </Pressable>
          <Text style={styles.budgetValue}>{budget} €</Text>
          <Pressable style={styles.budgetBtn} onPress={() => bumpBudget(10)}>
            <Text style={styles.budgetBtnText}>+</Text>
          </Pressable>
        </View>
        <Text style={styles.budgetHint}>{translate('fr', 'search.budget.total')}</Text>

        <Text style={styles.label}>{translate('fr', 'search.departure')}</Text>
        <TextInput
          style={styles.input}
          value={airport}
          onChangeText={setAirport}
          autoCapitalize="characters"
          placeholder="BVA, CDG, ORY..."
          placeholderTextColor={colors.slate400}
        />
        {airports.length > 0 ? (
          <Text style={styles.meta}>{airports.length} aéroports disponibles</Text>
        ) : null}

        <Text style={[styles.label, { marginTop: spacing.xl }]}>{translate('fr', 'search.when')}</Text>
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

        <Pressable style={[styles.cta, loading && styles.ctaDisabled]} onPress={onSearch} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.ctaText}>{translate('fr', 'search.launch')}</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.xl, paddingBottom: 48 },
  brand: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.slate900,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  tagline: {
    textAlign: 'center',
    color: colors.slate600,
    fontWeight: '600',
    marginBottom: spacing.xl,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.xl,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.slate100,
  },
  label: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.slate900,
    marginBottom: spacing.md,
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: 4,
  },
  budgetBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.primary50,
    borderWidth: 2,
    borderColor: colors.primary100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetBtnText: { fontSize: 24, fontWeight: '800', color: colors.primary },
  budgetValue: { fontSize: 36, fontWeight: '900', color: colors.primary, minWidth: 110, textAlign: 'center' },
  budgetHint: { textAlign: 'center', color: colors.slate500, marginBottom: spacing.xl },
  input: {
    backgroundColor: colors.bgMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.slate200,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '700',
    color: colors.slate900,
  },
  meta: { color: colors.slate400, fontSize: 12, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.slate200,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.white,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary50,
  },
  chipText: { color: colors.slate600, fontWeight: '700', fontSize: 13 },
  chipTextActive: { color: colors.primary700 },
  error: { color: colors.danger, marginTop: spacing.md },
  cta: {
    marginTop: spacing.xxl,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: colors.white, fontWeight: '900', fontSize: 17 },
})
