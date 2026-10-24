import { useEffect, useMemo, useState } from 'react'
import type { DealCalendarCell, DealCalendarResponse, DealWindowKind } from '../types'
import { getApiClient } from '../utils/apiClient'

interface Props {
  /** Destination slug OR arrival IATA (prefer iata from TravelDeal.destination). */
  slug?: string
  iata?: string
  cityName?: string
  origin: string
  adults?: number
  windowKind?: DealWindowKind | ''
}

function formatShort(dateStr?: string) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  })
}

function cellTone(cells: DealCalendarCell[], cell: DealCalendarCell): string {
  if (cell.status !== 'ok' || cell.price_pp == null) {
    return 'bg-slate-50 text-muted border-line'
  }
  const priced = cells
    .map((c) => c.price_pp)
    .filter((p): p is number => p != null && p > 0)
  if (!priced.length) return 'bg-primary-50 text-primary-800 border-primary-100'
  const min = Math.min(...priced)
  const max = Math.max(...priced)
  if (max <= min) return 'bg-emerald-50 text-emerald-900 border-emerald-100'
  const t = (cell.price_pp - min) / (max - min)
  if (t <= 0.33) return 'bg-emerald-50 text-emerald-900 border-emerald-100'
  if (t <= 0.66) return 'bg-amber-50 text-amber-900 border-amber-100'
  return 'bg-orange-50 text-orange-900 border-orange-100'
}

export function DealWeekendCalendar({
  slug,
  iata,
  cityName,
  origin,
  adults = 2,
  windowKind = 'FRI_SUN',
}: Props) {
  const [data, setData] = useState<DealCalendarResponse | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if ((!slug && !iata) || !origin) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    void getApiClient()
      .getDealCalendar({
        slug,
        iata,
        origin,
        adults,
        window: (windowKind || 'FRI_SUN') as DealWindowKind,
      })
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [slug, iata, origin, adults, windowKind])

  const cells = data?.cells || []
  const best = useMemo(() => {
    const ok = cells.filter((c) => c.status === 'ok' && c.price_pp != null)
    if (!ok.length) return null
    return ok.reduce((a, b) => ((a.price_pp || 0) <= (b.price_pp || 0) ? a : b))
  }, [cells])

  if (!origin || (!slug && !iata)) return null
  if (loading) {
    return (
      <div className="mb-6 rounded-3xl border border-line bg-white p-4 shadow-soft animate-pulse">
        <div className="h-4 w-48 bg-primary-50 rounded mb-3" />
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-primary-50" />
          ))}
        </div>
      </div>
    )
  }
  if (!cells.length || data?.status === 'missing') return null

  return (
    <div className="mb-6 rounded-3xl border border-line bg-white p-4 sm:p-5 shadow-soft">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">
            Meilleurs week-ends
          </p>
          <p className="text-sm font-bold text-ink">
            {cityName || slug || iata} · depuis {origin}
            {adults === 1 ? ' · solo' : ''}
          </p>
        </div>
        {best?.price_pp != null ? (
          <p className="text-sm font-extrabold text-primary-700">
            dès {Math.round(best.price_pp)} € / pers.
          </p>
        ) : null}
      </div>
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {cells.map((c) => (
          <div
            key={c.window_id}
            className={`rounded-xl border px-2 py-2 text-center ${cellTone(cells, c)}`}
            title={c.window_id}
          >
            <p className="text-[10px] font-semibold leading-tight">
              {formatShort(c.checkin)}
            </p>
            <p className="text-sm font-extrabold mt-1 tabular-nums">
              {c.price_pp != null ? `${Math.round(c.price_pp)}€` : '—'}
            </p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted mt-3">
        Prix indicatifs vol + hôtel (cache 12 h). Réservation via les offres détaillées.
      </p>
    </div>
  )
}
