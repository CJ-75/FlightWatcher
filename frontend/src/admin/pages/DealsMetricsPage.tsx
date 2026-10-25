import { useEffect, useState } from 'react'
import { getAccessToken } from '../../lib/supabase'
import { resolveApiUrl } from '../../utils/apiBase'
import { StatsCard } from '../components/StatsCard'

type RiseBlock = {
  n_clicks?: number
  n_rise?: number
  rise_pct?: number | null
}

type OriginRow = {
  origin_iata: string
  active: number
  live: number
  cached: number
  live_share?: number | null
  cached_share?: number | null
  avg_hours_since_verified?: number | null
}

type Launch = {
  kill_switch?: {
    cached_enabled_effective?: boolean
    runtime_flag?: string | null
    env_default?: boolean
    kill_min_clicks?: number
    kill_threshold?: number
  }
  price_rise?: {
    live_7d?: RiseBlock
    live_30d?: RiseBlock
    cached_7d?: RiseBlock
    cached_30d?: RiseBlock
  }
  mon_voyage_return?: {
    n_clicks_with_draft?: number
    n_returned?: number
    return_pct?: number | null
    window_h?: number
    days?: number
  }
  my_trip_funnel?: {
    days?: number
    counts?: Record<string, number>
    unique_drafts?: number
    view_to_paid_pct?: number | null
    error?: string
  }
  deals_by_origin?: {
    total_active?: number
    origins?: OriginRow[]
    error?: string
  }
  error?: string
}

type WallCheck = {
  id?: string
  label?: string
  ok?: boolean
  value?: number | string | null
  threshold?: string
}

type WallHealth = {
  ok?: boolean | null
  error?: string
  active_deals?: number
  fresh_hotel_rate_share?: number | null
  baselines_age_h?: number | null
  ryanair_403_share_1h?: number | null
  photo_by_origin?: Record<string, number>
  job_chain?: Record<string, { age_h?: number; max_age_h?: number } | undefined>
  invariants?: { ok?: boolean; red_count?: number; checks?: WallCheck[] }
}

type Metrics = {
  generated_at?: string
  provider?: string
  liteapi_env?: string | null
  ui_enabled?: boolean
  booking_enabled?: boolean
  launch?: Launch
  wall_health?: WallHealth
  process?: {
    calls_total?: number
    latency_ms_p50?: number | null
    latency_ms_p95?: number | null
    calls_by_endpoint?: Record<string, number>
  }
  caches?: {
    hotel_rates_cache?: Record<string, number>
    deal_flight_cache?: Record<string, number>
    booking_funnel?: Record<string, number>
    ssp?: {
      ssp_missing_pct?: number | null
      margin_gap_avg?: number | null
      hotels_scored?: number
    }
    community?: Record<string, unknown>
  }
  go_no_go?: {
    ready?: boolean
    ready_with_warnings?: boolean
    blockers?: string[]
    warnings?: string[]
    checklist?: Array<{ id: string; label: string; status: string; note?: string }>
  }
}

function pct(v: number | null | undefined) {
  if (v == null) return '—'
  return `${v}%`
}

function RiseCell({ label, block }: { label: string; block?: RiseBlock }) {
  return (
    <div className="rounded-lg bg-[#1a1d2a] px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-xl font-bold text-white mt-0.5">{pct(block?.rise_pct)}</p>
      <p className="text-xs text-gray-500">
        {block?.n_rise ?? 0} / {block?.n_clicks ?? 0} clics
      </p>
    </div>
  )
}

