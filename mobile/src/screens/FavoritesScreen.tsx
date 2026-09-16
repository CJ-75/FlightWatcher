import React, { useCallback, useState } from 'react'
import { View, Text, FlatList, StyleSheet, RefreshControl, Pressable } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import type { SavedFavorite } from '@flightwatcher/shared'
import { getApi } from '../lib/client'

export function FavoritesScreen() {
  const [favorites, setFavorites] = useState<SavedFavorite[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      const list = await getApi().getFavorites()
      setFavorites(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de charger les favoris')
      setFavorites([])
    } finally {
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load])
  )

  const remove = async (id: string) => {
    try {
      await getApi().deleteFavorite(id)
      await load()
    } catch {
      /* ignore */
    }
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={favorites}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
      ListEmptyComponent={
        <Text style={styles.empty}>{error || 'Aucun favori pour le moment'}</Text>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.dest}>
            {item.trip.aller.origin} → {item.trip.destination_code}
          </Text>
          <Text style={styles.price}>{Math.round(item.trip.prix_total)} €</Text>
          <Pressable onPress={() => remove(item.id)}>
            <Text style={styles.remove}>Retirer</Text>
          </Pressable>
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#F0F4F8' },
  content: { padding: 16, flexGrow: 1 },
  empty: { textAlign: 'center', marginTop: 40, color: '#5A7388' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#D5DEE7',
  },
  dest: { fontSize: 16, fontWeight: '700', color: '#0B1F33' },
  price: { color: '#3DBDA7', fontWeight: '700', marginTop: 4 },
  remove: { color: '#C0392B', marginTop: 10, fontWeight: '600' },
})
