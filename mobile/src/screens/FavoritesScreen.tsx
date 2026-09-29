import React, { useCallback, useState } from 'react'
import {
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Pressable,
  View,
  ActivityIndicator,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { EnrichedTripResponse, SavedFavorite } from '@flightwatcher/shared'
import { translate } from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { useAuth } from '../context/AuthContext'
import { DestinationCard } from '../components/DestinationCard'
import { HeartIcon } from '../components/HeartIcon'
import { colors, fonts, shadow, spacing, type } from '../theme'

export function FavoritesScreen() {
  const insets = useSafeAreaInsets()
  const { user, signInWithGoogle } = useAuth()
  const [favorites, setFavorites] = useState<SavedFavorite[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) {
      setFavorites([])
      setRefreshing(false)
      return
    }
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
  }, [user])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const onLogin = async () => {
    setLoginLoading(true)
    setLoginError(null)
    const { error: err } = await signInWithGoogle()
    if (err) setLoginError(err.message)
    setLoginLoading(false)
  }

  const remove = async (id: string) => {
    try {
      await getApi().deleteFavorite(id)
      await load()
    } catch {
      /* ignore */
    }
  }

  if (!user) {
    return (
      <View style={[styles.guestRoot, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
        <LinearGradient
          colors={['#FFE8DC', '#FFF9F5']}
          locations={[0, 0.5]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.guestContent}>
          <View style={[styles.guestCard, shadow.soft]}>
            <View style={styles.heartCircle}>
              <HeartIcon size={32} filled color={colors.primary} />
            </View>
            <Text style={styles.guestTitle}>Tes favoris t’attendent</Text>
            <Text style={styles.guestBody}>
              Connecte-toi pour sauver tes weekends coup de cœur et les retrouver sur tous tes
              appareils.
            </Text>

            {loginError ? <Text style={styles.loginError}>{loginError}</Text> : null}

            <Pressable
              onPress={() => void onLogin()}
              disabled={loginLoading}
              style={({ pressed }) => [
                styles.googleBtn,
                pressed && { opacity: 0.92, transform: [{ scale: 0.985 }] },
              ]}
            >
              {loginLoading ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <>
                  <View style={styles.gMark}>
                    <Text style={styles.gLetter}>G</Text>
                  </View>
                  <Text style={styles.googleLabel}>Continuer avec Google</Text>
                </>
              )}
            </Pressable>

            <Text style={styles.guestHint}>
              Ensuite, un tap sur le cœur depuis les résultats suffit.
            </Text>
          </View>
        </View>
      </View>
    )
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={{
        paddingHorizontal: spacing.xl,
        paddingTop: insets.top + spacing.md,
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
          <HeartIcon size={40} filled={false} color={colors.primaryMuted} />
          <Text style={styles.empty}>
            {error || 'Aucun favori pour l’instant.\nAjoute-en depuis les résultats.'}
          </Text>
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
  emptyWrap: { marginTop: 72, alignItems: 'center', paddingHorizontal: 24, gap: 14 },
  empty: {
    ...type.body,
    textAlign: 'center',
    color: colors.muted,
    lineHeight: 22,
  },
  remove: { alignItems: 'center', marginTop: -4, marginBottom: spacing.lg },
  removeText: { fontFamily: fonts.semibold, color: colors.danger, fontSize: 13 },

  guestRoot: { flex: 1, backgroundColor: colors.canvas },
  guestContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  guestCard: {
    backgroundColor: colors.white,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 28,
    alignItems: 'center',
  },
  heartCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  guestTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.6,
    color: colors.ink,
    textAlign: 'center',
    includeFontPadding: false,
  },
  guestBody: {
    marginTop: 10,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    textAlign: 'center',
    includeFontPadding: false,
  },
  loginError: {
    marginTop: 14,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
    includeFontPadding: false,
  },
  googleBtn: {
    marginTop: 22,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 18,
  },
  gMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gLetter: {
    fontFamily: fonts.extrabold,
    color: '#4285F4',
    fontSize: 14,
    lineHeight: 18,
    includeFontPadding: false,
  },
  googleLabel: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
    includeFontPadding: false,
  },
  guestHint: {
    marginTop: 16,
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.faint,
    textAlign: 'center',
    includeFontPadding: false,
  },
})
