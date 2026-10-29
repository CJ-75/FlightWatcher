import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  boardLabelFr,
  type HotelUpsellOption,
  type MyTripDraft,
} from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'
import { HotelPhotoGallery } from './HotelPhotoGallery'

type Props = {
  draft: MyTripDraft
  token: string
  onUpdated: (row: MyTripDraft) => void
  onDone: () => void
}

type SortKey = 'price' | 'rating' | 'distance'

function hotelKey(h: HotelUpsellOption, idx = 0) {
  return String(h.id || h.hotel_id || idx)
}

function hotelIdOf(h: HotelUpsellOption | Record<string, unknown> | null | undefined) {
  if (!h) return ''
  return String((h as HotelUpsellOption).id || (h as HotelUpsellOption).hotel_id || '')
}

/** Keep initial order; refresh prices from live; drop unavailable. */
function revalidateSnapshot(
  snapshot: HotelUpsellOption[],
  live: HotelUpsellOption[],
): HotelUpsellOption[] {
  if (!snapshot.length) return live
  const byId = new Map<string, HotelUpsellOption>()
  for (const h of live) {
    const id = hotelIdOf(h)
    if (id) byId.set(id, h)
  }
  const kept: HotelUpsellOption[] = []
  for (const h of snapshot) {
    const id = hotelIdOf(h)
    const fresh = id ? byId.get(id) : undefined
    if (fresh) kept.push({ ...h, ...fresh })
  }
  return kept
}

function readSnapshot(payload: Record<string, unknown>): HotelUpsellOption[] {
  const raw = payload.compose_options
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is HotelUpsellOption => Boolean(x && typeof x === 'object'))
    .filter((h) => hotelIdOf(h))
    .slice(0, 12)
}

function formatDistance(m?: number | null) {
  if (m == null || Number.isNaN(Number(m))) return null
  const n = Number(m)
  if (n < 1000) return `${Math.round(n)} m du centre`
  return `${(n / 1000).toFixed(1)} km du centre`
}

function mapsQuery(name: string, city?: string | null) {
  return [name, city].filter(Boolean).join(', ')
}

function mapsSearchUrl(name: string, city?: string | null) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    mapsQuery(name, city),
  )}`
}

function mapsEmbedUrl(name: string, city?: string | null) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(
    mapsQuery(name, city),
  )}&z=15&output=embed`
}

function StarRow({ stars }: { stars?: number | null }) {
  const n = Math.min(5, Math.max(0, Math.round(Number(stars) || 0)))
  if (!n) return null
  return (
    <span className="text-amber-500 tracking-tight" aria-label={`${n} étoiles`}>
      {'★'.repeat(n)}
    </span>
  )
}

function ratingLabel(rating?: number | null) {
  if (rating == null || Number.isNaN(Number(rating))) return null
  const r = Number(rating)
  if (r >= 9) return 'Exceptionnel'
  if (r >= 8.5) return 'Excellent'
  if (r >= 8) return 'Très bien'
  if (r >= 7) return 'Bien'
  return 'Correct'
}

function hotelAdvantages(h: HotelUpsellOption): string[] {
  const out: string[] = []
  const board = boardLabelFr(h.board)
  if (board) out.push(board)
  if (h.refundable) out.push('Annulation flexible')
  const dist = formatDistance(h.distance_m)
  if (dist) out.push(dist)
  if (h.stars != null && Number(h.stars) >= 4) {
    out.push(`${Math.round(Number(h.stars))} étoiles`)
  }
  if (h.rating != null && Number(h.rating) >= 8) {
    out.push(`Note voyageurs ${Number(h.rating).toFixed(1)}/10`)
  }
  if (h.review_count != null && Number(h.review_count) >= 200) {
    out.push(`${Number(h.review_count).toLocaleString('fr-FR')} avis`)
  }
  return out
}

