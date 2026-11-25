import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  Image,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Platform,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import {
  ACTIVITY_ADD_LABEL_FR,
  ACTIVITY_ADD_TO_PLANNER_FR,
  ACTIVITY_BOOK_VIATOR_FR,
  ACTIVITY_BOOKED_PROMPT_FR,
  ACTIVITY_DELETE_LABEL_FR,
  ACTIVITY_RESTORE_EMPTY_FR,
  ACTIVITY_RESTORE_POP_FR,
  ACTIVITY_SKIP_CONFIRM_FR,
  ACTIVITY_SKIP_LABEL_FR,
  ACTIVITY_VALIDATE_LABEL_FR,
  resolveSourceItineraryId,
  tripItemsHavePopSource,
  activityDestinationLabelFr,
  canonicalViatorProductUrl,
  formatActivityPrice,
  isTripItemsAuthError,
  pickTripItemOwner,
  resolveActivityCitySlug,
  tripItemHasViatorCatalog,
  tripItemStatusLabelFr,
  tripItemsErrorLabelFr,
  type ActivityCardModel,
} from '@waypop/shared'
import {
  StayBookingCard,
  stayBookingLinkBtn,
} from './StayBookingCard'
import { useAuth } from '../context/AuthContext'
import { auth, getApi } from '../lib/client'
import {
  hydrateTripItems,
  invalidateTripItemsCache,
  listTripItemsCached,
  peekTripItems,
  setTripItemsCache,
} from '../lib/tripItemsCache'
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
  day_offset?: number | null
  moment?: string | null
  notes?: string | null
  title?: string | null
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
  const meta = (it.meta || {}) as Record<string, unknown>
  const fromMeta = String(meta.photo_url || '').trim()
  if (fromMeta) return fromMeta
  const fromPhoto = String(meta.photo || '').trim()
  if (fromPhoto) return fromPhoto
  const photos = meta.photos
  if (Array.isArray(photos)) {
    for (const entry of photos) {
      const url = String(entry || '').trim()
      if (url) return url
    }
  }
  return String(placeOf(it)?.meta?.photo_url || '').trim()
}

