/**
 * Planner / MyTrip étape Activités — DnD ordre + Viator return prompt (Lot E).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ACTIVITY_ADD_LABEL_FR,
  ACTIVITY_BOOK_VIATOR_FR,
  ACTIVITY_BOOKED_PROMPT_FR,
  ACTIVITY_BROWSE_CATALOG_FR,
  ACTIVITY_SKIP_LABEL_FR,
  ACTIVITY_VALIDATE_LABEL_FR,
  AVAILABILITY_STATE_LABEL_FR,
  activitiesCityPath,
  canonicalViatorProductUrl,
  detectEventPlatform,
  pickTripItemOwner,
  reorderKeysMoving,
  tripItemStatusLabelFr,
  type AvailabilityState,
  type TripItemStatus,
} from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'
import { rememberTrip } from '../utils/tripRecovery'

type ItemRow = {
  id: string
  status?: string
  availability_state?: string
  sort_key?: string
  day_offset?: number
  inherited?: boolean
  meta?: Record<string, unknown>
  places?: { name?: string } | null
}

export function ActivityStepPanel(props: {
  draftToken?: string | null
  plannedTripId?: string | null
  citySlug?: string | null
  enabled?: boolean
  surface?: string
}) {
  const { draftToken, plannedTripId, enabled = true, surface = 'my_trip' } = props
  const owner = useMemo(
    () =>
      pickTripItemOwner({
        draftToken,
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

  const load = useCallback(async () => {
    if (!owner.draft_token && !owner.planned_trip_id) return
    setLoading(true)
    setError(null)
    try {
      const res = await getApiClient().listTripItems(owner)
      setItems((res.items || []) as ItemRow[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [owner])

  useEffect(() => {
    if (enabled) void load()
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
        ...owner,
        platform: 'web',
        surface,
      })
      track('add', { product_code: raw.product_code })
      setPickerOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ajout impossible')
    }
  }

  const patch = async (id: string, body: Record<string, unknown>) => {
    await getApiClient().patchTripItem(id, {
      ...body,
      draft_token: owner.draft_token,
    })
    await load()
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
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Réordonnancement impossible')
    }
  }

  if (!enabled) {
    return (
      <p className="text-sm text-slate-500">Activités bientôt disponibles sur ce voyage.</p>
    )
  }

  const titleOf = (it: ItemRow) =>
    String(it.places?.name || it.meta?.title || 'Activité')

  const catalogHref = activitiesCityPath(props.citySlug || 'paris', {
    draftToken: draftToken || undefined,
    plannedTripId: plannedTripId || undefined,
  })

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
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
          onClick={() => void openSuggestions()}
          className="rounded-lg border border-slate-200 text-xs font-semibold px-3 py-2 min-h-[36px]"
        >
          {ACTIVITY_ADD_LABEL_FR}
        </button>
        <button
          type="button"
          onClick={() => void skipAll()}
          className="rounded-lg border border-slate-200 text-xs font-semibold px-3 py-2 min-h-[36px] text-slate-600"
        >
          {ACTIVITY_SKIP_LABEL_FR}
        </button>
      </div>

      {loading ? <p className="text-sm text-slate-500">Chargement…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

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
            <div className="flex justify-between gap-2">
              <p className="font-bold text-sm text-slate-900">
                {titleOf(it)}
                {it.inherited ? (
                  <span className="ml-2 text-[9px] font-bold text-primary-700 bg-orange-50 px-2 py-1 rounded-full">
                    Idée du groupe
                  </span>
                ) : null}
              </p>
              <span className="text-xs text-slate-500">
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
              {it.meta?.product_url ? (
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
            {suggestions.map((s) => (
              <button
                key={String(s.product_code)}
                type="button"
                className="w-full text-left rounded-xl border p-3 hover:bg-slate-50"
                onClick={() => void addProduct(s)}
              >
                <p className="font-semibold text-sm">{String(s.title || '')}</p>
                <p className="text-xs text-slate-500">
                  {s.price_from != null ? `dès ${s.price_from} €` : ''}
                </p>
              </button>
            ))}
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
    </div>
  )
}
