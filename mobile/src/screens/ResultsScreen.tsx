import React from 'react'
import { FlatList, StyleSheet, Text, View, Linking } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { EnrichedTripResponse } from '@flightwatcher/shared'
import { STORAGE_KEYS, createAsyncKVStore, kvSetJson, translate } from '@flightwatcher/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { RootStackParamList } from '../../App'
import { getApi } from '../lib/client'
import { DestinationCard } from '../components/DestinationCard'
import { colors, spacing } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'Results'>
const kv = createAsyncKVStore(AsyncStorage)

export function ResultsScreen({ route }: Props) {
  const trips = route.params.trips || []

  const openBooking = async (trip: EnrichedTripResponse) => {
    const url = 'https://www.ryanair.com/fr/fr'
    void getApi()
      .trackBookingSasEvent({
        trip,
        partner_id: 'ryanair',
        partner_name: 'Ryanair',
        redirect_url: url,
        source: 'mobile',
      })
      .catch(() => undefined)
    await Linking.openURL(url)
  }

  const addFavorite = async (trip: EnrichedTripResponse) => {
    try {
      await getApi().saveFavorite({
        trip,
        search_request: {
          aeroport_depart: trip.aller.origin,
          dates_depart: [{ date: trip.aller.departureTime.slice(0, 10) }],
          dates_retour: [{ date: trip.retour.departureTime.slice(0, 10) }],
          budget_max: Math.ceil(trip.prix_total),
        },
      })
    } catch {
      const raw = await kv.getItem(STORAGE_KEYS.FAVORITES)
      const list = raw ? JSON.parse(raw) : []
      list.push({ id: `${Date.now()}`, trip, createdAt: new Date().toISOString() })
      await kvSetJson(kv, STORAGE_KEYS.FAVORITES, list)
    }
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={trips}
      keyExtractor={(item, i) => `${item.destination_code}-${item.aller.departureTime}-${i}`}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>{translate('fr', 'results.title')}</Text>
          <Text style={styles.count}>
            {trips.length} {translate('fr', 'results.destination')}
          </Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>{translate('fr', 'results.noResults')}</Text>}
      renderItem={({ item }) => (
        <DestinationCard
          trip={item}
          onFavorite={() => void addFavorite(item)}
          onBook={() => void openBooking(item)}
        />
      )}
    />
  )
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.bgMuted },
  content: { padding: spacing.lg, paddingBottom: 40 },
  header: { marginBottom: spacing.lg },
  title: { fontSize: 24, fontWeight: '900', color: colors.slate900 },
  count: { color: colors.slate500, fontWeight: '600', marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 48, color: colors.slate500, fontWeight: '600' },
})
