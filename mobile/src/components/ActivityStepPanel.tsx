import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Platform,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import {
  ACTIVITY_ADD_LABEL_FR,
  ACTIVITY_ADD_TO_PLANNER_FR,
  ACTIVITY_BOOK_VIATOR_FR,
  ACTIVITY_BOOKED_PROMPT_FR,
  ACTIVITY_VALIDATE_LABEL_FR,
  activityDestinationLabelFr,
  canonicalViatorProductUrl,
  formatActivityPrice,
  isTripItemsAuthError,
  pickTripItemOwner,
  tripItemStatusLabelFr,
  tripItemsErrorLabelFr,
  type ActivityCardModel,
} from '@flightwatcher/shared'
import {
  StayBookingCard,
  stayBookingLinkBtn,
} from './StayBookingCard'
import { useAuth } from '../context/AuthContext'
import { auth, getApi } from '../lib/client'
import { openInAppBrowser } from '../lib/openInApp'
import { rememberTrip } from '../lib/tripRecovery'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, shadow, spacing } from '../theme'
import { ActivityDetailSheet } from './ActivityDetailSheet'

type ItemRow = {
  id: string
  item_type?: string
  status?: string
  sort_key?: string
  inherited?: boolean
  meta?: Record<string, unknown>
  places?: { name?: string; meta?: Record<string, unknown> | null } | null
}

/** trip-items merge can include hotel/resto rows — keep them out of Activités. */
function isActivityItem(it: ItemRow): boolean {
  return String(it.item_type || 'activity') === 'activity'
}

function placeOf(it: ItemRow): {
  name?: string
  meta?: Record<string, unknown> | null
} | null {
  const raw = it.places as
    | { name?: string; meta?: Record<string, unknown> | null }
    | Array<{ name?: string; meta?: Record<string, unknown> | null }>
    | null
    | undefined
  if (Array.isArray(raw)) return raw[0] || null
  return raw || null
}

function photoOf(it: ItemRow): string {
  const fromMeta = String(it.meta?.photo_url || '').trim()
  if (fromMeta) return fromMeta
  return String(placeOf(it)?.meta?.photo_url || '').trim()
}

function titleOf(it: ItemRow) {
  return String(placeOf(it)?.name || it.meta?.title || 'Activité')
}