export function DealsMetricsPage() {
  const [data, setData] = useState<Metrics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessToken()
        const res = await fetch(resolveApiUrl('/api/admin/deals-metrics'), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!res.ok) throw new Error(await res.text())
        const json = (await res.json()) as Metrics
        if (!cancelled) setData(json)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const gng = data?.go_no_go
  const launch = data?.launch
  const wall = data?.wall_health
  const kill = launch?.kill_switch
  const rise = launch?.price_rise
  const ret = launch?.mon_voyage_return
  const funnel = launch?.my_trip_funnel
  const byOrigin = launch?.deals_by_origin
  const verdict = !gng
    ? '—'
    : gng.ready
      ? 'GO'
      : gng.ready_with_warnings
        ? 'GO (warnings)'
        : 'NO-GO'

  return (
    <div className="p-6 space-y-6 text-gray-100">
      <div>
        <h1 className="text-2xl font-bold">Deals · métriques</h1>
        <p className="text-sm text-gray-400 mt-1">
          Lot G + v3.3 santé mur · {data?.generated_at || '—'}
        </p>
      </div>

      {loading ? <p className="text-gray-400">Chargement…</p> : null}
      {error ? <p className="text-red-400 text-sm">{error}</p> : null}

      {data ? (
        <>
          {/* ——— v3.3 wall health ——— */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-white">Santé du mur (v3.3)</h2>
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                  wall?.ok
                    ? 'bg-emerald-900/50 text-emerald-300'
                    : wall?.ok === false
                      ? 'bg-red-900/50 text-red-300'
                      : 'bg-gray-800 text-gray-400'
                }`}
              >
                {wall?.ok ? 'VERT' : wall?.ok === false ? 'ROUGE' : '—'}
              </span>
            </div>
            {wall?.error ? (
              <p className="text-sm text-red-300">{wall.error}</p>
            ) : null}
            <p className="text-xs text-gray-500">
              Actifs {wall?.active_deals ?? '—'} · rates frais{' '}
              {wall?.fresh_hotel_rate_share != null
                ? `${Math.round(wall.fresh_hotel_rate_share * 100)}%`
                : '—'}{' '}
              · baselines {wall?.baselines_age_h != null ? `${wall.baselines_age_h.toFixed?.(1) ?? wall.baselines_age_h} h` : '—'}
            </p>
            <div className="rounded-xl border border-gray-700 bg-[#252836] divide-y divide-gray-800">
              {(wall?.invariants?.checks || []).map((c) => (
                <div
                  key={c.id || c.label}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="text-gray-300">{c.label}</span>
                  <span
                    className={
                      c.ok ? 'text-emerald-300 font-semibold' : 'text-red-300 font-semibold'
                    }
                  >
                    {String(c.value ?? '—')}
                    <span className="text-gray-500 font-normal ml-2">
                      ({c.threshold})
                    </span>
                  </span>
                </div>
              ))}
              {(wall?.invariants?.checks || []).length === 0 ? (
                <p className="px-4 py-3 text-gray-500 text-sm">Pas encore de checks</p>
              ) : null}
            </div>
          </section>

          {/* ——— Lot G ——— */}
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-white">Lancement (G)</h2>

            <div className="rounded-xl border border-gray-700 bg-[#252836] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-gray-300">
                  1. Taux de hausse au clic
                </p>
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                    kill?.cached_enabled_effective
                      ? 'bg-emerald-900/50 text-emerald-300'
                      : 'bg-red-900/50 text-red-300'
                  }`}
                >
                  Cached {kill?.cached_enabled_effective ? 'ON' : 'OFF (kill)'}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                Interrupteur C4 · flag=
                {kill?.runtime_flag ?? '—'} · seuil={kill?.kill_threshold ?? '—'} · min
                clics={kill?.kill_min_clicks ?? '—'}
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <RiseCell label="Live 7 j" block={rise?.live_7d} />
                <RiseCell label="Live 30 j" block={rise?.live_30d} />
                <RiseCell label="Cached 7 j" block={rise?.cached_7d} />
                <RiseCell label="Cached 30 j" block={rise?.cached_30d} />
              </div>
            </div>

            <div className="rounded-xl border border-gray-700 bg-[#252836] p-4 space-y-2">
              <p className="text-sm font-semibold text-gray-300">
                2. Retour Mon voyage (après clic sortant)
              </p>
              <p className="text-3xl font-black text-white">{pct(ret?.return_pct)}</p>
              <p className="text-sm text-gray-400">
                {ret?.n_returned ?? 0} retours / {ret?.n_clicks_with_draft ?? 0} clics avec
                brouillon · fenêtre {ret?.window_h ?? 24} h · {ret?.days ?? 7} j
              </p>
              <p className="text-xs text-gray-500">
                Compte : « J’ai réservé ✓ », feedback prix, ou rechargement de la page trip.
              </p>
            </div>

            <div className="rounded-xl border border-gray-700 bg-[#252836] p-4 space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-gray-300">
                  2b. Entonnoir Mon voyage (Lot E)
                </p>
                <p className="text-sm text-gray-400">
                  {funnel?.days ?? 7} j · {funnel?.unique_drafts ?? 0} voyages
                </p>
              </div>
              {funnel?.error ? (
                <p className="text-sm text-amber-300">
                  {funnel.error} — appliquez apply_mytrip_events_lot_e_migration.sql
                </p>
              ) : null}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {(
                  [
                    ['view', 'Vues'],
                    ['company_click', 'Clic compagnie'],
                    ['flight_booked_yes', 'Vol réservé'],
                    ['hotel_checkout_open', 'Checkout hôtel'],
                    ['hotel_paid', 'Hôtel payé'],
                    ['account_cta', 'CTA compte'],
                  ] as const
                ).map(([key, label]) => (
                  <div
                    key={key}
                    className="rounded-lg bg-gray-900/60 border border-gray-800 px-3 py-2"
                  >
                    <p className="text-[11px] text-gray-500 uppercase tracking-wide">
                      {label}
                    </p>
                    <p className="text-xl font-black text-white tabular-nums">
                      {funnel?.counts?.[key] ?? 0}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500">
                Vue → payé :{' '}
                {funnel?.view_to_paid_pct != null ? `${funnel.view_to_paid_pct} %` : '—'}
              </p>
            </div>

            <div className="rounded-xl border border-gray-700 bg-[#252836] p-4 space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-gray-300">
                  3. Deals actifs par origine
                </p>
                <p className="text-sm text-gray-400">
                  Total {byOrigin?.total_active ?? 0}
                </p>
              </div>
              {byOrigin?.error ? (
                <p className="text-sm text-red-300">{byOrigin.error}</p>
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-700">
                      <th className="py-2 pr-3 font-medium">Origine</th>
                      <th className="py-2 pr-3 font-medium">Actifs</th>
                      <th className="py-2 pr-3 font-medium">Live</th>
                      <th className="py-2 pr-3 font-medium">Cached</th>
                      <th className="py-2 font-medium">Âge vérif. moy.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(byOrigin?.origins || []).map((o) => (
                      <tr key={o.origin_iata} className="border-b border-gray-800">
                        <td className="py-2 pr-3 font-bold text-white">{o.origin_iata}</td>
                        <td className="py-2 pr-3">{o.active}</td>
                        <td className="py-2 pr-3 text-emerald-300">
                          {o.live}
                          {o.live_share != null
                            ? ` (${Math.round(o.live_share * 100)}%)`
                            : ''}
                        </td>
                        <td className="py-2 pr-3 text-amber-300">
                          {o.cached}
                          {o.cached_share != null
                            ? ` (${Math.round(o.cached_share * 100)}%)`
                            : ''}
                        </td>
                        <td className="py-2 text-gray-400">
                          {o.avg_hours_since_verified != null
                            ? `${o.avg_hours_since_verified} h`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                    {(byOrigin?.origins || []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-4 text-gray-500">
                          Aucun deal actif
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard title="Go / no-go" value={verdict} subtitle={data.provider || ''} />
            <StatsCard
              title="Appels LiteAPI (jour)"
              value={String(data.process?.calls_total ?? 0)}
              subtitle={`p50 ${data.process?.latency_ms_p50 ?? '—'} ms · p95 ${data.process?.latency_ms_p95 ?? '—'} ms`}
            />
            <StatsCard
              title="Rates cache OK"
              value={String(data.caches?.hotel_rates_cache?.ok ?? 0)}
              subtitle={`no_rates ${data.caches?.hotel_rates_cache?.no_rates ?? 0}`}
            />
            <StatsCard
              title="SSP missing"
              value={
                data.caches?.ssp?.ssp_missing_pct != null
                  ? `${data.caches.ssp.ssp_missing_pct}%`
                  : '—'
              }
              subtitle={`margin_gap avg ${data.caches?.ssp?.margin_gap_avg ?? '—'} €`}
            />
          </div>

          <div className="rounded-xl border border-gray-700 bg-[#252836] p-4 space-y-2">
            <p className="text-sm font-semibold text-gray-300">Flags</p>
            <p className="text-sm text-gray-400">
              env={data.liteapi_env || '—'} · UI={String(data.ui_enabled)} · booking=
              {String(data.booking_enabled)}
            </p>
            {(gng?.blockers || []).length ? (
              <ul className="text-sm text-red-300 list-disc pl-5">
                {gng!.blockers!.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
            {(gng?.warnings || []).length ? (
              <ul className="text-sm text-amber-300 list-disc pl-5">
                {gng!.warnings!.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="rounded-xl border border-gray-700 bg-[#252836] p-4">
            <p className="text-sm font-semibold text-gray-300 mb-3">Checklist §12</p>
            <ul className="space-y-2">
              {(gng?.checklist || []).map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-sm border-b border-gray-700/60 pb-2"
                >
                  <span className="text-gray-200">{c.label}</span>
                  <span
                    className={
                      c.status === 'ok'
                        ? 'text-emerald-400 font-bold'
                        : c.status === 'todo'
                          ? 'text-amber-400 font-bold'
                          : 'text-gray-400 font-bold'
                    }
                  >
                    {c.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  )
}
