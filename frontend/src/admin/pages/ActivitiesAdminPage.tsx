import { useEffect, useState } from 'react'
import { getApiClient } from '../../utils/apiClient'
import { ErrorBlock, LoadingBlock } from '../components/PageState'

type FunnelRow = {
  event: string
  platform: string | null
  surface: string | null
  n: number
}

export function ActivitiesAdminPage() {
  const [migrations, setMigrations] = useState<Record<string, unknown> | null>(null)
  const [funnel, setFunnel] = useState<FunnelRow[]>([])
  const [platform, setPlatform] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      setLoading(true)
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
      } finally {
        setLoading(false)
      }
    })()
  }, [platform])

  const migrationsOk = migrations?.ok ?? migrations?.migrations_ok

  return (
    <div>
      <div className="fw-page-head">
        <div>
          <h1 className="fw-display">Activités</h1>
          <p>Flags, migrations et funnel d’événements.</p>
        </div>
      </div>

      {error ? (
        <div style={{ marginBottom: '0.75rem' }}>
          <ErrorBlock error={error} />
        </div>
      ) : null}

      {migrationsOk === false ? (
        <div className="fw-card" style={{ marginBottom: '0.95rem', borderColor: 'rgba(180,83,9,0.35)' }}>
          <span className="fw-badge warn">Attention</span>
          <p style={{ margin: '0.55rem 0 0', fontSize: '0.9rem' }}>
            Migrations activités manquantes — appliquer{' '}
            <code>apply_activities_lot_a_migration.sql</code> manuellement.
          </p>
        </div>
      ) : null}

      {loading && !migrations ? <LoadingBlock /> : null}

      {migrations ? (
        <div className="fw-card" style={{ marginBottom: '0.95rem' }}>
          <h2 className="fw-display" style={{ margin: '0 0 0.55rem', fontSize: '1.05rem' }}>
            Flags & migrations
          </h2>
          <pre
            style={{
              margin: 0,
              fontSize: '0.75rem',
              color: 'var(--fw-muted)',
              overflow: 'auto',
              maxHeight: 220,
            }}
          >
            {JSON.stringify(migrations, null, 2)}
          </pre>
        </div>
      ) : null}

      <div className="fw-card">
        <div className="fw-toolbar" style={{ marginBottom: '0.75rem', boxShadow: 'none', padding: 0, border: 'none' }}>
          <h2 className="fw-display" style={{ margin: 0, fontSize: '1.05rem', flex: 1 }}>
            Funnel events
          </h2>
          <select
            className="fw-select"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="">Toutes plateformes</option>
            <option value="web">web</option>
            <option value="ios">ios</option>
            <option value="android">android</option>
          </select>
        </div>
        <div className="fw-table-wrap" style={{ boxShadow: 'none' }}>
          <table className="fw-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Platform</th>
                <th>Surface</th>
                <th>N</th>
              </tr>
            </thead>
            <tbody>
              {funnel.map((r, i) => (
                <tr key={i}>
                  <td>{r.event}</td>
                  <td>{r.platform || '—'}</td>
                  <td>{r.surface || '—'}</td>
                  <td>{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!funnel.length ? (
            <p className="fw-muted" style={{ padding: '0.85rem', margin: 0 }}>
              Aucun event.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
