import { useEffect, useState } from 'react'
import { getAccessToken } from '../../lib/supabase'
import { resolveApiUrl } from '../../utils/apiBase'
import { StatsCard } from '../components/StatsCard'

type VolumeRow = {
  slug: string
  label?: string
  count: number
  badge_count?: number
  meets_chip_min?: boolean
  verified?: boolean
  kind?: string
  push?: boolean
}

type OccasionsAdmin = {
  ok?: boolean
  today?: string
  weather_enabled?: boolean
  wall_active?: number
  active_chips?: VolumeRow[]
  tag_volume?: VolumeRow[]
  unverified?: { slug: string; label?: string; kind?: string }[]
  pushable?: string[]
  recent_sends?: { channel?: string; occasion_slug?: string; sent_at?: string; deal_count?: number }[]
  error?: string
}

export function OccasionsPage() {
  const [data, setData] = useState<OccasionsAdmin | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const token = await getAccessToken()
        const res = await fetch(resolveApiUrl('/api/admin/deals-occasions'), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = (await res.json()) as OccasionsAdmin
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

  const volume = data?.tag_volume || []
  const chips = data?.active_chips || []
  const unverified = data?.unverified || []

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Occasions</h1>
        <p className="text-sm text-gray-400 mt-1">
          Volume tags mur · chips actifs · events non vérifiés
          {data?.today ? ` · ${data.today}` : ''}
        </p>
      </div>

      {loading ? <p className="text-gray-400">Chargement…</p> : null}
      {error ? <p className="text-red-400 text-sm">{error}</p> : null}
      {data?.error ? (
        <p className="text-amber-400 text-sm">Snapshot partiel : {data.error}</p>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard title="Mur actif" value={String(data?.wall_active ?? '—')} />
        <StatsCard title="Chips ≥3" value={String(chips.length)} />
        <StatsCard
          title="Météo"
          value={data?.weather_enabled ? 'ON' : 'OFF'}
        />
        <StatsCard title="Pushable" value={String(data?.pushable?.length ?? 0)} />
      </div>

      <section className="bg-[#1e2230] rounded-xl border border-gray-700 p-4">
        <h2 className="text-sm font-semibold text-gray-200 mb-3">Chips actifs aujourd’hui</h2>
        {chips.length === 0 ? (
          <p className="text-xs text-gray-500">Aucun chip avec ≥3 deals (ou tags pas encore matérialisés).</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <li
                key={c.slug}
                className="text-xs font-bold px-3 py-1.5 rounded-full bg-blue-600/20 text-blue-200 border border-blue-500/30"
              >
                {c.label || c.slug} · {c.count}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-[#1e2230] rounded-xl border border-gray-700 p-4 overflow-x-auto">
        <h2 className="text-sm font-semibold text-gray-200 mb-3">Volume par occasion</h2>
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-500 uppercase">
            <tr>
              <th className="py-2 pr-3">Slug</th>
              <th className="py-2 pr-3">Label</th>
              <th className="py-2 pr-3">Tags</th>
              <th className="py-2 pr-3">Badge</th>
              <th className="py-2 pr-3">Kind</th>
              <th className="py-2 pr-3">OK</th>
            </tr>
          </thead>
          <tbody>
            {volume.map((row) => (
              <tr key={row.slug} className="border-t border-gray-800 text-gray-300">
                <td className="py-2 pr-3 font-mono text-xs">{row.slug}</td>
                <td className="py-2 pr-3">{row.label}</td>
                <td className="py-2 pr-3 tabular-nums">{row.count}</td>
                <td className="py-2 pr-3 tabular-nums">{row.badge_count ?? 0}</td>
                <td className="py-2 pr-3 text-xs">{row.kind}</td>
                <td className="py-2 pr-3 text-xs">
                  {!row.verified ? (
                    <span className="text-amber-400">unverified</span>
                  ) : row.meets_chip_min ? (
                    <span className="text-emerald-400">chip</span>
                  ) : (
                    <span className="text-gray-500">&lt;3</span>
                  )}
                  {row.push ? ' · push' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="bg-[#1e2230] rounded-xl border border-gray-700 p-4">
        <h2 className="text-sm font-semibold text-gray-200 mb-3">Events non vérifiés</h2>
        {unverified.length === 0 ? (
          <p className="text-xs text-gray-500">Aucun.</p>
        ) : (
          <ul className="space-y-1 text-sm text-gray-400">
            {unverified.map((u) => (
              <li key={u.slug}>
                <span className="font-mono text-xs text-amber-300">{u.slug}</span>
                {' — '}
                {u.label} <span className="text-gray-600">({u.kind})</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(data?.recent_sends || []).length > 0 ? (
        <section className="bg-[#1e2230] rounded-xl border border-gray-700 p-4">
          <h2 className="text-sm font-semibold text-gray-200 mb-3">Derniers envois (Lot F)</h2>
          <ul className="space-y-1 text-xs text-gray-400 font-mono">
            {(data?.recent_sends || []).slice(0, 12).map((s, i) => (
              <li key={`${s.sent_at}-${i}`}>
                {s.sent_at?.slice(0, 16)} · {s.channel} · {s.occasion_slug} · n={s.deal_count}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
