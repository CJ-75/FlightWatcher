import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
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

const spring = { type: 'spring' as const, stiffness: 340, damping: 30, mass: 0.55 }

function hotelKey(h: HotelUpsellOption, idx = 0) {
  return String(h.id || h.hotel_id || idx)
}

function formatDistance(m?: number | null) {
  if (m == null || Number.isNaN(Number(m))) return null
  const n = Number(m)
  if (n < 1000) return `${Math.round(n)} m du centre`
  return `${(n / 1000).toFixed(1)} km du centre`
}

function mapsUrl(name: string, city?: string | null) {
  const q = [name, city].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
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

function Signal({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-white/95 text-ink text-[11px] font-bold px-2.5 py-1 shadow-sm">
      {children}
    </span>
  )
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
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [detail, setDetail] = useState<HotelUpsellOption | null>(null)
  const [sort, setSort] = useState<SortKey>('price')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nightCap, setNightCap] = useState<number | null>(null)
  const [cityLabel, setCityLabel] = useState<string | null>(null)

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
      try {
        const cityHint =
          String(
            draft.city_name ||
              (payload as { city?: string }).city ||
              '',
          ).trim() || undefined
        const item = {
          iata: destIata,
          checkin,
          checkout,
          participants: adults,
          flight_pp: flightPp || undefined,
          city: cityHint,
          live: true,
        }

        const pickOpts = (r: {
          options?: HotelUpsellOption[] | null
          hotel?: HotelUpsellOption | null
        }) =>
          r?.options?.length
            ? r.options
            : r?.hotel
              ? [r.hotel]
              : []

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

        let result = await getApiClient().fetchHotelUpsell(item)
        if (result?.status === 'pending') {
          if (result.job_id) {
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
              result = await getApiClient().fetchHotelUpsell(item)
              if (result?.status === 'pending' && result.job_id) {
                const job2 = await pollJob(result.job_id)
                if (job2) {
                  result = {
                    ...result,
                    status: job2.status,
                    options: job2.options,
                    night_cap: job2.night_cap ?? result.night_cap,
                    reason: (job2 as { error?: string }).error || result.reason,
                  }
                }
              }
            }
          }
        }

        if (cancelled) return
        let opts = pickOpts(result || {})
        if (!opts.length && !cancelled) {
          try {
            const cached = (
              await getApiClient().lookupHotelUpsell([
                {
                  iata: destIata,
                  checkin,
                  checkout,
                  participants: adults,
                  flight_pp: flightPp || undefined,
                  city: cityHint,
                },
              ])
            ).results?.[0]
            const cachedOpts = pickOpts(cached || {})
            if (cachedOpts.length) {
              opts = cachedOpts
              result = cached || result
            }
          } catch {
            /* ignore */
          }
        }

        setOptions(opts)
        if (result?.night_cap != null) setNightCap(Number(result.night_cap))
        if (result?.city) setCityLabel(String(result.city))
        else if (cityHint) setCityLabel(cityHint)
        const curId = String(currentHotel?.id || currentHotel?.hotel_id || '')
        const match = opts.find(
          (h) => String(h.id || h.hotel_id || '') === curId,
        )
        setSelected(match || opts[0] || null)
        if (!opts.length) {
          const reason = String(result?.reason || result?.status || '')
          setError(
            reason === 'not_in_catalogue'
              ? 'Cette destination n’a pas encore d’hôtels — réessaie dans un instant'
              : reason === 'bad_dates'
                ? 'Dates invalides pour l’hôtel'
                : reason === 'empty_pool' ||
                    reason === 'no_rates' ||
                    result?.status === 'no_rates'
                  ? 'Pas de dispo hôtel pour ces dates'
                  : reason === 'rate_limited'
                    ? 'Trop de recherches hôtel — réessaie dans un moment'
                    : 'Aucun hôtel disponible pour cette ville / ces dates',
          )
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('[MyTripHotelCompose] hotel load failed', e)
          setError('Impossible de charger les hôtels')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destIata, checkin, checkout, adults, flightPp])

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

  const compareHotels = useMemo(
    () =>
      compareIds
        .map((id) => options.find((h, i) => hotelKey(h, i) === id))
        .filter(Boolean) as HotelUpsellOption[],
    [compareIds, options],
  )

  const toggleCompare = (h: HotelUpsellOption, idx: number) => {
    const id = hotelKey(h, idx)
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 3) return [...prev.slice(1), id]
      return [...prev, id]
    })
  }

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
      setDetail(null)
      onDone()
    } catch {
      setError('Impossible d’enregistrer l’hôtel')
    } finally {
      setSaving(false)
    }
  }

  const packTotal = (h: HotelUpsellOption) =>
    Math.round(flightPp + Number(h.hotel_pp || 0))

  return (
    <section className="relative rounded-3xl border border-line bg-gradient-to-b from-primary-50/80 via-white to-canvas overflow-hidden shadow-soft">
      {/* Hero header */}
      <div className="relative px-5 sm:px-7 pt-6 pb-5 border-b border-line/80">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 10% 0%, rgba(14,165,233,0.18), transparent 55%)',
          }}
          aria-hidden
        />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary-700/80">
            Composer le voyage
          </p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight mt-1">
            {cityLabel ? `Trouve ton hôtel à ${cityLabel}` : 'Choisis ton hôtel'}
          </h2>
          <p className="text-sm text-slate-600 mt-2 max-w-2xl leading-relaxed">
            Compare photos, note, distance et pension — le vol reste fixe
            {flightPp > 0 ? ` (${Math.round(flightPp)} € / pers.)` : ''}.
            {nightCap != null
              ? ` Gamme confort ≤ ~${Math.round(nightCap)} €/nuit.`
              : ''}
          </p>

          {!loading && options.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
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
                      ? 'bg-primary-500 text-white shadow-sm'
                      : 'bg-white text-ink-soft border border-line hover:border-primary-200'
                  }`}
                >
                  {label}
                </button>
              ))}
              <span className="text-xs font-semibold text-slate-400 ml-1">
                {options.length} option{options.length > 1 ? 's' : ''}
                {compareIds.length
                  ? ` · ${compareIds.length} en comparaison`
                  : ' · coche pour comparer'}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="p-5 sm:p-7 space-y-5">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-64 rounded-3xl bg-gradient-to-r from-primary-100 via-white to-primary-100 bg-[length:200%_100%] animate-[shimmer_2s_infinite]"
              />
            ))}
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
            {error}
          </p>
        ) : null}

        {!loading && sorted.length > 0 ? (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sorted.map((h, idx) => {
              const id = hotelKey(h, idx)
              const active =
                String(selected?.id || selected?.hotel_id || '') ===
                String(h.id || h.hotel_id || '')
              const inCompare = compareIds.includes(id)
              const dist = formatDistance(h.distance_m)
              const board = boardLabelFr(h.board)
              const total = packTotal(h)
              const photo = h.photo || h.thumbnail

              return (
                <li key={id}>
                  <motion.article
                    layout
                    whileHover={{ y: -3 }}
                    transition={spring}
                    className={`group relative flex flex-col h-full rounded-3xl overflow-hidden border-2 bg-white transition-shadow ${
                      active
                        ? 'border-primary-500 shadow-lift'
                        : 'border-line hover:border-primary-200 shadow-soft'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(h)
                        setDetail(h)
                      }}
                      className="relative block w-full text-left"
                    >
                      <div className="relative h-44 sm:h-48 bg-slate-100 overflow-hidden">
                        {photo ? (
                          <img
                            src={photo}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                            loading="lazy"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-primary-400 to-primary-700" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent" />
                        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                          {h.rating != null ? (
                            <Signal>{Number(h.rating).toFixed(1)}/10</Signal>
                          ) : null}
                          {h.refundable ? <Signal>Annul. flexible</Signal> : null}
                        </div>
                        <div className="absolute bottom-3 left-3 right-3">
                          <p className="text-white font-extrabold text-lg leading-tight line-clamp-2 drop-shadow">
                            {h.name || 'Hôtel'}
                          </p>
                          <p className="text-white/90 text-xs font-semibold mt-1 flex items-center gap-2">
                            <StarRow stars={h.stars} />
                            {h.review_count != null && h.review_count > 0 ? (
                              <span>{h.review_count} avis</span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                    </button>

                    <div className="flex flex-col flex-1 p-4 gap-3">
                      <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold text-slate-600">
                        {board ? (
                          <span className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1">
                            {board}
                          </span>
                        ) : null}
                        {dist ? (
                          <span className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1">
                            {dist}
                          </span>
                        ) : null}
                        {h.hotel_pp != null ? (
                          <span className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-1">
                            Hôtel {Math.round(Number(h.hotel_pp))} € / pers.
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-auto flex items-end justify-between gap-3">
                        <div>
                          <p className="text-2xl font-black text-primary-600 tabular-nums leading-none">
                            {total} €
                          </p>
                          <p className="text-[11px] font-semibold text-slate-400 mt-1">
                            / pers. vol + hôtel
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <label className="inline-flex items-center gap-2 text-xs font-bold text-ink-soft cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={inCompare}
                              onChange={() => toggleCompare(h, idx)}
                              className="rounded border-line text-primary-500 focus:ring-primary-300"
                            />
                            Comparer
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setSelected(h)
                              setDetail(h)
                            }}
                            className="text-xs font-bold text-primary-700 hover:underline underline-offset-2"
                          >
                            Voir photos & détail
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelected(h)
                          void confirm(h)
                        }}
                        disabled={saving}
                        className={`w-full rounded-2xl min-h-[44px] text-sm font-bold transition-colors disabled:opacity-50 ${
                          active
                            ? 'bg-primary-500 text-white hover:bg-primary-600'
                            : 'bg-primary-50 text-primary-800 hover:bg-primary-100'
                        }`}
                      >
                        {active ? 'Choisir cet hôtel' : 'Sélectionner'}
                      </button>
                    </div>
                  </motion.article>
                </li>
              )
            })}
          </ul>
        ) : null}

        {/* Compare strip */}
        <AnimatePresence>
          {compareHotels.length >= 2 ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="rounded-3xl border border-primary-200 bg-white p-4 sm:p-5 shadow-soft"
            >
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="font-extrabold text-ink text-lg">Comparaison</h3>
                <button
                  type="button"
                  onClick={() => setCompareIds([])}
                  className="text-xs font-bold text-slate-500 hover:text-ink"
                >
                  Effacer
                </button>
              </div>
              <div
                className={`grid gap-3 ${
                  compareHotels.length === 2
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : 'grid-cols-1 sm:grid-cols-3'
                }`}
              >
                {compareHotels.map((h, i) => {
                  const photo = h.photo || h.thumbnail
                  const total = packTotal(h)
                  return (
                    <div
                      key={hotelKey(h, i)}
                      className="rounded-2xl border border-line overflow-hidden flex flex-col"
                    >
                      <div className="h-28 bg-slate-100 relative">
                        {photo ? (
                          <img
                            src={photo}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="p-3 space-y-2 flex-1 flex flex-col">
                        <p className="font-bold text-sm text-ink line-clamp-2">
                          {h.name}
                        </p>
                        <dl className="text-[11px] space-y-1 text-slate-600 flex-1">
                          <div className="flex justify-between gap-2">
                            <dt>Note</dt>
                            <dd className="font-bold text-ink">
                              {h.rating != null
                                ? `${Number(h.rating).toFixed(1)}/10`
                                : '—'}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt>Étoiles</dt>
                            <dd className="font-bold text-ink">
                              {h.stars != null ? `${Math.round(Number(h.stars))}★` : '—'}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt>Distance</dt>
                            <dd className="font-bold text-ink text-right">
                              {formatDistance(h.distance_m)?.replace(' du centre', '') ||
                                '—'}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt>Pension</dt>
                            <dd className="font-bold text-ink">
                              {boardLabelFr(h.board) || '—'}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2">
                            <dt>Annulation</dt>
                            <dd className="font-bold text-ink">
                              {h.refundable ? 'Flexible' : 'Non flexible'}
                            </dd>
                          </div>
                          <div className="flex justify-between gap-2 pt-1 border-t border-slate-100">
                            <dt>Pack / pers.</dt>
                            <dd className="font-black text-primary-600">{total} €</dd>
                          </div>
                        </dl>
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(h)
                            setDetail(h)
                          }}
                          className="w-full mt-1 rounded-xl bg-primary-500 text-white text-xs font-bold min-h-[40px] hover:bg-primary-600"
                        >
                          Voir & choisir
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center pt-1">
          <button
            type="button"
            disabled={!selected || saving}
            onClick={() => void confirm()}
            className="flex-1 rounded-2xl bg-primary-500 hover:bg-primary-600 text-white font-bold py-3.5 min-h-[48px] disabled:opacity-50"
          >
            {saving
              ? '…'
              : selected
                ? `Valider · ${packTotal(selected)} € / pers.`
                : 'Valider cet hôtel'}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="sm:w-auto px-4 text-sm font-semibold text-slate-500 hover:text-ink min-h-[44px]"
          >
            Plus tard
          </button>
        </div>
      </div>

      {/* Detail lightbox */}
      <AnimatePresence>
        {detail ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-ink/55 backdrop-blur-[2px] p-0 sm:p-6"
            onClick={() => setDetail(null)}
            role="presentation"
          >
            <motion.div
              initial={{ y: 48, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 28, opacity: 0 }}
              transition={spring}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-line shadow-lift"
              role="dialog"
              aria-modal="true"
              aria-label={detail.name || 'Détail hôtel'}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 bg-white/95 backdrop-blur border-b border-line">
                <div className="min-w-0">
                  <p className="font-extrabold text-ink truncate">
                    {detail.name || 'Hôtel'}
                  </p>
                  <p className="text-xs text-slate-500 font-semibold truncate">
                    {[
                      detail.rating != null
                        ? `${Number(detail.rating).toFixed(1)}/10`
                        : null,
                      formatDistance(detail.distance_m),
                      boardLabelFr(detail.board),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="shrink-0 w-10 h-10 rounded-full border border-line font-bold text-ink-soft hover:bg-canvas"
                  aria-label="Fermer"
                >
                  ×
                </button>
              </div>

              <div className="p-4 sm:p-5 space-y-4">
                <HotelPhotoGallery
                  hotelId={String(detail.hotel_id || detail.id || '')}
                  seedPhoto={detail.photo || detail.thumbnail}
                  alt={detail.name || 'Hôtel'}
                  hotelName={detail.name}
                  cityLabel={cityLabel || undefined}
                  embedded
                />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    {
                      label: 'Note',
                      value:
                        detail.rating != null
                          ? `${Number(detail.rating).toFixed(1)}/10`
                          : '—',
                    },
                    {
                      label: 'Étoiles',
                      value:
                        detail.stars != null
                          ? `${Math.round(Number(detail.stars))}★`
                          : '—',
                    },
                    {
                      label: 'Distance',
                      value:
                        formatDistance(detail.distance_m)?.replace(
                          ' du centre',
                          '',
                        ) || '—',
                    },
                    {
                      label: 'Pack',
                      value: `${packTotal(detail)} €`,
                    },
                  ].map((cell) => (
                    <div
                      key={cell.label}
                      className="rounded-2xl bg-slate-50 border border-slate-100 px-3 py-2.5"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        {cell.label}
                      </p>
                      <p className="text-sm font-extrabold text-ink mt-0.5">
                        {cell.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-line bg-canvas/60 px-4 py-3 space-y-2 text-sm">
                  <p className="font-bold text-ink">Ce que propose l’offre</p>
                  <ul className="space-y-1.5 text-slate-600">
                    <li>
                      · Pension :{' '}
                      <span className="font-semibold text-ink">
                        {boardLabelFr(detail.board) || 'Non précisée'}
                      </span>
                    </li>
                    <li>
                      · Annulation :{' '}
                      <span className="font-semibold text-ink">
                        {detail.refundable
                          ? 'Flexible (selon conditions partenaire)'
                          : 'Non flexible'}
                      </span>
                    </li>
                    <li>
                      · Hôtel seul :{' '}
                      <span className="font-semibold text-ink">
                        {detail.hotel_pp != null
                          ? `${Math.round(Number(detail.hotel_pp))} € / pers.`
                          : '—'}
                      </span>
                    </li>
                    {detail.review_count != null && detail.review_count > 0 ? (
                      <li>
                        ·{' '}
                        <span className="font-semibold text-ink">
                          {detail.review_count} avis voyageurs
                        </span>
                      </li>
                    ) : null}
                  </ul>
                  {detail.name ? (
                    <a
                      href={mapsUrl(detail.name, cityLabel)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex mt-2 text-sm font-bold text-primary-700 hover:underline underline-offset-2"
                    >
                      Voir sur la carte →
                    </a>
                  ) : null}
                </div>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setSelected(detail)
                    void confirm(detail)
                  }}
                  className="w-full rounded-2xl bg-primary-500 hover:bg-primary-600 text-white font-bold py-3.5 min-h-[48px] disabled:opacity-50"
                >
                  {saving
                    ? '…'
                    : `Choisir cet hôtel · ${packTotal(detail)} € / pers.`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  )
}
