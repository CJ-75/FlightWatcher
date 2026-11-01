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
  Image,
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
  ACTIVITY_CITY_OPTIONS_FR,
  ACTIVITY_SEE_PLANNER_FR,
  ACTIVITY_SORT_LABEL_FR,
  activityCitySlugFromLabel,
  activityDestinationLabelFr,
  activityMatchesCategories,
  toActivityCardModel,
  toggleActivityCategory,
  type ActivityCardModel,
} from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { openInAppBrowser } from '../lib/openInApp'
import { listRememberedTrips } from '../lib/tripRecovery'
import { ActivityCard } from '../components/ActivityCard'
import { ActivityCityPicker } from '../components/ActivityCityPicker'
import { ActivityTripHero } from '../components/ActivityTripHero'
import { ScreenBackground } from '../components/ScreenBackground'
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
    () => route.params?.city?.trim().toLowerCase() || 'paris',
  )

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
  const [activeTrip, setActiveTrip] = useState<{
    draftToken: string
    slug: string
    label: string
  } | null>(null)
  const [plannerCount, setPlannerCount] = useState(0)
  const [addBusy, setAddBusy] = useState(false)
  const [addNotice, setAddNotice] = useState<string | null>(null)
  const didAutoCity = useRef(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const remembered = await listRememberedTrips()
      const latest = remembered[0]
      if (!latest?.draft_token) {
        if (!cancelled) {
          setActiveTrip(null)
          setPlannerCount(0)
        }
        return
      }
      const raw = String(latest.city || '')
        .trim()
        .toLowerCase()
      const known = raw
        ? ACTIVITY_CITY_OPTIONS_FR.find(
            (c) => c.slug === raw || c.label.toLowerCase() === raw,
          )
        : null
      const slug =
        known?.slug || (raw ? activityCitySlugFromLabel(raw) : '') || 'paris'
      const label = String(known?.label || latest.city || slug)
      if (cancelled) return
      setActiveTrip({
        draftToken: latest.draft_token,
        slug,
        label,
      })
      if (
        !didAutoCity.current &&
        slug &&
        slug !== 'paris' &&
        citySlug === 'paris'
      ) {
        didAutoCity.current = true
        setCitySlug(slug)
      } else {
        didAutoCity.current = true
      }
      try {
        const res = await getApi().listTripItems({
          draft_token: latest.draft_token,
        })
        const n = (res.items || []).filter((raw) => {
          const it = raw as { item_type?: string; status?: string }
          if (it.item_type && it.item_type !== 'activity') return false
          return it.status !== 'skipped'
        }).length
        if (!cancelled) setPlannerCount(n)
      } catch {
        if (!cancelled) setPlannerCount(0)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
                ? 'Clé Viator invalide'
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
    if (citySlug) void loadCity(citySlug)
  }, [citySlug, loadCity])

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
    if (!card.productUrl) return
    setPendingBook(card)
    track('book_click', card)
    openInAppBrowser(navigation, card.productUrl, card.title)
  }

  const onAddToPlanner = async (card: ActivityCardModel) => {
    setAddNotice(null)
    if (!activeTrip?.draftToken) {
      setAddNotice(ACTIVITY_NO_TRIP_CTA_BODY_FR)
      return
    }
    setAddBusy(true)
    try {
      await getApi().addTripItem({
        product_code: card.productCode,
        title: card.title,
        product_url: card.productUrl,
        draft_token: activeTrip.draftToken,
        platform: eventPlatform(),
        surface: 'tab',
      })
      track('add', card)
      setPlannerCount((n) => n + 1)
      setAddNotice(ACTIVITY_ADDED_TO_PLANNER_FR(activeTrip.label))
      setDetail(null)
    } catch (e) {
      setAddNotice(e instanceof Error ? e.message : 'Ajout impossible')
    } finally {
      setAddBusy(false)
    }
  }

  const openPlanner = () => {
    if (!activeTrip?.draftToken) {
      navigation.navigate('Deals')
      return
    }
    navigation.navigate('TripSummary', { draftToken: activeTrip.draftToken })
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
          paddingBottom: 120,
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
            <Text style={styles.title}>Activités</Text>
            <Text style={styles.subtitle}>Que faire sur place</Text>

            {activeTrip ? (
              <ActivityTripHero
                mode="active"
                cityLabel={activeTrip.label}
                plannerCount={plannerCount}
                showSyncCity={activeTrip.slug !== citySlug}
                onOpenPlanner={openPlanner}
                onSyncCity={() => setCitySlug(activeTrip.slug)}
              />
            ) : (
              <ActivityTripHero
                mode="empty"
                onBrowseTrips={() => navigation.navigate('Deals')}
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

            <View style={[styles.chipWrap, { marginBottom: spacing.md }]}>
              {ACTIVITY_CATEGORY_TAGS_FR.map((t) => {
                const on = categories.includes(t.id)
                return (
                  <Pressable
                    key={t.id}
                    onPress={() =>
                      setCategories((prev) => toggleActivityCategory(prev, t.id))
                    }
                    style={[styles.tagChip, on && styles.tagChipActive]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                  >
                    <Text style={styles.tagEmoji}>{t.emoji}</Text>
                    <Text
                      style={[
                        styles.tagChipText,
                        on && styles.tagChipTextActive,
                      ]}
                    >
                      {t.label}
                    </Text>
                  </Pressable>
                )
              })}
              {categories.length ? (
                <Pressable onPress={() => setCategories([])} hitSlop={8}>
                  <Text style={styles.clearLink}>Effacer</Text>
                </Pressable>
              ) : null}
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
            onAdd={() => void onAddToPlanner(c)}
            addLabel={ACTIVITY_ADD_TO_PLANNER_FR}
            addDisabled={addBusy}
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

      <Modal visible={!!detail} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, shadow.soft]}>
            {detail?.photoUrl ? (
              <Image source={{ uri: detail.photoUrl }} style={styles.modalPhoto} />
            ) : null}
            <Text style={styles.modalTitle}>{detail?.title}</Text>
            <Text style={styles.modalMeta}>
              {detail?.priceLabel} · {detail?.durationLabel || 'Durée variable'}
            </Text>
            <Pressable
              style={styles.modalCta}
              onPress={() => detail && onBook(detail)}
            >
              <Text style={styles.modalCtaText}>Réserver sur Viator</Text>
            </Pressable>
            <Pressable
              style={styles.modalSecondary}
              disabled={addBusy}
              onPress={() => detail && void onAddToPlanner(detail)}
            >
              <Text style={styles.modalSecondaryText}>
                {activeTrip
                  ? `Ajouter au planner · ${activeTrip.label}`
                  : ACTIVITY_ADD_TO_PLANNER_FR}
              </Text>
            </Pressable>
            <Pressable style={styles.modalSecondary} onPress={() => setDetail(null)}>
              <Text style={styles.modalSecondaryText}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
  header: { marginBottom: spacing.md },
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
    lineHeight: 20,
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
  clearLink: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
  },
  tagChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tagEmoji: {
    fontSize: 16,
    lineHeight: 20,
  },
  tagChipText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.inkSoft,
  },
  tagChipTextActive: { color: colors.white },
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
  modalPhoto: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    marginBottom: 4,
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
