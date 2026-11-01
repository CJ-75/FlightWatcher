import { useEffect, useState } from 'react'
import { getApiClient } from '../../utils/apiClient'

type FunnelRow = {
  event: string
  platform: string | null
  surface: string | null
  n: number
}

export function ActivitiesAdminPage() {
  const [migrations, setMigrations] = useState<Record<string, unknown> | null>(null)
  const [funnel, setFunnel] = useState<FunnelRow[]>([])
  const [platform, setPlatform] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const api = getApiClient()
        const cfg = await api.getConfig()
        const migRes = await fetch('/api/admin/activities/migrations', {
          credentials: 'include',
        })
        const migBody = migRes.ok ? await migRes.json() : {}
        setMigrations({
          ...migBody,
          activities_ui_enabled: cfg.activities_ui_enabled,
          planner_activities_enabled: cfg.planner_activities_enabled,
          itineraries_enabled: cfg.itineraries_enabled,
        })
        const q = platform ? `?platform=${encodeURIComponent(platform)}` : ''
        const res = await fetch(`/api/admin/activities/events${q}`, {
          credentials: 'include',
        })
        if (res.ok) {
          const body = await res.json()
          setFunnel(Array.isArray(body.funnel) ? body.funnel : [])
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur')
      }
    })()
  }, [platform])

  const migrationsOk = migrations?.ok ?? migrations?.migrations_ok

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Activités / mesure</h1>
      {error ? <p className="text-red-400 text-sm">{error}</p> : null}

      {migrationsOk === false ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Migrations activités manquantes — appliquer{' '}
          <code className="text-amber-50">apply_activities_lot_a_migration.sql</code>{' '}
          manuellement (pas de db push).
        </div>
      ) : null}

      <section className="rounded-xl bg-[#232736] p-4 space-y-2">
        <h2 className="font-semibold text-gray-200">Flags & migrations</h2>
        <pre className="text-xs text-gray-400 overflow-auto">
          {JSON.stringify(migrations, null, 2)}
        </pre>
      </section>

      <section className="rounded-xl bg-[#232736] p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <h2 className="font-semibold text-gray-200 flex-1">Funnel events</h2>
          <select
            className="bg-[#1a1d29] border border-gray-700 rounded-lg px-2 py-1 text-sm"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="">Toutes plateformes</option>
            <option value="web">web</option>
            <option value="ios">ios</option>
            <option value="android">android</option>
          </select>
        </div>
        <table className="w-full text-sm text-left">
          <thead className="text-gray-500">
            <tr>
              <th className="py-1">event</th>
              <th>platform</th>
              <th>surface</th>
              <th>n</th>
            </tr>
          </thead>
          <tbody>
            {funnel.map((r, i) => (
              <tr key={i} className="border-t border-gray-800 text-gray-300">
                <td className="py-1.5">{r.event}</td>
                <td>{r.platform || '—'}</td>
                <td>{r.surface || '—'}</td>
                <td>{r.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!funnel.length ? (
          <p className="text-xs text-gray-500">Aucun event (applique la migration Lot A).</p>
        ) : null}
      </section>
    </div>
  )
}