function titleOf(it: ItemRow) {
  return String(
    placeOf(it)?.name ||
      it.title ||
      it.meta?.title ||
      'Activité',
  )
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

/** Hero thumbs only — never pull GET /cities/{slug} (catalogue is for Activities tab). */
async function enrichActivityPhotos(rows: ItemRow[]): Promise<ItemRow[]> {
  const missing = rows
    .filter((it) => Boolean(it.meta?.product_code) && !photoOf(it))
    .map((it) => String(it.meta?.product_code || '').trim())
    .filter(Boolean)
    .slice(0, 4)
  if (!missing.length) return rows
  const byCode = new Map<string, string>()
  const priceByCode = new Map<string, number>()
  await Promise.allSettled(
    missing.map(async (code) => {
      const res = await getApi().getActivityProduct(code)
      const product = (res.product || {}) as Record<string, unknown>
      const url = photoFromCatalogRow(product)
      if (url) byCode.set(code, url)
      const pf = priceFromCatalogRow(product)
      if (pf != null) priceByCode.set(code, pf)
    }),
  )
  return applyPhotoMap(rows, byCode, priceByCode)
}

export function ActivityStepPanel(props: {
  draftToken?: string | null
  plannedTripId?: string | null
  citySlug?: string | null
  /** Source Pop itinerary — enables « Remettre le Pop » in planner. */
  sourceItineraryId?: string | null
  fromPop?: boolean
  enabled?: boolean
  surface?: string
  onItemsChange?: (
    items: {
      id?: string
      item_type?: string
      title?: string | null
      name?: string | null
      day_offset?: number | null
      moment?: string | null
      notes?: string | null
      status?: string | null
      meta?: Record<string, unknown> | null
    }[],
  ) => void
  layout?: 'default' | 'booking_cards'
}) {
  const {
    draftToken,
    plannedTripId,
    sourceItineraryId,
    fromPop = false,
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
        // Writes prefer planned; load may still fall back to draft below.
        draftToken: plannedTripId ? null : draftToken,
        plannedTripId,
      }),
    [draftToken, plannedTripId],
  )
  const draftFallback = String(draftToken || '').trim()
  const [items, setItems] = useState<ItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingBook, setPendingBook] = useState<ItemRow | null>(null)
  const [askBooked, setAskBooked] = useState(false)
  const [detailCard, setDetailCard] = useState<ActivityCardModel | null>(null)
  const [detailItem, setDetailItem] = useState<ItemRow | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [resuming, setResuming] = useState(false)
  const [restoringPop, setRestoringPop] = useState(false)
  const [resolvedSourceId, setResolvedSourceId] = useState<string | null>(
    () => String(sourceItineraryId || '').trim() || null,
  )
  const pendingRef = useRef<ItemRow | null>(null)
  const authRetryRef = useRef(false)
  const parcoursReadyRef = useRef(false)
  const loadGenRef = useRef(0)
  const backfillDoneRef = useRef<string>('')
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
        id: i.id,
        item_type: i.item_type,
        title: titleOf(i),
        name: placeOf(i)?.name ?? i.title ?? null,
        day_offset: i.day_offset ?? null,
        moment: i.moment ?? null,
        notes: i.notes ?? null,
        status: i.status ?? null,
        meta: (i.meta || null) as Record<string, unknown> | null,
      })),
    )
  }, [])

  const fetchActivityRows = useCallback(async (): Promise<ItemRow[]> => {
    const planned = owner.planned_trip_id
    const draft = owner.draft_token || draftFallback || undefined
    if (planned && String(planned).startsWith('dev-trip-')) return []

    // One request only: planned already merges linked drafts server-side.
    // Dual planned+draft was 2× enrich/list latency for the hero.
    const query = planned
      ? { planned_trip_id: planned }
      : draft
        ? { draft_token: draft }
        : null
    if (!query) return []
    const res = await listTripItemsCached(query)
    return ((res.items || []) as ItemRow[]).filter(isActivityItem)
  }, [owner.planned_trip_id, owner.draft_token, draftFallback])

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!owner.draft_token && !owner.planned_trip_id && !draftFallback) return
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
    const silent = Boolean(opts?.silent)
    setError(null)

    // Instant paint from memory / disk (shared with TripDetail + tap prefetch).
    const peekOwner = owner.planned_trip_id
      ? { planned_trip_id: owner.planned_trip_id }
      : owner.draft_token || draftFallback
        ? { draft_token: owner.draft_token || draftFallback || undefined }
        : null
    const peekedRows: ItemRow[] = []
    if (peekOwner) {
      let hit = peekTripItems(peekOwner)
      if (!hit?.items?.length) {
        hit = (await hydrateTripItems(peekOwner)) || null
      }
      for (const raw of hit?.items || []) {
        const it = raw as ItemRow
        if (!isActivityItem(it)) continue
        const id = String(it.id || '')
        if (!id) continue
        peekedRows.push(it)
      }
    }
    if (peekedRows.length) {
      setItems(peekedRows)
      publishParcours(peekedRows)
      if (!silent) setLoading(false)
    } else if (!silent) {
      setLoading(true)
    }

    try {
      let rows = await fetchActivityRows()
      if (gen !== loadGenRef.current) return

      const ownerKey = `${owner.planned_trip_id || ''}|${owner.draft_token || draftFallback || ''}`
      if (backfillDoneRef.current !== ownerKey) {
        const toValidate = rows.filter(
          (it) =>
            !it.inherited &&
            it.status === 'idea' &&
            !tripItemHasViatorCatalog(it.meta),
        )
        backfillDoneRef.current = ownerKey
        if (toValidate.length) {
          await Promise.all(
            toValidate.map((it) =>
              getApi().patchTripItem(it.id, {
                status: 'validated',
                draft_token: owner.draft_token,
              }),
            ),
          )
          invalidateTripItemsCache(
            owner.planned_trip_id
              ? { planned_trip_id: owner.planned_trip_id }
              : {
                  draft_token:
                    owner.draft_token || draftFallback || undefined,
                },
          )
          rows = await fetchActivityRows()
          if (gen !== loadGenRef.current) return
        }
      }

      setItems(rows)
      publishParcours(rows)
      // Titles/status paint now — photos fill in after (don't await).
      setLoading(false)
      authRetryRef.current = false
      if (!rows.length) return
      if (owner.planned_trip_id) {
        setTripItemsCache(
          { planned_trip_id: owner.planned_trip_id },
          rows as unknown as Record<string, unknown>[],
        )
      } else if (owner.draft_token || draftFallback) {
        setTripItemsCache(
          { draft_token: owner.draft_token || draftFallback || undefined },
          rows as unknown as Record<string, unknown>[],
        )
      }
      const needsPhoto = rows.some(
        (it) => Boolean(it.meta?.product_code) && !photoOf(it),
      )
      if (!needsPhoto) return
      // Defer product-detail thumbs so trip-items + hotel seed win the wire.
      setTimeout(() => {
        if (gen !== loadGenRef.current) return
        void enrichActivityPhotos(rows).then((enriched) => {
          if (gen !== loadGenRef.current) return
          setItems(enriched)
          publishParcours(enriched)
          if (owner.planned_trip_id) {
            setTripItemsCache(
              { planned_trip_id: owner.planned_trip_id },
              enriched as unknown as Record<string, unknown>[],
            )
          } else if (owner.draft_token || draftFallback) {
            setTripItemsCache(
              {
                draft_token:
                  owner.draft_token || draftFallback || undefined,
              },
              enriched as unknown as Record<string, unknown>[],
            )
          }
        })
      }, 600)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur'
      if (isTripItemsAuthError(msg) && !authRetryRef.current) {
        authRetryRef.current = true
        const token = await auth.refreshAccessToken()
        if (token) {
          try {
            const rows = await fetchActivityRows()
            if (gen !== loadGenRef.current) return
            setItems(rows)
            publishParcours(rows)
            setLoading(false)
            setError(null)
            if (!rows.length) return
            const needsPhoto = rows.some(
              (it) => Boolean(it.meta?.product_code) && !photoOf(it),
            )
            if (!needsPhoto) return
            setTimeout(() => {
              if (gen !== loadGenRef.current) return
              void enrichActivityPhotos(rows).then((enriched) => {
                if (gen !== loadGenRef.current) return
                setItems(enriched)
                publishParcours(enriched)
              })
            }, 600)
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
  }, [owner, draftFallback, publishParcours, fetchActivityRows])

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
    backfillDoneRef.current = ''
  }, [owner.draft_token, owner.planned_trip_id, draftFallback])

  useEffect(() => {
    if (enabled) void load()
  }, [enabled, load])

  // Reload when coming back from Activities catalog / other screens.
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return
      authRetryRef.current = false
      void load({ silent: true })
    }, [enabled, load]),
  )

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

  const skipAll = () => {
    Alert.alert(ACTIVITY_SKIP_LABEL_FR, ACTIVITY_SKIP_CONFIRM_FR, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Continuer',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setError(null)
            try {
              if (!items.length) {
                await getApi().addTripItem({
                  product_code: `skip-${Date.now()}`,
                  title: ACTIVITY_SKIP_LABEL_FR,
                  ...owner,
                  platform,
                  surface,
                })
                const res = await getApi().listTripItems(owner)
                const last = ((res.items || []) as ItemRow[]).slice(-1)[0]
                if (last?.id) await patch(last.id, { status: 'skipped' })
              } else {
                for (const it of items) {
                  if (it.status === 'skipped') continue
                  // Pas d’activité = stops Pop only — leave catalogue Viator alone.
                  if (tripItemHasViatorCatalog(it.meta)) continue
                  await patch(it.id, { status: 'skipped' })
                }
              }
              track('skip')
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Erreur')
            }
          })()
        },
      },
    ])
  }

  useEffect(() => {
    const fromProp = String(sourceItineraryId || '').trim()
    if (fromProp) {
      setResolvedSourceId(fromProp)
      return
    }
    const fromItems = resolveSourceItineraryId(null, items)
    if (fromItems) {
      setResolvedSourceId(fromItems)
      return
    }
    const planned = String(plannedTripId || '').trim()
    const needsResolve = fromPop || tripItemsHavePopSource(items)
    if (!planned || !needsResolve) return
    let cancelled = false
    void getApi()
      .getPlannedTrip(planned)
      .then((trip) => {
        if (cancelled) return
        const id = resolveSourceItineraryId(
          (trip.meta || {}) as { source_itinerary_id?: string | null },
          null,
        )
        if (id) setResolvedSourceId(id)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [sourceItineraryId, fromPop, plannedTripId, items])

  const restorePopActivities = async () => {
    const plannedId = String(owner.planned_trip_id || '').trim()
    if (!plannedId && !owner.draft_token) {
      setError('Pop source introuvable — recharge le séjour.')
      return
    }
    setRestoringPop(true)
    setError(null)
    try {
      const resolveItinId = async (): Promise<string> => {
        let itinId =
          String(resolvedSourceId || sourceItineraryId || '').trim() ||
          resolveSourceItineraryId(null, items) ||
          ''
        if (!itinId && plannedId) {
          try {
            const trip = await getApi().getPlannedTrip(plannedId)
            itinId =
              resolveSourceItineraryId(
                (trip.meta || {}) as { source_itinerary_id?: string | null },
                null,
              ) || ''
          } catch {
            /* ignore */
          }
        }
        if (itinId) setResolvedSourceId(itinId)
        return itinId
      }

      const unskipLocalPopItems = async () => {
        const skipped = items.filter((it) => {
          if (it.status !== 'skipped') return false
          if (tripItemHasViatorCatalog(it.meta)) return false
          const m = (it.meta || {}) as Record<string, unknown>
          return Boolean(
            String(
              m.from_itinerary_item_id ||
                m.source_itinerary_id ||
                m.itinerary_id ||
                '',
            ).trim(),
          )
        })
        for (const it of skipped) {
          await patch(it.id, { status: 'validated' })
        }
        return skipped.length
      }

      if (plannedId) {
        try {
          const res = await getApi().restorePopPlannedTrip(plannedId)
          const sid = String(res.source_itinerary_id || '').trim()
          if (sid) setResolvedSourceId(sid)
          track('restore_pop', {
            itinerary_id: sid || undefined,
            mode: res.mode,
          })
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          const routeMissing =
            /not found/i.test(msg) &&
            !/pop source|voyage introuvable/i.test(msg)
          if (!routeMissing && /pop source introuvable/i.test(msg)) {
            const n = await unskipLocalPopItems()
            if (n > 0) {
              track('restore_pop', { mode: 'unskip_client' })
            } else {
              throw e
            }
          } else if (routeMissing || /not found/i.test(msg)) {
            const itinId = await resolveItinId()
            if (itinId) {
              await getApi().applyItinerary(itinId, {
                planned_trip_id: plannedId,
              })
              track('restore_pop', {
                itinerary_id: itinId,
                mode: 'apply_fallback',
              })
            } else {
              const n = await unskipLocalPopItems()
              if (n > 0) {
                track('restore_pop', { mode: 'unskip_client' })
              } else {
                throw e
              }
            }
          } else {
            throw e
          }
        }
      } else {
        const itinId = await resolveItinId()
        if (!itinId) {
          setError('Pop source introuvable — recharge le séjour.')
          return
        }
        await getApi().applyItinerary(itinId, {
          draft_token: owner.draft_token || undefined,
        })
        track('restore_pop', { itinerary_id: itinId })
      }
      invalidateTripItemsCache(owner)
      backfillDoneRef.current = ''
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de remettre le Pop')
    } finally {
      setRestoringPop(false)
    }
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
    const citySlug = resolveActivityCitySlug({
      cityLabel: city,
      citySlug: city,
    })
    navigation.navigate('Main', {
      screen: 'Activities',
      params: {
        city: citySlug || city,
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
  const canRestorePop =
    Boolean(String(resolvedSourceId || sourceItineraryId || '').trim()) ||
    fromPop ||
    tripItemsHavePopSource(items)
  const activeItems = items.filter((it) => it.status !== 'skipped')

  return (
    <View style={[styles.wrap, layout === 'booking_cards' && styles.wrapTight]}>
      {layout !== 'booking_cards' ? (
        <>
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
          <View style={styles.actionRow}>
            <Pressable
              onPress={skipAll}
              style={({ pressed }) => [
                styles.skipBtn,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={ACTIVITY_SKIP_LABEL_FR}
            >
              <Text style={styles.skipBtnText}>{ACTIVITY_SKIP_LABEL_FR}</Text>
            </Pressable>
            {canRestorePop ? (
              <Pressable
                onPress={() => void restorePopActivities()}
                disabled={restoringPop}
                style={({ pressed }) => [
                  styles.restoreBtn,
                  pressed && { opacity: 0.85 },
                  restoringPop && { opacity: 0.6 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={ACTIVITY_RESTORE_POP_FR}
              >
                <Text style={styles.restoreBtnText}>
                  {restoringPop ? '…' : ACTIVITY_RESTORE_POP_FR}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 4 }} />
      ) : null}
      {error ? (
        <Text style={styles.err}>{tripItemsErrorLabelFr(error)}</Text>
      ) : null}

      {!activeItems.length && !loading ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Aucune activité pour l’instant</Text>
          <Text style={styles.emptyBody}>
            {canRestorePop
              ? ACTIVITY_RESTORE_EMPTY_FR
              : 'Parcours le catalogue pour en ajouter.'}
          </Text>
        </View>
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
                  tripItemHasViatorCatalog(it.meta) &&
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
                  tripItemHasViatorCatalog(it.meta) &&
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
                  {!it.inherited && it.status !== 'skipped' ? (
                    <Pressable
                      style={stayBookingLinkBtn.btn}
                      onPress={() => void patch(it.id, { status: 'skipped' })}
                    >
                      <Text style={[stayBookingLinkBtn.text, { color: colors.danger }]}>
                        {ACTIVITY_DELETE_LABEL_FR}
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
            tripItemHasViatorCatalog(it.meta) &&
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
            tripItemHasViatorCatalog(it.meta) &&
            it.status !== 'validated' &&
            it.status !== 'booked' &&
            it.status !== 'skipped' ? (
              <Pressable hitSlop={8} onPress={() => bookItem(it)}>
                <Text style={styles.linkPrimary}>{ACTIVITY_BOOK_VIATOR_FR}</Text>
              </Pressable>
            ) : null}
            {!it.inherited && it.status !== 'skipped' ? (
              <Pressable
                onPress={() => void patch(it.id, { status: 'skipped' })}
                hitSlop={8}
              >
                <Text style={styles.linkDanger}>{ACTIVITY_DELETE_LABEL_FR}</Text>
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
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skipBtn: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
  skipBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.inkSoft,
  },
  restoreBtn: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
  restoreBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primaryDeep,
  },
  emptyCard: {
    gap: 6,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  emptyTitle: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.ink,
  },
  emptyBody: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
  },
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
  linkDanger: { fontFamily: fonts.semibold, color: colors.danger, fontSize: 12 },
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
