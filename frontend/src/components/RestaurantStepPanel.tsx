/**
 * Étape ④ Adresses — restos autour de l’hôtel (sans import de liens).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  evaluateOpening,
  RESTAURANT_BUDGET_HINT_FR,
  RESTAURANT_EMPTY_BODY_FR,
  RESTAURANT_EMPTY_TITLE_FR,
  RESTAURANT_MAPS_LABEL_FR,
  RESTAURANT_NEAR_HOTEL_LABEL_FR,
  RESTAURANT_NEEDS_HOTEL_FR,
  RESTAURANT_VALIDATE_LABEL_FR,
  tripItemStatusLabelFr,
} from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'

type ItemRow = {
  id: string
  status?: string
  item_type?: string
  moment?: string | null
  day_offset?: number
  availability_state?: string
  inherited?: boolean
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
  /** Restos autour de l’hôtel — requires a booked / external hotel */
  hotelReady?: boolean
  hotelLat?: number | null
  hotelLng?: number | null
}) {
  const {
    draftToken,
    plannedTripId,
    enabled = true,
    hotelReady = true,
    citySlug,
    cityLabel,
    dateIso,
  } = props
  const [items, setItems] = useState<ItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [draftToken, plannedTripId])

  useEffect(() => {
    if (enabled && hotelReady) void load()
  }, [enabled, hotelReady, load])

  const city = cityLabel || citySlug || 'ta ville'

  const mapsSearchUrl = useMemo(() => {
    const q = encodeURIComponent(`restaurants near ${city}`)
    if (props.hotelLat != null && props.hotelLng != null) {
      return `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=&center=${props.hotelLat},${props.hotelLng}`
    }
    return `https://www.google.com/maps/search/?api=1&query=${q}`
  }, [city, props.hotelLat, props.hotelLng])

  if (!enabled) {
    return (
      <p className="text-sm text-muted py-4">Adresses bientôt disponibles.</p>
    )
  }

  if (!hotelReady) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3.5 py-3">
          <p className="text-sm font-extrabold text-ink tracking-tight">
            Après ton hôtel
          </p>
          <p className="mt-1 text-xs text-muted leading-snug">
            {RESTAURANT_NEEDS_HOTEL_FR}
          </p>
        </div>
      </div>
    )
  }

  const visible = items.filter((i) => i.status !== 'skipped')

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <p className="text-xs font-bold text-muted shrink-0">{RESTAURANT_BUDGET_HINT_FR}</p>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="text-sm font-semibold text-red-600">
          {/^auth_required$/i.test(error)
            ? 'Connecte-toi pour gérer les adresses de ce voyage.'
            : /^[a-z][a-z0-9_]*$/i.test(error) && error.includes('_')
              ? 'Impossible de charger les adresses pour le moment.'
              : error}
        </p>
      ) : null}

      {!loading && visible.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center rounded-xl border border-orange-100 bg-gradient-to-br from-[#FFF8F3] to-white px-3.5 py-3">
          <h3 className="text-sm font-extrabold text-ink tracking-tight">
            {RESTAURANT_EMPTY_TITLE_FR(String(city))}
          </h3>
          <p className="text-xs text-muted mt-1 max-w-md leading-snug">
            {RESTAURANT_EMPTY_BODY_FR}
          </p>
          <div className="mt-2.5">
            <a
              href={mapsSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="app-btn-primary rounded-lg px-3 py-2 text-xs min-h-[36px] inline-flex items-center"
            >
              {RESTAURANT_NEAR_HOTEL_LABEL_FR}
            </a>
          </div>
        </div>
      ) : null}

      {visible.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <a
            href={mapsSearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-bold text-ink-soft hover:bg-primary-50 min-h-[44px]"
          >
            {RESTAURANT_NEAR_HOTEL_LABEL_FR}
          </a>
        </div>
      ) : null}

      <ul className="space-y-3">
        {visible.map((item) => {
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
                    {item.inherited ? (
                      <span className="text-[9px] font-bold uppercase text-primary-700 bg-orange-50 px-2 py-1 rounded-full">
                        Idée du groupe
                      </span>
                    ) : null}
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
                    {!item.inherited && item.status === 'idea' ? (
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
    </div>
  )
}