export function MyTripHotelCompose({ draft, token, onUpdated, onDone }: Props) {
  const payload = (draft.payload || {}) as Record<string, unknown>
  const flight = (payload.flight || {}) as Record<string, unknown>
  const currentHotel = (payload.hotel || draft.hotel) as Record<string, unknown> | null

  const destIata = String(
    draft.dest_iata || payload.destination || flight.destination_iata || '',
  ).toUpperCase()
  const checkin = String(draft.out_date || (payload.dates as any)?.outbound || '').slice(0, 10)
  const checkout = String(draft.ret_date || (payload.dates as any)?.inbound || '').slice(0, 10)
  const adults = Number(draft.adults || payload.adults || 2)
  const flightPp = Number(flight.price_pp || 0)

  const [options, setOptions] = useState<HotelUpsellOption[]>([])
  const [selected, setSelected] = useState<HotelUpsellOption | null>(null)
  const [sort, setSort] = useState<SortKey>('price')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nightCap, setNightCap] = useState<number | null>(null)
  const [cityLabel, setCityLabel] = useState<string | null>(null)
  const [description, setDescription] = useState<string | null>(null)
  const detailRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!destIata || !checkin || !checkout) {
        setError('Destination ou dates manquantes')
        setLoading(false)
        return
      }
      setLoading(true)
      setError(null)

      const cityHint =
        String(
          draft.city_name ||
            payload.compose_city ||
            (payload as { city?: string }).city ||
            '',
        ).trim() || undefined
      const snapshot = readSnapshot(payload)
      const lookupItem = {
        iata: destIata,
        checkin,
        checkout,
        participants: adults,
        flight_pp: flightPp || undefined,
        city: cityHint,
      }
      const liveItem = { ...lookupItem, live: true }

      const pickOpts = (r: {
        options?: HotelUpsellOption[] | null
        hotel?: HotelUpsellOption | null
      }) =>
        r?.options?.length ? r.options : r?.hotel ? [r.hotel] : []

      const applyOpts = (
        opts: HotelUpsellOption[],
        meta?: { night_cap?: number | null; city?: string | null },
      ) => {
        setOptions(opts)
        if (meta?.night_cap != null) setNightCap(Number(meta.night_cap))
        if (meta?.city) setCityLabel(String(meta.city))
        else if (cityHint) setCityLabel(cityHint)
        const curId = hotelIdOf(currentHotel)
        const match = opts.find((h) => hotelIdOf(h) === curId)
        setSelected(match || opts[0] || null)
      }

      const persistSnapshot = async (
        opts: HotelUpsellOption[],
        meta?: { night_cap?: number | null; city?: string | null },
      ) => {
        if (!opts.length || !token) return
        try {
          const row = await getApiClient().saveMyTripComposeOptions(token, {
            options: opts,
            night_cap: meta?.night_cap ?? nightCap,
            city: meta?.city ?? cityHint ?? null,
          })
          if (!cancelled) onUpdated(row)
        } catch (e) {
          console.warn('[MyTripHotelCompose] persist snapshot failed', e)
        }
      }

      const reasonError = (reason: string, status?: string) =>
        reason === 'not_in_catalogue'
          ? 'Cette destination n’a pas encore d’hôtels — réessaie dans un instant'
          : reason === 'bad_dates'
            ? 'Dates invalides pour l’hôtel'
            : reason === 'empty_pool' ||
                reason === 'no_rates' ||
                status === 'no_rates'
              ? 'Pas de dispo hôtel pour ces dates'
              : reason === 'rate_limited' || reason === 'too_many_fetches'
                ? 'Trop de recherches hôtel — réessaie dans un moment'
                : 'Aucun hôtel disponible pour cette ville / ces dates'

      const loadCached = async () => {
        try {
          const cached = (
            await getApiClient().lookupHotelUpsell([lookupItem])
          ).results?.[0]
          const opts = pickOpts(cached || {})
          return {
            opts,
            night_cap: cached?.night_cap ?? null,
            city: cached?.city ?? null,
            status: cached?.status,
            reason: cached?.reason,
          }
        } catch {
          return {
            opts: [] as HotelUpsellOption[],
            night_cap: null,
            city: null,
            status: undefined,
            reason: undefined,
          }
        }
      }

      const pollJob = async (jobId: string) => {
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 1200))
          if (cancelled) return null
          try {
            const job = await getApiClient().getHotelUpsellJob(jobId)
            if (
              job.status === 'ready' ||
              job.status === 'error' ||
              job.status === 'no_rates'
            ) {
              return job
            }
          } catch {
            return null
          }
        }
        return null
      }

      const fetchLive = async () => {
        let result = await getApiClient().fetchHotelUpsell(liveItem)
        if (result?.status === 'pending' && result.job_id) {
          const job = await pollJob(result.job_id)
          if (job) {
            result = {
              ...result,
              status: job.status,
              options: job.options,
              night_cap: job.night_cap ?? result.night_cap,
              reason: (job as { error?: string }).error || result.reason,
            }
          } else if (!cancelled) {
            try {
              result = await getApiClient().fetchHotelUpsell(liveItem)
              if (result?.status === 'pending' && result.job_id) {
                const job2 = await pollJob(result.job_id)
                if (job2) {
                  result = {
                    ...result,
                    status: job2.status,
                    options: job2.options,
                    night_cap: job2.night_cap ?? result.night_cap,
                    reason:
                      (job2 as { error?: string }).error || result.reason,
                  }
                }
              }
            } catch {
              /* keep prior */
            }
          }
        }
        return result
      }

      try {
        const snapCap =
          payload.compose_night_cap != null
            ? Number(payload.compose_night_cap)
            : null
        if (snapshot.length) {
          applyOpts(snapshot, { night_cap: snapCap, city: cityHint })
          setLoading(false)
        } else {
          const cached = await loadCached()
          if (cancelled) return
          if (cached.opts.length) {
            applyOpts(cached.opts, cached)
            setLoading(false)
          }
        }

        let result: Awaited<
          ReturnType<ReturnType<typeof getApiClient>['fetchHotelUpsell']>
        > | null = null
        try {
          result = await fetchLive()
        } catch (e) {
          if (snapshot.length) {
            if (!cancelled) setLoading(false)
            return
          }
          const cached = await loadCached()
          if (cached.opts.length) {
            applyOpts(cached.opts, cached)
            await persistSnapshot(cached.opts, cached)
            return
          }
          throw e
        }

        if (cancelled) return
        const liveOpts = pickOpts(result || {})
        let opts: HotelUpsellOption[] = []

        if (snapshot.length && liveOpts.length) {
          opts = revalidateSnapshot(snapshot, liveOpts)
          if (!opts.length) opts = liveOpts
        } else if (liveOpts.length) {
          opts = liveOpts
        } else if (snapshot.length) {
          opts = snapshot
        } else {
          const again = await loadCached()
          opts = again.opts
          if (again.night_cap != null && result) {
            result = { ...result, night_cap: again.night_cap, city: again.city }
          }
        }

        if (opts.length) {
          const meta = {
            night_cap: result?.night_cap ?? snapCap,
            city: result?.city ?? cityHint,
          }
          applyOpts(opts, meta)
          setError(null)
          await persistSnapshot(opts, meta)
        } else {
          setError(
            reasonError(
              String(result?.reason || result?.status || ''),
              result?.status,
            ),
          )
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('[MyTripHotelCompose] hotel load failed', e)
          if (snapshot.length) {
            applyOpts(snapshot, {
              night_cap:
                payload.compose_night_cap != null
                  ? Number(payload.compose_night_cap)
                  : null,
              city: cityHint,
            })
            setError(null)
          } else {
            const again = await loadCached()
            if (again.opts.length) {
              applyOpts(again.opts, again)
              await persistSnapshot(again.opts, again)
              setError(null)
            } else {
              setError('Impossible de charger les hôtels')
            }
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destIata, checkin, checkout, adults, flightPp, token])

  useEffect(() => {
    const id = hotelIdOf(selected)
    if (!id) {
      setDescription(null)
      return
    }
    let cancelled = false
    setDescription(null)
    void getApiClient()
      .getHotelGallery(id, { language: 'fr' })
      .then((g) => {
        if (!cancelled) {
          const d = typeof g.description === 'string' ? g.description.trim() : ''
          setDescription(d || null)
        }
      })
      .catch(() => {
        if (!cancelled) setDescription(null)
      })
    return () => {
      cancelled = true
    }
  }, [selected])

  const sorted = useMemo(() => {
    const list = [...options]
    list.sort((a, b) => {
      if (sort === 'rating') {
        return (Number(b.rating) || 0) - (Number(a.rating) || 0)
      }
      if (sort === 'distance') {
        const da = a.distance_m == null ? 1e9 : Number(a.distance_m)
        const db = b.distance_m == null ? 1e9 : Number(b.distance_m)
        return da - db
      }
      return (Number(a.hotel_pp) || 0) - (Number(b.hotel_pp) || 0)
    })
    return list
  }, [options, sort])

  const confirm = async (hotel?: HotelUpsellOption | null) => {
    const pick = hotel || selected
    if (!pick) return
    setSaving(true)
    setError(null)
    try {
      const hotelPp = Number(pick.hotel_pp || 0)
      const totalPp = Math.round(flightPp + hotelPp)
      const row = await getApiClient().updateMyTripHotel(token, {
        hotel: {
          id: pick.id || pick.hotel_id,
          hotel_id: pick.hotel_id || pick.id,
          name: pick.name,
          stars: pick.stars,
          rating: pick.rating,
          photo: pick.photo || pick.thumbnail,
          board: pick.board,
          public_hotel_price: pick.public_hotel_price,
          hotel_pp: pick.hotel_pp,
          distance_m: pick.distance_m,
          refundable: pick.refundable,
        },
        price_per_person: totalPp,
      })
      onUpdated(row)
      onDone()
    } catch {
      setError('Impossible d’enregistrer l’hôtel')
    } finally {
      setSaving(false)
    }
  }

  const packTotal = (h: HotelUpsellOption) =>
    Math.round(flightPp + Number(h.hotel_pp || 0))

  const selectHotel = (h: HotelUpsellOption) => {
    setSelected(h)
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }

  const advantages = selected ? hotelAdvantages(selected) : []
  const rLabel = selected ? ratingLabel(selected.rating) : null

  return (
    <section className="w-full">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#FF385C]">
            Composer le voyage
          </p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            {cityLabel ? `Choisis ton hôtel à ${cityLabel}` : 'Choisis ton hôtel'}
          </h2>
          <p className="text-sm text-slate-600 mt-1.5 max-w-2xl">
            Sélectionne à gauche — le détail s’affiche à droite
            {flightPp > 0 ? ` · vol fixe ${Math.round(flightPp)} € / pers.` : ''}
            {nightCap != null ? ` · confort ≤ ~${Math.round(nightCap)} €/nuit` : ''}.
          </p>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="self-start sm:self-auto text-sm font-semibold text-slate-500 hover:text-slate-900 min-h-[40px]"
        >
          Plus tard
        </button>
      </div>

      {!loading && options.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {(
            [
              ['price', 'Meilleur prix'],
              ['rating', 'Mieux notés'],
              ['distance', 'Plus proches'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSort(key)}
              className={`rounded-full px-3.5 py-2 text-xs font-bold min-h-[40px] transition-colors ${
                sort === key
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
          <span className="text-xs font-semibold text-slate-400 ml-1">
            {options.length} logement{options.length > 1 ? 's' : ''}
          </span>
        </div>
      ) : null}

      {error ? (
        <p className="mb-4 text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
          {error}
        </p>
      ) : null}

      <div className="lg:grid lg:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.35fr)] lg:gap-8 lg:items-start">
        {/* Liste */}
        <div className="min-w-0">
          {loading ? (
            <ul className="space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <li
                  key={i}
                  className="h-[108px] rounded-2xl bg-gradient-to-r from-slate-100 via-white to-slate-100 bg-[length:200%_100%] animate-[shimmer_2s_infinite] border border-slate-100"
                />
              ))}
            </ul>
          ) : null}

          {!loading && sorted.length > 0 ? (
            <ul className="space-y-2.5 max-h-[none] lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto lg:pr-1 lg:scroll-smooth">
              {sorted.map((h, idx) => {
                const id = hotelKey(h, idx)
                const active = hotelIdOf(selected) === hotelIdOf(h)
                const dist = formatDistance(h.distance_m)
                const board = boardLabelFr(h.board)
                const total = packTotal(h)
                const photo = h.photo || h.thumbnail

                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => selectHotel(h)}
                      className={`w-full text-left flex gap-3 rounded-2xl border bg-white p-2.5 sm:p-3 transition-all ${
                        active
                          ? 'border-slate-900 shadow-[0_0_0_1px_#111827]'
                          : 'border-slate-200 hover:border-slate-400 hover:shadow-sm'
                      }`}
                    >
                      <div className="relative w-[104px] sm:w-[120px] h-[96px] shrink-0 rounded-xl overflow-hidden bg-slate-100">
                        {photo ? (
                          <img
                            src={photo}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-slate-300 to-slate-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 flex flex-col py-0.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-bold text-slate-900 text-sm sm:text-[15px] leading-snug line-clamp-2">
                            {h.name || 'Hôtel'}
                          </p>
                          <p className="shrink-0 text-base font-extrabold text-slate-900 tabular-nums">
                            {total} €
                          </p>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <StarRow stars={h.stars} />
                          {h.rating != null ? (
                            <span>
                              {Number(h.rating).toFixed(1)}/10
                              {h.review_count != null && h.review_count > 0
                                ? ` · ${Number(h.review_count).toLocaleString('fr-FR')} avis`
                                : ''}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                          {[board, dist].filter(Boolean).join(' · ') || '—'}
                        </p>
                        <p className="mt-auto pt-1 text-[10px] font-semibold text-slate-400">
                          / pers. vol + hôtel
                          {h.hotel_pp != null
                            ? ` · hôtel ${Math.round(Number(h.hotel_pp))} €`
                            : ''}
                        </p>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}

          {!loading && !sorted.length && !error ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              Aucun hôtel pour ces dates.
            </p>
          ) : null}
        </div>

        {/* Fiche détail */}
        <aside
          ref={detailRef}
          className="mt-8 lg:mt-0 min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto scroll-mt-20"
        >
          {selected ? (
            <motion.div
              key={hotelIdOf(selected)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden"
            >
              <div className="p-4 sm:p-5 space-y-5">
                <HotelPhotoGallery
                  hotelId={hotelIdOf(selected)}
                  seedPhoto={selected.photo || selected.thumbnail}
                  alt={selected.name || 'Hôtel'}
                  hotelName={selected.name}
                  cityLabel={cityLabel || undefined}
                  embedded
                />

                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                        {selected.name || 'Hôtel'}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <StarRow stars={selected.stars} />
                        {formatDistance(selected.distance_m) ? (
                          <span>{formatDistance(selected.distance_m)}</span>
                        ) : null}
                        {cityLabel ? <span>· {cityLabel}</span> : null}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-black text-slate-900 tabular-nums leading-none">
                        {packTotal(selected)} €
                      </p>
                      <p className="text-[11px] font-semibold text-slate-400 mt-1">
                        / pers. vol + hôtel
                      </p>
                    </div>
                  </div>
                </div>

                {/* Avis */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3.5 flex gap-4 items-center">
                  <div className="shrink-0 w-14 h-14 rounded-2xl bg-slate-900 text-white flex flex-col items-center justify-center">
                    <span className="text-lg font-black tabular-nums leading-none">
                      {selected.rating != null
                        ? Number(selected.rating).toFixed(1)
                        : '—'}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-wide opacity-70 mt-0.5">
                      /10
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-extrabold text-slate-900">
                      {rLabel || 'Avis voyageurs'}
                    </p>
                    <p className="text-sm text-slate-600 mt-0.5">
                      {selected.review_count != null && selected.review_count > 0
                        ? `Basé sur ${Number(selected.review_count).toLocaleString('fr-FR')} avis`
                        : 'Note moyenne des voyageurs'}
                    </p>
                  </div>
                </div>

                {/* Avantages */}
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900 mb-2.5">
                    Ce qui est inclus
                  </h4>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {advantages.length ? (
                      advantages.map((a) => (
                        <li
                          key={a}
                          className="flex items-start gap-2 text-sm text-slate-700 rounded-xl border border-slate-100 bg-white px-3 py-2.5"
                        >
                          <span
                            className="mt-0.5 text-[#FF385C] font-bold"
                            aria-hidden
                          >
                            ✓
                          </span>
                          <span className="font-medium">{a}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-sm text-slate-500 col-span-full">
                        Détails de l’offre à confirmer à la réservation.
                      </li>
                    )}
                    {selected.hotel_pp != null ? (
                      <li className="flex items-start gap-2 text-sm text-slate-700 rounded-xl border border-slate-100 bg-white px-3 py-2.5">
                        <span className="mt-0.5 text-[#FF385C] font-bold" aria-hidden>
                          ✓
                        </span>
                        <span className="font-medium">
                          Hôtel {Math.round(Number(selected.hotel_pp))} € / pers. pour
                          le séjour
                        </span>
                      </li>
                    ) : null}
                  </ul>
                </div>

                {description ? (
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900 mb-2">
                      À propos
                    </h4>
                    <p className="text-sm text-slate-600 leading-relaxed line-clamp-6 whitespace-pre-line">
                      {description}
                    </p>
                  </div>
                ) : null}

                {/* Maps */}
                {selected.name ? (
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      <h4 className="text-sm font-extrabold text-slate-900">
                        Emplacement
                      </h4>
                      <a
                        href={mapsSearchUrl(selected.name, cityLabel)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-bold text-[#FF385C] hover:underline underline-offset-2"
                      >
                        Ouvrir dans Maps →
                      </a>
                    </div>
                    <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 aspect-[16/10] sm:aspect-[2/1]">
                      <iframe
                        title={`Carte — ${selected.name}`}
                        src={mapsEmbedUrl(selected.name, cityLabel)}
                        className="w-full h-full border-0"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </div>
                    {formatDistance(selected.distance_m) ? (
                      <p className="text-xs text-slate-500 mt-2 font-medium">
                        {formatDistance(selected.distance_m)}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void confirm(selected)}
                  className="w-full rounded-2xl bg-[#FF385C] hover:bg-[#E31C5F] text-white font-bold py-3.5 min-h-[52px] disabled:opacity-50 shadow-sm transition-colors"
                >
                  {saving
                    ? '…'
                    : `Choisir cet hôtel · ${packTotal(selected)} € / pers.`}
                </button>
              </div>
            </motion.div>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-16 text-center text-sm text-slate-500">
              {loading
                ? 'Chargement des hôtels…'
                : 'Sélectionne un hôtel dans la liste'}
            </div>
          )}
        </aside>
      </div>
    </section>
  )
}
