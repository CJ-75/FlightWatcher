import React, { useCallback, useMemo, useState } from 'react'
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
import type {
  ActivityCardModel,
  EnrichedTripResponse,
  LikedActivity,
  LikedDeal,
  SavedFavorite,
} from '@flightwatcher/shared'
import {
  isPastFavoriteActivity,
  isPastFavoriteDeal,
  isPastFavoriteFlight,
  partitionFavoritesByPast,
  translate,
} from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { useAuth } from '../context/AuthContext'
import {
  listGuestFlightFavorites,
  listGuestLikedActivities,
  listGuestLikedDeals,
  removeGuestFlightFavorite,
  unlikeGuestActivity,
  unlikeGuestDeal,
} from '../dev/guestPreview'
import { DestinationCard } from '../components/DestinationCard'
import { DealCard } from '../components/DealCard'
import { ActivityCard } from '../components/ActivityCard'
import { HeartIcon } from '../components/HeartIcon'
import { openInAppBrowser } from '../lib/openInApp'
import { GoogleGIcon } from '../components/GoogleGIcon'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, shadow, spacing } from '../theme'

export function FavoritesScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { viewUser, signInWithGoogle, isGuest } = useAuth()
  const [favorites, setFavorites] = useState<SavedFavorite[]>([])
  const [likedDeals, setLikedDeals] = useState<LikedDeal[]>([])
  const [likedActivities, setLikedActivities] = useState<LikedActivity[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)
  const [tab, setTab] = useState<'flights' | 'deals' | 'activities' | 'addresses'>(
    'flights',
  )
  const [userAddresses, setUserAddresses] = useState<
    { id: string; status?: string; places?: { name?: string; city_slug?: string } }[]
  >([])
  const [archiveOpen, setArchiveOpen] = useState(false)

  const load = useCallback(async () => {
    if (!viewUser) {
      setFavorites([])
      setLikedDeals([])
      setLikedActivities([])
      setUserAddresses([])
      setRefreshing(false)
      return
    }
    setRefreshing(true)
    setError(null)
    try {
      if (__DEV__ && isGuest) {
        setFavorites(listGuestFlightFavorites())
        setLikedDeals(listGuestLikedDeals())
        setLikedActivities(listGuestLikedActivities())
        setUserAddresses([])
      } else {
        const [list, deals, acts, addresses] = await Promise.all([
          getApi().getFavorites(),
          getApi().getLikedDeals(),
          getApi().getLikedActivities().catch(() => [] as LikedActivity[]),
          getApi()
            .listUserAddresses()
            .then((r) => r.items || [])
            .catch(() => []),
        ])
        setFavorites(Array.isArray(list) ? list : [])
        setLikedDeals(Array.isArray(deals) ? deals : [])
        setLikedActivities(Array.isArray(acts) ? acts : [])
        setUserAddresses(
          Array.isArray(addresses)
            ? (addresses as {
                id: string
                status?: string
                places?: { name?: string; city_slug?: string }
              }[])
            : [],
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : translate('fr', 'favorites.empty'))
      setFavorites([])
      setLikedDeals([])
      setLikedActivities([])
      setUserAddresses([])
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

  const unlikeActivity = async (productCode: string) => {
    try {
      if (__DEV__ && isGuest) unlikeGuestActivity(productCode)
      else await getApi().unlikeActivity(productCode)
      setLikedActivities((prev) =>
        prev.filter((a) => a.product_code !== productCode),
      )
    } catch {
      /* ignore */
    }
  }

  const toActivityCard = (item: LikedActivity): ActivityCardModel => ({
    productCode: item.activity.productCode || item.product_code,
    title: item.activity.title || 'Activité',
    photoUrl: item.activity.photoUrl ?? null,
    rating: item.activity.rating ?? null,
    reviewCount: item.activity.reviewCount ?? null,
    durationLabel: item.activity.durationLabel ?? null,
    priceLabel: item.activity.priceLabel ?? null,
    productUrl: item.activity.productUrl ?? null,
    freeCancellation: !!item.activity.freeCancellation,
    instantConfirmation: !!item.activity.instantConfirmation,
    destinationLabel: item.activity.destinationLabel ?? null,
    distanceLabel: item.activity.distanceLabel ?? null,
  })

  const { active: activeItems, archived: archivedItems } = useMemo(() => {
    if (tab === 'addresses') return { active: [] as never[], archived: [] as never[] }
    if (tab === 'flights') {
      return partitionFavoritesByPast(favorites, isPastFavoriteFlight)
    }
    if (tab === 'deals') {
      return partitionFavoritesByPast(likedDeals, isPastFavoriteDeal)
    }
    return partitionFavoritesByPast(likedActivities, isPastFavoriteActivity)
  }, [tab, favorites, likedDeals, likedActivities])

  const listData = activeItems

  const renderFavoriteItem = (
    item: SavedFavorite | LikedDeal | LikedActivity,
    faded: boolean,
  ) => {
    const wrap = (node: React.ReactNode) =>
      faded ? <View style={styles.archivedItem}>{node}</View> : node

    if (tab === 'deals') {
      return wrap(
        <DealCard
          deal={(item as LikedDeal).deal}
          liked
          onToggleLike={() => void unlikeDeal((item as LikedDeal).deal_id)}
          onPress={() =>
            navigation.navigate('DealDetail', {
              dealId: (item as LikedDeal).deal_id,
            })
          }
        />,
      )
    }
    if (tab === 'activities') {
      const liked = item as LikedActivity
      const card = toActivityCard(liked)
      return wrap(
        <ActivityCard
          card={card}
          liked
          onToggleLike={() => void unlikeActivity(liked.product_code)}
          onPress={() => {
            if (card.productUrl) void openInAppBrowser(card.productUrl)
          }}
          onBook={() => {
            if (card.productUrl) void openInAppBrowser(card.productUrl)
          }}
        />,
      )
    }
    return wrap(
      <DestinationCard
        trip={(item as SavedFavorite).trip as EnrichedTripResponse}
        isFavorite
        onFavorite={() => void remove(item.id)}
      />,
    )
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
      <FlatList<SavedFavorite | LikedDeal | LikedActivity>
        style={styles.list}
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 120,
          flexGrow: 1,
        }}
        data={listData}
        keyExtractor={(item) => item.id}
        extraData={{
          tab,
          archiveOpen,
          archivedCount: archivedItems.length,
          addressCount: userAddresses.length,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.kicker}>FAVORIS</Text>
            <Text style={styles.title}>{translate('fr', 'favorites.title')}</Text>
            <Text style={styles.subtitle}>
              {translate('fr', 'favorites.subtitle')}
            </Text>
            <View style={styles.switchTrack}>
              {(
                [
                  ['flights', 'favorites.switch.flights'],
                  ['deals', 'favorites.switch.deals'],
                  ['activities', 'favorites.switch.activities'],
                  ['addresses', 'favorites.switch.addresses'],
                ] as const
              ).map(([id, key]) => (
                <Pressable
                  key={id}
                  onPress={() => {
                    setTab(id)
                    setArchiveOpen(false)
                  }}
                  style={[styles.switchBtn, tab === id && styles.switchBtnOn]}
                >
                  <Text
                    style={[styles.switchLabel, tab === id && styles.switchLabelOn]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                  >
                    {translate('fr', key)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        ListEmptyComponent={
          tab === 'addresses' ? (
            userAddresses.length === 0 ? (
              <View style={[styles.emptyCard, shadow.soft]}>
                <View style={[styles.emptyIcon, styles.addressEmptyIcon]}>
                  <Text style={styles.addressGlyph}>🍽</Text>
                </View>
                <Text style={styles.emptyTitle}>
                  {error
                    ? error
                    : translate('fr', 'favorites.addressesEmptyTitle')}
                </Text>
                <Text style={styles.emptyBody}>
                  {error
                    ? 'Tire pour réessayer.'
                    : translate('fr', 'favorites.addressesEmpty')}
                </Text>
              </View>
            ) : (
              <View style={styles.addressList}>
                {userAddresses.map((row) => {
                  const place = row.places || {}
                  const status = String(row.status || 'to_try')
                  const statusKey =
                    status === 'loved' || status === 'meh' ? status : 'to_try'
                  return (
                    <View key={row.id} style={[styles.addressCard, shadow.soft]}>
                      <View style={styles.addressIcon}>
                        <Text style={styles.addressGlyph}>🍽</Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.addressName} numberOfLines={2}>
                          {place.name || 'Adresse'}
                        </Text>
                        {place.city_slug ? (
                          <Text style={styles.addressMeta}>{place.city_slug}</Text>
                        ) : null}
                        <Text style={styles.addressStatus}>
                          {translate(
                            'fr',
                            `favorites.addressStatus.${statusKey}` as
                              | 'favorites.addressStatus.to_try'
                              | 'favorites.addressStatus.loved'
                              | 'favorites.addressStatus.meh',
                          )}
                        </Text>
                      </View>
                    </View>
                  )
                })}
              </View>
            )
          ) : listData.length === 0 && archivedItems.length === 0 ? (
            <View style={[styles.emptyCard, shadow.soft]}>
              <View style={styles.emptyIcon}>
                <HeartIcon size={28} filled={false} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>
                {error
                  ? error
                  : tab === 'deals'
                    ? translate('fr', 'favorites.dealsEmptyTitle')
                    : tab === 'activities'
                      ? translate('fr', 'favorites.activitiesEmptyTitle')
                      : translate('fr', 'favorites.flightsEmpty')}
              </Text>
              <Text style={styles.emptyBody}>
                {error
                  ? 'Tire pour réessayer.'
                  : tab === 'deals'
                    ? translate('fr', 'favorites.dealsEmpty')
                    : tab === 'activities'
                      ? translate('fr', 'favorites.activitiesEmpty')
                      : translate('fr', 'favorites.flightsEmptyBody')}
              </Text>
            </View>
          ) : listData.length === 0 ? (
            <Text style={styles.onlyArchivedHint}>
              {translate('fr', 'favorites.archivedHint')}
            </Text>
          ) : null
        }
        ListFooterComponent={
          archivedItems.length > 0 ? (
            <View style={styles.archiveBlock}>
              <Pressable
                onPress={() => setArchiveOpen((o) => !o)}
                style={styles.archiveHeader}
                accessibilityRole="button"
                accessibilityState={{ expanded: archiveOpen }}
              >
                <Text style={styles.archiveTitle}>
                  {translate('fr', 'favorites.archivedSectionCount', {
                    n: archivedItems.length,
                  })}
                </Text>
                <Text style={styles.archiveChevron}>{archiveOpen ? '▾' : '▸'}</Text>
              </Pressable>
              {archiveOpen ? (
                <View style={styles.archiveList}>
                  <Text style={styles.archiveHint}>
                    {translate('fr', 'favorites.archivedHint')}
                  </Text>
                  {archivedItems.map((item) => (
                    <View key={item.id}>{renderFavoriteItem(item, true)}</View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null
        }
        renderItem={({ item }) => renderFavoriteItem(item, false)}
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
              <GoogleGIcon size={22} />
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
  header: { marginBottom: 22, gap: 4 },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.primary,
    marginBottom: 2,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 34,
    color: colors.ink,
    letterSpacing: -1,
    lineHeight: 40,
  },
  subtitle: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.muted,
    lineHeight: 22,
    marginTop: 2,
  },
  switchTrack: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: spacing.lg,
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    padding: 4,
    gap: 4,
    width: '100%',
  },
  switchBtn: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 4,
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
    fontSize: 13,
    letterSpacing: -0.2,
    color: colors.muted,
    textAlign: 'center',
  },
  switchLabelOn: {
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  archivedItem: {
    opacity: 0.48,
  },
  archiveBlock: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
  },
  archiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  archiveTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 15,
    color: colors.inkSoft,
    letterSpacing: -0.2,
  },
  archiveChevron: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.muted,
  },
  archiveHint: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    marginBottom: spacing.md,
    paddingHorizontal: 4,
  },
  archiveList: {
    gap: 0,
  },
  onlyArchivedHint: {
    marginTop: spacing.lg,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
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
  addressEmptyIcon: { backgroundColor: '#FFF3EC' },
  addressGlyph: { fontSize: 22 },
  addressList: { marginTop: 8, gap: 10 },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  addressIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressName: {
    fontFamily: fonts.extrabold,
    fontSize: 15,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  addressMeta: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
  },
  addressStatus: {
    marginTop: 4,
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.primaryDeep,
  },
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
