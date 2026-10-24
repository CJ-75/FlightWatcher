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
import type { Airport, DealWindowKind, TravelDeal } from '@flightwatcher/shared'
import {
  encodeAirportCodes,
  findCityGroupByCodes,
  groupAirportsByCity,
  normalizeAirports,
} from '@flightwatcher/shared'
import { apiBase, getApi } from '../lib/client'
import { DealCard } from '../components/DealCard'
import { CityAirportPicker } from '../components/CityAirportPicker'
import { BudgetSlider } from '../components/BudgetSlider'
import { PassengerStepper } from '../components/PassengerStepper'
import { useLikedDeals } from '../hooks/useLikedDeals'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../../App'
import { colors, fonts, radius, shadow, spacing } from '../theme'

const BUDGET_MIN = 120
const BUDGET_MAX = 450

export function DealsScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { isLiked, toggleLike, refresh: refreshLikes } = useLikedDeals()
  const [deals, setDeals] = useState<TravelDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  const [adults, setAdults] = useState(2)
  const [budgetUnlimited, setBudgetUnlimited] = useState(true)
  const [maxPp, setMaxPp] = useState(300)
  const [windowKind, setWindowKind] = useState<'' | DealWindowKind>('')
  const [windowKinds, setWindowKinds] = useState<DealWindowKind[]>(['FRI_SUN'])
  const [airports, setAirports] = useState<Airport[]>([])
  const [uiEnabled, setUiEnabled] = useState(true)
  const [readonlyBanner, setReadonlyBanner] = useState(false)
  const expandedDefaultRef = useRef(false)

  useEffect(() => {
    getApi()
      .getAirports()
      .then((raw) => {
        const list = normalizeAirports(raw as Airport[] | { airports: Airport[] })
        setAirports(list)
        if (!expandedDefaultRef.current && list.length) {
          expandedDefaultRef.current = true
          const groups = groupAirportsByCity(list)
          const paris = findCityGroupByCodes(groups, ['BVA', 'CDG', 'ORY'])
          if (paris && paris.airports.length > 1) {
            const encoded = encodeAirportCodes(paris.airports.map((a) => a.code))
            if (encoded) setOrigin(encoded)
          }
        }
      })
      .catch(() => undefined)
  }, [])

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)
      setError(null)
      try {
        try {
          const cfgRes = await fetch(`${apiBase}/api/config`)
          if (cfgRes.ok) {
            const cfg = await cfgRes.json()
            setUiEnabled(cfg?.ui_enabled !== false)
            setReadonlyBanner(
              Boolean(cfg?.prod_readonly) || cfg?.booking_enabled === false,
            )
            const kinds = Array.isArray(cfg?.window_kinds)
              ? (cfg.window_kinds as DealWindowKind[])
              : (['FRI_SUN'] as DealWindowKind[])
            setWindowKinds(kinds.length ? kinds : ['FRI_SUN'])
            if (cfg?.ui_enabled === false) {
              setDeals([])
              return
            }
          }
        } catch {
          /* ignore */
        }
        const list = await getApi().getDeals({
          origin: origin || undefined,
          adults,
          window: windowKind || undefined,
          max_pp: budgetUnlimited ? undefined : maxPp,
        })
        setDeals(Array.isArray(list) ? list : [])
        await refreshLikes()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Impossible de charger les deals')
        setDeals([])
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [refreshLikes, origin, adults, windowKind, maxPp, budgetUnlimited],
  )

  useFocusEffect(
    useCallback(() => {
      void load()
    }, [load]),
  )

  const windowChips: { key: '' | DealWindowKind; label: string; hint: string }[] = [
    { key: '', label: 'Tous', hint: 'Toutes dates' },
    ...(windowKinds.includes('FRI_SUN')
      ? [{ key: 'FRI_SUN' as const, label: 'Ven → Dim', hint: 'Week-end' }]
      : []),
    ...(windowKinds.includes('SAT_MON')
      ? [{ key: 'SAT_MON' as const, label: 'Sam → Lun', hint: 'Pont' }]
      : []),
  ]

  const filterSummary = [
    !budgetUnlimited ? `≤ ${maxPp}€` : null,
    windowKind === 'FRI_SUN' ? 'ven→dim' : windowKind === 'SAT_MON' ? 'sam→lun' : null,
    adults !== 2 ? `${adults} ad.` : null,
  ]
    .filter(Boolean)
    .join(' · ')

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
          data={deals}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 100,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
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
                <BudgetSlider
                  value={maxPp}
                  min={BUDGET_MIN}
                  max={BUDGET_MAX}
                  step={10}
                  hint="Budget max / personne"
                  subHint="vol + hôtel"
                  displayValue={budgetUnlimited ? 'Sans limite' : undefined}
                  onChange={(v) => {
                    setBudgetUnlimited(false)
                    setMaxPp(v)
                  }}
                />

                <Pressable
                  onPress={() => setBudgetUnlimited(true)}
                  style={[styles.limitChip, budgetUnlimited && styles.limitChipActive]}
                >
                  <Text
                    style={[
                      styles.limitChipText,
                      budgetUnlimited && styles.limitChipTextActive,
                    ]}
                  >
                    Sans limite
                  </Text>
                </Pressable>

                <View style={styles.divider} />

                <PassengerStepper value={adults} onChange={setAdults} />

                <View style={styles.divider} />

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

                <Text style={styles.label}>Quand</Text>
                <View style={styles.presetRow}>
                  {windowChips.map((p) => {
                    const active = windowKind === p.key
                    return (
                      <Pressable
                        key={p.key || 'all'}
                        onPress={() => setWindowKind(p.key)}
                        style={[styles.presetCard, active && styles.presetCardActive]}
                      >
                        <Text
                          style={[styles.presetLabel, active && styles.presetLabelActive]}
                          numberOfLines={1}
                        >
                          {p.label}
                        </Text>
                        <Text
                          style={[styles.presetHint, active && styles.presetHintActive]}
                          numberOfLines={1}
                        >
                          {p.hint}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
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
                  <Pressable onPress={() => void load()} style={styles.retryBtn}>
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
          renderItem={({ item }) => (
            <DealCard
              deal={item}
              liked={isLiked(item.id)}
              onToggleLike={() => void toggleLike(item)}
              onPress={() => navigation.navigate('DealDetail', { dealId: item.id })}
            />
          )}
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
  limitChip: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  limitChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  limitChipText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.inkSoft,
  },
  limitChipTextActive: {
    color: colors.white,
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
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  presetCard: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 96,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: colors.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  presetCardActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  presetLabel: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.ink,
    includeFontPadding: false,
  },
  presetLabelActive: {
    color: colors.white,
  },
  presetHint: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.muted,
  },
  presetHintActive: {
    color: 'rgba(255,255,255,0.85)',
  },
  count: {
    marginTop: 4,
    fontFamily: fonts.semibold,
    fontSize: 13,
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
