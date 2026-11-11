import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
} from 'react-native'
import { useNavigation, useScrollToTop } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  buildParcoursFeed,
  citySlugDisplayNameFr,
  isFeaturedToday,
  itineraryBadgeLabel,
  itineraryOccasionEmoji,
  type Itinerary,
  type ItineraryOccasion,
} from '@flightwatcher/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getApi } from '../lib/client'
import {
  getParcoursCached,
  getParcoursCatalogMemory,
  hydrateParcoursCatalogMemory,
  prefetchParcoursDetails,
  rememberParcoursPreview,
  setParcoursCatalogMemory,
  subscribeParcoursCatalogChange,
} from '../lib/parcoursCache'
import { scheduleActivitiesWarmup } from '../lib/activitiesWarmup'
import { useAuth } from '../context/AuthContext'
import { FwKicker } from '../components/FwKicker'
import { tabScreenHeaderStyles } from '../components/TabScreenHeader'
import { ItineraryCard } from '../components/parcours/ItineraryCard'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, shadow, spacing } from '../theme'

const CITY_LS = 'fw_parcours_city'
const CITIES = ['paris', 'marseille', 'lyon', 'lisbon', 'porto', 'barcelona', 'rome'] as const

type Props = {
  headerExtra?: React.ReactNode
  embedded?: boolean
}

