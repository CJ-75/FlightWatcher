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
import { normalizeAirports } from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import type { RootStackParamList } from '../../App'

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
  const [budget, setBudget] = useState('150')
  const [airports, setAirports] = useState<Airport[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getApi()
      .getAirports()
      .then((raw) => setAirports(normalizeAirports(raw as Airport[] | { airports: Airport[] })))
      .catch(() => undefined)
  }, [])

  const onSearch = async () => {
    setLoading(true)
    setError(null)
    try {
      const dates = nextWeekendDates()
      const result = await getApi().inspire({
        budget: Number(budget) || 150,
        date_preset: 'next-weekend',
        departure: airport.trim().toUpperCase(),
        flexible_dates: dates,
      })
      navigation.navigate('Results', {
        trips: result.resultats as EnrichedTripResponse[],
        title: `${airport} · ${budget}€`,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de recherche')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Aéroport de départ</Text>
      <TextInput
        style={styles.input}
        value={airport}
        onChangeText={setAirport}
        autoCapitalize="characters"
        placeholder="BVA"
        placeholderTextColor="#5A7388"
      />
      {airports.length > 0 ? (
        <Text style={styles.hint}>{airports.length} aéroports disponibles</Text>
      ) : null}

      <Text style={styles.label}>Budget max (aller-retour)</Text>
      <TextInput
        style={styles.input}
        value={budget}
        onChangeText={setBudget}
        keyboardType="number-pad"
        placeholder="150"
        placeholderTextColor="#5A7388"
      />

      <Text style={styles.preset}>Preset: weekend prochain</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.button} onPress={onSearch} disabled={loading}>
        {loading ? <ActivityIndicator color="#0B1F33" /> : <Text style={styles.buttonText}>Lancer la recherche</Text>}
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4F8' },
  content: { padding: 20 },
  label: { fontWeight: '600', color: '#0B1F33', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#D5DEE7',
    color: '#0B1F33',
  },
  hint: { color: '#5A7388', fontSize: 12, marginTop: 4 },
  preset: { marginTop: 16, color: '#5A7388' },
  button: {
    marginTop: 24,
    backgroundColor: '#3DBDA7',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#0B1F33', fontWeight: '700', fontSize: 16 },
  error: { color: '#C0392B', marginTop: 12 },
})
