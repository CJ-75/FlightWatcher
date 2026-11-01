/**
 * Étape ④ Adresses — liste + import liens (parité ActivityStepPanel).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  evaluateOpening,
  RESTAURANT_ADD_LABEL_FR,
  RESTAURANT_BUDGET_HINT_FR,
  RESTAURANT_EMPTY_BODY_FR,
  RESTAURANT_EMPTY_TITLE_FR,
  RESTAURANT_MAPS_LABEL_FR,
  RESTAURANT_SKIP_LABEL_FR,
  RESTAURANT_VALIDATE_LABEL_FR,
  tripItemStatusLabelFr,
} from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'
import { LinkImportPanel } from './LinkImportPanel'

type ItemRow = {
  id: string
  status?: string
  item_type?: string
  moment?: string | null
  day_offset?: number
  availability_state?: string
  meta?: Record<string, unknown>
  places?: {
    id?: string
    name?: string
    restaurant_details?: { opening_hours_raw?: string; cuisine?: string; website?: string; phone?: string }
  } | null
}

export function RestaurantStepPanel(props: {
  draftToken?: string | null
  plannedTripId?: string | null
  citySlug?: string | null
  cityLabel?: string | null
  dateIso?: string | null
  enabled?: boolean
  hotelLat?: number | null
  hotelLng?: number | null
}) {
  const {
    draftToken,
    plannedTripId,
    enabled = true,
    citySlug,
    cityLabel,
    dateIso,
  } = props
  const [items, setItems] = useState<ItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [pendingPaste, setPendingPaste] = useState('')

  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return
    try {
      const raw = sessionStorage.getItem('fw_pending_address_links')
      if (!raw) return
      const parsed = JSON.parse(raw) as { text?: string; at?: number }
      if (!parsed.text) return
      if (parsed.at && Date.now() - parsed.at > 7 * 24 * 3600 * 1000) {
        sessionStorage.removeItem('fw_pending_address_links')
        return
      }
      setPendingPaste(parsed.text)
      setImportOpen(true)
      sessionStorage.removeItem('fw_pending_address_links')
    } catch {
      /* ignore */
    }
  }, [])

  const load = useCallback(async () => {
    if (!draftToken && !plannedTripId) return
    setLoading(true)
    setError(null)
    try {
      const res = await getApiClient().listTripItems({
        draft_token: draftToken || undefined,
        planned_trip_id: plannedTripId || undefined,
      })
      const all = (res.items || []) as ItemRow[]
      setItems(all.filter((i) => i.item_type === 'restaurant'))
      setSkipped(all.some((i) => i.item_type === 'restaurant' && i.status === 'skipped'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [draftToken, plannedTripId])

  useEffect(() => {
    if (enabled) void load()
  }, [enabled, load])

  const city = cityLabel || citySlug || 'ta ville'

  const mapsSearchUrl = useMemo(() => {
    const q = encodeURIComponent(`restaurants near ${city}`)
    if (props.hotelLat != null && props.hotelLng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=&center=${props.hotelLat},${props.hotelLng}`
    }
    return `https://www.google.com/maps/search/?api=1&query=${q}`
  }, [city, props.hotelLat, props.hotelLng])

  const skipRestaurants = async () => {
    try {
      // Synthetic skip item via confirm with a user place is heavy —
      // mark local skipped + patch any idea items; create skip meta on first restaurant-less trip via activity skip pattern
      await getApiClient().addTripItem({
        product_code: `skip-resto-${Date.now()}`,
        title: RESTAURANT_SKIP_LABEL_FR,
        draft_token: draftToken || undefined,
        planned_trip_id: plannedTripId || undefined,
        // backend may treat as activity — also set via patch after
        platform: 'web',
        surface: 'restaurants',
        meta: { skip_restaurants: true },
      })
    } catch {
      /* optional */
    }
    setSkipped(true)
  }

  if (!enabled) {
    return (
      <p className="text-sm text-muted py-4">Adresses bientôt disponibles.</p>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-bold text-muted">{RESTAURANT_BUDGET_HINT_FR}</p>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="text-sm font-semibold text-red-600">{error}</p>
      ) : null}

      {!loading && items.filter((i) => i.status !== 'skipped').length === 0 ? (
        <div className="rounded-3xl border border-orange-100 bg-gradient-to-br from-[#FFF8F3] to-white p-5 sm:p-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#E85A28] text-white flex items-center justify-center text-xl shadow-md shadow-orange-500/25 mb-3">
            🍽
          </div>
          <h3 className="text-lg font-extrabold text-ink tracking-tight">
            {RESTAURANT_EMPTY_TITLE_FR(String(city))}
          </h3>
          <p className="text-sm text-muted mt-1.5 max-w-md leading-relaxed">
            {RESTAURANT_EMPTY_BODY_FR}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="app-btn-primary rounded-xl px-4 py-2.5 text-sm min-h-[44px]"
            >
              {RESTAURANT_ADD_LABEL_FR}
            </button>
            <a
              href={mapsSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-bold text-ink-soft hover:bg-primary-50 min-h-[44px] inline-flex items-center"
            >
              Autour de ton hôtel
            </a>
            <button
              type="button"
              onClick={() => void skipRestaurants()}
              className="rounded-xl px-3 py-2.5 text-sm font-bold text-muted hover:text-ink min-h-[44px]"
            >
              {RESTAURANT_SKIP_LABEL_FR}
            </button>
          </div>
          <p className="text-[11px] text-muted mt-3 leading-snug">
            Astuce mobile : Instagram ou Google Maps → Partager → FlightWatcher.
          </p>
        </div>
      ) : null}

      {importOpen || items.some((i) => i.status !== 'skipped') ? (
        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-sm font-extrabold text-ink">Ajouter</p>
            <button
              type="button"
              className="text-xs font-bold text-primary-700"
              onClick={() => setImportOpen((o) => !o)}
            >
              {importOpen ? 'Masquer' : RESTAURANT_ADD_LABEL_FR}
            </button>
          </div>
          {importOpen ? (
            <LinkImportPanel
              draftToken={draftToken}
              plannedTripId={plannedTripId}
              citySlug={citySlug}
              dateIso={dateIso}
              compact
              initialText={pendingPaste}
              onAdded={() => void load()}
            />
          ) : null}
        </div>
      ) : null}

      <ul className="space-y-3">
        {items
          .filter((i) => i.status !== 'skipped')
          .map((item) => {
            const name = item.places?.name || 'Restaurant'
            const cuisine = item.places?.restaurant_details?.cuisine
            const hours = item.places?.restaurant_details?.opening_hours_raw
            const chip = dateIso
              ? evaluateOpening({
                  openingHoursRaw: hours,
                  dateIso,
                  moment: (item.moment as 'evening') || 'evening',
                })
              : null
            const mapsQ = encodeURIComponent(name)
            const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQ}`
            return (
              <li
                key={item.id}
                className="rounded-2xl border border-line bg-white p-4 shadow-soft"
              >
                <div className="flex gap-3">
                  <div
                    className="w-10 h-10 rounded-xl bg-orange-50 text-primary-600 flex items-center justify-center shrink-0"
                    aria-hidden
                  >
                    🍽
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-extrabold text-ink text-[15px]">{name}</h4>
                      {item.moment ? (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted bg-slate-100 px-2 py-0.5 rounded-full">
                          {item.moment}
                        </span>
                      ) : null}
                    </div>
                    {cuisine ? (
                      <p className="text-sm text-muted mt-0.5">{cuisine}</p>
                    ) : null}
                    {chip ? (
                      <span
                        className={`inline-flex mt-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          chip.status === 'open'
                            ? 'bg-emerald-50 text-emerald-800'
                            : chip.status === 'closed'
                              ? 'bg-amber-50 text-amber-900'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {chip.label}
                      </span>
                    ) : null}
                    <p className="text-xs text-muted mt-1">
                      {tripItemStatusLabelFr((item.status as 'idea') || 'idea')}
                      {item.availability_state === 'needs_check'
                        ? ' · À vérifier pour tes nouvelles dates'
                        : ''}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.status === 'idea' ? (
                        <button
                          type="button"
                          className="text-sm font-bold bg-ink text-white rounded-xl px-3 py-2"
                          onClick={() =>
                            void getApiClient()
                              .patchTripItem(item.id, { status: 'validated' })
                              .then(() => load())
                          }
                        >
                          {RESTAURANT_VALIDATE_LABEL_FR}
                        </button>
                      ) : null}
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-bold text-primary-700 px-2 py-2"
                      >
                        {RESTAURANT_MAPS_LABEL_FR}
                      </a>
                      {item.places?.restaurant_details?.website ||
                      item.places?.restaurant_details?.phone ? (
                        <span className="text-sm font-bold text-ink-soft px-2 py-2">
                          {item.places.restaurant_details.website ? (
                            <a
                              href={item.places.restaurant_details.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline"
                            >
                              Site
                            </a>
                          ) : null}
                          {item.places.restaurant_details.phone
                            ? ` · ${item.places.restaurant_details.phone}`
                            : null}
                        </span>
                      ) : null}
                      {item.places?.id ? (
                        <button
                          type="button"
                          className="text-xs font-bold text-muted px-2 py-2"
                          onClick={() =>
                            void getApiClient().reportPlace({
                              place_id: item.places!.id!,
                              reason: 'closed',
                            })
                          }
                        >
                          C’était fermé ?
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
      </ul>

      {skipped && items.filter((i) => i.status !== 'skipped').length === 0 ? (
        <p className="text-sm text-muted font-medium">Pas de restaurant prévu pour ce voyage.</p>
      ) : null}
    </div>
  )
}
