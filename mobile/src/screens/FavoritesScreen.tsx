import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import AsyncStorage from '@react-native-async-storage/async-storage'
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
import {
  prefetchDealDetail,
  rememberDealPreview,
} from '../lib/dealDetailCache'
import { setLikedParcoursIdLocal } from '../lib/parcoursCache'
import { useAuth } from '../context/AuthContext'
import {
  listGuestFlightFavorites,
  listGuestLikedActivities,
  listGuestLikedDeals,
  removeGuestFlightFavorite,
  unlikeGuestActivity,
  unlikeGuestDeal,
} from '../dev/guestPreview'
import { TabScreenHeader } from '../components/TabScreenHeader'
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

const FAV_CACHE_KEY = 'fw_favorites_cache_v2'
/**
 * Background warm only — never skip network for the focused / selected tab.
 * Paint can still come from memory/disk; the list must revalidate every open.
 */
const FAV_BG_STALE_MS = 45_000

type FavCachePayload = {
  favorites: SavedFavorite[]
  likedDeals: LikedDeal[]
  likedActivities: LikedActivity[]
  likedParcours: LikedItinerary[]
}

type FavReady = Record<FavCollection, boolean>
type FavFetchedAt = Record<FavCollection, number>

const READY_NONE: FavReady = {
  flights: false,
  deals: false,
  activities: false,
  parcours: false,
}
const READY_ALL: FavReady = {
  flights: true,
  deals: true,
  activities: true,
  parcours: true,
}
const FETCHED_NONE: FavFetchedAt = {
  flights: 0,
  deals: 0,
  activities: 0,
  parcours: 0,
}

/** Instant paint across remounts / tab revisits. */
let favMemoryCache: FavCachePayload | null = null
let favFetchedAtMemory: FavFetchedAt = { ...FETCHED_NONE }
let favDiskBootstrapped = false

function normalizeFavCache(parsed: Partial<FavCachePayload> | null): FavCachePayload {
  return {
    favorites: Array.isArray(parsed?.favorites) ? parsed!.favorites : [],
    likedDeals: Array.isArray(parsed?.likedDeals) ? parsed!.likedDeals : [],
    likedActivities: Array.isArray(parsed?.likedActivities)
      ? parsed!.likedActivities
      : [],
    likedParcours: Array.isArray(parsed?.likedParcours)
      ? parsed!.likedParcours
      : [],
  }
}

function collectionFromCache(
  cache: FavCachePayload,
  id: FavCollection,
): unknown[] {
  if (id === 'flights') return cache.favorites
  if (id === 'deals') return cache.likedDeals
  if (id === 'activities') return cache.likedActivities
  return cache.likedParcours
}

function isSkeletonItem(
  item: FavListItem,
): item is { id: string; __skeleton: true } {
  return '__skeleton' in item && item.__skeleton === true
}

type FavSort = 'date' | 'recent'

