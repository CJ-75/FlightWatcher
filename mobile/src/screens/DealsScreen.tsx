import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Alert,
} from 'react-native'
import type { MainTabParamList } from '../../App'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Airport, TravelDeal } from '@flightwatcher/shared'
import { normalizeAirports, type FlexibleDates } from '@flightwatcher/shared'
import { apiBase, getApi } from '../lib/client'
import { DealCard } from '../components/DealCard'
import { CityAirportPicker } from '../components/CityAirportPicker'
import { PassengerStepper } from '../components/PassengerStepper'
import { FlexibleDatesModal } from '../components/FlexibleDatesModal'
import { useLikedDeals } from '../hooks/useLikedDeals'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../../App'
import { colors, fonts, radius, shadow, spacing } from '../theme'

const STALE_MS = 90_000

export function DealsScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { isLiked, toggleLike, refresh: refreshLikes } = useLikedDeals()
  const [deals, setDeals] = useState<TravelDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Empty = browse ~30 deals; set origin to prioritize then fill. */
  const [origin, setOrigin] = useState('')
  const [adults, setAdults] = useState(2)
  const [queryOrigin, setQueryOrigin] = useState('')
  const [queryAdults, setQueryAdults] = useState(2)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sort, setSort] = useState<'recommended' | 'price_asc' | 'price_desc'>('recommended')
  const [dateModalOpen, setDateModalOpen] = useState(false)
  const [flexDates, setFlexDates] = useState<FlexibleDates>({
    dates_depart: [],
    dates_retour: [],
  })
  const [airports, setAirports] = useState<Airport[]>([])
  const [uiEnabled, setUiEnabled] = useState(true)
  const [readonlyBanner, setReadonlyBanner] = useState(false)
  const configLoadedRef = useRef(false)
  const lastFetchAtRef = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getApi()
      .getAirports()
      .then((raw) => {
        const list = normalizeAirports(raw as Airport[] | { airports: Airport[] })
        setAirports(list)
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
      setQueryOrigin(origin)
      setQueryAdults(adults)
    }, 280)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [origin, adults])

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
          adults: queryAdults,
        })
        void refreshLikes()
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
    [refreshLikes, queryOrigin, queryAdults, deals.length, uiEnabled],
  )

  // Filter changes → always refetch
  useEffect(() => {
    void load({ force: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- query* only
  }, [queryOrigin, queryAdults])

  // Tab focus → refetch only if stale (skip first mount: filter effect owns it)
  useFocusEffect(
    useCallback(() => {
      if (lastFetchAtRef.current === 0) return
      void load()
    }, [load]),
  )

  const filterSummary = [
    adults !== 2 ? `${adults} ad.` : null,
    sort === 'price_asc' ? 'Prix ↑' : sort === 'price_desc' ? 'Prix ↓' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const matchedDeals = useMemo(
    () =>
      queryOrigin ? deals.filter((d) => d.flags?.match_origin !== false) : deals,
    [deals, queryOrigin],
  )
  const fillerDeals = useMemo(
    () =>
      queryOrigin ? deals.filter((d) => d.flags?.match_origin === false) : [],
    [deals, queryOrigin],
  )
  const gridDeals = useMemo(() => {
    if (sort === 'recommended') return matchedDeals
    const dir = sort === 'price_asc' ? 1 : -1
    return [...matchedDeals].sort(
      (a, b) => dir * ((a.price_per_person || 0) - (b.price_per_person || 0)),
    )
  }, [sort, matchedDeals])

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
              <Text style={styles.title}>Deals</Text>
              <Text style={styles.subtitle}>
                Bonnes affaires vol + hôtel depuis ton aéroport
              </Text>
              {!uiEnabled ? (
                <Text style={styles.subtitle}>Onglet deals désactivé (calibration).</Text>
              ) : null}
              {readonlyBanner && uiEnabled ? (
                <Text style={[styles.subtitle, { color: colors.primary }]}>
                  Lecture seule — réservation hôtel fermée.
                </Text>
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
                      {origin
                        ? `${origin.split(',')[0]}${adults !== 2 ? ` · ${adults} ad.` : ''}`
                        : filterSummary || 'Toutes origines · 2 voyageurs'}
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
                    <View style={styles.originRow}>
                      <Text style={styles.label}>Départ</Text>
                      {origin ? (
                        <Pressable onPress={() => setOrigin('')} hitSlop={8}>
                          <Text style={styles.clearOrigin}>Toutes les origines</Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <CityAirportPicker
                      airports={airports}
                      value={origin}
                      onChange={setOrigin}
                    />
                    {!origin ? (
                      <Text style={styles.originHint}>
                        Laisse vide pour toutes les origines, ou choisis une ville.
                      </Text>
                    ) : null}

                    <View style={styles.divider} />

                    <PassengerStepper value={adults} onChange={setAdults} />

                    <View style={styles.divider} />
                    <Text style={styles.label}>Dates (recherche live)</Text>
                    <Text style={styles.originHint}>
                      Aller + retour → vraie recherche vols (pas le mur Deals).
                    </Text>
                    <Pressable
                      onPress={() => setDateModalOpen(true)}
                      style={styles.datesBtn}
                    >
                      <Text style={styles.datesBtnText}>
                        {flexDates.dates_depart[0]?.date &&
                        flexDates.dates_retour[0]?.date
                          ? `${flexDates.dates_depart[0].date} → ${flexDates.dates_retour[0].date}`
                          : 'Choisir aller / retour'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        const out = flexDates.dates_depart[0]?.date
                        const ret = flexDates.dates_retour[0]?.date
                        if (!origin.trim()) {
                          Alert.alert('Origine', 'Choisis une ville / aéroport de départ')
                          return
                        }
                        if (!out || !ret || ret <= out) {
                          Alert.alert(
                            'Dates',
                            'Indique une date aller et une date retour (retour après l’aller)',
                          )
                          setDateModalOpen(true)
                          return
                        }
                        ;(navigation as { navigate: (a: string, b?: object) => void }).navigate(
                          'Search',
                          {
                            origin: origin.trim().toUpperCase(),
                            adults,
                            outbound: out,
                            inbound: ret,
                            autoSearch: true,
                          } satisfies NonNullable<MainTabParamList['Search']>,
                        )
                      }}
                      style={[
                        styles.searchBtn,
                        !(
                          origin.trim() &&
                          flexDates.dates_depart[0]?.date &&
                          flexDates.dates_retour[0]?.date
                        ) && styles.searchBtnDisabled,
                      ]}
                    >
                      <Text style={styles.searchBtnText}>Lancer la recherche</Text>
                    </Pressable>

                    <View style={styles.divider} />
                    <Text style={styles.label}>Trier</Text>
                    <View style={styles.sortRow}>
                      {(
                        [
                          ['recommended', 'Recommandés'],
                          ['price_asc', 'Prix ↑'],
                          ['price_desc', 'Prix ↓'],
                        ] as const
                      ).map(([id, label]) => (
                        <Pressable
                          key={id}
                          onPress={() => setSort(id)}
                          style={[
                            styles.sortChip,
                            sort === id && styles.sortChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.sortChipText,
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

              {!loading && !error && deals.length > 0 ? (
                <View style={styles.countRow}>
                  <Text style={styles.count}>
                    {deals.length} offre{deals.length > 1 ? 's' : ''}
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
                  <Text style={styles.emptyTitle}>Aucun deal pour l’instant</Text>
                  <Text style={styles.emptyBody}>
                    {origin
                      ? `Pas encore de bonne affaire depuis cet aéroport. Essaie une autre ville ou lance une recherche.`
                      : 'Pas encore de bonne affaire. Choisis un aéroport ou lance une recherche.'}
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

      <FlexibleDatesModal
        visible={dateModalOpen}
        value={flexDates}
        onChange={setFlexDates}
        onClose={() => setDateModalOpen(false)}
      />
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
    marginBottom: 14,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
    includeFontPadding: false,
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
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
    includeFontPadding: false,
  },
  clearOrigin: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.primary,
  },
  originHint: {
    marginTop: 8,
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 16,
  },
  datesBtn: {
    marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  datesBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
  },
  searchBtn: {
    marginTop: 12,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  searchBtnDisabled: {
    backgroundColor: colors.line,
  },
  searchBtnText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.white,
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
