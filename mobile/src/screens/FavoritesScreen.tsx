import React, { useCallback, useState } from 'react'
import {
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Pressable,
  View,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { EnrichedTripResponse, LikedDeal, SavedFavorite } from '@flightwatcher/shared'
import { translate } from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { useAuth } from '../context/AuthContext'
import {
  listGuestFlightFavorites,
  listGuestLikedDeals,
  removeGuestFlightFavorite,
  unlikeGuestDeal,
} from '../dev/guestPreview'
import { DestinationCard } from '../components/DestinationCard'
import { DealCard } from '../components/DealCard'
import { HeartIcon } from '../components/HeartIcon'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../../App'
import { colors, fonts, shadow, spacing, type } from '../theme'

export function FavoritesScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { viewUser, signInWithGoogle, isGuest } = useAuth()
  const [favorites, setFavorites] = useState<SavedFavorite[]>([])
  const [likedDeals, setLikedDeals] = useState<LikedDeal[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)
  const [tab, setTab] = useState<'flights' | 'deals'>('flights')

  const load = useCallback(async () => {
    if (!viewUser) {
      setFavorites([])
      setLikedDeals([])
      setRefreshing(false)
      return
    }
    setRefreshing(true)
    setError(null)
    try {
      if (__DEV__ && isGuest) {
        setFavorites(listGuestFlightFavorites())
        setLikedDeals(listGuestLikedDeals())
      } else {
        const [list, deals] = await Promise.all([
          getApi().getFavorites(),
          getApi().getLikedDeals(),
        ])
        setFavorites(Array.isArray(list) ? list : [])
        setLikedDeals(Array.isArray(deals) ? deals : [])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : translate('fr', 'favorites.empty'))
      setFavorites([])
      setLikedDeals([])
    } finally {
      setRefreshing(false)
    }
  }, [viewUser, isGuest])

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const onLogin = async () => {
    setLoginLoading(true)
    const { error: err } = await signInWithGoogle()
    if (err && __DEV__) console.warn('[auth] signIn', err.message)
    setLoginLoading(false)
  }

  const remove = async (id: string) => {
    try {
      if (__DEV__ && isGuest) removeGuestFlightFavorite(id)
      else await getApi().deleteFavorite(id)
      await load()
    } catch {
      /* ignore */
    }
  }

  const unlikeDeal = async (dealId: string) => {
    try {
      if (__DEV__ && isGuest) unlikeGuestDeal(dealId)
      else await getApi().unlikeDeal(dealId)
      setLikedDeals((prev) => prev.filter((d) => d.deal_id !== dealId))
    } catch {
      /* ignore */
    }
  }

  if (!viewUser) {
    return (
      <FavoritesGuestLanding
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        loginLoading={loginLoading}
        onLogin={() => void onLogin()}
      />
    )
  }

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <FlatList
        style={styles.list}
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + 100,
          flexGrow: 1,
        }}
        data={tab === 'flights' ? favorites : likedDeals}
        keyExtractor={(item) => item.id}
        extraData={tab}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>{translate('fr', 'favorites.title')}</Text>
            <View style={styles.switchTrack}>
              <Pressable
                onPress={() => setTab('flights')}
                style={[styles.switchBtn, tab === 'flights' && styles.switchBtnOn]}
              >
                <Text style={[styles.switchLabel, tab === 'flights' && styles.switchLabelOn]}>
                  {translate('fr', 'favorites.switch.flights')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setTab('deals')}
                style={[styles.switchBtn, tab === 'deals' && styles.switchBtnOn]}
              >
                <Text style={[styles.switchLabel, tab === 'deals' && styles.switchLabelOn]}>
                  {translate('fr', 'favorites.switch.deals')}
                </Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={[styles.emptyCard, shadow.soft]}>
            <View style={styles.emptyIcon}>
              <HeartIcon size={28} filled={false} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>
              {error
                ? error
                : tab === 'deals'
                  ? translate('fr', 'favorites.dealsEmptyTitle')
                  : translate('fr', 'favorites.flightsEmpty')}
            </Text>
            <Text style={styles.emptyBody}>
              {error
                ? 'Tire pour réessayer.'
                : tab === 'deals'
                  ? translate('fr', 'favorites.dealsEmpty')
                  : translate('fr', 'favorites.flightsEmptyBody')}
            </Text>
          </View>
        }
        renderItem={({ item }) =>
          tab === 'deals' ? (
            <DealCard
              deal={(item as LikedDeal).deal}
              liked
              onToggleLike={() => void unlikeDeal((item as LikedDeal).deal_id)}
              onPress={() =>
                navigation.navigate('DealDetail', { dealId: (item as LikedDeal).deal_id })
              }
            />
          ) : (
            <View>
              <DestinationCard
                trip={(item as SavedFavorite).trip as EnrichedTripResponse}
                isFavorite
                onFavorite={() => void remove(item.id)}
              />
              <Pressable onPress={() => void remove(item.id)} style={styles.remove}>
                <Text style={styles.removeText}>{translate('fr', 'card.removeFavorite')}</Text>
              </Pressable>
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
}

function FavoritesGuestLanding({
  insetsTop,
  insetsBottom,
  loginLoading,
  onLogin,
}: {
  insetsTop: number
  insetsBottom: number
  loginLoading: boolean
  onLogin: () => void
}) {
  const steps = [
    { title: 'Trouve un weekend', detail: 'Lance une recherche selon ton budget' },
    { title: 'Ajoute aux favoris', detail: 'Un tap sur le cœur suffit' },
    { title: 'Retrouve-les plus tard', detail: 'Sync sur web et mobile' },
  ]

  return (
    <View style={[styles.root, { paddingTop: insetsTop, paddingBottom: insetsBottom + 24 }]}>
      <ScreenBackground />
      <View style={styles.guestOrbA} />
      <View style={styles.guestOrbB} />
      <ScrollView
        contentContainerStyle={styles.guestContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.guestKicker}>FAVORIS</Text>
        <Text style={styles.guestTitle}>Tes coups de cœur, partout</Text>
        <Text style={styles.guestBody}>
          Sauve les weekends qui te font vibrer et retrouve-les sur tous tes appareils.
        </Text>

        <View style={[styles.mockCard, shadow.soft]}>
          <LinearGradient
            colors={['#1A120E', '#2A1418', '#3D1820']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.mockInner}
          >
            <View style={styles.mockTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.mockTag}>Coup de cœur</Text>
                <Text style={styles.mockCity}>Lisbonne</Text>
                <Text style={styles.mockRoute}>BVA → LIS</Text>
              </View>
              <View style={styles.mockHeart}>
                <HeartIcon size={22} filled color={colors.white} />
              </View>
            </View>
            <View style={styles.mockBottom}>
              <View style={styles.mockChips}>
                <Text style={styles.mockChip}>Weekend</Text>
                <Text style={styles.mockChip}>Aller-retour</Text>
              </View>
              <Text style={styles.mockPrice}>48€</Text>
            </View>
          </LinearGradient>
        </View>

        <View style={styles.steps}>
          {steps.map((step, i) => (
            <View key={step.title} style={[styles.stepCard, shadow.soft]}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDetail}>{step.detail}</Text>
              </View>
            </View>
          ))}
        </View>

        <Pressable
          onPress={onLogin}
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
        <Text style={styles.guestHint}>Gratuit · tes favoris restent privés</Text>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  list: { flex: 1, backgroundColor: 'transparent' },
  header: { marginBottom: spacing.xl },
  title: { ...type.title },
  sub: { ...type.caption, marginTop: 4, fontFamily: fonts.semibold },
  switchTrack: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    padding: 5,
    gap: 4,
  },
  switchBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchBtnOn: {
    backgroundColor: colors.white,
    ...shadow.soft,
  },
  switchLabel: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    letterSpacing: -0.2,
    color: colors.muted,
  },
  switchLabelOn: {
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  section: { marginTop: spacing.xl },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.ink,
    letterSpacing: -0.3,
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  emptyCard: {
    marginTop: 40,
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.ink,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  remove: { alignItems: 'center', marginTop: -4, marginBottom: spacing.lg },
  removeText: { fontFamily: fonts.semibold, color: colors.danger, fontSize: 13 },

  guestOrbA: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,61,107,0.12)',
  },
  guestOrbB: {
    position: 'absolute',
    bottom: 80,
    left: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,107,53,0.14)',
  },
  guestContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  guestKicker: {
    fontFamily: fonts.extrabold,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.accent,
    textAlign: 'center',
    marginBottom: 10,
  },
  guestTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.7,
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
    paddingHorizontal: 4,
  },
  mockCard: {
    marginTop: 22,
    borderRadius: 22,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  mockInner: {
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  mockTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  mockTag: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1,
    color: 'rgba(255,180,190,0.7)',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  mockCity: {
    fontFamily: fonts.extrabold,
    fontSize: 26,
    color: colors.white,
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
  mockRoute: {
    marginTop: 4,
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: 'rgba(255,210,200,0.75)',
  },
  mockHeart: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mockBottom: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  mockChips: { flexDirection: 'row', gap: 6 },
  mockChip: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: 'rgba(255,230,220,0.8)',
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  mockPrice: {
    fontFamily: fonts.extrabold,
    fontSize: 24,
    color: colors.white,
    includeFontPadding: false,
  },
  steps: { alignSelf: 'stretch', marginTop: 18, gap: 8 },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  stepNum: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.white },
  stepTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
    includeFontPadding: false,
  },
  stepDetail: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    includeFontPadding: false,
  },
  googleBtn: {
    marginTop: 20,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    paddingHorizontal: 18,
  },
  gMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
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
    marginTop: 14,
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 17,
    color: colors.faint,
    textAlign: 'center',
    includeFontPadding: false,
  },
})