function dayKey(raw: string | null | undefined): string {
  const s = String(raw || '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

function favoriteTripDay(item: FavListItem): string {
  if (isSkeletonItem(item)) return ''
  if ('trip' in item && (item as SavedFavorite).trip) {
    const t = (item as SavedFavorite).trip as EnrichedTripResponse
    return dayKey(t.aller?.departureTime || t.retour?.departureTime)
  }
  if ('deal' in item && (item as LikedDeal).deal) {
    return dayKey((item as LikedDeal).deal?.dates?.outbound)
  }
  return ''
}

function favoriteSavedAt(item: FavListItem): string {
  if (isSkeletonItem(item)) return ''
  if ('createdAt' in item && (item as SavedFavorite).createdAt) {
    return String((item as SavedFavorite).createdAt)
  }
  if ('created_at' in item) {
    return String((item as { created_at?: string }).created_at || '')
  }
  return ''
}

function sortFavorites(
  items: FavListItem[],
  sort: FavSort,
  opts?: { reverseDate?: boolean },
): FavListItem[] {
  const list = items.slice()
  if (sort === 'recent') {
    list.sort((a, b) => favoriteSavedAt(b).localeCompare(favoriteSavedAt(a)))
    return list
  }
  const dir = opts?.reverseDate ? -1 : 1
  list.sort((a, b) => {
    const da = favoriteTripDay(a)
    const db = favoriteTripDay(b)
    if (da && db && da !== db) return da < db ? -dir : dir
    if (da && !db) return -1
    if (!da && db) return 1
    return favoriteSavedAt(b).localeCompare(favoriteSavedAt(a))
  })
  return list
}

function persistFavCache(next: FavCachePayload) {
  favMemoryCache = next
  void AsyncStorage.setItem(FAV_CACHE_KEY, JSON.stringify(next)).catch(() => {})
}
import {
  ActivityPlannerPicker,
  type ActivityPlannerTarget,
} from '../components/ActivityPlannerPicker'
import { HeartIcon } from '../components/HeartIcon'
import { GuestAuthLanding } from '../components/GuestAuthLanding'
import { FavorisEmpty } from '../components/onboarding/EmptyStates'
import { openInAppBrowser } from '../lib/openInApp'
import { bookCtaLabel, preparePartnerBook } from '../lib/partnerBook'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, shadow, spacing } from '../theme'

export function FavoritesScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { viewUser, signInWithGoogle, isGuest } = useAuth()
  const [favorites, setFavorites] = useState<SavedFavorite[]>(
    () => favMemoryCache?.favorites ?? [],
  )
  const [likedDeals, setLikedDeals] = useState<LikedDeal[]>(
    () => favMemoryCache?.likedDeals ?? [],
  )
  const [likedActivities, setLikedActivities] = useState<LikedActivity[]>(
    () => favMemoryCache?.likedActivities ?? [],
  )
  const [likedParcours, setLikedParcours] = useState<LikedItinerary[]>(
    () => favMemoryCache?.likedParcours ?? [],
  )
  /** Pull-to-refresh only — never toggled on focus (évite le bounce). */
  const [refreshing, setRefreshing] = useState(false)
  /** Per-collection ready — skeleton only on the active tab until its fetch lands. */
  const [ready, setReady] = useState<FavReady>(() =>
    favMemoryCache ? READY_ALL : READY_NONE,
  )
  const readyRef = useRef<FavReady>(favMemoryCache ? READY_ALL : READY_NONE)
  const cacheRef = useRef<FavCachePayload>(
    favMemoryCache ?? {
      favorites: [],
      likedDeals: [],
      likedActivities: [],
      likedParcours: [],
    },
  )
  /** Per-collection in-flight token — late responses for an older token are dropped. */
  const fetchTokenRef = useRef<FavFetchedAt>({ ...FETCHED_NONE })
  const fetchedAtRef = useRef<FavFetchedAt>({ ...favFetchedAtMemory })
  const [error, setError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)
  const [tab, setTab] = useState<FavCollection>('flights')
  const tabRef = useRef<FavCollection>('flights')
  tabRef.current = tab
  const [sort, setSort] = useState<FavSort>('date')
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [pendingAdd, setPendingAdd] = useState<ActivityCardModel | null>(null)
  const [addBusy, setAddBusy] = useState(false)
  const dateSortAvailable = tab === 'flights' || tab === 'deals'
  const inflightRef = useRef<Partial<Record<FavCollection, Promise<void>>>>({})

  const markReady = useCallback((id: FavCollection) => {
    if (readyRef.current[id]) return
    const next = { ...readyRef.current, [id]: true }
    readyRef.current = next
    setReady(next)
  }, [])

  const patchCache = useCallback((partial: Partial<FavCachePayload>) => {
    const next = { ...cacheRef.current, ...partial }
    cacheRef.current = next
    persistFavCache(next)
  }, [])

  const applyDiskCache = useCallback(
    (payload: FavCachePayload) => {
      favMemoryCache = payload
      cacheRef.current = payload
      setFavorites(payload.favorites)
      setLikedDeals(payload.likedDeals)
      setLikedActivities(payload.likedActivities)
      setLikedParcours(payload.likedParcours)
      readyRef.current = READY_ALL
      setReady(READY_ALL)
    },
    [],
  )

  const fetchCollection = useCallback(
    async (id: FavCollection, opts?: { force?: boolean; background?: boolean }) => {
      const force = Boolean(opts?.force)
      const background = Boolean(opts?.background)
      const age = Date.now() - (fetchedAtRef.current[id] || 0)
      const hasPaint =
        Boolean(favMemoryCache) ||
        collectionFromCache(cacheRef.current, id).length > 0 ||
        readyRef.current[id]
      // Soft skip only for lazy background warm of inactive tabs.
      if (
        background &&
        !force &&
        fetchedAtRef.current[id] &&
        age < FAV_BG_STALE_MS
      ) {
        markReady(id)
        return
      }
      // Already fetching this collection — reuse (unless forced refresh).
      const existing = inflightRef.current[id]
      if (existing && !force) {
        markReady(id)
        await existing
        return
      }

      const token = (fetchTokenRef.current[id] || 0) + 1
      fetchTokenRef.current[id] = token

      const run = (async () => {
        const api = getApi()
        try {
          if (id === 'flights') {
            const list = await api.getFavorites()
            if (fetchTokenRef.current[id] !== token) return
            const next = Array.isArray(list) ? list : []
            setFavorites(next)
            patchCache({ favorites: next })
          } else if (id === 'deals') {
            const deals = await api.getLikedDeals()
            if (fetchTokenRef.current[id] !== token) return
            const next = Array.isArray(deals) ? deals : []
            setLikedDeals(next)
            patchCache({ likedDeals: next })
          } else if (id === 'activities') {
            const acts = await api.getLikedActivities()
            if (fetchTokenRef.current[id] !== token) return
            const next = Array.isArray(acts) ? acts : []
            setLikedActivities(next)
            patchCache({ likedActivities: next })
          } else {
            // Never .catch→[] : that wiped liked parcours when API/backend failed.
            const parcoursRes = await api.listLikedItineraries()
            if (fetchTokenRef.current[id] !== token) return
            if (!parcoursRes?.ok) {
              throw new Error('Favoris parcours indisponibles')
            }
            const next = Array.isArray(parcoursRes.items) ? parcoursRes.items : []
            setLikedParcours(next)
            patchCache({ likedParcours: next })
          }
          if (fetchTokenRef.current[id] !== token) return
          const now = Date.now()
          fetchedAtRef.current[id] = now
          favFetchedAtMemory[id] = now
        } catch (e) {
          if (fetchTokenRef.current[id] !== token) return
          if (id === tabRef.current && !hasPaint) {
            setError(
              e instanceof Error
                ? e.message
                : translate('fr', 'favorites.empty'),
            )
          }
          // Keep previous collection state on failure (do not clear to []).
        } finally {
          if (fetchTokenRef.current[id] === token) markReady(id)
        }
      })()

      inflightRef.current[id] = run
      try {
        await run
      } finally {
        if (inflightRef.current[id] === run) delete inflightRef.current[id]
      }
    },
    [markReady, patchCache],
  )

  const load = useCallback(
    async (opts?: { pull?: boolean }) => {
      if (!viewUser) {
        setFavorites([])
        setLikedDeals([])
        setLikedActivities([])
        setLikedParcours([])
        readyRef.current = READY_ALL
        setReady(READY_ALL)
        setRefreshing(false)
        return
      }
      if (opts?.pull) setRefreshing(true)
      setError(null)

      if (__DEV__ && isGuest) {
        const next: FavCachePayload = {
          favorites: listGuestFlightFavorites(),
          likedDeals: listGuestLikedDeals(),
          likedActivities: listGuestLikedActivities(),
          likedParcours: [],
        }
        setFavorites(next.favorites)
        setLikedDeals(next.likedDeals)
        setLikedActivities(next.likedActivities)
        setLikedParcours([])
        patchCache(next)
        const now = Date.now()
        for (const c of COLLECTIONS) {
          fetchedAtRef.current[c.id] = now
          favFetchedAtMemory[c.id] = now
        }
        readyRef.current = READY_ALL
        setReady(READY_ALL)
        setRefreshing(false)
        return
      }

      const prefer = tabRef.current
      const rest = COLLECTIONS.map((c) => c.id).filter((id) => id !== prefer)

      // 1) Visible tab — always revalidate (cache paints first, network wins).
      await fetchCollection(prefer, { force: true })
      setRefreshing(false)

      // 2) Lazy warm other tabs after paint (may skip if recently fetched).
      for (const id of rest) {
        void fetchCollection(id, { background: true })
      }
    },
    [viewUser, isGuest, fetchCollection, patchCache],
  )

  const selectTab = useCallback(
    (id: FavCollection) => {
      setTab(id)
      setArchiveOpen(false)
      setSort(id === 'flights' || id === 'deals' ? 'date' : 'recent')
      if (viewUser && !(__DEV__ && isGuest)) {
        // Show cache immediately if we have it.
        if (
          collectionFromCache(cacheRef.current, id).length > 0 ||
          fetchedAtRef.current[id]
        ) {
          markReady(id)
        }
        // Always hit the API so likes/unlikes elsewhere aren't stale.
        void fetchCollection(id, { force: true })
      }
    },
    [viewUser, isGuest, fetchCollection, markReady],
  )

  // Cold start: disk → paint before / with network (never blocks fetch).
  useEffect(() => {
    if (favMemoryCache || favDiskBootstrapped) return
    favDiskBootstrapped = true
    let cancelled = false
    void AsyncStorage.getItem(FAV_CACHE_KEY)
      .then(async (raw) => {
        // Migrate v1 disk cache once if v2 empty.
        let payload = raw
        if (!payload) {
          payload = await AsyncStorage.getItem('fw_favorites_cache_v1')
        }
        if (cancelled || !payload || favMemoryCache) return
        const hydrated = normalizeFavCache(
          JSON.parse(payload) as Partial<FavCachePayload>,
        )
        const any =
          hydrated.favorites.length +
            hydrated.likedDeals.length +
            hydrated.likedActivities.length +
            hydrated.likedParcours.length >
          0
        if (!any) return
        // Don't clobber a network response that already landed.
        const networkWon = COLLECTIONS.some(
          (c) => (fetchedAtRef.current[c.id] || 0) > 0,
        )
        if (networkWon) return
        applyDiskCache(hydrated)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [applyDiskCache])

  useFocusEffect(
    useCallback(() => {
      void load()
      return () => {
        setRefreshing(false)
      }
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
    const prev = favorites
    const next = prev.filter((f) => f.id !== id)
    setFavorites(next)
    patchCache({ favorites: next })
    try {
      if (__DEV__ && isGuest) removeGuestFlightFavorite(id)
      else await getApi().deleteFavorite(id)
    } catch {
      setFavorites(prev)
      patchCache({ favorites: prev })
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
      setLikedDeals((prev) => {
        const next = prev.filter((d) => d.deal_id !== dealId)
        patchCache({ likedDeals: next })
        return next
      })
    } catch {
      /* ignore */
    }
  }

  const unlikeActivity = async (productCode: string) => {
    try {
      if (__DEV__ && isGuest) unlikeGuestActivity(productCode)
      else await getApi().unlikeActivity(productCode)
      setLikedActivities((prev) => {
        const next = prev.filter((a) => a.product_code !== productCode)
        patchCache({ likedActivities: next })
        return next
      })
    } catch {
      /* ignore */
    }
  }

  const unlikeParcours = async (itineraryId: string) => {
    try {
      setLikedParcoursIdLocal(itineraryId, false)
      await getApi().unlikeItinerary(itineraryId)
      setLikedParcours((prev) => {
        const next = prev.filter((p) => p.itinerary_id !== itineraryId)
        patchCache({ likedParcours: next })
        return next
      })
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

  const { active: activeRaw, archived: archivedRaw } = useMemo(() => {
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

  const effectiveSort: FavSort = dateSortAvailable ? sort : 'recent'

  const activeItems = useMemo(
    () => sortFavorites(activeRaw as FavListItem[], effectiveSort),
    [activeRaw, effectiveSort],
  )
  const archivedItems = useMemo(
    () =>
      sortFavorites(archivedRaw as FavListItem[], effectiveSort, {
        reverseDate: true,
      }),
    [archivedRaw, effectiveSort],
  )

  const showSkeleton = !ready[tab]
  const listData: FavListItem[] = showSkeleton ? SKELETON_ITEMS : activeItems
  const collectionCounts = useMemo(
    () => ({
      flights: favorites.length,
      deals: likedDeals.length,
      activities: likedActivities.length,
      parcours: likedParcours.length,
    }),
    [favorites.length, likedDeals.length, likedActivities.length, likedParcours.length],
  )

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
          onPressIn={() => {
            const liked = item as LikedDeal
            const deal = liked.deal
            const dealId = String(
              liked.deal_key || liked.deal_id || deal?.deal_key || deal?.id || '',
            )
            if (dealId) prefetchDealDetail(dealId, deal)
          }}
          onPress={() => {
            const liked = item as LikedDeal
            const deal = liked.deal
            const dealId = String(
              liked.deal_key || liked.deal_id || deal?.deal_key || deal?.id || '',
            )
            if (deal) rememberDealPreview(deal)
            navigation.navigate('DealDetail', {
              dealId,
              preview: deal,
            })
          }}
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
                itineraryId: card.slug || liked.itinerary_id,
                preview: {
                  id: liked.itinerary_id,
                  slug: card.slug,
                  title: card.title,
                  subtitle: card.subtitle,
                  cover_image: card.cover_image,
                  city_slug: card.city_slug,
                  duration_kind: card.duration_kind,
                },
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
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 120,
          flexGrow: 1,
        }}
        data={listData}
        keyExtractor={(item) => {
          if (isSkeletonItem(item)) return item.id
          if ('itinerary_id' in item && (item as LikedItinerary).itinerary_id) {
            return `parcours-${(item as LikedItinerary).itinerary_id}`
          }
          if ('product_code' in item && (item as LikedActivity).product_code) {
            return `act-${(item as LikedActivity).product_code}`
          }
          return String((item as { id?: string }).id || Math.random())
        }}
        extraData={{
          tab,
          sort: effectiveSort,
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
            <TabScreenHeader
              kicker="FAVORIS"
              title={translate('fr', 'favorites.title')}
              subtitle={translate('fr', 'favorites.subtitle')}
            >
              <View style={styles.hubTabs}>
                {COLLECTIONS.map(({ id, labelKey }) => {
                  const on = tab === id
                  const n = collectionCounts[id]
                  return (
                    <Pressable
                      key={id}
                      onPress={() => selectTab(id)}
                      style={[styles.hubTab, on && styles.hubTabActive]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                    >
                      <Text
                        style={[styles.hubTabText, on && styles.hubTabTextActive]}
                        numberOfLines={1}
                      >
                        {translate('fr', labelKey)}
                        {showSkeleton ? '' : ` · ${n}`}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>

              {!showSkeleton && dateSortAvailable ? (
                <View style={styles.toolbar}>
                  <View style={styles.sortRow}>
                    {(['date', 'recent'] as const).map((id) => {
                      const on = effectiveSort === id
                      return (
                        <Pressable
                          key={id}
                          onPress={() => setSort(id)}
                          style={({ pressed }) => [
                            styles.sortChip,
                            on && styles.sortChipOn,
                            pressed && { opacity: 0.9 },
                          ]}
                        >
                          <Text
                            style={[styles.sortLabel, on && styles.sortLabelOn]}
                          >
                            {translate(
                              'fr',
                              id === 'date'
                                ? 'favorites.sort.date'
                                : 'favorites.sort.recent',
                            )}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>
              ) : null}
            </TabScreenHeader>
          </View>
        }
        ListEmptyComponent={
          showSkeleton ? null : error && listData.length === 0 ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : listData.length === 0 &&
            archivedItems.length === 0 ? (
            <FavorisEmpty
              onExplore={() =>
                navigation.navigate('Main', { screen: 'Deals' } as never)
              }
            />
          ) : listData.length === 0 ? (
            <Text style={styles.onlyArchivedHint}>
              {translate('fr', 'favorites.archivedHint')}
            </Text>
          ) : null
        }
        ListFooterComponent={
          !showSkeleton && archivedItems.length > 0 ? (
            <View style={[styles.archiveCard, shadow.soft]}>
              <Pressable
                onPress={() => setArchiveOpen((o) => !o)}
                style={({ pressed }) => [
                  styles.archiveHeader,
                  archiveOpen && styles.archiveHeaderOpen,
                  pressed && { opacity: 0.92 },
                ]}
                accessibilityRole="button"
                accessibilityState={{ expanded: archiveOpen }}
              >
                <View style={styles.archiveCopy}>
                  <Text
                    style={[
                      styles.archiveKicker,
                      archiveOpen && styles.archiveKickerOpen,
                    ]}
                  >
                    PASSÉS
                  </Text>
                  <Text
                    style={[
                      styles.archiveTitle,
                      archiveOpen && styles.archiveTitleOpen,
                    ]}
                  >
                    {translate('fr', 'favorites.archivedSectionCount', {
                      n: archivedItems.length,
                    })}
                  </Text>
                </View>
                <View
                  style={[
                    styles.archiveChevronWrap,
                    archiveOpen && styles.archiveChevronWrapOpen,
                  ]}
                >
                  <Text
                    style={[
                      styles.archiveChevron,
                      archiveOpen && styles.archiveChevronOpen,
                    ]}
                  >
                    {archiveOpen ? '▾' : '▸'}
                  </Text>
                </View>
              </Pressable>
              {archiveOpen ? (
                <View style={styles.archiveList}>
                  <Text style={styles.archiveHint}>
                    {translate('fr', 'favorites.archivedHint')}
                  </Text>
                  {archivedItems.map((item) => (
                    <View key={String((item as { id?: string }).id)}>
                      {renderFavoriteItem(item, true)}
                    </View>
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
  header: { marginBottom: 18, gap: 4 },
  hubTabs: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 14,
  },
  hubTab: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  hubTabActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  hubTabText: {
    fontFamily: fonts.bold,
    fontSize: 10,
    color: colors.muted,
    textAlign: 'center',
  },
  hubTabTextActive: { color: colors.white },
  toolbar: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  sortChipOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  sortLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.muted,
  },
  sortLabelOn: {
    fontFamily: fonts.bold,
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
  archiveCard: {
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  archiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    backgroundColor: colors.primarySoft,
  },
  archiveHeaderOpen: {
    backgroundColor: colors.ink,
  },
  archiveCopy: { flex: 1, minWidth: 0 },
  archiveKicker: {
    fontFamily: fonts.extrabold,
    fontSize: 10,
    letterSpacing: 1.1,
    color: colors.primaryInk,
    marginBottom: 2,
  },
  archiveKickerOpen: {
    color: colors.primaryMuted,
  },
  archiveTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 16,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  archiveTitleOpen: {
    color: colors.white,
  },
  archiveChevronWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  archiveChevronWrapOpen: {
    backgroundColor: colors.primary,
  },
  archiveChevron: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
  },
  archiveChevronOpen: {
    color: colors.white,
  },
  archiveHint: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
    marginBottom: spacing.md,
    paddingHorizontal: 16,
  },
  archiveList: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 0,
  },
  errorText: {
    marginTop: spacing.xl,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.inkSoft,
    textAlign: 'center',
    lineHeight: 20,
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
