import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Modal,
  AppState,
  type AppStateStatus,
  Platform,
  RefreshControl,
  ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import {
  ACTIVITY_ADDED_TO_PLANNER_FR,
  ACTIVITY_ADD_TO_PLANNER_FR,
  ACTIVITY_BOOKED_PROMPT_FR,
  ACTIVITY_CATEGORY_TAGS_FR,
  ACTIVITY_CHOOSE_TRIP_FR,
  ACTIVITY_CITY_OPTIONS_FR,
  ACTIVITY_PAGE_SUBTITLE_FR,
  ACTIVITY_PAGE_TITLE_FR,
  ACTIVITY_KEEP_ADDING_FR,
  ACTIVITY_NO_PLANNER_TO_ADD_FR,
  ACTIVITY_SEE_PLANNER_FR,
  ACTIVITY_SORT_LABEL_FR,
  canonicalViatorProductUrl,
  resolveActivityCitySlug,
  activityDestinationLabelFr,
  activityMatchesCategories,
  hasTripItemOwner,
  pickTripItemOwner,
  toActivityCardModel,
  toggleActivityCategory,
  type ActivityCardModel,
} from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { openInAppBrowser } from '../lib/openInApp'
import { listRememberedTrips, rememberTrip } from '../lib/tripRecovery'
import { ActivityCard } from '../components/ActivityCard'
import { ActivityCityPicker } from '../components/ActivityCityPicker'
import { ActivityDetailSheet } from '../components/ActivityDetailSheet'
import {
  ActivityPlannerPicker,
  type ActivityPlannerTarget,
} from '../components/ActivityPlannerPicker'
import { ActivityTripHero } from '../components/ActivityTripHero'
import { ScreenBackground } from '../components/ScreenBackground'
import { useLikedActivities } from '../hooks/useLikedActivities'
import type { MainTabParamList, RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, shadow, spacing } from '../theme'

function eventPlatform(): 'ios' | 'android' {
  return Platform.OS === 'ios' ? 'ios' : 'android'
}

