import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Airport, TravelDeal } from '@flightwatcher/shared'
import { normalizeAirports } from '@flightwatcher/shared'
import { apiBase, getApi } from '../lib/client'
import { DealCard } from '../components/DealCard'
import { CityAirportPicker } from '../components/CityAirportPicker'
import { PassengerStepper } from '../components/PassengerStepper'
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
        setDeals(Array.isArray(list) ? list : [])
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

  const filterSummary = [adults !== 2 ? `${adults} ad.` : null].filter(Boolean).join(' · ')
  const matchedDeals = queryOrigin
    ? deals.filter((d) => d.flags?.match_origin !== false)
    : deals
  const fillerDeals = queryOrigin
    ? deals.filter((d) => d.flags?.match_origin === false)
    : []
  const listData =
    fillerDeals.length > 0
      ? [
          ...matchedDeals.map((d) => ({ kind: 'deal' as const, deal: d })),
          { kind: 'filler_header' as const },
          ...fillerDeals.map((d) => ({ kind: 'deal' as const, deal: d })),
        ]
      : matchedDeals.map((d) => ({ kind: 'deal' as const, deal: d }))

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
              </View>

              {!loading && !error && deals.length > 0 ? (
                <Text style={styles.count}>
                  {deals.length} offre{deals.length > 1 ? 's' : ''}
                  {filterSummary ? ` · ${filterSummary}` : ''}
                </Text>
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
                  <Text style={styles.fillerTitle}>Aussi intéressants</Text>
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
    marginBottom: 14,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
    includeFontPadding: false,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    marginBottom: spacing.md,
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
  count: {
    marginTop: 4,
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.muted,
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