export function ParcoursCatalogScreen({ headerExtra, embedded = false }: Props) {
  const insets = useSafeAreaInsets()
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { user, isGuest } = useAuth()
  const scrollRef = useRef<ScrollView>(null)
  useScrollToTop(scrollRef)
  const [city, setCity] = useState('paris')
  const cityRef = useRef(city)
  cityRef.current = city
  const [cityOpen, setCityOpen] = useState(false)
  const [items, setItems] = useState<Itinerary[]>(
    () => getParcoursCatalogMemory() ?? [],
  )
  const [loading, setLoading] = useState(() => !getParcoursCatalogMemory())
  const [refreshing, setRefreshing] = useState(false)
  const [occasion, setOccasion] = useState<ItineraryOccasion | null>(null)
  const [error, setError] = useState<string | null>(null)

  const kickActivitiesWarm = useCallback(() => {
    const key = user?.id || (isGuest ? 'guest' : '')
    if (!key) return
    scheduleActivitiesWarmup(key)
  }, [user?.id, isGuest])

  useEffect(() => {
    void AsyncStorage.getItem(CITY_LS).then((v) => {
      if (v) setCity(v)
    })
  }, [])

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    else if (!getParcoursCatalogMemory()?.length) setLoading(true)
    setError(null)
    try {
      const res = await getApi().listParcours({ limit: 80 })
      if (!res.ok) throw new Error('Catalogue indisponible')
      const next = (res.itineraries || []) as unknown as Itinerary[]
      setItems(next)
      setParcoursCatalogMemory(next)
      // Warm detail+steps before tap (backend TTL + client singleflight).
      prefetchParcoursDetails(
        next.map((it) => it.slug || it.id),
        { limit: 12 },
      )
      // Parcours ready → activités next (post-login sequencing).
      kickActivitiesWarm()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      if (!getParcoursCatalogMemory()?.length) setItems([])
      // Still try activities if we already had disk/memory catalogue.
      if (getParcoursCatalogMemory()?.length) kickActivitiesWarm()
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [kickActivitiesWarm])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!getParcoursCatalogMemory()) {
        const disk = await hydrateParcoursCatalogMemory()
        if (!cancelled && disk?.length) {
          setItems(disk)
          setLoading(false)
          // Disk hit: home is usable — start activités warm without waiting HTTP.
          kickActivitiesWarm()
        }
      } else if (!cancelled && getParcoursCatalogMemory()?.length) {
        kickActivitiesWarm()
      }
      if (!cancelled) void load()
    })()
    return () => {
      cancelled = true
    }
  }, [load, kickActivitiesWarm])

  // Unpublish / delete / publish depuis admin → refetch catalogue
  useEffect(() => {
    return subscribeParcoursCatalogChange(() => {
      const mem = getParcoursCatalogMemory()
      if (mem) setItems(mem)
      void load(true)
    })
  }, [load])

  // Warm Metro chunk before first tap (cold open was ~700–800ms).
  useEffect(() => {
    void import('./ItineraryDetailScreen')
  }, [])

  useEffect(() => {
    void AsyncStorage.setItem(CITY_LS, city)
  }, [city])

  useEffect(() => {
    if (loading) return
    void getApi()
      .trackActivityEvent({
        domain: 'itinerary',
        event: 'itinerary_list_viewed',
        surface: 'parcours',
        platform: 'ios',
        meta: { city, count: items.length, occasion },
      })
      .catch(() => {})
  }, [loading, city, items.length, occasion])

  const rows = useMemo(
    () => buildParcoursFeed(items, { citySlug: city, occasionFilter: occasion }),
    [items, city, occasion],
  )

  const warm = (it: Itinerary) => {
    const idOrSlug = it.slug || it.id
    if (idOrSlug) void getParcoursCached(idOrSlug).catch(() => {})
  }

  const open = (it: Itinerary) => {
    rememberParcoursPreview(it)
    const idOrSlug = it.slug || it.id
    warm(it)
    void getApi()
      .trackActivityEvent({
        domain: 'itinerary',
        event: 'itinerary_card_clicked',
        surface: 'parcours',
        platform: 'ios',
        meta: { id: it.id, slug: it.slug },
      })
      .catch(() => {})
    navigation.navigate('ItineraryDetail', {
      itineraryId: idOrSlug,
      preview: {
        id: it.id,
        slug: it.slug,
        title: it.title,
        subtitle: it.subtitle,
        intro: it.intro,
        cover_image: it.cover_image,
        city_slug: it.city_slug,
        duration_kind: it.duration_kind,
        occasions: it.occasions,
        featured_from: it.featured_from,
        featured_to: it.featured_to,
        budget_estimate_eur: it.budget_estimate_eur,
        budget_basis: it.budget_basis,
        // Instant steps when catalogue embeds itinerary_items.
        itinerary_items: it.itinerary_items,
      },
    })
  }

  const cityLabel = citySlugDisplayNameFr(city) || city
  const showSkeleton = loading && items.length === 0

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          paddingTop: embedded ? 0 : insets.top + 12,
          paddingBottom: insets.bottom + 110,
          paddingHorizontal: spacing.xl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.primary}
          />
        }
      >
        {headerExtra}
        {!embedded ? (
          <>
            <FwKicker>PARCOURS</FwKicker>
            <Text style={styles.title}>Où aller, quoi faire</Text>
            <Text style={styles.subtitle}>
              Des balades et des week-ends choisis pour toi.
            </Text>
          </>
        ) : null}

        <Pressable
          onPress={() => setCityOpen((v) => !v)}
          style={[styles.cityChip, embedded && { marginTop: 12 }]}
        >
          <Text style={styles.cityChipText}>
            Près de toi · {cityLabel} ▾
          </Text>
        </Pressable>
        {cityOpen ? (
          <View style={styles.cityMenu}>
            {CITIES.map((c) => (
              <Pressable
                key={c}
                onPress={() => {
                  setCity(c)
                  setCityOpen(false)
                }}
                style={styles.cityItem}
              >
                <Text style={styles.cityItemText}>
                  {citySlugDisplayNameFr(c) || c}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {occasion ? (
          <Pressable onPress={() => setOccasion(null)} style={{ marginTop: 12 }}>
            <Text style={styles.backLink}>← Tous les parcours</Text>
          </Pressable>
        ) : null}

        {error && items.length === 0 ? (
          <Text style={styles.error}>{error}</Text>
        ) : null}

        {showSkeleton ? (
          <View style={styles.skeletonBlock}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.skeletonCard, shadow.soft]}>
                <View style={styles.skeletonImage} />
                <View style={styles.skeletonBody}>
                  <View style={[styles.skeletonLine, { width: '70%' }]} />
                  <View style={[styles.skeletonLine, { width: '42%' }]} />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {!showSkeleton &&
          !occasion &&
          items.length > 0 &&
          !rows.some((r) => r.kind === 'near') ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              Pas encore d’idées à {cityLabel}
            </Text>
          </View>
        ) : null}

        {rows.map((row) => {
          if (row.kind === 'envies') {
            return (
              <View key={row.id} style={styles.section}>
                <Text style={styles.envieKicker}>INSPIRE-TOI</Text>
                <Text style={styles.rowTitle}>{row.title}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.envieRail}
                >
                  {row.chips.map((chip) => {
                    const on = occasion === chip.occasion
                    return (
                      <Pressable
                        key={chip.occasion}
                        onPress={() =>
                          setOccasion((prev) =>
                            prev === chip.occasion ? null : chip.occasion,
                          )
                        }
                        style={[styles.envie, on && styles.envieOn]}
                      >
                        <View
                          style={[styles.envieIcon, on && styles.envieIconOn]}
                        >
                          <Text style={styles.envieEmoji}>
                            {itineraryOccasionEmoji(chip.occasion)}
                          </Text>
                        </View>
                        <Text
                          style={[styles.envieLabel, on && styles.envieLabelOn]}
                          numberOfLines={2}
                        >
                          {chip.label}
                        </Text>
                      </Pressable>
                    )
                  })}
                </ScrollView>
              </View>
            )
          }

          const landscape = row.kind === 'featured'
          return (
            <View key={row.id} style={styles.section}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {row.items.map((it) => (
                  <ItineraryCard
                    key={it.id}
                    itinerary={it}
                    variant={landscape ? 'landscape' : 'portrait'}
                    badge={
                      itineraryBadgeLabel(it) ||
                      (isFeaturedToday(it) ? 'Nouveau' : null)
                    }
                    onPress={() => open(it)}
                    onPressIn={() => warm(it)}
                    style={{ marginRight: 12 }}
                  />
                ))}
              </ScrollView>
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: {
    ...tabScreenHeaderStyles.title,
  },
  subtitle: {
    ...tabScreenHeaderStyles.subtitle,
    marginBottom: 12,
  },
  cityChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cityChipText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
  },
  cityMenu: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  cityItem: { paddingHorizontal: 14, paddingVertical: 12 },
  cityItemText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  backLink: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.primary,
  },
  error: { marginTop: 16, color: '#b91c1c', fontFamily: fonts.medium },
  empty: {
    marginTop: 16,
    marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  skeletonBlock: { marginTop: 28, gap: 14 },
  skeletonCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
  },
  skeletonImage: { height: 160, backgroundColor: colors.primaryMuted },
  skeletonBody: { padding: 14, gap: 10 },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primarySoft,
  },
  section: { marginTop: 28 },
  rowTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.ink,
    marginBottom: 12,
  },
  envieKicker: {
    fontFamily: fonts.extrabold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: colors.muted,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  envieRail: {
    gap: 8,
    paddingRight: 8,
  },
  envie: {
    width: 124,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  envieOn: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  envieIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: '#FFE7DC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  envieIconOn: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  envieEmoji: {
    fontSize: 14,
    lineHeight: 18,
  },
  envieLabel: {
    fontFamily: fonts.extrabold,
    fontSize: 12,
    color: colors.ink,
    lineHeight: 15,
  },
  envieLabelOn: {
    color: '#F5EFEA',
  },
})
