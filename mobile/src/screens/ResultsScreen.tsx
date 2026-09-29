import React from 'react'
import { FlatList, StyleSheet, Text, View, Linking } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { EnrichedTripResponse } from '@flightwatcher/shared'
import { STORAGE_KEYS, createAsyncKVStore, kvSetJson, translate } from '@flightwatcher/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { RootStackParamList } from '../../App'
import { getApi } from '../lib/client'
import { DestinationCard } from '../components/DestinationCard'
import { colors, fonts, spacing, type } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'Results'>
const kv = createAsyncKVStore(AsyncStorage)

export function ResultsScreen({ route }: Props) {
  const trips = route.params.trips || []
  const insets = useSafeAreaInsets()

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
      contentContainerStyle={{
        paddingHorizontal: spacing.xl,
        paddingTop: spacing.lg,
        paddingBottom: insets.bottom + spacing.xxxl,
      }}
      data={trips}
      keyExtractor={(item, i) => `${item.destination_code}-${item.aller.departureTime}-${i}`}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>{translate('fr', 'results.title')}</Text>
          <Text style={styles.count}>
            {trips.length} destination{trips.length > 1 ? 's' : ''}
          </Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>{translate('fr', 'results.noResults')}</Text>
          <Text style={styles.emptyHint}>Essaie d’augmenter le budget ou de changer de dates.</Text>
        </View>
      }
      renderItem={({ item }) => (
        <DestinationCard
          trip={item}
          onFavorite={() => void addFavorite(item)}
          onBook={() => void openBooking(item)}
        />
      )}
      showsVerticalScrollIndicator={false}
    />
  )
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.canvas },
  header: { marginBottom: spacing.xl },
  title: { ...type.title },
  count: { ...type.caption, marginTop: 6, fontFamily: fonts.semibold },
  emptyWrap: { marginTop: 56, alignItems: 'center', paddingHorizontal: spacing.xl },
  empty: { ...type.section, textAlign: 'center', color: colors.ink },
  emptyHint: { ...type.caption, textAlign: 'center', marginTop: spacing.sm },
})
