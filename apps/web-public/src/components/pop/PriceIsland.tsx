'use client'

import { useEffect, useMemo, useState } from 'react'
import { seedPopularAirports } from '@waypop/shared'

type PricePayload = {
  ok?: boolean
  price_pp?: number | null
  flight_pp?: number | null
  hotel_pp?: number | null
  priced_at?: string | null
}

const ORIGIN_LS = 'fw_pop_origin'
const DEFAULT_ORIGIN = 'LYS'
const CARD_MIN_H = 'min-h-[18rem]'
const BAR_MIN_H = 'min-h-[4.5rem]'

type CityOpt = { label: string; codes: string }

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

function departureCities(): CityOpt[] {
  const byCity = new Map<string, string[]>()
  for (const a of seedPopularAirports()) {
    const city = String(a.city || a.name || a.code).trim()
    if (!city) continue
    const list = byCity.get(city) || []
    if (!list.includes(a.code)) list.push(a.code)
    byCity.set(city, list)
  }
  return [...byCity.entries()]
    .map(([label, codes]) => ({ label, codes: codes.join(',') }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
}

function cityLabelForCodes(codes: string, opts: CityOpt[]): string {
  const hit = opts.find(
    (o) =>
      o.codes === codes ||
      o.codes.split(',').includes(codes.split(',')[0] || ''),
  )
  return hit?.label || codes
}

type StopPin = { title: string; lat?: number; lng?: number }

type Props = {
  destCity: string
  cityLabel: string
  stopCount: number
  variant?: 'card' | 'bar'
  className?: string
  mapsUrl?: string | null
  shareUrl?: string
  shareTitle?: string
  stops?: StopPin[]
}

export function PriceIsland({
  destCity,
  cityLabel,
  stopCount,
  variant = 'card',
  className = '',
  mapsUrl,
  shareUrl,
  shareTitle,
  stops = [],
}: Props) {
  const cities = useMemo(() => departureCities(), [])
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

  const originCity = cityLabelForCodes(origin, cities)
  const hasPrice = data?.price_pp != null

  const onOriginChange = (codes: string) => {
    const next = codes.trim().toUpperCase() || DEFAULT_ORIGIN
    setOrigin(next)
    try {
      localStorage.setItem(ORIGIN_LS, next)
    } catch {
      /* ignore */
    }
  }

  const plannerHref = `/sejours?origin=${encodeURIComponent(origin)}&dest=${encodeURIComponent(destCity)}`
  const alertHref = `/alertes?origin=${encodeURIComponent(origin)}&dest=${encodeURIComponent(destCity)}`
  const waHref = `https://wa.me/?text=${encodeURIComponent(
    `${shareTitle || `Pop ${cityLabel}`}\n${shareUrl || ''}`,
  )}`

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
              Dès · {originCity}
            </p>
            <p className="truncate text-lg font-bold tracking-tight">
              {loading ? (
                <span className="inline-block h-5 w-20 animate-pulse rounded bg-white/15" />
              ) : hasPrice ? (
                <>
                  {formatEuro(data!.price_pp!)}
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
          <a href={plannerHref} className="wp-cta-ink shrink-0 py-2.5 px-4 text-sm">
            Planner
          </a>
        </div>
      </div>
    )
  }

  const staticMap = buildStaticMapUrl(stops)

  return (
    <div className={`space-y-4 ${className}`}>
      <aside
        className={`rounded-2xl bg-night p-6 text-night-fg shadow-rail ${CARD_MIN_H}`}
        aria-busy={loading}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-night-fg/50">
          Prix week-end
        </p>

        <label className="mt-5 block">
          <span className="text-[11px] font-semibold text-night-fg/55">
            Je pars de
          </span>
          <select
            value={
              cities.find((c) => c.codes === origin)?.codes ||
              cities.find((c) =>
                c.codes.split(',').includes(origin.split(',')[0] || ''),
              )?.codes ||
              origin
            }
            onChange={(e) => onOriginChange(e.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-bold tracking-wide text-night-fg outline-none transition-colors focus:border-primary-500"
            aria-label="Ville de départ"
          >
            {cities.map((c) => (
              <option key={c.codes} value={c.codes} className="bg-night text-white">
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-6">
          <p className="text-[11px] text-night-fg/55">à {cityLabel}</p>
          {loading ? (
            <p className="mt-1">
              <span className="inline-block h-9 w-32 animate-pulse rounded-lg bg-white/15" />
            </p>
          ) : hasPrice ? (
            <>
              <p className="mt-1 text-[2rem] font-extrabold leading-none tracking-tight">
                {formatEuro(data!.price_pp!)}
              </p>
              <p className="mt-2 text-sm text-night-fg/60">
                par personne · vol + hôtel
              </p>
              {(data?.flight_pp != null || data?.hotel_pp != null) && (
                <p className="mt-2 text-xs text-night-fg/45">
                  {data.flight_pp != null
                    ? `Vol ${formatEuro(data.flight_pp)}`
                    : null}
                  {data.flight_pp != null && data.hotel_pp != null
                    ? ' · '
                    : null}
                  {data.hotel_pp != null
                    ? `Hôtel ${formatEuro(data.hotel_pp)}`
                    : null}
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-night-fg/75">
              On t&apos;affiche le prix dès qu&apos;on trouve un bon plan depuis{' '}
              {originCity}.
            </p>
          )}
        </div>

        <div className="mt-6 space-y-2">
          <a href={plannerHref} className="wp-cta-ink w-full">
            Ajouter au Planner
          </a>
          <a
            href={alertHref}
            className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-night-fg no-underline transition-colors hover:bg-white/5"
          >
            {hasPrice
              ? 'Me prévenir si le prix baisse'
              : 'Me prévenir dès qu’un prix est dispo'}
          </a>
        </div>

        <div className="mt-5 border-t border-white/10 pt-4 text-xs text-night-fg/45">
          <p>{stopCount} stops sur ce Pop</p>
          {pricedLabel ? <p className="mt-0.5">Vu le {pricedLabel}</p> : null}
        </div>
      </aside>

      {staticMap || mapsUrl ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          {staticMap ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={staticMap}
              alt={`Carte des stops à ${cityLabel}`}
              className="h-40 w-full object-cover"
              loading="lazy"
            />
          ) : null}
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <p className="text-xs font-bold text-ink">
              {stopCount} stops sur la carte
            </p>
            {mapsUrl ? (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-bold text-ink no-underline hover:underline"
              >
                Ouvrir Maps →
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-line bg-peach-mist/80 px-5 py-4">
        <p className="text-sm font-extrabold text-ink">
          Envoie ce Pop au groupe
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Un lien WhatsApp — tout le monde voit le même programme.
        </p>
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="wp-cta-ink mt-3 inline-flex w-full text-sm"
        >
          WhatsApp
        </a>
      </div>
    </div>
  )
}

function buildStaticMapUrl(stops: StopPin[]): string | null {
  const pins = stops.filter(
    (s) => typeof s.lat === 'number' && typeof s.lng === 'number',
  )
  if (pins.length === 0) return null
  const lats = pins.map((p) => p.lat!)
  const lngs = pins.map((p) => p.lng!)
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2
  const markers = pins
    .slice(0, 8)
    .map((p) => `${p.lat},${p.lng},red-pushpin`)
    .join('|')
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${centerLat},${centerLng}&zoom=13&size=560x220&maptype=mapnik&markers=${encodeURIComponent(markers)}`
}
