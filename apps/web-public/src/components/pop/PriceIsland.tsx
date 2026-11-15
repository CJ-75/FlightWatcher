'use client'

import { useEffect, useMemo, useState } from 'react'

type PricePayload = {
  ok?: boolean
  price_pp?: number | null
  flight_pp?: number | null
  hotel_pp?: number | null
  priced_at?: string | null
  origin?: string
  dest_city?: string
  cached?: boolean
  error?: string
}

const ORIGIN_LS = 'fw_pop_origin'
const DEFAULT_ORIGIN = 'LYS'
/** Reserved height ≈ final card — avoids CLS when price loads */
const CARD_MIN_H = 'min-h-[22rem]'
const BAR_MIN_H = 'min-h-[4.25rem]'

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
    const q = new URLSearchParams({
      origin,
      dest_city: destCity,
    })
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
      const d = new Date(data.priced_at)
      return d.toLocaleString('fr-FR', {
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

  if (variant === 'bar') {
    return (
      <div
        className={`fixed inset-x-0 bottom-0 z-50 border-t border-line bg-ink/95 px-4 py-3 text-[color:var(--fw-primary-fg)] backdrop-blur-md ${BAR_MIN_H} ${className}`}
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        aria-busy={loading}
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">
              Dès · {origin}
            </p>
            <p className="truncate text-lg font-extrabold">
              {loading ? (
                <span className="inline-block h-6 w-24 animate-pulse rounded bg-white/20" />
              ) : data?.price_pp != null ? (
                <>
                  {formatEuro(data.price_pp)}
                  <span className="text-sm font-semibold opacity-80"> / pers.</span>
                </>
              ) : (
                'Prix à venir'
              )}
            </p>
          </div>
          <a
            href={plannerHref}
            className="app-btn-primary shrink-0 no-underline text-sm py-2.5 px-4"
          >
            Ajouter au Planner
          </a>
        </div>
      </div>
    )
  }

  return (
    <aside
      className={`rounded-card bg-ink p-5 text-[color:var(--fw-primary-fg)] shadow-lift space-y-4 ${CARD_MIN_H} ${className}`}
      aria-busy={loading}
    >
      <div>
        <label className="text-[10px] font-black uppercase tracking-[0.14em] opacity-70">
          Je pars de
        </label>
        <input
          value={origin}
          onChange={(e) => onOriginChange(e.target.value)}
          className="mt-1.5 w-full rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm font-bold outline-none focus:border-primary-500"
          aria-label="Aéroport de départ (IATA)"
          maxLength={15}
          autoComplete="off"
        />
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.14em] opacity-70">
          Week-end à {cityLabel}
        </p>
        <p className="mt-1 text-3xl font-extrabold tracking-tight">
          {loading ? (
            <span className="inline-block h-9 w-36 animate-pulse rounded-lg bg-white/20" />
          ) : data?.price_pp != null ? (
            `dès ${formatEuro(data.price_pp)}`
          ) : (
            'Prix à venir'
          )}
        </p>
        {data?.price_pp != null ? (
          <p className="mt-1 text-sm opacity-80">par personne · vol + hôtel</p>
        ) : (
          <p className="mt-1 text-sm opacity-70">
            On affiche un prix dès qu’un deal est dispo.
          </p>
        )}
        {(data?.flight_pp != null || data?.hotel_pp != null) && (
          <p className="mt-2 text-xs opacity-70">
            {data.flight_pp != null ? `Vol ${formatEuro(data.flight_pp)}` : null}
            {data.flight_pp != null && data.hotel_pp != null ? ' · ' : null}
            {data.hotel_pp != null ? `Hôtel ${formatEuro(data.hotel_pp)}` : null}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <a
          href={plannerHref}
          className="app-btn-primary w-full no-underline text-center"
        >
          Ajouter au Planner
        </a>
        <a
          href={`/alertes?origin=${encodeURIComponent(origin)}&dest=${encodeURIComponent(destCity)}`}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-transparent px-5 py-3 text-sm font-bold text-[color:var(--fw-primary-fg)] no-underline hover:bg-white/10"
        >
          Me prévenir si le prix baisse
        </a>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs opacity-80">
        <p className="font-bold">{stopCount} stops sur ce Pop</p>
        {pricedLabel ? <p className="mt-0.5">Prix vu le {pricedLabel}</p> : null}
      </div>
    </aside>
  )
}
