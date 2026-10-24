import { useEffect, useState } from 'react'
import { getAccessToken } from '../../lib/supabase'
import { resolveApiUrl } from '../../utils/apiBase'
import { StatsCard } from '../components/StatsCard'

type Metrics = {
  generated_at?: string
  provider?: string
  liteapi_env?: string | null
  ui_enabled?: boolean
  booking_enabled?: boolean
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
  }
  go_no_go?: {
    ready?: boolean
    ready_with_warnings?: boolean
    blockers?: string[]
    warnings?: string[]
    checklist?: Array<{ id: string; label: string; status: string; note?: string }>
  }
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
          Observabilité L11 + checklist §12 (validation juridique hors app)
        </p>
      </div>

      {loading ? <p className="text-gray-400">Chargement…</p> : null}
      {error ? <p className="text-red-400 text-sm">{error}</p> : null}

      {data ? (
        <>
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-700 bg-[#252836] p-4">
              <p className="text-sm font-semibold mb-2">Funnel bookings</p>
              <pre className="text-xs text-gray-400 overflow-auto">
                {JSON.stringify(data.caches?.booking_funnel || {}, null, 2)}
              </pre>
            </div>
            <div className="rounded-xl border border-gray-700 bg-[#252836] p-4">
              <p className="text-sm font-semibold mb-2">Appels / endpoint</p>
              <pre className="text-xs text-gray-400 overflow-auto">
                {JSON.stringify(data.process?.calls_by_endpoint || {}, null, 2)}
              </pre>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
