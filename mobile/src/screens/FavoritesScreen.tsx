import React, { useCallback, useMemo, useRef, useState } from 'react'
import {
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Pressable,
  View,
  ScrollView,
  Alert,
  Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type {
  ActivityCardModel,
  EnrichedTripResponse,
  Itinerary,
  LikedActivity,
  LikedDeal,
  LikedItinerary,
  SavedFavorite,
} from '@flightwatcher/shared'
import {
  ACTIVITY_ADDED_TO_PLANNER_FR,
  ACTIVITY_ADD_TO_PLANNER_FR,
  ACTIVITY_NO_PLANNER_TO_ADD_FR,
  hasTripItemOwner,
  isPastFavoriteActivity,
  isPastFavoriteDeal,
  isPastFavoriteFlight,
  partitionFavoritesByPast,
  pickTripItemOwner,
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
import { AccountAvatarButton } from '../components/AccountAvatarButton'
import { FavoriteFlightCard } from '../components/FavoriteFlightCard'
import { DealCard } from '../components/DealCard'
import { ActivityCard } from '../components/ActivityCard'
import { ItineraryCard } from '../components/parcours/ItineraryCard'

type FavCollection = 'flights' | 'deals' | 'activities' | 'parcours'

type FavListItem =
  | SavedFavorite
  | LikedDeal
  | LikedActivity
  | LikedItinerary
  | { id: string; __skeleton: true }

const COLLECTIONS: { id: FavCollection; labelKey: string }[] = [
  { id: 'flights', labelKey: 'favorites.switch.flights' },
  { id: 'deals', labelKey: 'favorites.switch.deals' },
  { id: 'activities', labelKey: 'favorites.switch.activities' },
  { id: 'parcours', labelKey: 'favorites.switch.parcours' },
]

const SKELETON_ITEMS: FavListItem[] = Array.from({ length: 3 }, (_, i) => ({
  id: `fav-sk-${i}`,
  __skeleton: true as const,
}))

function isSkeletonItem(
  item: FavListItem,
): item is { id: string; __skeleton: true } {
  return '__skeleton' in item && item.__skeleton === true
}
import {
  ActivityPlannerPicker,
  type ActivityPlannerTarget,
} from '../components/ActivityPlannerPicker'
import { HeartIcon } from '../components/HeartIcon'
import { GuestAuthLanding } from '../components/GuestAuthLanding'
import { openInAppBrowser } from '../lib/openInApp'
import { bookCtaLabel, preparePartnerBook } from '../lib/partnerBook'
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
  const [likedParcours, setLikedParcours] = useState<LikedItinerary[]>([])
  /** Pull-to-refresh only — never toggled on focus (évite le bounce). */
  const [refreshing, setRefreshing] = useState(false)
  /** First paint ready — skeleton until then, no spinner. */
  const [hydrated, setHydrated] = useState(false)
  const hydratedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)
  const [tab, setTab] = useState<FavCollection>('flights')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [pendingAdd, setPendingAdd] = useState<ActivityCardModel | null>(null)
  const [addBusy, setAddBusy] = useState(false)

  const load = useCallback(async (opts?: { pull?: boolean }) => {
    if (!viewUser) {
      setFavorites([])
      setLikedDeals([])
      setLikedActivities([])
      setLikedParcours([])
      hydratedRef.current = true
      setHydrated(true)
      setRefreshing(false)
      return
    }
    if (opts?.pull) setRefreshing(true)
    setError(null)
    try {
      if (__DEV__ && isGuest) {
        setFavorites(listGuestFlightFavorites())
        setLikedDeals(listGuestLikedDeals())
        setLikedActivities(listGuestLikedActivities())
        setLikedParcours([])
      } else {
        const [list, deals, acts, parcoursRes] = await Promise.all([
          getApi().getFavorites(),
          getApi().getLikedDeals(),
          getApi().getLikedActivities().catch(() => [] as LikedActivity[]),
          getApi()
            .listLikedItineraries()
            .catch(() => ({ ok: false, items: [] as LikedItinerary[] })),
        ])
        setFavorites(Array.isArray(list) ? list : [])
        setLikedDeals(Array.isArray(deals) ? deals : [])
        setLikedActivities(Array.isArray(acts) ? acts : [])
        setLikedParcours(
          Array.isArray(parcoursRes?.items) ? parcoursRes.items : [],
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : translate('fr', 'favorites.empty'))
      // Keep previous data if already hydrated (no empty flash)
      if (!hydratedRef.current) {
        setFavorites([])
        setLikedDeals([])
        setLikedActivities([])
        setLikedParcours([])
      }
    } finally {
      hydratedRef.current = true
      setHydrated(true)
      setRefreshing(false)
    }
  }, [viewUser, isGuest])

  useFocusEffect(
    useCallback(() => {
      // Silent refresh — header + skeleton déjà peints, pas de RefreshControl
      void load()
    }, [load]),
  )

  const onPullRefresh = useCallback(() => {
    void load({ pull: true })
  }, [load])

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

  const bookFavoriteFlight = (favorite: SavedFavorite) => {
    const trip = favorite.trip as EnrichedTripResponse
    void preparePartnerBook({
      trip,
      passengers: 1,
      skipReturnBanner: true,
    }).then((ps) => {
      openInAppBrowser(navigation, ps.primaryUrl, bookCtaLabel(ps))
    })
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

  const unlikeParcours = async (itineraryId: string) => {
    try {
      await getApi().unlikeItinerary(itineraryId)
      setLikedParcours((prev) =>
        prev.filter((p) => p.itinerary_id !== itineraryId),
      )
    } catch {
      /* ignore */
    }
  }

  const toParcoursCard = (item: LikedItinerary): Partial<Itinerary> => {
    const d = item.itinerary_data || {}
    return {
      id: item.itinerary_id,
      slug: d.slug || undefined,
      title: d.title || 'Parcours',
      subtitle: d.subtitle || null,
      city_slug: d.city_slug || null,
      cover_image: d.cover_image || null,
      duration_kind: (d.duration_kind as Itinerary['duration_kind']) || null,
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

  const confirmAddToPlanner = async (target: ActivityPlannerTarget) => {
    const card = pendingAdd
    if (!card) return
    if (__DEV__ && isGuest) {
      Alert.alert('Connexion', 'Connecte-toi pour ajouter au planner.')
      setPendingAdd(null)
      return
    }
    const owner = pickTripItemOwner({
      draftToken: target.draftToken,
      plannedTripId: target.plannedTripId,
    })
    if (!hasTripItemOwner(owner)) {
      Alert.alert('Planner', ACTIVITY_NO_PLANNER_TO_ADD_FR)
      return
    }
    setAddBusy(true)
    try {
      await getApi().addTripItem({
        product_code: card.productCode,
        title: card.title,
        product_url: card.productUrl,
        photo_url: card.photoUrl || null,
        ...owner,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        surface: 'favorites',
      })
      setPendingAdd(null)
      Alert.alert('Activité', ACTIVITY_ADDED_TO_PLANNER_FR(target.label))
    } catch (e) {
      Alert.alert(
        'Erreur',
        e instanceof Error ? e.message : 'Ajout au planner impossible',
      )
    } finally {
      setAddBusy(false)
    }
  }

  const { active: activeItems, archived: archivedItems } = useMemo(() => {
    if (tab === 'flights') {
      return partitionFavoritesByPast(favorites, isPastFavoriteFlight)
    }
    if (tab === 'deals') {
      return partitionFavoritesByPast(likedDeals, isPastFavoriteDeal)
    }
    if (tab === 'activities') {
      return partitionFavoritesByPast(likedActivities, isPastFavoriteActivity)
    }
    return { active: likedParcours, archived: [] as LikedItinerary[] }
  }, [tab, favorites, likedDeals, likedActivities, likedParcours])

  const showSkeleton = !hydrated
  const listData: FavListItem[] = showSkeleton ? SKELETON_ITEMS : activeItems

  const renderFavoriteItem = (item: FavListItem, faded: boolean) => {
    if (isSkeletonItem(item)) {
      return (
        <View style={[styles.skeletonCard, shadow.soft]}>
          <View style={styles.skeletonImage} />
          <View style={styles.skeletonBody}>
            <View style={[styles.skeletonLine, { width: '72%' }]} />
            <View style={[styles.skeletonLine, { width: '48%' }]} />
            <View style={[styles.skeletonLine, { width: '32%', height: 18 }]} />
          </View>
        </View>
      )
    }

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
          onAdd={() => setPendingAdd(card)}
          addLabel={ACTIVITY_ADD_TO_PLANNER_FR}
          onPress={() => {
            if (card.productUrl) void openInAppBrowser(navigation, card.productUrl, card.title)
          }}
          onBook={() => {
            if (card.productUrl) void openInAppBrowser(navigation, card.productUrl, card.title)
          }}
        />,
      )
    }
    if (tab === 'parcours') {
      const liked = item as LikedItinerary
      const card = toParcoursCard(liked)
      return wrap(
        <View style={styles.parcoursRow}>
          <ItineraryCard
            itinerary={card}
            variant="landscape"
            onPress={() =>
              navigation.navigate('ItineraryDetail', {
                itineraryId: liked.itinerary_id,
              })
            }
            style={styles.parcoursCard}
          />
          <Pressable
            onPress={() => void unlikeParcours(liked.itinerary_id)}
            style={styles.parcoursUnlike}
            hitSlop={8}
            accessibilityLabel="Retirer des favoris"
          >
            <HeartIcon size={20} filled color={colors.primary} />
          </Pressable>
        </View>,
      )
    }
    return (
      <FavoriteFlightCard
        favorite={item as SavedFavorite}
        faded={faded}
        bookLabel={bookCtaLabel()}
        onBook={() => bookFavoriteFlight(item as SavedFavorite)}
        onRemove={() => void remove(item.id)}
      />
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
      <FlatList<FavListItem>
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
          showSkeleton,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.topRow}>
              <View style={styles.topCopy}>
                <Text style={styles.kicker}>FAVORIS</Text>
                <Text style={styles.title}>{translate('fr', 'favorites.title')}</Text>
              </View>
              <AccountAvatarButton />
            </View>
            <Text style={styles.subtitle}>
              {translate('fr', 'favorites.collectionsHint')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.collectionsRow}
              style={styles.collectionsScroll}
            >
              {COLLECTIONS.map(({ id, labelKey }) => (
                <Pressable
                  key={id}
                  onPress={() => {
                    setTab(id)
                    setArchiveOpen(false)
                  }}
                  style={[
                    styles.collectionChip,
                    tab === id && styles.collectionChipOn,
                  ]}
                >
                  <Text
                    style={[
                      styles.collectionLabel,
                      tab === id && styles.collectionLabelOn,
                    ]}
                    numberOfLines={1}
                  >
                    {translate('fr', labelKey)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          showSkeleton ? null : listData.length === 0 &&
            archivedItems.length === 0 ? (
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
                      : tab === 'parcours'
                        ? translate('fr', 'favorites.parcoursEmptyTitle')
                        : translate('fr', 'favorites.flightsEmpty')}
              </Text>
              <Text style={styles.emptyBody}>
                {error
                  ? 'Tire pour réessayer.'
                  : tab === 'deals'
                    ? translate('fr', 'favorites.dealsEmpty')
                    : tab === 'activities'
                      ? translate('fr', 'favorites.activitiesEmpty')
                      : tab === 'parcours'
                        ? translate('fr', 'favorites.parcoursEmpty')
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
          !showSkeleton && archivedItems.length > 0 ? (
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
      <ActivityPlannerPicker
        visible={Boolean(pendingAdd)}
        busy={addBusy}
        catalogCity={pendingAdd?.destinationLabel || null}
        onClose={() => {
          if (!addBusy) setPendingAdd(null)
        }}
        onPick={(target) => void confirmAddToPlanner(target)}
        onOpenPlanner={() => {
          setPendingAdd(null)
          navigation.navigate('Main', { screen: 'Planner' })
        }}
        onSignIn={() => {
          setPendingAdd(null)
          void onLogin()
        }}
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
  const t = (key: string) => translate('fr', key as never)

  return (
    <GuestAuthLanding
      insetsTop={insetsTop}
      insetsBottom={insetsBottom}
      kicker="FAVORIS"
      title={t('favorites.guest.title')}
      lead={t('favorites.guest.lead')}
      steps={[
        { title: t('favorites.guest.step1'), detail: t('favorites.guest.step1.detail') },
        { title: t('favorites.guest.step2'), detail: t('favorites.guest.step2.detail') },
        { title: t('favorites.guest.step3'), detail: t('favorites.guest.step3.detail') },
      ]}
      ctaLabel={t('favorites.guest.cta')}
      hint={t('favorites.guest.hint')}
      loginLoading={loginLoading}
      onLogin={onLogin}
      accent="accent"
      orbStyle="rose"
      preview={
        <View style={[styles.mockCard, shadow.soft]}>
          <LinearGradient
            colors={['#1A120E', '#2A1418', '#3D1820']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.mockInner}
          >
            <View style={styles.mockTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.mockTag}>{t('favorites.guest.mock.tag')}</Text>
                <Text style={styles.mockCity}>{t('favorites.guest.mock.city')}</Text>
                <Text style={styles.mockRoute}>{t('favorites.guest.mock.route')}</Text>
              </View>
              <View style={styles.mockHeart}>
                <HeartIcon size={22} filled color={colors.white} />
              </View>
            </View>
            <View style={styles.mockBottom}>
              <View style={styles.mockChips}>
                <Text style={styles.mockChip}>{t('favorites.guest.mock.chip1')}</Text>
                <Text style={styles.mockChip}>{t('favorites.guest.mock.chip2')}</Text>
              </View>
              <Text style={styles.mockPrice}>{t('favorites.guest.mock.price')}</Text>
            </View>
          </LinearGradient>
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  list: { flex: 1, backgroundColor: 'transparent' },
  skeletonCard: {
    backgroundColor: colors.white,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 14,
  },
  skeletonImage: {
    height: 140,
    backgroundColor: colors.primaryMuted,
  },
  skeletonBody: {
    padding: 16,
    gap: 10,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primarySoft,
  },
  header: { marginBottom: 22, gap: 4 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  topCopy: { flex: 1, minWidth: 0 },
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
  collectionsScroll: {
    marginTop: spacing.lg,
    marginHorizontal: -spacing.xl,
  },
  collectionsRow: {
    paddingHorizontal: spacing.xl,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  collectionChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  collectionChipOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  collectionLabel: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.inkSoft,
  },
  collectionLabelOn: {
    color: colors.white,
  },
  parcoursRow: {
    position: 'relative',
    marginBottom: 14,
  },
  parcoursCard: {
    width: '100%',
  },
  parcoursUnlike: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
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
  mockCard: {
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
})
