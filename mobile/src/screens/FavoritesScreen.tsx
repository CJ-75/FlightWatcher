import React, { useCallback, useState } from 'react'
import { Text, FlatList, StyleSheet, RefreshControl, Pressable, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import type { EnrichedTripResponse, SavedFavorite } from '@flightwatcher/shared'
import { translate } from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { DestinationCard } from '../components/DestinationCard'
import { colors, spacing } from '../theme'

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
      setError(e instanceof Error ? e.message : translate('fr', 'favorites.empty'))
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
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />}
      ListHeaderComponent={
        <Text style={styles.title}>{translate('fr', 'favorites.title')}</Text>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>{error || translate('fr', 'favorites.empty')}</Text>
      }
      renderItem={({ item }) => (
        <View>
          <DestinationCard
            trip={item.trip as EnrichedTripResponse}
            isFavorite
            onFavorite={() => void remove(item.id)}
          />
          <Pressable onPress={() => void remove(item.id)} style={styles.remove}>
            <Text style={styles.removeText}>{translate('fr', 'card.removeFavorite')}</Text>
          </Pressable>
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.bgMuted },
  content: { padding: spacing.lg, paddingBottom: 40, flexGrow: 1 },
  title: { fontSize: 24, fontWeight: '900', color: colors.slate900, marginBottom: spacing.lg },
  empty: { textAlign: 'center', marginTop: 48, color: colors.slate500, fontWeight: '600' },
  remove: { alignItems: 'center', marginTop: -8, marginBottom: spacing.lg },
  removeText: { color: colors.danger, fontWeight: '700' },
})