export function ActivitiesScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute<RouteProp<MainTabParamList, 'Activities'>>()
  const [citySlug, setCitySlug] = useState(
    () => route.params?.city?.trim().toLowerCase() || '',
  )
  const [tripReady, setTripReady] = useState(false)

  useEffect(() => {
    const fromRoute = route.params?.city?.trim().toLowerCase()
    if (fromRoute && fromRoute !== citySlug) setCitySlug(fromRoute)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.city])
  const [adults] = useState(2)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [header, setHeader] = useState<string | null>(null)
  const [fallbackHint, setFallbackHint] = useState<string | null>(null)
  const [sort, setSort] = useState<'recommended' | 'price' | 'rating'>('recommended')
  const [categories, setCategories] = useState<string[]>([])
  const [detail, setDetail] = useState<ActivityCardModel | null>(null)
  const [pendingBook, setPendingBook] = useState<ActivityCardModel | null>(null)
  const [askBooked, setAskBooked] = useState(false)
  const pendingRef = useRef<ActivityCardModel | null>(null)
  const draftFromRoute = route.params?.draftToken?.trim() || ''
  const plannedFromRoute = route.params?.plannedTripId?.trim() || ''
  const [activeTrip, setActiveTrip] = useState<{
    draftToken?: string
    plannedTripId?: string
    slug: string
    label: string
  } | null>(null)
  const [plannerCount, setPlannerCount] = useState(0)
  const [addedCodes, setAddedCodes] = useState<Set<string>>(new Set())
  const [addBusy, setAddBusy] = useState(false)
  const [addNotice, setAddNotice] = useState<string | null>(null)
  const [pendingAdd, setPendingAdd] = useState<ActivityCardModel | null>(null)
  const [tripPickerOpen, setTripPickerOpen] = useState(false)
  const didAutoCity = useRef(false)
  const { isLiked, toggleLike, refresh: refreshLikes } = useLikedActivities()

  useEffect(() => {
    void refreshLikes()
  }, [refreshLikes])

  useEffect(() => {
    let cancelled = false
    didAutoCity.current = false
    setTripReady(false)
    void (async () => {
      try {
        const remembered = await listRememberedTrips()
        const fromRoute = draftFromRoute
          ? remembered.find((t) => t.draft_token === draftFromRoute) || {
              draft_token: draftFromRoute,
              city: citySlug || null,
              at: Date.now(),
            }
          : null
        const latest = fromRoute || remembered[0]

        const syncCityFilter = (slug: string) => {
          if (
            slug &&
            (draftFromRoute || plannedFromRoute || latest?.draft_token) &&
            slug !== citySlug
          ) {
            if (!didAutoCity.current) {
              didAutoCity.current = true
              setCitySlug(slug)
            }
          } else {
            didAutoCity.current = true
          }
        }

        let linkedPlanned = plannedFromRoute || undefined
        if (plannedFromRoute && !draftFromRoute) {
          const slug = resolveActivityCitySlug({
            citySlug: citySlug || null,
            cityLabel: citySlug || null,
          })
          if (cancelled) return
          setActiveTrip({
            plannedTripId: plannedFromRoute,
            slug,
            label: activityDestinationLabelFr(slug),
          })
          syncCityFilter(slug)
        } else if (latest?.draft_token) {
          let cityLabel = String(latest.city || '').trim() || null
          let citySlugHint: string | null = null
          let destIata: string | null = null
          const ownerHint = pickTripItemOwner({
            draftToken: latest.draft_token,
            plannedTripId: plannedFromRoute || undefined,
          })
          const [row, itemsRes] = await Promise.all([
            getApi().getMyTrip(latest.draft_token).catch(() => null),
            hasTripItemOwner(ownerHint)
              ? getApi().listTripItems(ownerHint).catch(() => null)
              : Promise.resolve(null),
          ])
          if (cancelled) return
          if (row) {
            const pl = (row.payload || {}) as Record<string, unknown>
            const fl = (pl.flight || {}) as Record<string, unknown>
            cityLabel =
              String(row.city_name || pl.city || cityLabel || '').trim() || null
            citySlugHint = typeof pl.city_slug === 'string' ? pl.city_slug : null
            destIata =
              String(
                fl.destination_iata ||
                  pl.destination ||
                  pl.dest_iata ||
                  row.dest_iata ||
                  '',
              ).trim() || null
            linkedPlanned =
              linkedPlanned ||
              (row.source_planned_trip_id
                ? String(row.source_planned_trip_id)
                : undefined)
          }
          const slug = resolveActivityCitySlug({
            citySlug: citySlugHint || cityLabel,
            cityLabel,
            destIata,
          })
          const known = ACTIVITY_CITY_OPTIONS_FR.find((c) => c.slug === slug)
          const label = String(
            known?.label || cityLabel || activityDestinationLabelFr(slug),
          )
          if (cancelled) return
          setActiveTrip({
            draftToken: latest.draft_token,
            plannedTripId: linkedPlanned,
            slug,
            label,
          })
          if (draftFromRoute) {
            await rememberTrip({
              draft_token: latest.draft_token,
              city: slug,
            })
          }
          syncCityFilter(slug)

          let res = itemsRes
          const ownerFinal = pickTripItemOwner({
            draftToken: latest.draft_token,
            plannedTripId: linkedPlanned,
          })
          if (
            linkedPlanned &&
            ownerHint.planned_trip_id !== ownerFinal.planned_trip_id
          ) {
            res = await getApi().listTripItems(ownerFinal).catch(() => null)
          }
          if (cancelled) return
          const codes = new Set<string>()
          const n = (res?.items || []).filter((raw) => {
            const it = raw as {
              item_type?: string
              status?: string
              meta?: { product_code?: string }
            }
            if (it.item_type && it.item_type !== 'activity') return false
            if (it.status === 'skipped') return false
            const code = it.meta?.product_code ? String(it.meta.product_code) : ''
            if (code) codes.add(code)
            return true
          }).length
          setPlannerCount(n)
          setAddedCodes(codes)
        } else {
          if (!cancelled) {
            setActiveTrip(null)
            setPlannerCount(0)
            if (!citySlug) setCitySlug('paris')
            didAutoCity.current = true
          }
        }
      } finally {
        if (!cancelled) setTripReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftFromRoute, plannedFromRoute])

  const cards = useMemo(() => {
    const matched = items.filter((r) => activityMatchesCategories(r, categories))
    let list = matched.map((r) => toActivityCardModel(r, adults))
    if (sort === 'price') {
      list = [...list].sort((a, b) => {
        const pa = a.priceLabel ? parseInt(a.priceLabel.replace(/\D/g, ''), 10) : 9999
        const pb = b.priceLabel ? parseInt(b.priceLabel.replace(/\D/g, ''), 10) : 9999
        return pa - pb
      })
    } else if (sort === 'rating') {
      list = [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0))
    }
    return list
  }, [items, adults, sort, categories])

  const loadCity = useCallback(
    async (slug: string, opts?: { silent?: boolean }) => {
      if (!slug) return
      if (!opts?.silent) setLoading(true)
      setError(null)
      setHeader(null)
      setFallbackHint(null)
      try {
        const res = await getApi().listCityActivities(slug, adults)
        if (!res.ok) {
          const msg =
            res.error === 'unknown_city'
              ? 'Ville non reconnue'
              : String(res.error || '').includes('401') ||
                  String(res.error || '').includes('UNAUTHORIZED')
                ? 'Catalogue activités indisponible'
                : res.error || 'Chargement impossible'
          throw new Error(msg)
        }
        setItems(Array.isArray(res.items) ? res.items : [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur')
        setItems([])
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [adults],
  )

  useEffect(() => {
    if (!tripReady) return
    if (!citySlug) {
      setCitySlug('paris')
      return
    }
    void loadCity(citySlug)
  }, [tripReady, citySlug, loadCity])

  useEffect(() => {
    pendingRef.current = pendingBook
  }, [pendingBook])

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active' && pendingRef.current) setAskBooked(true)
    }
    const sub = AppState.addEventListener('change', onChange)
    return () => sub.remove()
  }, [])

  const track = (event: string, card?: ActivityCardModel | null) => {
    void getApi()
      .trackActivityEvent({
        domain: 'activity',
        event,
        surface: 'tab',
        platform: eventPlatform(),
        meta: card ? { product_code: card.productCode } : undefined,
      })
      .catch(() => undefined)
  }

  const onBook = (card: ActivityCardModel) => {
    const url = canonicalViatorProductUrl(card.productUrl, {
      productCode: card.productCode,
    })
    if (!url) return
    setPendingBook(card)
    track('book_click', card)
    openInAppBrowser(navigation, url, card.title)
  }

  const bindActiveTrip = async (target: ActivityPlannerTarget) => {
    const tripSlug = resolveActivityCitySlug({
      citySlug: target.city || null,
      cityLabel: target.city || target.label,
      destIata: target.destIata || null,
    })
    const known = ACTIVITY_CITY_OPTIONS_FR.find((c) => c.slug === tripSlug)
    const label =
      target.label ||
      String(known?.label || target.city || activityDestinationLabelFr(tripSlug))
    setActiveTrip({
      draftToken: target.draftToken,
      plannedTripId: target.plannedTripId,
      slug: tripSlug || citySlug || 'voyage',
      label,
    })
    if (target.draftToken) {
      await rememberTrip({
        draft_token: target.draftToken,
        city: tripSlug || citySlug || null,
      })
    }
    if (tripSlug && tripSlug !== citySlug) {
      setCitySlug(tripSlug)
    }
    try {
      const res = await getApi().listTripItems(
        pickTripItemOwner({
          draftToken: target.draftToken,
          plannedTripId: target.plannedTripId,
        }),
      )
      const codes = new Set<string>()
      let count = 0
      for (const raw of res.items || []) {
        const it = raw as {
          item_type?: string
          status?: string
          meta?: { product_code?: string }
        }
        if (it.item_type && it.item_type !== 'activity') continue
        if (it.status === 'skipped') continue
        count += 1
        const code = it.meta?.product_code ? String(it.meta.product_code) : ''
        if (code) codes.add(code)
      }
      setPlannerCount(count)
      setAddedCodes(codes)
    } catch {
      setPlannerCount(0)
      setAddedCodes(new Set())
    }
  }

  const onAddToPlanner = (card: ActivityCardModel) => {
    setAddNotice(null)
    setTripPickerOpen(false)
    setPendingAdd(card)
  }

  const confirmAddToTarget = async (target: ActivityPlannerTarget) => {
    const card = pendingAdd
    if (!card) return
    const owner = pickTripItemOwner({
      draftToken: target.draftToken,
      plannedTripId: target.plannedTripId,
    })
    if (!hasTripItemOwner(owner)) {
      setAddNotice(ACTIVITY_NO_PLANNER_TO_ADD_FR)
      return
    }
    setAddBusy(true)
    try {
      await getApi().addTripItem({
        product_code: card.productCode,
        title: card.title,
        product_url: card.productUrl,
        ...owner,
        platform: eventPlatform(),
        surface: 'tab',
      })
      track('add', card)
      setPlannerCount((n) => n + 1)
      if (card.productCode) {
        setAddedCodes((prev) => new Set(prev).add(card.productCode))
      }
      await bindActiveTrip(target)
      setAddNotice(
        `${ACTIVITY_ADDED_TO_PLANNER_FR(target.label)} — ${ACTIVITY_KEEP_ADDING_FR}`,
      )
      setPendingAdd(null)
      setDetail(null)
    } catch (e) {
      setAddNotice(e instanceof Error ? e.message : 'Ajout impossible')
    } finally {
      setAddBusy(false)
    }
  }

  const openPlanner = () => {
    if (activeTrip?.draftToken) {
      navigation.navigate('TripSummary', { draftToken: activeTrip.draftToken })
      return
    }
    navigation.navigate('Main', { screen: 'Planner' })
  }

  const onRefresh = () => {
    setRefreshing(true)
    if (citySlug) void loadCity(citySlug, { silent: true })
    else setRefreshing(false)
  }

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <FlatList
        data={cards}
        keyExtractor={(c) => c.productCode || c.title}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: spacing.xl,
          paddingBottom: insets.bottom + 120,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>{ACTIVITY_PAGE_TITLE_FR}</Text>
            <Text style={styles.subtitle}>{ACTIVITY_PAGE_SUBTITLE_FR}</Text>

            {activeTrip ? (
              <ActivityTripHero
                mode="active"
                cityLabel={activeTrip.label}
                plannerCount={plannerCount}
                showSyncCity={activeTrip.slug !== citySlug}
                onOpenPlanner={openPlanner}
                onSyncCity={() => setCitySlug(activeTrip.slug)}
                onChangeTrip={() => {
                  setPendingAdd(null)
                  setTripPickerOpen(true)
                }}
              />
            ) : (
              <ActivityTripHero
                mode="empty"
                onBrowseTrips={() => navigation.navigate('Deals')}
                onChooseTrip={() => {
                  setPendingAdd(null)
                  setTripPickerOpen(true)
                }}
              />
            )}

            {addNotice ? (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>{addNotice}</Text>
                {activeTrip && addNotice.startsWith('Ajouté') ? (
                  <Pressable onPress={openPlanner}>
                    <Text style={styles.noticeLink}>{ACTIVITY_SEE_PLANNER_FR}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <Text style={styles.label}>Ville</Text>
            <View style={{ marginBottom: spacing.md }}>
              <ActivityCityPicker
                valueSlug={citySlug}
                valueLabel={activityDestinationLabelFr(citySlug)}
                onChange={(city) => setCitySlug(city.slug)}
              />
            </View>

            <View style={styles.catBlock}>
              <View style={styles.catHeader}>
                <View>
                  <Text style={styles.catKicker}>AFFINER</Text>
                  <Text style={styles.catTitle}>Catégories</Text>
                </View>
                {categories.length ? (
                  <Pressable onPress={() => setCategories([])} hitSlop={8}>
                    <Text style={styles.catClear}>Toutes</Text>
                  </Pressable>
                ) : null}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.catRail}
              >
                {ACTIVITY_CATEGORY_TAGS_FR.map((t) => {
                  const on = categories.includes(t.id)
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() =>
                        setCategories((prev) =>
                          toggleActivityCategory(prev, t.id),
                        )
                      }
                      style={[styles.catCard, on && styles.catCardOn]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      <View
                        style={[styles.catIcon, on && styles.catIconOn]}
                      >
                        <Text style={styles.catEmoji}>{t.emoji}</Text>
                      </View>
                      <Text
                        style={[styles.catLabel, on && styles.catLabelOn]}
                        numberOfLines={2}
                      >
                        {t.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </ScrollView>
            </View>

            {header ? <Text style={styles.count}>{header}</Text> : null}
            {fallbackHint ? (
              <View style={styles.hintBox}>
                <Text style={styles.hintText}>{fallbackHint}</Text>
              </View>
            ) : null}

            {!loading && !error && cards.length > 0 ? (
              <View style={styles.countRow}>
                <Text style={styles.count}>
                  {cards.length} activité{cards.length > 1 ? 's' : ''}
                </Text>
                <View style={styles.sortRowCompact}>
                  {(
                    Object.keys(ACTIVITY_SORT_LABEL_FR) as Array<
                      keyof typeof ACTIVITY_SORT_LABEL_FR
                    >
                  ).map((k) => (
                    <Pressable
                      key={k}
                      onPress={() => setSort(k)}
                      style={[styles.sortChipSm, sort === k && styles.sortChipActive]}
                    >
                      <Text
                        style={[
                          styles.sortChipTextSm,
                          sort === k && styles.sortChipTextActive,
                        ]}
                      >
                        {ACTIVITY_SORT_LABEL_FR[k]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {loading && !refreshing ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
            ) : null}
          </View>
        }
        renderItem={({ item: c }) => (
            <ActivityCard
              card={c}
              onPress={() => setDetail(c)}
              onBook={() => onBook(c)}
              onAdd={() => onAddToPlanner(c)}
              addLabel={ACTIVITY_ADD_TO_PLANNER_FR}
              addDisabled={addBusy}
              liked={isLiked(c.productCode)}
              onToggleLike={() => void toggleLike(c)}
              added={Boolean(c.productCode && addedCodes.has(c.productCode))}
            />
        )}
        ListEmptyComponent={
          loading ? null : (
            <View style={[styles.emptyCard, shadow.soft]}>
              {error ? (
                <>
                  <Text style={styles.emptyTitle}>Oups</Text>
                  <Text style={styles.emptyBody}>{error}</Text>
                  <Pressable
                    onPress={() => void loadCity(citySlug || 'paris')}
                    style={styles.retryBtn}
                  >
                    <Text style={styles.retryText}>Réessayer</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.emptyTitle}>Aucune activité</Text>
                  <Text style={styles.emptyBody}>
                    Choisis une ville d’arrivée dans Affiner.
                  </Text>
                </>
              )}
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
      />

      <ActivityDetailSheet
        visible={!!detail}
        card={detail}
        adults={adults}
        addBusy={addBusy}
        alreadyAdded={false}
        addLabel={ACTIVITY_ADD_TO_PLANNER_FR}
        onBook={(c) => onBook(c)}
        onAdd={(c) => onAddToPlanner(c)}
        onClose={() => setDetail(null)}
      />

      <ActivityPlannerPicker
        visible={Boolean(pendingAdd) || tripPickerOpen}
        busy={addBusy}
        preferredPlannedTripId={activeTrip?.plannedTripId}
        preferredDraftToken={activeTrip?.draftToken}
        title={pendingAdd ? undefined : ACTIVITY_CHOOSE_TRIP_FR}
        hint={
          pendingAdd
            ? undefined
            : 'Le séjour choisi devient le voyage en cours pour le catalogue.'
        }
        onClose={() => {
          if (addBusy) return
          setPendingAdd(null)
          setTripPickerOpen(false)
        }}
        onPick={(target) => {
          if (pendingAdd) {
            void confirmAddToTarget(target)
            return
          }
          void (async () => {
            await bindActiveTrip(target)
            setTripPickerOpen(false)
          })()
        }}
        onOpenPlanner={() => {
          setPendingAdd(null)
          setTripPickerOpen(false)
          navigation.navigate('Main', { screen: 'Planner' })
        }}
        onSignIn={() => {
          setPendingAdd(null)
          setTripPickerOpen(false)
          navigation.navigate('Main', { screen: 'Profile' })
        }}
      />

      <Modal visible={askBooked && !!pendingBook} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, shadow.soft]}>
            <Text style={styles.modalTitle}>
              {ACTIVITY_BOOKED_PROMPT_FR(pendingBook?.title || 'cette activité')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                style={[styles.modalCta, { flex: 1, backgroundColor: colors.success }]}
                onPress={() => {
                  track('booked_yes', pendingBook)
                  setPendingBook(null)
                  setAskBooked(false)
                }}
              >
                <Text style={styles.modalCtaText}>Oui</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSecondary, { flex: 1 }]}
                onPress={() => {
                  track('booked_no', pendingBook)
                  setPendingBook(null)
                  setAskBooked(false)
                }}
              >
                <Text style={styles.modalSecondaryText}>Pas encore</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: { marginBottom: spacing.lg },
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
  noticeBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
    padding: 12,
    marginBottom: spacing.md,
    gap: 6,
  },
  noticeText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primaryInk,
  },
  noticeLink: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  catBlock: {
    marginBottom: spacing.md,
  },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  catKicker: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.primary,
    marginBottom: 2,
  },
  catTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 14,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  catClear: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.primary,
  },
  catRail: {
    gap: 8,
    paddingRight: 8,
  },
  catCard: {
    width: 124,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  catCardOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  catIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catIconOn: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  catEmoji: {
    fontSize: 15,
    lineHeight: 18,
  },
  catLabel: {
    fontFamily: fonts.extrabold,
    fontSize: 12,
    color: colors.ink,
    lineHeight: 15,
  },
  catLabelOn: {
    color: colors.white,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: spacing.sm,
    marginTop: 4,
  },
  count: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.inkSoft,
    flexShrink: 1,
  },
  sortRowCompact: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sortChipSm: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  sortChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryMuted,
  },
  sortChipTextSm: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.muted,
  },
  sortChipTextActive: { color: colors.primaryInk },
  hintBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
  },
  hintText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.primaryInk,
  },
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.ink,
  },
  emptyBody: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  retryText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  modalBg: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    gap: 10,
    paddingBottom: 36,
  },
  modalTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 20,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  modalMeta: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
  },
  modalCta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  modalCtaText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  modalSecondary: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalSecondaryText: {
    fontFamily: fonts.semibold,
    color: colors.ink,
    fontSize: 14,
  },
})
