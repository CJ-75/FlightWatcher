import React from 'react'
import { View, Text, FlatList, Pressable, StyleSheet, Linking } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { EnrichedTripResponse } from '@flightwatcher/shared'
import type { RootStackParamList } from '../../App'
import { getApi } from '../lib/client'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { STORAGE_KEYS, kvSetJson, createAsyncKVStore } from '@flightwatcher/shared'

type Props = NativeStackScreenProps<RootStackParamList, 'Results'>

const kv = createAsyncKVStore(AsyncStorage)

function formatPrice(n: number) {
  return `${Math.round(n)} €`
}

export function ResultsScreen({ route }: Props) {
  const trips = route.params.trips || []

  const openBooking = async (trip: EnrichedTripResponse) => {
    const url = `https://www.ryanair.com/fr/fr`
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
      // fallback local
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
      ListEmptyComponent={<Text style={styles.empty}>Aucun résultat</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.dest}>
            {item.aller.origin} → {item.destination_code}
          </Text>
          <Text style={styles.price}>{formatPrice(item.prix_total)}</Text>
          {item.is_good_deal ? <Text style={styles.deal}>Bon deal</Text> : null}
          <Text style={styles.meta}>
            Aller {item.aller.departureTime.slice(0, 16)} · {formatPrice(item.aller.price)}
          </Text>
          <Text style={styles.meta}>
            Retour {item.retour.departureTime.slice(0, 16)} · {formatPrice(item.retour.price)}
          </Text>
          <View style={styles.row}>
            <Pressable style={styles.secondary} onPress={() => addFavorite(item)}>
              <Text style={styles.secondaryText}>Favori</Text>
            </Pressable>
            <Pressable style={styles.primary} onPress={() => openBooking(item)}>
              <Text style={styles.primaryText}>Réserver</Text>
            </Pressable>
          </View>
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#F0F4F8' },
  content: { padding: 16 },
  empty: { textAlign: 'center', marginTop: 40, color: '#5A7388' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#D5DEE7',
  },
  dest: { fontSize: 18, fontWeight: '700', color: '#0B1F33' },
  price: { fontSize: 22, fontWeight: '700', color: '#3DBDA7', marginTop: 4 },
  deal: { color: '#C0392B', fontWeight: '600', marginTop: 4 },
  meta: { color: '#5A7388', marginTop: 4, fontSize: 13 },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  primary: {
    flex: 1,
    backgroundColor: '#3DBDA7',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryText: { color: '#0B1F33', fontWeight: '700' },
  secondary: {
    flex: 1,
    backgroundColor: '#E8EEF3',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryText: { color: '#0B1F33', fontWeight: '600' },
})
