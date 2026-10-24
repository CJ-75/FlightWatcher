import { useEffect, useState } from 'react'
import type { HotelUpsellOption, MyTripDraft } from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'

type Props = {
  draft: MyTripDraft
  token: string
  onUpdated: (row: MyTripDraft) => void
  onDone: () => void
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
        const item = {
          iata: destIata,
          checkin,
          checkout,
          participants: adults,
          flight_pp: flightPp || undefined,
        }
        let result = (await getApiClient().lookupHotelUpsell([item])).results?.[0]
        if (result?.status === 'miss' || result?.status === 'pending') {
          result = await getApiClient().fetchHotelUpsell(item)
        }
        if (result?.status === 'pending' && result.job_id) {
          for (let i = 0; i < 14; i++) {
            await new Promise((r) => setTimeout(r, 1200))
            if (cancelled) return
            const job = await getApiClient().getHotelUpsellJob(result.job_id!)
            if (job.status === 'ready' || job.status === 'error' || job.status === 'no_rates') {
              result = {
                ...result,
                status: job.status,
                options: job.options,
                night_cap: job.night_cap ?? result.night_cap,
              }
              break
            }
          }
        }
        if (cancelled) return
        const opts =
          result?.options?.length
            ? result.options
            : result?.hotel
              ? [result.hotel]
              : []
        setOptions(opts)
        if (result?.night_cap != null) setNightCap(Number(result.night_cap))
        if (result?.city) setCityLabel(String(result.city))
        // Prefer current hotel if still in list
        const curId = String(currentHotel?.id || currentHotel?.hotel_id || '')
        const match = opts.find(
          (h) => String(h.id || h.hotel_id || '') === curId,
        )
        setSelected(match || opts[0] || null)
        if (!opts.length) {
          setError('Aucun hôtel disponible pour cette ville / ces dates')
        }
      } catch {
        if (!cancelled) setError('Impossible de charger les hôtels')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destIata, checkin, checkout, adults, flightPp])

  const confirm = async () => {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      const hotelPp = Number(selected.hotel_pp || 0)
      const totalPp = Math.round(flightPp + hotelPp)
      const row = await getApiClient().updateMyTripHotel(token, {
        hotel: {
          id: selected.id || selected.hotel_id,
          hotel_id: selected.hotel_id || selected.id,
          name: selected.name,
          stars: selected.stars,
          rating: selected.rating,
          photo: selected.photo || selected.thumbnail,
          board: selected.board,
          public_hotel_price: selected.public_hotel_price,
          hotel_pp: selected.hotel_pp,
          distance_m: selected.distance_m,
          refundable: selected.refundable,
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

  return (
    <section className="rounded-2xl border-2 border-primary-200 bg-primary-50/40 p-5 space-y-4 shadow-sm">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-primary-700/70">
          Composer le voyage
        </p>
        <h2 className="text-xl font-black text-ink mt-1">
          {cityLabel ? `Hôtels à ${cityLabel}` : 'Choisir un autre hôtel'}
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Le vol reste le même
          {flightPp > 0 ? ` (${Math.round(flightPp)} € / pers.)` : ''}.
          {nightCap != null
            ? ` Confort ≤ ~${Math.round(nightCap)} €/nuit.`
            : ' Choisis parmi les options confort de la ville.'}
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 rounded-2xl bg-gradient-to-r from-primary-100 via-white to-primary-100 bg-[length:200%_100%] animate-[shimmer_2s_infinite]"
            />
          ))}
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          {error}
        </p>
      ) : null}

      {!loading && options.length > 0 ? (
        <ul className="space-y-2.5">
          {options.map((h, idx) => {
            const id = String(h.id || h.hotel_id || idx)
            const active =
              String(selected?.id || selected?.hotel_id || '') ===
              String(h.id || h.hotel_id || '')
            const total = Math.round(flightPp + Number(h.hotel_pp || 0))
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setSelected(h)}
                  className={`w-full flex gap-3 text-left rounded-2xl border-2 p-2.5 transition-all bg-white ${
                    active
                      ? 'border-primary-500 shadow-sm'
                      : 'border-line hover:border-primary-200'
                  }`}
                >
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                    {h.photo || h.thumbnail ? (
                      <img
                        src={h.photo || h.thumbnail}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-ink truncate text-sm">
                      {h.stars
                        ? `${'★'.repeat(Math.min(5, Math.round(Number(h.stars))))} `
                        : ''}
                      {h.name || 'Hôtel'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {[
                        h.rating != null ? `${Number(h.rating).toFixed(1)}/10` : null,
                        h.board,
                        h.distance_m != null
                          ? `${(h.distance_m / 1000).toFixed(1)} km`
                          : null,
                        h.refundable ? 'Annul. gratuite' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <p className="text-sm font-black text-primary-600 mt-1 tabular-nums">
                      {total} €
                      <span className="text-[10px] font-semibold text-slate-400 ml-1">
                        / pers. pack
                      </span>
                    </p>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          disabled={!selected || saving}
          onClick={() => void confirm()}
          className="w-full rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-bold py-3.5 disabled:opacity-50"
        >
          {saving ? '…' : 'Valider cet hôtel'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="w-full text-sm font-medium text-slate-500 py-2"
        >
          Garder l’hôtel actuel
        </button>
      </div>
    </section>
  )
}
