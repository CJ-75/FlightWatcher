import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  ScrollView,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Airport, DealOccasionChip, TravelDeal } from '@flightwatcher/shared'
import {
  airportSelectionLabel,
  dedupeDealsByHotelTitle,
  encodeAirportCodes,
  findCityGroupByCodes,
  groupAirportsByCity,
  parseAirportCodes,
} from '@flightwatcher/shared'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getCachedAirports } from '../lib/airportsCache'
import { apiBase, getApi } from '../lib/client'
import { DealCard } from '../components/DealCard'
import { OccasionIcon } from '../components/OccasionIcon'
import { CityAirportPicker } from '../components/CityAirportPicker'
import { PassengerStepper } from '../components/PassengerStepper'
import { useLikedDeals } from '../hooks/useLikedDeals'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../../App'
import { colors, fonts, radius, shadow, spacing } from '../theme'

const STALE_MS = 90_000
const ORIGIN_LS_KEY = 'fw_deals_origin'
type DurationTab = 'weekend' | 'short' | 'week'

export function DealsScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { isLiked, toggleLike, refresh: refreshLikes } = useLikedDeals()
  const [deals, setDeals] = useState<TravelDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Arrival city first; origin optional for flight priority. */
  const [destination, setDestination] = useState('')
  const [origin, setOrigin] = useState('')
  const [adults, setAdults] = useState(2)
  const [queryDestination, setQueryDestination] = useState('')
  const [queryOrigin, setQueryOrigin] = useState('')
  const [queryAdults, setQueryAdults] = useState(2)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [durationTab, setDurationTab] = useState<DurationTab>('weekend')
  const [occasion, setOccasion] = useState<string | null>(null)
  const [occasionChips, setOccasionChips] = useState<DealOccasionChip[]>([])
  const [sort, setSort] = useState<'recommended' | 'price_asc' | 'price_desc'>('recommended')
  const [airports, setAirports] = useState<Airport[]>([])
  const [uiEnabled, setUiEnabled] = useState(true)
  const [readonlyBanner, setReadonlyBanner] = useState(false)
  const configLoadedRef = useRef(false)
  const lastFetchAtRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const originHydratedRef = useRef(false)

  const setOriginPersist = useCallback((value: string) => {
    setOrigin(value)
    void AsyncStorage.setItem(ORIGIN_LS_KEY, value || '').catch(() => undefined)
  }, [])

  useEffect(() => {
    getCachedAirports()
      .then(async (list) => {
        setAirports(list)
        if (originHydratedRef.current) return
        originHydratedRef.current = true
        const groups = groupAirportsByCity(list)
        const expandToCity = (encoded: string) => {
          const codes = parseAirportCodes(encoded)
          if (!codes.length) return encoded
          const group = findCityGroupByCodes(groups, codes)
          if (!group || group.airports.length <= 1) return encoded
          return encodeAirportCodes(group.airports.map((a) => a.code)) || encoded
        }
        try {
          const stored = ((await AsyncStorage.getItem(ORIGIN_LS_KEY)) || '').trim()
          if (stored) {
            const expanded = expandToCity(stored)
            setOrigin(expanded)
            setQueryOrigin(expanded)
            if (expanded !== stored) {
              void AsyncStorage.setItem(ORIGIN_LS_KEY, expanded).catch(() => undefined)
            }
            return
          }
        } catch {
          /* ignore */
        }
        // Default: Paris + tous ses aéroports
        const paris = groups.find((g) => g.city.toLowerCase() === 'paris')
        if (!paris) return
        const encoded = encodeAirportCodes(paris.airports.map((a) => a.code))
        if (!encoded) return
        setOrigin(encoded)
        setQueryOrigin(encoded)
        void AsyncStorage.setItem(ORIGIN_LS_KEY, encoded).catch(() => undefined)
      })
      .catch(() => undefined)

    // Config once (not on every deals load)
    void fetch(`${apiBase}/api/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (!cfg) return
        configLoadedRef.current = true
        setUiEnabled(cfg?.ui_enabled !== false)
        setReadonlyBanner(
          Boolean(cfg?.prod_readonly) || cfg?.booking_enabled === false,
        )
      })
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setQueryDestination(destination)
      setQueryOrigin(origin)
      setQueryAdults(adults)
    }, 280)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [destination, origin, adults])

  const load = useCallback(
    async (opts?: { refresh?: boolean; force?: boolean }) => {
      const isRefresh = Boolean(opts?.refresh)
      const force = Boolean(opts?.force)
      if (!force && !isRefresh && lastFetchAtRef.current > 0) {
        const age = Date.now() - lastFetchAtRef.current
        if (age < STALE_MS) return
      }
      if (isRefresh) setRefreshing(true)
      else if (deals.length === 0) setLoading(true)
      setError(null)
      try {
        if (uiEnabled === false) {
          setDeals([])
          return
        }
        const listPromise = getApi().getDeals({
          origin: queryOrigin || undefined,
          destination: queryDestination || undefined,
          adults: queryAdults,
          occasion: occasion || undefined,
          duration: durationTab,
          limit: 36,
        })
        void refreshLikes()
        void getApi()
          .getDealOccasions({
            origin: queryOrigin || undefined,
            destination: queryDestination || undefined,
            adults: queryAdults,
            duration: durationTab,
          })
          .then((res) => {
            const seen = new Set<string>()
            const all: DealOccasionChip[] = []
            for (const c of [...(res?.main || []), ...(res?.more || [])]) {
              if (!c?.slug || seen.has(c.slug)) continue
              seen.add(c.slug)
              all.push(c)
            }
            setOccasionChips(all)
            setOccasion((prev) => {
              if (!prev) return null
              return all.some((c) => c.slug === prev) ? prev : null
            })
          })
          .catch(() => {
            setOccasionChips([])
          })
        const list = await listPromise
        const withHotelPhoto = (Array.isArray(list) ? list : []).filter(
          (d) => Boolean(d.hotel?.photo || (d.image_url && String(d.image_url).trim())),
        )
        setDeals(withHotelPhoto)
        lastFetchAtRef.current = Date.now()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Impossible de charger les deals')
        setDeals([])
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [refreshLikes, queryOrigin, queryDestination, queryAdults, occasion, durationTab, deals.length, uiEnabled],
  )

  // Filter changes → always refetch
  useEffect(() => {
    void load({ force: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- query* + occasion + duration
  }, [queryOrigin, queryDestination, queryAdults, occasion, durationTab])

  // Tab focus → refetch only if stale (skip first mount: filter effect owns it)
  useFocusEffect(
    useCallback(() => {
      if (lastFetchAtRef.current === 0) return
      void load()
    }, [load]),
  )

  const originCityLabel = useMemo(() => {
    if (!origin) return ''
    const groups = groupAirportsByCity(airports)
    const full = airportSelectionLabel(origin, groups)
    return (full.split(' · ')[0] || full || origin.split(',')[0] || '').trim()
  }, [origin, airports])

  const filterSummary = (() => {
    const from = originCityLabel || null
    const to = destination ? destination.split(',')[0] : null
    const parts: string[] = []
    if (from && to) parts.push(`${from} → ${to}`)
    else if (from) parts.push(`de ${from}`)
    else if (to) parts.push(`→ ${to}`)
    if (adults !== 2) parts.push(`${adults} ad.`)
    return parts.join(' · ')
  })()

  const hasWallFilter = Boolean(queryOrigin || queryDestination)
  // Duration applied server-side (≥30 floor) — do not re-strip here
  const matchedDeals = useMemo(() => {
    let list = deals
    if (hasWallFilter) {
      list = list.filter((d) => {
        if (queryOrigin && d.flags?.match_origin === false) return false
        if (queryDestination && d.flags?.match_destination === false) return false
        return true
      })
    }
    return list
  }, [deals, queryOrigin, queryDestination, hasWallFilter])
  const gridDeals = useMemo(() => {
    const sorted =
      sort === 'recommended'
        ? matchedDeals
        : [...matchedDeals].sort((a, b) => {
            const dir = sort === 'price_asc' ? 1 : -1
            return dir * ((a.price_per_person || 0) - (b.price_per_person || 0))
          })
    return dedupeDealsByHotelTitle(sorted)
  }, [sort, matchedDeals])
  const fillerDeals = useMemo(() => {
    if (!hasWallFilter) return []
    const raw = deals.filter((d) => {
      if (queryOrigin && d.flags?.match_origin === false) return true
      if (queryDestination && d.flags?.match_destination === false) return true
      return false
    })
    const occupied = new Set<string>()
    dedupeDealsByHotelTitle(gridDeals, occupied)
    return dedupeDealsByHotelTitle(raw, occupied)
  }, [deals, queryOrigin, queryDestination, hasWallFilter, gridDeals])

  const listData =
    fillerDeals.length > 0
      ? [
          ...gridDeals.map((d) => ({ kind: 'deal' as const, deal: d })),
          { kind: 'filler_header' as const },
          ...fillerDeals.map((d) => ({ kind: 'deal' as const, deal: d })),
        ]
      : gridDeals.map((d) => ({ kind: 'deal' as const, deal: d }))

  return (
    <View style={styles.root}>
      <ScreenBackground />

      {loading && deals.length === 0 ? (
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Chargement des deals…</Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item, i) =>
            item.kind === 'filler_header' ? 'filler-header' : item.deal.id || String(i)
          }
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 100,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load({ refresh: true, force: true })}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>Séjours pas chers</Text>
              <Text style={styles.subtitle}>
                Vol + hôtel, prix réels vérifiés. Inspire-toi, filtre, réserve.
              </Text>
              {!uiEnabled ? (
                <Text style={styles.subtitle}>Onglet deals désactivé (calibration).</Text>
              ) : null}
              {readonlyBanner && uiEnabled ? (
                <Text style={[styles.subtitle, { color: colors.primary }]}>
                  Lecture seule — réservation hôtel fermée.
                </Text>
              ) : null}

              <View style={styles.chipRow}>
                {(
                  [
                    ['weekend', 'Week-end'],
                    ['short', 'Court séjour'],
                    ['week', 'Semaine'],
                  ] as const
                ).map(([id, label]) => (
                  <Pressable
                    key={id}
                    onPress={() => setDurationTab(id)}
                    style={[styles.chip, durationTab === id && styles.chipInk]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        durationTab === id && styles.chipTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {occasionChips.length > 0 ? (
                <View style={styles.occasionBlock}>
                  <View style={styles.occasionHeader}>
                    <View>
                      <Text style={styles.occasionKicker}>INSPIRE-TOI</Text>
                      <Text style={styles.occasionTitle}>Envies & moments</Text>
                    </View>
                    {occasion ? (
                      <Pressable onPress={() => setOccasion(null)} hitSlop={8}>
                        <Text style={styles.occasionClear}>Tous les séjours</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.occasionRail}
                  >
                    {occasionChips.map((f) => {
                      const on = occasion === f.slug
                      return (
                        <Pressable
                          key={f.slug}
                          onPress={() =>
                            setOccasion((prev) => (prev === f.slug ? null : f.slug))
                          }
                          style={[styles.occasionCard, on && styles.occasionCardOn]}
                        >
                          <View
                            style={[styles.occasionIcon, on && styles.occasionIconOn]}
                          >
                            <OccasionIcon
                              icon={f.icon}
                              slug={f.slug}
                              size={16}
                              color={on ? colors.white : colors.primaryDeep}
                            />
                          </View>
                          <Text
                            style={[styles.occasionLabel, on && styles.occasionLabelOn]}
                            numberOfLines={2}
                          >
                            {f.label || f.slug}
                          </Text>
                          {f.count > 0 ? (
                            <Text
                              style={[styles.occasionCount, on && styles.occasionCountOn]}
                            >
                              {f.count} séjours
                            </Text>
                          ) : null}
                        </Pressable>
                      )
                    })}
                  </ScrollView>
                  {occasion
                    ? (() => {
                        const active = occasionChips.find((c) => c.slug === occasion)
                        return active?.explain ? (
                          <View style={styles.occasionExplain}>
                            <Text style={styles.occasionExplainTitle}>{active.label}</Text>
                            <Text style={styles.occasionExplainBody}>{active.explain}</Text>
                          </View>
                        ) : null
                      })()
                    : null}
                </View>
              ) : null}

              <View style={[styles.card, shadow.soft]}>
                <Pressable
                  onPress={() => setFiltersOpen((o) => !o)}
                  style={styles.filterToggle}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: filtersOpen }}
                >
                  <View style={styles.filterToggleText}>
                    <Text style={styles.filterToggleTitle}>Affiner</Text>
                    <Text style={styles.filterToggleHint} numberOfLines={1}>
                      {filterSummary || 'Tous trajets · 2 voyageurs'}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.filterChevron,
                      filtersOpen && styles.filterChevronOpen,
                    ]}
                  >
                    ▾
                  </Text>
                </Pressable>

                {filtersOpen ? (
                  <View style={styles.filterBody}>
                    <View style={styles.routePair}>
                      <View style={styles.routeField}>
                        <View style={styles.originRow}>
                          <Text style={styles.label}>Départ</Text>
                          {origin ? (
                            <Pressable onPress={() => setOriginPersist('')} hitSlop={8}>
                              <Text style={styles.clearOrigin}>Effacer</Text>
                            </Pressable>
                          ) : null}
                        </View>
                        <CityAirportPicker
                          airports={airports}
                          value={origin}
                          onChange={setOriginPersist}
                        />
                      </View>

                      <Text style={styles.routeArrow}>↓</Text>

                      <View style={styles.routeField}>
                        <View style={styles.originRow}>
                          <Text style={styles.label}>Arrivée</Text>
                          {destination ? (
                            <Pressable onPress={() => setDestination('')} hitSlop={8}>
                              <Text style={styles.clearOrigin}>Effacer</Text>
                            </Pressable>
                          ) : null}
                        </View>
                        <CityAirportPicker
                          airports={airports}
                          value={destination}
                          onChange={setDestination}
                        />
                      </View>
                    </View>
                    <Text style={styles.originHint}>
                      Optionnels — filtrent le mur (arrivée = ville / hôtels).
                    </Text>

                    <View style={styles.divider} />

                    <PassengerStepper value={adults} onChange={setAdults} />
                  </View>
                ) : null}
              </View>

              {!loading && !error && deals.length > 0 ? (
                <View style={styles.countRow}>
                  <Text style={styles.count}>
                    {gridDeals.length} offre{gridDeals.length > 1 ? 's' : ''}
                    {filterSummary ? ` · ${filterSummary}` : ''}
                  </Text>
                  <View style={styles.sortRowCompact}>
                    {(
                      [
                        ['recommended', 'Reco'],
                        ['price_asc', 'Prix ↑'],
                        ['price_desc', 'Prix ↓'],
                      ] as const
                    ).map(([id, label]) => (
                      <Pressable
                        key={id}
                        onPress={() => setSort(id)}
                        style={[
                          styles.sortChipSm,
                          sort === id && styles.sortChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.sortChipTextSm,
                            sort === id && styles.sortChipTextActive,
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={[styles.emptyCard, shadow.soft]}>
              {error ? (
                <>
                  <Text style={styles.emptyTitle}>Oups</Text>
                  <Text style={styles.emptyBody} numberOfLines={3}>
                    {error}
                  </Text>
                  <Pressable
                    onPress={() => void load({ force: true })}
                    style={styles.retryBtn}
                  >
                    <Text style={styles.retryText}>Réessayer</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.emptyTitle}>Pas encore de bon plan ici</Text>
                  <Text style={styles.emptyBody}>
                    {origin
                      ? `Aucun séjour vol + hôtel pour ces filtres. Change d’aéroport, d’envie, ou lance une recherche.`
                      : 'Aucun séjour pour l’instant. Choisis un départ dans Affiner, ou lance une recherche.'}
                  </Text>
                  <Pressable
                    onPress={() =>
                      (navigation as { navigate: (a: string) => void }).navigate('Search')
                    }
                    style={styles.retryBtn}
                  >
                    <Text style={styles.retryText}>Lancer une recherche</Text>
                  </Pressable>
                </>
              )}
            </View>
          }
          renderItem={({ item }) => {
            if (item.kind === 'filler_header') {
              return (
                <View style={styles.fillerHeader}>
                  <Text style={styles.fillerTitle}>Depuis d’autres aéroports</Text>
                  <Text style={styles.fillerSub}>
                    Autres départs pour compléter ta sélection
                  </Text>
                </View>
              )
            }
            const deal = item.deal
            return (
              <DealCard
                deal={deal}
                liked={isLiked(deal.id)}
                onToggleLike={() => void toggleLike(deal)}
                onPress={() => navigation.navigate('DealDetail', { dealId: deal.id })}
              />
            )
          }}
          showsVerticalScrollIndicator={false}
        />
      )}

    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    marginTop: 14,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
  },
  header: {
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 32,
    letterSpacing: -1,
    color: colors.ink,
    includeFontPadding: false,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 12,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
    includeFontPadding: false,
  },
  occasionBlock: {
    marginTop: 4,
    marginBottom: 14,
  },
  occasionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  occasionKicker: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.primary,
    marginBottom: 2,
  },
  occasionTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 16,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  occasionClear: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.primary,
  },
  occasionRail: {
    gap: 8,
    paddingRight: 8,
  },
  occasionCard: {
    width: 124,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  occasionCardOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  occasionIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  occasionIconOn: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  occasionLabel: {
    fontFamily: fonts.extrabold,
    fontSize: 12,
    color: colors.ink,
    lineHeight: 15,
  },
  occasionLabelOn: {
    color: colors.white,
  },
  occasionCount: {
    fontFamily: fonts.semibold,
    fontSize: 10,
    color: colors.muted,
  },
  occasionCountOn: {
    color: 'rgba(255,255,255,0.85)',
  },
  occasionExplain: {
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  occasionExplainTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 12,
    color: colors.ink,
  },
  occasionExplainBody: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.inkSoft,
    lineHeight: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipInk: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.muted,
  },
  chipTextActive: {
    color: colors.white,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    gap: 12,
  },
  filterToggleText: {
    flex: 1,
    minWidth: 0,
  },
  filterToggleTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
    includeFontPadding: false,
  },
  filterToggleHint: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
  },
  filterChevron: {
    fontSize: 16,
    color: colors.muted,
    transform: [{ rotate: '0deg' }],
  },
  filterChevronOpen: {
    transform: [{ rotate: '180deg' }],
  },
  filterBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginVertical: 14,
  },
  originRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    minHeight: 20,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
    includeFontPadding: false,
  },
  clearOrigin: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.primary,
  },
  routePair: {
    gap: 4,
  },
  routeField: {},
  routeArrow: {
    alignSelf: 'center',
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.muted,
    paddingVertical: 2,
  },
  originHint: {
    marginTop: 10,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 16,
  },
  count: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.muted,
    flexShrink: 1,
  },
  countRow: {
    marginTop: 4,
    gap: 10,
  },
  sortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  sortRowCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  sortChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  sortChipSm: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  sortChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sortChipText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.ink,
  },
  sortChipTextSm: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.muted,
  },
  sortChipTextActive: {
    color: colors.white,
  },
  fillerHeader: {
    marginTop: 8,
    marginBottom: 12,
  },
  fillerTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
    includeFontPadding: false,
  },
  fillerSub: {
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
  },
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 24,
    marginTop: 8,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.ink,
    marginBottom: 8,
  },
  emptyBody: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.muted,
  },
  retryBtn: {
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.white,
  },
})
