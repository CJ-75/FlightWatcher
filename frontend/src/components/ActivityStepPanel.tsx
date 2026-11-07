/**
 * Planner / MyTrip étape Activités — DnD ordre + Viator return prompt (Lot E).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ACTIVITY_ADD_TO_PLANNER_FR,
  ACTIVITY_BOOK_VIATOR_FR,
  ACTIVITY_BOOKED_PROMPT_FR,
  ACTIVITY_BROWSE_CATALOG_FR,
  ACTIVITY_SKIP_LABEL_FR,
  ACTIVITY_VALIDATE_LABEL_FR,
  AVAILABILITY_STATE_LABEL_FR,
  activitiesCityPath,
  canonicalViatorProductUrl,
  detectEventPlatform,
  formatActivityPrice,
  isTripItemsAuthError,
  pickTripItemOwner,
  reorderKeysMoving,
  tripItemStatusLabelFr,
  tripItemsErrorLabelFr,
  type ActivityCardModel,
  type AvailabilityState,
  type TripItemStatus,
} from '@flightwatcher/shared'
import { StayCardShell } from './StayCardShell'
import {
  getCurrentSession,
  getCurrentUser,
  onAuthStateChange,
  refreshAccessToken,
  signInWithGoogle,
} from '../lib/supabase'
import { getApiClient } from '../utils/apiClient'
import {
  invalidateTripItemsCache,
  listTripItemsCached,
} from '../utils/tripItemsCache'
import { rememberTrip } from '../utils/tripRecovery'
import { ActivityDetailSheet } from './ActivityDetailSheet'

type ItemRow = {
  id: string
  item_type?: string
  status?: string
  availability_state?: string
  sort_key?: string
  day_offset?: number
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

function statusChip(it: ItemRow): { label: string; chipClass: string } {
  const label = tripItemStatusLabelFr(it.status)
  if (it.status === 'booked' || it.status === 'validated') {
    return {
      label,
      chipClass: 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200',
    }
  }
  if (it.status === 'skipped') {
    return {
      label,
      chipClass: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    }
  }
  return {
    label: label || 'À réserver',
    chipClass: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200',
  }
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
  citySlug: string | null | undefined,
  api: {
    listCity: (slug: string, adults: number) => Promise<{ items?: unknown[] }>
    getProduct: (
      code: string,
    ) => Promise<{ product?: Record<string, unknown> }>
  },
): Promise<ItemRow[]> {
  const needsEnrich = rows.some(
    (it) =>
      Boolean(it.meta?.product_code) &&
      (!photoOf(it) || rawPriceOf(it) == null),
  )
  if (!needsEnrich) return rows
  const byCode = new Map<string, string>()
  const priceByCode = new Map<string, number>()
  const slug = String(citySlug || '').trim() || 'paris'
  try {
    const res = await api.listCity(slug, 2)
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
  const settled = await Promise.allSettled(
    stillMissing.map(async (code) => {
      const res = await api.getProduct(code)
      const product = res.product || {}
      const url = photoFromCatalogRow(product)
      if (url) byCode.set(code, url)
      const pf = priceFromCatalogRow(product)
      if (pf != null) priceByCode.set(code, pf)
    }),
  )
  void settled
  return applyPhotoMap(next, byCode, priceByCode)
}

export function ActivityStepPanel(props: {
  draftToken?: string | null
  plannedTripId?: string | null
  citySlug?: string | null
  enabled?: boolean
  surface?: string
  /** Sync parcours pipeline when ideas are added / removed. */
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
    }[],
  ) => void
  /** Mon voyage: cartes type réservations (photo + prix). */
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
  const owner = useMemo(
    () =>
      pickTripItemOwner({
        // Planner wins; draft only when this séjour has no planned_trip_id.
        draftToken: plannedTripId ? null : draftToken,
        plannedTripId,
      }),
    [draftToken, plannedTripId],
  )
  const [items, setItems] = useState<ItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [pendingBook, setPendingBook] = useState<ItemRow | null>(null)
  const [askBooked, setAskBooked] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<Record<string, unknown>[]>([])
  const [detailCard, setDetailCard] = useState<ActivityCardModel | null>(null)
  const [detailItem, setDetailItem] = useState<ItemRow | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [hasAccount, setHasAccount] = useState(false)
  const [resuming, setResuming] = useState(false)
  const authRetryRef = useRef(false)
  /** Avoid pushing [] to parcours before the first successful list. */
  const parcoursReadyRef = useRef(false)
  const loadGenRef = useRef(0)
  const onItemsChangeRef = useRef(onItemsChange)
  onItemsChangeRef.current = onItemsChange

  const publishParcours = useCallback((rows: ItemRow[]) => {
    parcoursReadyRef.current = true
    onItemsChangeRef.current?.(
      rows.filter(isActivityItem).map((i) => ({
        id: i.id,
        item_type: i.item_type,
        title: i.title ?? placeOf(i)?.name ?? null,
        name: placeOf(i)?.name ?? null,
        day_offset: i.day_offset ?? null,
        moment: i.moment ?? null,
        notes: i.notes ?? null,
        status: i.status ?? null,
      })),
    )
  }, [])

  const load = useCallback(async (opts?: { force?: boolean }) => {
    if (!owner.draft_token && !owner.planned_trip_id) return
    const gen = ++loadGenRef.current
    setLoading(true)
    setError(null)
    try {
      const res = await listTripItemsCached(owner, { force: opts?.force })
      const rows = ((res.items || []) as ItemRow[]).filter(isActivityItem)
      if (gen !== loadGenRef.current) return
      setItems(rows)
      // Sync parcours immediately — don't wait for photo enrich.
      publishParcours(rows)
      const enriched = await enrichActivityPhotos(rows, props.citySlug, {
        listCity: (slug, adults) =>
          getApiClient().listCityActivities(slug, adults),
        getProduct: (code) => getApiClient().getActivityProduct(code),
      })
      if (gen !== loadGenRef.current) return
      setItems(enriched)
      publishParcours(enriched)
      authRetryRef.current = false
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur'
      if (isTripItemsAuthError(msg) && !authRetryRef.current) {
        authRetryRef.current = true
        const token = await refreshAccessToken()
        if (token) {
          try {
            const res = await listTripItemsCached(owner, { force: true })
            const rows = ((res.items || []) as ItemRow[]).filter(isActivityItem)
            if (gen !== loadGenRef.current) return
            setItems(rows)
            publishParcours(rows)
            const enriched = await enrichActivityPhotos(rows, props.citySlug, {
              listCity: (slug, adults) =>
                getApiClient().listCityActivities(slug, adults),
              getProduct: (code) => getApiClient().getActivityProduct(code),
            })
            if (gen !== loadGenRef.current) return
            setItems(enriched)
            publishParcours(enriched)
            setError(null)
            return
          } catch (e2) {
            setError(e2 instanceof Error ? e2.message : msg)
            // Keep previous items so parcours stays green.
            return
          } finally {
            setLoading(false)
          }
        }
      }
      setError(msg)
      // Keep previous items — empty would reset parcours to « Choisir ».
    } finally {
      setLoading(false)
    }
  }, [owner, props.citySlug, publishParcours])

  const needsAuth = isTripItemsAuthError(error)

  const onResumeSession = async () => {
    setResuming(true)
    authRetryRef.current = false
    await refreshAccessToken()
    await load()
    setResuming(false)
  }

  const onSignIn = async () => {
    setSigningIn(true)
    try {
      sessionStorage.setItem('fw_active_tab', 'planner')
    } catch {
      /* ignore */
    }
    const { error: err } = await signInWithGoogle()
    if (err) setError(err.message)
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
    // Status patches (Réservée, etc.) — skip until first successful list.
    if (!parcoursReadyRef.current) return
    publishParcours(items)
  }, [items, publishParcours])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [user, session] = await Promise.all([
        getCurrentUser().catch(() => null),
        getCurrentSession().catch(() => null),
      ])
      if (!cancelled) setHasAccount(Boolean(user || session?.user))
    })()
    const unsub = onAuthStateChange((_event, session) => {
      setHasAccount(Boolean(session?.user))
      if (session?.user && enabled) {
        authRetryRef.current = false
        void load()
      }
    })
    return () => {
      cancelled = true
      unsub?.()
    }
  }, [enabled, load])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && pendingBook) setAskBooked(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [pendingBook])

  const track = (event: string, meta?: Record<string, unknown>) => {
    void getApiClient()
      .trackActivityEvent({
        domain: 'activity',
        event,
        surface,
        platform: detectEventPlatform('web'),
        ...owner,
        meta,
      })
      .catch(() => undefined)
  }

  const openSuggestions = async () => {
    setPickerOpen(true)
    const slug = props.citySlug || 'paris'
    try {
      const res = await getApiClient().listCityActivities(slug, 2)
      setSuggestions(Array.isArray(res.items) ? res.items.slice(0, 12) : [])
    } catch {
      setSuggestions([])
    }
  }

  const addProduct = async (raw: Record<string, unknown>) => {
    try {
      await getApiClient().addTripItem({
        product_code: raw.product_code,
        title: raw.title,
        product_url: raw.product_url,
        photo_url: photoFromCatalogRow(raw) || null,
        ...owner,
        platform: 'web',
        surface,
      })
      track('add', { product_code: raw.product_code })
      setPickerOpen(false)
      invalidateTripItemsCache(owner)
      await load({ force: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ajout impossible')
    }
  }

  const patch = async (id: string, body: Record<string, unknown>) => {
    await getApiClient().patchTripItem(id, {
      ...body,
      draft_token: owner.draft_token,
    })
    invalidateTripItemsCache(owner)
    await load({ force: true })
  }

  const skipAll = async () => {
    if (!items.length) {
      // Create a skipped placeholder via patch on a synthetic — use add with skip status if API allows
      track('skip')
      setError(null)
      // Mark UX done locally by inserting skip note via first item or track only
      try {
        await getApiClient().addTripItem({
          product_code: `skip-${Date.now()}`,
          title: ACTIVITY_SKIP_LABEL_FR,
          ...owner,
          platform: 'web',
          surface,
        })
        const res = await getApiClient().listTripItems(owner)
        const last = (res.items || []).slice(-1)[0] as ItemRow | undefined
        if (last?.id) await patch(last.id, { status: 'skipped' })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur')
      }
      return
    }
    for (const it of items) {
      if (it.status !== 'skipped') await patch(it.id, { status: 'skipped' })
    }
    track('skip')
  }

  const onBook = (it: ItemRow) => {
    const url = canonicalViatorProductUrl(String(it.meta?.product_url || ''), {
      productCode:
        it.meta?.product_code != null ? String(it.meta.product_code) : null,
    })
    if (!url) return
    if (!it.inherited) setPendingBook(it)
    track('book_click', { trip_item_id: it.id })
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const onDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null)
      return
    }
    const ids = items.map((i) => i.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) {
      setDragId(null)
      return
    }
    const keys = reorderKeysMoving(ids, from, to)
    setDragId(null)
    try {
      await getApiClient().reorderTripItems(keys, owner)
      invalidateTripItemsCache(owner)
      await load({ force: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Réordonnancement impossible')
    }
  }

  if (!enabled) {
    return (
      <p className="text-sm text-slate-500">Activités bientôt disponibles sur ce voyage.</p>
    )
  }

  const openDetail = (it: ItemRow) => {
    const card = cardFromItem(it)
    if (!card) return
    setDetailItem(it)
    setDetailCard(card)
    track('open_detail', { trip_item_id: it.id, product_code: card.productCode })
  }

  const catalogHref = activitiesCityPath(props.citySlug || 'paris', {
    draftToken: draftToken || undefined,
    plannedTripId: plannedTripId || undefined,
  })

  if (needsAuth && !loading) {
    return (
      <div className="flex h-full min-h-0 flex-col justify-center rounded-xl border border-orange-100 bg-gradient-to-br from-[#FFF8F3] to-white px-3.5 py-4 gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-primary-700">
            {hasAccount ? 'Session' : 'Compte requis'}
          </p>
          <p className="mt-1 text-sm font-extrabold text-ink tracking-tight">
            {hasAccount
              ? 'Reprendre ton compte'
              : 'Connecte-toi pour tes activités'}
          </p>
          <p className="mt-1 text-xs text-muted leading-snug">
            {hasAccount
              ? 'Tu es déjà connecté. On recharge tes activités avec ta session.'
              : tripItemsErrorLabelFr(error)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasAccount ? (
            <button
              type="button"
              disabled={resuming}
              onClick={() => void onResumeSession()}
              className="rounded-lg bg-primary-600 text-white text-xs font-bold px-3.5 py-2.5 min-h-[40px] disabled:opacity-60"
            >
              {resuming ? 'Reprise…' : 'Reprendre ma session'}
            </button>
          ) : (
            <button
              type="button"
              disabled={signingIn}
              onClick={() => void onSignIn()}
              className="rounded-lg bg-primary-600 text-white text-xs font-bold px-3.5 py-2.5 min-h-[40px] disabled:opacity-60"
            >
              {signingIn ? 'Connexion…' : 'Se connecter avec Google'}
            </button>
          )}
          <Link
            to={catalogHref}
            onClick={() => {
              track('browse_catalog')
              if (draftToken) {
                rememberTrip({
                  draft_token: draftToken,
                  city: props.citySlug || null,
                })
              }
            }}
            className="rounded-lg border border-slate-200 text-xs font-semibold px-3.5 py-2.5 min-h-[40px] inline-flex items-center text-ink"
          >
            Voir le catalogue
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {layout !== 'booking_cards' ? (
      <div className="flex flex-wrap gap-1.5 shrink-0">
        <Link
          to={catalogHref}
          onClick={() => {
            track('browse_catalog')
            if (draftToken) {
              rememberTrip({
                draft_token: draftToken,
                city: props.citySlug || null,
              })
            }
          }}
          className="rounded-lg bg-primary-600 text-white text-xs font-bold px-3 py-2 min-h-[36px] inline-flex items-center"
        >
          {ACTIVITY_BROWSE_CATALOG_FR}
        </Link>
        <button
          type="button"
          onClick={() => void skipAll()}
          className="rounded-lg border border-slate-200 text-xs font-semibold px-3 py-2 min-h-[36px] text-slate-600"
        >
          {ACTIVITY_SKIP_LABEL_FR}
        </button>
      </div>
      ) : null}

      {loading ? <p className="text-sm text-slate-500">Chargement…</p> : null}
      {error ? (
        <p className="text-sm text-red-600">{tripItemsErrorLabelFr(error)}</p>
      ) : null}

      {layout === 'booking_cards' ? (
        <ul className="space-y-2">
          {items
            .filter((it) => it.status !== 'skipped')
            .map((it) => {
              const chip = statusChip(it)
              const price = priceOf(it)
              return (
                <StayCardShell
                  key={it.id}
                  as="li"
                  photo={photoOf(it) || null}
                  chipClass={chip.chipClass}
                  chipLabel={chip.label}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                        Activité
                      </p>
                      <button
                        type="button"
                        onClick={() => openDetail(it)}
                        className="text-left w-full"
                      >
                        <h3 className="text-lg font-extrabold text-ink tracking-tight mt-0.5">
                          {titleOf(it)}
                        </h3>
                      </button>
                      {it.availability_state ? (
                        <p className="text-xs text-muted mt-1">
                          {AVAILABILITY_STATE_LABEL_FR[
                            it.availability_state as AvailabilityState
                          ] || it.availability_state}
                        </p>
                      ) : null}
                    </div>
                    {price ? (
                      <div className="text-right shrink-0">
                        <p className="text-2xl font-extrabold text-ink tracking-tight tabular-nums leading-none">
                          {price}
                        </p>
                        <p className="text-[11px] text-muted font-medium mt-1">
                          Activité
                        </p>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-auto pt-4 flex flex-wrap gap-2">
                    {!it.inherited &&
                    it.status !== 'validated' &&
                    it.status !== 'booked' ? (
                      <button
                        type="button"
                        className="inline-flex items-center rounded-xl border border-line px-3.5 py-2 text-sm font-bold text-ink hover:bg-slate-50 min-h-[40px]"
                        onClick={() =>
                          void patch(it.id, {
                            status: 'validated' as TripItemStatus,
                          })
                        }
                      >
                        {ACTIVITY_VALIDATE_LABEL_FR}
                      </button>
                    ) : null}
                    {(it.meta?.product_url || it.meta?.product_code) &&
                    it.status !== 'validated' &&
                    it.status !== 'booked' ? (
                      <button
                        type="button"
                        className="inline-flex items-center rounded-xl bg-primary-500 text-white px-3.5 py-2 text-sm font-bold hover:bg-primary-600 min-h-[40px]"
                        onClick={() => onBook(it)}
                      >
                        {ACTIVITY_BOOK_VIATOR_FR}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="inline-flex items-center rounded-xl border border-line px-3.5 py-2 text-sm font-semibold text-ink-soft hover:bg-slate-50 min-h-[40px]"
                      onClick={() => openDetail(it)}
                    >
                      Détails
                    </button>
                  </div>
                </StayCardShell>
              )
            })}
        </ul>
      ) : (
      <ul className="space-y-2">
        {items.map((it) => (
          <li
            key={it.id}
            draggable={!it.inherited}
            onDragStart={() => {
              if (!it.inherited) setDragId(it.id)
            }}
            onDragOver={(e) => {
              if (!it.inherited) e.preventDefault()
            }}
            onDrop={() => {
              if (!it.inherited) void onDrop(it.id)
            }}
            className="rounded-xl border border-slate-200 bg-white p-3 flex flex-col gap-2"
          >
            <button
              type="button"
              onClick={() => openDetail(it)}
              className="flex items-start gap-3 text-left w-full rounded-lg hover:bg-slate-50/80 -m-1 p-1 transition-colors"
            >
              {photoOf(it) ? (
                <img
                  src={photoOf(it)}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-lg object-cover bg-slate-100"
                  loading="lazy"
                />
              ) : (
                <div
                  aria-hidden
                  className="h-14 w-14 shrink-0 rounded-lg bg-gradient-to-br from-orange-50 to-slate-100"
                />
              )}
              <div className="min-w-0 flex-1 flex justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-sm text-slate-900">
                    {titleOf(it)}
                  </p>
                  {priceOf(it) ? (
                    <p className="text-xs font-bold text-ink mt-0.5">
                      {priceOf(it)}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 text-xs text-slate-500">
                  {tripItemStatusLabelFr(it.status)}
                  {it.availability_state
                    ? ` · ${
                        AVAILABILITY_STATE_LABEL_FR[
                          it.availability_state as AvailabilityState
                        ] || it.availability_state
                      }`
                    : ''}
                </span>
              </div>
            </button>
            <div className="flex flex-wrap gap-2">
              {!it.inherited && it.status !== 'validated' && it.status !== 'booked' && it.status !== 'skipped' ? (
                <button
                  type="button"
                  className="text-xs font-semibold rounded-lg bg-slate-100 px-2 py-1"
                  onClick={() =>
                    void patch(it.id, { status: 'validated' as TripItemStatus })
                  }
                >
                  {ACTIVITY_VALIDATE_LABEL_FR}
                </button>
              ) : null}
              {(it.meta?.product_url || it.meta?.product_code) &&
              it.status !== 'validated' &&
              it.status !== 'booked' &&
              it.status !== 'skipped' ? (
                <button
                  type="button"
                  className="text-xs font-semibold rounded-lg bg-primary-600 text-white px-2 py-1"
                  onClick={() => onBook(it)}
                >
                  {ACTIVITY_BOOK_VIATOR_FR}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      )}
      {!items.length && !loading ? (
        <div className="flex flex-1 flex-col justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3.5 py-3 space-y-1">
          <p className="text-sm font-semibold text-slate-800">
            Aucune activité pour l’instant
          </p>
          <p className="text-xs text-slate-500 leading-snug">
            Parcours le catalogue, ou ajoute une suggestion rapide.
          </p>
          <Link
            to={catalogHref}
            className="inline-flex text-xs font-bold text-primary-700 hover:underline"
          >
            {ACTIVITY_BROWSE_CATALOG_FR} →
          </Link>
        </div>
      ) : null}

      {pickerOpen ? (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-auto p-4 space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="font-bold">Suggestions</h3>
              <button type="button" onClick={() => setPickerOpen(false)} className="text-sm">
                Fermer
              </button>
            </div>
            {suggestions.map((s) => {
              const thumb = String(s.photo_url || '').trim()
              return (
                <button
                  key={String(s.product_code)}
                  type="button"
                  className="w-full text-left rounded-xl border p-3 hover:bg-slate-50 flex items-center gap-3"
                  onClick={() => void addProduct(s)}
                >
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg object-cover bg-slate-100"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="h-12 w-12 shrink-0 rounded-lg bg-slate-100"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{String(s.title || '')}</p>
                    <p className="text-xs text-slate-500">
                      {s.price_from != null ? `dès ${s.price_from} €` : ''}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {askBooked && pendingBook ? (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-3">
            <p className="font-bold">{ACTIVITY_BOOKED_PROMPT_FR(titleOf(pendingBook))}</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl bg-emerald-600 text-white font-bold py-2"
                onClick={() => {
                  void patch(pendingBook.id, { status: 'booked' })
                  track('booked_yes', { trip_item_id: pendingBook.id })
                  setPendingBook(null)
                  setAskBooked(false)
                }}
              >
                Oui
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl border font-semibold py-2"
                onClick={() => {
                  void patch(pendingBook.id, { status: 'validated' })
                  track('booked_no', { trip_item_id: pendingBook.id })
                  setPendingBook(null)
                  setAskBooked(false)
                }}
              >
                Pas encore
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <p className="text-[11px] text-slate-400">
          Glisse pour réordonner · statut utilisateur ≠ disponibilité offre
        </p>
      ) : null}

      {detailCard ? (
        <ActivityDetailSheet
          card={detailCard}
          alreadyAdded
          showBook={
            detailItem?.status !== 'validated' &&
            detailItem?.status !== 'booked' &&
            detailItem?.status !== 'skipped'
          }
          addLabel={ACTIVITY_ADD_TO_PLANNER_FR}
          onBook={() => {
            if (detailItem) onBook(detailItem)
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
      ) : null}
    </div>
  )
}
