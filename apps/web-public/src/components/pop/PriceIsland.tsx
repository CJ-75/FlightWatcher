'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  citySlugDisplayNameFr,
  findCityGroupByCodes,
  groupAirportsByCity,
  parseAirportCodes,
  seedPopularAirports,
} from '@waypop/shared'
import { PopOriginSelect } from '@/components/pop/PopOriginSelect'

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

function cityKey(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function frenchOriginGroups() {
  return groupAirportsByCity(seedPopularAirports()).filter(
    (g) => cityKey(g.country) === 'france',
  )
}

function isSameCityOrigin(
  origin: string,
  destCity: string,
  cityLabel: string,
  groups: ReturnType<typeof frenchOriginGroups>,
): boolean {
  const selected = findCityGroupByCodes(groups, parseAirportCodes(origin))
  const originLabel = selected?.city || ''
  const destKeys = new Set(
    [destCity, cityLabel, citySlugDisplayNameFr(destCity)]
      .map((x) => cityKey(String(x || '')))
      .filter(Boolean),
  )
  return destKeys.has(cityKey(originLabel))
}

type Props = {
  destCity: string
  cityLabel: string
  stopCount: number
  variant?: 'card' | 'bar'
  className?: string
  shareUrl?: string
  shareTitle?: string
}

export function PriceIsland({
  destCity,
  cityLabel,
  stopCount,
  variant = 'card',
  className = '',
  shareUrl,
  shareTitle,
}: Props) {
  const groups = useMemo(() => frenchOriginGroups(), [])
  const [origin, setOrigin] = useState(DEFAULT_ORIGIN)
  const [data, setData] = useState<PricePayload | null>(null)
  const [loading, setLoading] = useState(true)

  const localMode = useMemo(
    () => isSameCityOrigin(origin, destCity, cityLabel, groups),
    [origin, destCity, cityLabel, groups],
  )

  useEffect(() => {
    const codesOf = (g: (typeof groups)[number]) =>
      g.airports.map((a) => a.code).join(',')
    try {
      const saved = localStorage.getItem(ORIGIN_LS)
      if (saved && /^[A-Z]{3}(,[A-Z]{3})*$/i.test(saved)) {
        const next = saved.toUpperCase()
        if (findCityGroupByCodes(groups, parseAirportCodes(next))) {
          setOrigin(next)
          return
        }
      }
    } catch {
      /* ignore */
    }
    const lys = findCityGroupByCodes(groups, ['LYS'])
    const fallback = lys
      ? codesOf(lys).includes('LYS')
        ? 'LYS'
        : codesOf(lys)
      : groups[0]
        ? codesOf(groups[0])
        : DEFAULT_ORIGIN
    setOrigin(fallback)
  }, [groups])

  useEffect(() => {
    if (localMode) {
      setData(null)
      setLoading(false)
      return
    }
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
  }, [origin, destCity, localMode])

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

  const originCity =
    findCityGroupByCodes(groups, parseAirportCodes(origin))?.city || origin
  const hasPrice = !localMode && data?.price_pp != null

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
        className={`fixed inset-x-0 bottom-0 z-50 border-t border-line bg-cream/95 px-4 py-3 text-ink backdrop-blur-md ${BAR_MIN_H} ${className}`}
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        aria-busy={!localMode && loading}
      >
        <div className="mx-auto flex max-w-pop items-center justify-between gap-3">
          <div className="min-w-0">
            {localMode ? (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                  Sur place · {cityLabel}
                </p>
                <p className="truncate text-lg font-bold tracking-tight">
                  {stopCount} stops prêts
                </p>
              </>
            ) : (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                  Dès · {originCity}
                </p>
                <p className="truncate text-lg font-bold tracking-tight">
                  {loading ? (
                    <span className="inline-block h-5 w-20 animate-pulse rounded bg-sand" />
                  ) : hasPrice ? (
                    <>
                      {formatEuro(data!.price_pp!)}
                      <span className="text-sm font-semibold text-ink-muted">
                        {' '}
                        / pers.
                      </span>
                    </>
                  ) : (
                    'Prix à venir'
                  )}
                </p>
              </>
            )}
          </div>
          <a
            href={plannerHref}
            className="relative shrink-0 overflow-hidden rounded-2xl bg-ink px-5 py-2.5 text-sm font-bold text-cream no-underline"
          >
            <span
              className="absolute inset-y-0 left-0 w-1 bg-[#FF6B35]"
              aria-hidden
            />
            Planner
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <aside
        className={`overflow-hidden rounded-[1.5rem] border border-[#E8C4B4] bg-[#F3D9CC] shadow-soft ${CARD_MIN_H}`}
        aria-busy={!localMode && loading}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#E8C4B4] bg-[#EBC8B8] px-5 py-3.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink">
            {localMode ? 'Week-end sur place' : 'Prix week-end'}
          </p>
          <p className="text-[11px] font-semibold text-ink/70">
            {stopCount} stops
          </p>
        </div>

        <div className="p-5 sm:p-6">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
              Je pars de
            </span>
            <div className="mt-2">
              <PopOriginSelect value={origin} onChange={onOriginChange} />
            </div>
          </label>

          {localMode ? (
            <div className="mt-5 overflow-hidden rounded-2xl bg-white ring-1 ring-line">
              <div className="border-b border-line bg-gradient-to-br from-accent-soft/80 to-white px-4 py-4 sm:px-5">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-accent">
                  Déjà à {cityLabel}
                </p>
                <p className="mt-1.5 text-[1.4rem] font-extrabold leading-[1.2] tracking-[-0.03em] text-ink">
                  Programme prêt.
                </p>
                <p className="mt-2 text-sm leading-snug text-ink/75">
                  Pas de trajet à chercher — glisse ce Pop dans ton Planner et
                  invite le groupe.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-px bg-line">
                <div className="bg-white px-4 py-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">
                    Stops
                  </p>
                  <p className="mt-1 text-2xl font-extrabold tracking-tight text-ink">
                    {stopCount}
                  </p>
                </div>
                <div className="bg-white px-4 py-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">
                    Format
                  </p>
                  <p className="mt-1 text-2xl font-extrabold tracking-tight text-ink">
                    Local
                  </p>
                </div>
              </div>
              <ul className="divide-y divide-line px-1">
                {[
                  'Parcours cadencé jour par jour',
                  'Idées d’hébergement sur place',
                  'Partage groupe en un tap',
                ].map((line) => (
                  <li
                    key={line}
                    className="flex items-center gap-3 px-3.5 py-3 text-sm font-medium text-ink"
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-extrabold text-accent"
                      aria-hidden
                    >
                      ✓
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-5 overflow-hidden rounded-2xl bg-white ring-1 ring-line">
              <div className="px-4 py-4 sm:px-5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                    vers {cityLabel}
                  </p>
                  {pricedLabel && hasPrice ? (
                    <p className="text-[10px] font-semibold text-ink-muted">
                      Vu {pricedLabel}
                    </p>
                  ) : null}
                </div>
                {loading ? (
                  <div className="mt-3 space-y-2">
                    <div className="h-10 w-40 animate-pulse rounded-lg bg-sand" />
                    <div className="h-4 w-28 animate-pulse rounded bg-sand/80" />
                  </div>
                ) : hasPrice ? (
                  <>
                    <p className="mt-2 text-[2.5rem] font-extrabold leading-none tracking-[-0.04em] text-ink">
                      {formatEuro(data!.price_pp!)}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-ink-muted">
                      / personne · week-end
                    </p>
                    {(data?.flight_pp != null || data?.hotel_pp != null) && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {data.flight_pp != null ? (
                          <span className="inline-flex items-center rounded-xl bg-cream px-3 py-1.5 text-xs font-bold text-ink ring-1 ring-line">
                            Trajet {formatEuro(data.flight_pp)}
                          </span>
                        ) : null}
                        {data.hotel_pp != null ? (
                          <span className="inline-flex items-center rounded-xl bg-cream px-3 py-1.5 text-xs font-bold text-ink ring-1 ring-line">
                            Hôtel {formatEuro(data.hotel_pp)}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="mt-3 rounded-xl bg-cream/80 px-3.5 py-3.5">
                    <p className="text-sm font-bold leading-snug text-ink">
                      Prix en cours de chasse
                    </p>
                    <p className="mt-1.5 text-sm leading-snug text-ink/70">
                      Dès qu’un bon plan sort depuis{' '}
                      <span className="font-extrabold text-ink">
                        {originCity}
                      </span>
                      , il s’affiche ici.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-5 space-y-2.5">
            <a href={plannerHref} className="wp-cta-planner">
              <span>Ajouter au Planner</span>
              <span className="wp-cta-planner-arrow" aria-hidden>
                →
              </span>
            </a>
            <p className="text-center text-[11px] font-semibold leading-snug text-ink-muted">
              {localMode
                ? 'Organise avec ton groupe, sans friction'
                : hasPrice
                  ? 'Tu valides les détails ensuite'
                  : 'On te prévient quand ça tombe'}
            </p>
            {!localMode ? (
              <a
                href={alertHref}
                className="inline-flex w-full items-center justify-center rounded-2xl border border-ink/10 bg-white/80 px-5 py-3 text-sm font-bold text-ink no-underline transition-colors hover:border-ink/25 hover:bg-white"
              >
                {hasPrice
                  ? 'Me prévenir si le prix baisse'
                  : 'Me prévenir dès qu’un prix est dispo'}
              </a>
            ) : null}
          </div>

          <div className="mt-5 border-t border-[#E8C4B4] pt-4">
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center gap-3 rounded-2xl bg-[#E8F8EE] px-4 py-3.5 no-underline transition-colors hover:bg-[#DFF5E8]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#25D366] text-white">
                <WhatsAppIcon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-ink">
                  Envoie au groupe
                </span>
                <span className="block text-xs leading-snug text-ink-muted">
                  Le même programme pour tout le monde
                </span>
              </span>
              <span className="shrink-0 text-sm font-bold text-ink" aria-hidden>
                →
              </span>
            </a>
          </div>
        </div>
      </aside>
    </div>
  )
}

function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.04 2c-5.46 0-9.91 4.4-9.91 9.83 0 1.74.46 3.43 1.34 4.92L2 22l5.42-1.4a9.96 9.96 0 0 0 4.62 1.15h.01c5.46 0 9.9-4.4 9.9-9.83S17.5 2 12.04 2zm5.75 13.93c-.24.67-1.4 1.23-1.93 1.31-.5.07-1.13.1-1.82-.11-.42-.13-.96-.31-1.65-.61-2.9-1.26-4.79-4.18-4.93-4.37-.14-.2-1.16-1.54-1.16-2.94 0-1.4.73-2.09 1-2.36.24-.25.53-.32.71-.32h.51c.16 0 .38-.06.59.45.24.58.81 2 .88 2.14.07.14.12.3.02.48-.09.2-.14.31-.27.48-.14.16-.29.36-.41.48-.14.14-.28.29-.12.56.16.28.7 1.15 1.5 1.86 1.03.92 1.9 1.2 2.17 1.34.27.14.43.12.59-.07.17-.2.7-.8.89-1.08.19-.27.38-.23.64-.14.27.1 1.7.8 1.99.95.29.14.48.22.55.34.08.13.08.74-.16 1.41z" />
    </svg>
  )
}