function rawPriceOf(it: ItemRow): number | null {
  const meta = (it.meta || {}) as Record<string, unknown>
  const placeMeta = (placeOf(it)?.meta || {}) as Record<string, unknown>
  const raw =
    meta.price_from ?? meta.price ?? placeMeta.price_from ?? placeMeta.price
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function priceOf(it: ItemRow): string | null {
  const meta = (it.meta || {}) as Record<string, unknown>
  const placeMeta = (placeOf(it)?.meta || {}) as Record<string, unknown>
  const labeled = String(meta.price_label || placeMeta.price_label || '').trim()
  if (labeled) return labeled
  const currency = String(meta.currency || placeMeta.currency || 'EUR')
  return formatActivityPrice(rawPriceOf(it), currency, 1)
}

function priceFromCatalogRow(row: Record<string, unknown>): number | null {
  const pf = row.price_from ?? row.priceFrom ?? row.price
  if (pf == null || pf === '') return null
  const n = Number(pf)
  return Number.isFinite(n) ? n : null
}

function cardFromItem(it: ItemRow): ActivityCardModel | null {
  const productCode = String(it.meta?.product_code || '').trim()
  if (!productCode || productCode.startsWith('skip-')) return null
  const photo = photoOf(it) || null
  const productUrl =
    String(it.meta?.product_url || '').trim() ||
    canonicalViatorProductUrl(null, { productCode })
  return {
    productCode,
    title: titleOf(it),
    photoUrl: photo,
    rating: null,
    reviewCount: null,
    durationLabel: null,
    priceLabel: priceOf(it),
    productUrl,
    freeCancellation: false,
    instantConfirmation: false,
    destinationLabel: null,
    distanceLabel: null,
  }
}

function photoFromCatalogRow(row: Record<string, unknown>): string {
  const direct = String(row.photo_url || row.photoUrl || '').trim()
  if (direct) return direct
  const photos = row.photos
  if (Array.isArray(photos) && photos.length) {
    const first = photos[0]
    if (typeof first === 'string' && first.trim()) return first.trim()
    if (first && typeof first === 'object') {
      const obj = first as Record<string, unknown>
      return String(obj.url || obj.thumb || '').trim()
    }
  }
  return ''
}

function applyPhotoMap(
  rows: ItemRow[],
  byCode: Map<string, string>,
  priceByCode?: Map<string, number>,
): ItemRow[] {
  if (!byCode.size && !priceByCode?.size) return rows
  return rows.map((it) => {
    const code = String(it.meta?.product_code || '').trim()
    const meta = (it.meta || {}) as Record<string, unknown>
    const url = !photoOf(it) && code ? byCode.get(code) : undefined
    const hasPrice =
      rawPriceOf(it) != null ||
      Boolean(String(meta.price_label || '').trim())
    const price =
      !hasPrice && code && priceByCode?.has(code)
        ? priceByCode.get(code)
        : undefined
    if (!url && price == null) return it
    return {
      ...it,
      meta: {
        ...meta,
        ...(url ? { photo_url: url } : {}),
        ...(price != null ? { price_from: price } : {}),
      },
    }
  })
}

async function enrichActivityPhotos(
  rows: ItemRow[],
  citySlug: string,
): Promise<ItemRow[]> {
  const needsEnrich = rows.some(
    (it) =>
      Boolean(it.meta?.product_code) &&
      (!photoOf(it) || rawPriceOf(it) == null),
  )
  if (!needsEnrich) return rows
  const byCode = new Map<string, string>()
  const priceByCode = new Map<string, number>()
  try {
    const res = await getApi().listCityActivities(citySlug, 2)
    for (const raw of res.items || []) {
      const row = raw as Record<string, unknown>
      const code = String(row.product_code || row.productCode || '').trim()
      const url = photoFromCatalogRow(row)
      if (code && url) byCode.set(code, url)
      const pf = priceFromCatalogRow(row)
      if (code && pf != null) priceByCode.set(code, pf)
    }
  } catch {
    /* product detail fallback below */
  }
  let next = applyPhotoMap(rows, byCode, priceByCode)
  const stillMissing = next
    .filter(
      (it) =>
        Boolean(it.meta?.product_code) &&
        (!photoOf(it) || rawPriceOf(it) == null),
    )
    .map((it) => String(it.meta?.product_code || '').trim())
    .filter(Boolean)
    .slice(0, 8)
  if (!stillMissing.length) return next
  await Promise.allSettled(
    stillMissing.map(async (code) => {
      const res = await getApi().getActivityProduct(code)
      const product = (res.product || {}) as Record<string, unknown>
      const url = photoFromCatalogRow(product)
      if (url) byCode.set(code, url)
      const pf = priceFromCatalogRow(product)
      if (pf != null) priceByCode.set(code, pf)
    }),
  )
  return applyPhotoMap(next, byCode, priceByCode)
}

export function ActivityStepPanel(props: {
  draftToken?: string | null
  plannedTripId?: string | null
  citySlug?: string | null
  enabled?: boolean
  surface?: string
  onItemsChange?: (items: { status?: string | null }[]) => void
  layout?: 'default' | 'booking_cards'
}) {
  const {
    draftToken,
    plannedTripId,
    enabled = true,
    surface = 'my_trip',
    onItemsChange,
    layout = 'default',
  } = props
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const { signInWithGoogle, user, session, viewUser } = useAuth()
  const owner = useMemo(
    () =>
      pickTripItemOwner({
        draftToken: plannedTripId ? null : draftToken,
        plannedTripId,
      }),
    [draftToken, plannedTripId],
  )
  const [items, setItems] = useState<ItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingBook, setPendingBook] = useState<ItemRow | null>(null)
  const [askBooked, setAskBooked] = useState(false)
  const [detailCard, setDetailCard] = useState<ActivityCardModel | null>(null)
  const [detailItem, setDetailItem] = useState<ItemRow | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [resuming, setResuming] = useState(false)
  const pendingRef = useRef<ItemRow | null>(null)
  const authRetryRef = useRef(false)
  const parcoursReadyRef = useRef(false)
  const loadGenRef = useRef(0)
  const onItemsChangeRef = useRef(onItemsChange)
  onItemsChangeRef.current = onItemsChange
  const hasAccount = Boolean(user || session?.user || viewUser)

  const platform = Platform.OS === 'ios' ? 'ios' : 'android'
  const needsAuth = isTripItemsAuthError(error)
  const city = (props.citySlug || 'paris').trim().toLowerCase() || 'paris'

  const publishParcours = useCallback((rows: ItemRow[]) => {
    parcoursReadyRef.current = true
    onItemsChangeRef.current?.(
      rows.filter(isActivityItem).map((i) => ({
        status: i.status ?? null,
      })),
    )
  }, [])

  const load = useCallback(async () => {
    if (!owner.draft_token && !owner.planned_trip_id) return
    // Dev guest trips are in-memory only — never hit auth-required trip-items.
    if (
      owner.planned_trip_id &&
      String(owner.planned_trip_id).startsWith('dev-trip-')
    ) {
      setItems([])
      setError(null)
      publishParcours([])
      return
    }
    const gen = ++loadGenRef.current
    setLoading(true)
    setError(null)
    try {
      const res = await getApi().listTripItems(owner)
      const rows = ((res.items || []) as ItemRow[]).filter(isActivityItem)
      if (gen !== loadGenRef.current) return
      setItems(rows)
      publishParcours(rows)
      const enriched = await enrichActivityPhotos(rows, city)
      if (gen !== loadGenRef.current) return
      setItems(enriched)
      publishParcours(enriched)
      authRetryRef.current = false
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur'
      if (isTripItemsAuthError(msg) && !authRetryRef.current) {
        authRetryRef.current = true
        const token = await auth.refreshAccessToken()
        if (token) {
          try {
            const res = await getApi().listTripItems(owner)
            const rows = ((res.items || []) as ItemRow[]).filter(isActivityItem)
            if (gen !== loadGenRef.current) return
            setItems(rows)
            publishParcours(rows)
            const enriched = await enrichActivityPhotos(rows, city)
            if (gen !== loadGenRef.current) return
            setItems(enriched)
            publishParcours(enriched)
            setError(null)
            return
          } catch (e2) {
            setError(e2 instanceof Error ? e2.message : msg)
            return
          } finally {
            setLoading(false)
          }
        }
      }
      setError(msg)
      // Keep previous items so parcours stays green.
    } finally {
      setLoading(false)
    }
  }, [owner, city, publishParcours])

  const onResumeSession = async () => {
    setResuming(true)
    authRetryRef.current = false
    await auth.refreshAccessToken()
    await load()
    setResuming(false)
  }

  const onSignIn = async () => {
    setSigningIn(true)
    const { error: err } = await signInWithGoogle()
    if (err) setError(err.message)
    else {
      setError(null)
      authRetryRef.current = false
      await load()
    }
    setSigningIn(false)
  }

  useEffect(() => {
    parcoursReadyRef.current = false
    loadGenRef.current += 1
  }, [owner.draft_token, owner.planned_trip_id])

  useEffect(() => {
    if (enabled) void load()
  }, [enabled, load])

  useEffect(() => {
    if (!parcoursReadyRef.current) return
    publishParcours(items)
  }, [items, publishParcours])

  useEffect(() => {
    if (!enabled) return
    if (user || session?.user) {
      authRetryRef.current = false
      void load()
    }
  }, [enabled, user?.id, session?.access_token, load])

  useEffect(() => {
    pendingRef.current = pendingBook
  }, [pendingBook])

  useEffect(() => {
    const onChange = (s: AppStateStatus) => {
      if (s === 'active' && pendingRef.current) setAskBooked(true)
    }
    const sub = AppState.addEventListener('change', onChange)
    return () => sub.remove()
  }, [])

  const track = (event: string, meta?: Record<string, unknown>) => {
    void getApi()
      .trackActivityEvent({
        domain: 'activity',
        event,
        surface,
        platform,
        ...owner,
        meta,
      })
      .catch(() => undefined)
  }

  const patch = async (id: string, body: Record<string, unknown>) => {
    await getApi().patchTripItem(id, {
      ...body,
      draft_token: owner.draft_token,
    })
    await load()
  }

  const openDetail = (it: ItemRow) => {
    const card = cardFromItem(it)
    if (!card) return
    setDetailItem(it)
    setDetailCard(card)
    track('open_detail', { trip_item_id: it.id, product_code: card.productCode })
  }

  const bookItem = (it: ItemRow) => {
    const url = canonicalViatorProductUrl(
      it.meta?.product_url != null ? String(it.meta.product_url) : null,
      {
        productCode:
          it.meta?.product_code != null
            ? String(it.meta.product_code)
            : null,
      },
    )
    if (!url) return
    if (!it.inherited) setPendingBook(it)
    track('book_click', { trip_item_id: it.id })
    openInAppBrowser(navigation, url, titleOf(it))
  }

  const openActivitiesCatalog = () => {
    track('browse_catalog')
    if (draftToken) {
      void rememberTrip({ draft_token: draftToken, city })
    }
    navigation.navigate('Main', {
      screen: 'Activities',
      params: {
        city,
        draftToken: draftToken || undefined,
        plannedTripId: plannedTripId || undefined,
      },
    })
  }

  if (!enabled) {
    return <Text style={styles.muted}>Activités bientôt disponibles.</Text>
  }

  if (needsAuth && !loading) {
    return (
      <View style={styles.authCard}>
        <Text style={styles.authKicker}>
          {hasAccount ? 'SESSION' : 'COMPTE REQUIS'}
        </Text>
        <Text style={styles.authTitle}>
          {hasAccount
            ? 'Reprendre ton compte'
            : 'Connecte-toi pour tes activités'}
        </Text>
        <Text style={styles.authBody}>
          {hasAccount
            ? 'Tu es déjà connecté. On recharge tes activités avec ta session.'
            : tripItemsErrorLabelFr(error)}
        </Text>
        {hasAccount ? (
          <Pressable
            style={[styles.primaryBtn, resuming && { opacity: 0.6 }]}
            disabled={resuming}
            onPress={() => void onResumeSession()}
          >
            <Text style={styles.primaryBtnText}>
              {resuming ? 'Reprise…' : 'Reprendre ma session'}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.primaryBtn, signingIn && { opacity: 0.6 }]}
            disabled={signingIn}
            onPress={() => void onSignIn()}
          >
            <Text style={styles.primaryBtnText}>
              {signingIn ? 'Connexion…' : 'Se connecter avec Google'}
            </Text>
          </Pressable>
        )}
      </View>
    )
  }

  const cityLabel = activityDestinationLabelFr(city)

  return (
    <View style={[styles.wrap, layout === 'booking_cards' && styles.wrapTight]}>
      {layout !== 'booking_cards' ? (
      <Pressable
        onPress={openActivitiesCatalog}
        style={({ pressed }) => [
          styles.catalogBtn,
          shadow.soft,
          pressed && {
            backgroundColor: colors.primaryMuted,
            transform: [{ scale: 0.985 }],
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${ACTIVITY_ADD_LABEL_FR} · ${cityLabel}`}
      >
        <View style={styles.catalogIcon}>
          <Text style={styles.catalogIconPlus}>+</Text>
        </View>
        <View style={styles.catalogCopy}>
          <Text style={styles.catalogTitle}>{ACTIVITY_ADD_LABEL_FR}</Text>
          <View style={styles.catalogMetaRow}>
            <View style={styles.catalogCityPill}>
              <Text style={styles.catalogCityText} numberOfLines={1}>
                {cityLabel}
              </Text>
            </View>
            <Text style={styles.catalogMetaDot}>·</Text>
            <Text style={styles.catalogMeta}>Catalogue</Text>
          </View>
        </View>
        <View style={styles.catalogChevron}>
          <Text style={styles.catalogChevronText}>›</Text>
        </View>
      </Pressable>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 4 }} />
      ) : null}
      {error ? (
        <Text style={styles.err}>{tripItemsErrorLabelFr(error)}</Text>
      ) : null}

      {items.map((it) => {
        if (it.status === 'skipped') return null
        const price = priceOf(it)
        const booked =
          it.status === 'booked' || it.status === 'validated'
        if (layout === 'booking_cards') {
          return (
            <StayBookingCard
              key={it.id}
              photo={photoOf(it) || null}
              kicker="Activité"
              title={titleOf(it)}
              subtitle={tripItemStatusLabelFr(it.status)}
              priceLabel={price}
              style={{ marginBottom: 0 }}
              badge={
                booked
                  ? {
                      label: tripItemStatusLabelFr(it.status),
                      tone: colors.success,
                      soft: colors.successSoft,
                    }
                  : {
                      label: 'À réserver',
                      tone: colors.primaryDeep,
                      soft: colors.primarySoft,
                    }
              }
              onPress={() => openDetail(it)}
              footer={
                <>
                  {!it.inherited &&
                  it.status !== 'validated' &&
                  it.status !== 'booked' ? (
                    <Pressable
                      style={stayBookingLinkBtn.btn}
                      onPress={() => void patch(it.id, { status: 'validated' })}
                    >
                      <Text style={stayBookingLinkBtn.text}>
                        {ACTIVITY_VALIDATE_LABEL_FR}
                      </Text>
                    </Pressable>
                  ) : null}
                  {(it.meta?.product_url || it.meta?.product_code) &&
                  it.status !== 'validated' &&
                  it.status !== 'booked' ? (
                    <Pressable
                      style={stayBookingLinkBtn.btn}
                      onPress={() => bookItem(it)}
                    >
                      <Text style={stayBookingLinkBtn.text}>
                        {ACTIVITY_BOOK_VIATOR_FR}
                      </Text>
                    </Pressable>
                  ) : null}
                </>
              }
            />
          )
        }
        return (
        <View key={it.id} style={[styles.card, shadow.soft]}>
          <Pressable
            onPress={() => openDetail(it)}
            accessibilityRole="button"
            accessibilityLabel={`Voir ${titleOf(it)}`}
            style={styles.itemMainRow}
          >
            {photoOf(it) ? (
              <Image
                source={{ uri: photoOf(it) }}
                style={styles.itemPhoto}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <View style={styles.itemPhotoPlaceholder} />
            )}
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <View style={styles.itemTitleRow}>
                <Text style={[styles.title, { flex: 1 }]} numberOfLines={2}>
                  {titleOf(it)}
                </Text>
                {price ? (
                  <Text style={styles.price}>{price}</Text>
                ) : null}
              </View>
              <Text style={styles.status}>{tripItemStatusLabelFr(it.status)}</Text>
            </View>
          </Pressable>
          <View style={styles.actions}>
            {!it.inherited &&
            it.status !== 'validated' &&
            it.status !== 'booked' &&
            it.status !== 'skipped' ? (
              <Pressable
                onPress={() => void patch(it.id, { status: 'validated' })}
                hitSlop={8}
              >
                <Text style={styles.link}>{ACTIVITY_VALIDATE_LABEL_FR}</Text>
              </Pressable>
            ) : null}
            {(it.meta?.product_url || it.meta?.product_code) &&
            it.status !== 'validated' &&
            it.status !== 'booked' &&
            it.status !== 'skipped' ? (
              <Pressable hitSlop={8} onPress={() => bookItem(it)}>
                <Text style={styles.linkPrimary}>{ACTIVITY_BOOK_VIATOR_FR}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        )
      })}

      <ActivityDetailSheet
        visible={Boolean(detailCard)}
        card={detailCard}
        alreadyAdded
        showBook={
          detailItem?.status !== 'validated' &&
          detailItem?.status !== 'booked' &&
          detailItem?.status !== 'skipped'
        }
        addLabel={ACTIVITY_ADD_TO_PLANNER_FR}
        onBook={(c) => {
          const it =
            detailItem ||
            items.find(
              (row) => String(row.meta?.product_code || '') === c.productCode,
            ) ||
            null
          if (it) bookItem(it)
        }}
        onAdd={() => {
          setDetailCard(null)
          setDetailItem(null)
        }}
        onClose={() => {
          setDetailCard(null)
          setDetailItem(null)
        }}
      />

      <Modal visible={askBooked && !!pendingBook} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, shadow.lift]}>
            <Text style={styles.title}>
              {ACTIVITY_BOOKED_PROMPT_FR(
                pendingBook ? titleOf(pendingBook) : 'cette activité',
              )}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.primaryBtn, { flex: 1 }]}
                onPress={() => {
                  if (pendingBook) void patch(pendingBook.id, { status: 'booked' })
                  track('booked_yes')
                  setPendingBook(null)
                  setAskBooked(false)
                }}
              >
                <Text style={styles.primaryBtnText}>Oui</Text>
              </Pressable>
              <Pressable
                style={[styles.ghostBtn, { flex: 1 }]}
                onPress={() => {
                  if (pendingBook)
                    void patch(pendingBook.id, { status: 'validated' })
                  track('booked_no')
                  setPendingBook(null)
                  setAskBooked(false)
                }}
              >
                <Text style={styles.ghostBtnText}>Pas encore</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  wrapTight: { gap: 8 },
  catalogBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
  },
  catalogIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catalogIconPlus: {
    fontFamily: fonts.extrabold,
    fontSize: 24,
    color: colors.primaryDeep,
    lineHeight: 26,
    marginTop: -1,
  },
  catalogCopy: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  catalogTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  catalogMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  catalogCityPill: {
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
    paddingHorizontal: 9,
    paddingVertical: 3,
    maxWidth: '70%',
  },
  catalogCityText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.primaryInk,
    letterSpacing: -0.1,
  },
  catalogMetaDot: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.faint,
  },
  catalogMeta: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.muted,
  },
  catalogChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catalogChevronText: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.primaryDeep,
    lineHeight: 22,
    marginTop: -1,
    marginLeft: 1,
  },
  primaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primaryBtnText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.white,
    letterSpacing: -0.2,
  },
  authCard: {
    gap: 10,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
    backgroundColor: colors.primarySoft,
    padding: 14,
  },
  authKicker: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.primary,
  },
  authTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
  authBody: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: 14,
    gap: 6,
  },
  itemMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  itemPhoto: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.line,
  },
  itemPhotoPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
  },
  title: { fontFamily: fonts.bold, color: colors.ink, fontSize: 14 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  price: {
    fontFamily: fonts.extrabold,
    color: colors.ink,
    fontSize: 14,
    flexShrink: 0,
  },
  status: { fontFamily: fonts.medium, color: colors.muted, fontSize: 12 },
  muted: { fontFamily: fonts.regular, color: colors.muted, fontSize: 12 },
  err: { color: colors.danger, fontFamily: fonts.medium, fontSize: 12 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  link: { fontFamily: fonts.semibold, color: colors.inkSoft, fontSize: 12 },
  linkPrimary: { fontFamily: fonts.bold, color: colors.primary, fontSize: 12 },
  modalBg: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 18,
    gap: 14,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  ghostBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvas,
  },
  ghostBtnText: {
    fontFamily: fonts.semibold,
    color: colors.ink,
    fontSize: 14,
  },
})
