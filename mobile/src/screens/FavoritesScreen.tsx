import React, { useCallback, useState } from 'react'
import { Text, FlatList, StyleSheet, RefreshControl, Pressable, View } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { EnrichedTripResponse, SavedFavorite } from '@flightwatcher/shared'
import { translate } from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { DestinationCard } from '../components/DestinationCard'
import { colors, fonts, spacing, type } from '../theme'

export function FavoritesScreen() {
  const insets = useSafeAreaInsets()
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
      contentContainerStyle={{
        paddingHorizontal: spacing.xl,
        paddingTop: spacing.sm,
        paddingBottom: insets.bottom + 100,
        flexGrow: 1,
      }}
      data={favorites}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>{translate('fr', 'favorites.favoritesTitle')}</Text>
          <Text style={styles.sub}>
            {favorites.length} voyage{favorites.length > 1 ? 's' : ''}
          </Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Text style={styles.empty}>{error || translate('fr', 'favorites.empty')}</Text>
        </View>
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
      showsVerticalScrollIndicator={false}
    />
  )
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.canvas },
  header: { marginBottom: spacing.xl },
  title: { ...type.title },
  sub: { ...type.caption, marginTop: 4, fontFamily: fonts.semibold },
  emptyWrap: { marginTop: 64, alignItems: 'center' },
  empty: { ...type.body, textAlign: 'center', color: colors.muted },
  remove: { alignItems: 'center', marginTop: -4, marginBottom: spacing.lg },
  removeText: { fontFamily: fonts.semibold, color: colors.danger, fontSize: 13 },
})
