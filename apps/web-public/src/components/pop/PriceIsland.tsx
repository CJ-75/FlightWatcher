'use client'

import { useEffect, useMemo, useState } from 'react'

type PricePayload = {
  ok?: boolean
  price_pp?: number | null
  flight_pp?: number | null
  hotel_pp?: number | null
  priced_at?: string | null
}

const ORIGIN_LS = 'fw_pop_origin'
const DEFAULT_ORIGIN = 'LYS'
const CARD_MIN_H = 'min-h-[21rem]'
const BAR_MIN_H = 'min-h-[4.5rem]'

function apiBase(): string {
  return (
    process.env.NEXT_PUBLIC_WAYPOP_API_URL ||
    process.env.WAYPOP_API_URL ||
    'https://api.waypop.co'
  ).replace(/\/$/, '')
}

function formatEuro(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n)
}

type Props = {
  destCity: string
  cityLabel: string
  stopCount: number
  variant?: 'card' | 'bar'
  className?: string
}

export function PriceIsland({
  destCity,
  cityLabel,
  stopCount,
  variant = 'card',
  className = '',
}: Props) {
  const [origin, setOrigin] = useState(DEFAULT_ORIGIN)
  const [data, setData] = useState<PricePayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ORIGIN_LS)
      if (saved && /^[A-Z]{3}(,[A-Z]{3})*$/i.test(saved)) {
        setOrigin(saved.toUpperCase())
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const q = new URLSearchParams({ origin, dest_city: destCity })
    void fetch(`${apiBase()}/api/pop/price?${q}`, { credentials: 'omit' })
      .then((r) => r.json())
      .then((json: PricePayload) => {
        if (!cancelled) setData(json)
      })
      .catch(() => {
        if (!cancelled) setData({ ok: false, price_pp: null })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [origin, destCity])

  const pricedLabel = useMemo(() => {
    if (!data?.priced_at) return null
    try {
      return new Date(data.priced_at).toLocaleString('fr-FR', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return null
    }
  }, [data?.priced_at])

  const onOriginChange = (v: string) => {
    const next = v.trim().toUpperCase().replace(/[^A-Z,]/g, '')
    setOrigin(next || DEFAULT_ORIGIN)
    try {
      localStorage.setItem(ORIGIN_LS, next || DEFAULT_ORIGIN)
    } catch {
      /* ignore */
    }
  }

  const plannerHref = `/sejours?origin=${encodeURIComponent(origin)}&dest=${encodeURIComponent(destCity)}`
  const alertHref = `/alertes?origin=${encodeURIComponent(origin)}&dest=${encodeURIComponent(destCity)}`

  if (variant === 'bar') {
    return (
      <div
        className={`fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-night/95 px-4 py-3 text-night-fg backdrop-blur-md ${BAR_MIN_H} ${className}`}
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        aria-busy={loading}
      >
        <div className="mx-auto flex max-w-pop items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-night-fg/55">
              Dès · {origin}
            </p>
            <p className="truncate text-lg font-bold tracking-tight">
              {loading ? (
                <span className="inline-block h-5 w-20 animate-pulse rounded bg-white/15" />
              ) : data?.price_pp != null ? (
                <>
                  {formatEuro(data.price_pp)}
                  <span className="text-sm font-semibold text-night-fg/65">
                    {' '}
                    / pers.
                  </span>
                </>
              ) : (
                'Prix à venir'
              )}
            </p>
          </div>
          <a href={plannerHref} className="wp-cta shrink-0 py-2.5 px-4 text-sm">
            Planner
          </a>
        </div>
      </div>
    )
  }

  return (
    <aside
      className={`rounded-2xl bg-night p-6 text-night-fg shadow-rail ${CARD_MIN_H} ${className}`}
      aria-busy={loading}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-night-fg/50">
        Prix week-end
      </p>

      <label className="mt-5 block">
        <span className="text-[11px] font-semibold text-night-fg/55">
          Je pars de
        </span>
        <input
          value={origin}
          onChange={(e) => onOriginChange(e.target.value)}
          className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-bold tracking-wide text-night-fg outline-none transition-colors focus:border-primary-500"
          aria-label="Aéroport de départ (IATA)"
          maxLength={15}
          autoComplete="off"
        />
      </label>

      <div className="mt-6">
        <p className="text-[11px] text-night-fg/55">à {cityLabel}</p>
        <p className="mt-1 text-[2rem] font-extrabold leading-none tracking-tight">
          {loading ? (
            <span className="inline-block h-9 w-32 animate-pulse rounded-lg bg-white/15" />
          ) : data?.price_pp != null ? (
            formatEuro(data.price_pp)
          ) : (
            '—'
          )}
        </p>
        <p className="mt-2 text-sm text-night-fg/60">
          {data?.price_pp != null
            ? 'par personne · vol + hôtel'
            : 'Prix dès qu’un deal est dispo'}
        </p>
        {(data?.flight_pp != null || data?.hotel_pp != null) && (
          <p className="mt-2 text-xs text-night-fg/45">
            {data.flight_pp != null ? `Vol ${formatEuro(data.flight_pp)}` : null}
            {data.flight_pp != null && data.hotel_pp != null ? ' · ' : null}
            {data.hotel_pp != null ? `Hôtel ${formatEuro(data.hotel_pp)}` : null}
          </p>
        )}
      </div>

      <div className="mt-6 space-y-2">
        <a href={plannerHref} className="wp-cta w-full">
          Ajouter au Planner
        </a>
        <a
          href={alertHref}
          className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-night-fg no-underline transition-colors hover:bg-white/5"
        >
          Me prévenir si le prix baisse
        </a>
      </div>

      <div className="mt-5 border-t border-white/10 pt-4 text-xs text-night-fg/45">
        <p>{stopCount} stops sur ce Pop</p>
        {pricedLabel ? <p className="mt-0.5">Vu le {pricedLabel}</p> : null}
      </div>
    </aside>
  )
}
