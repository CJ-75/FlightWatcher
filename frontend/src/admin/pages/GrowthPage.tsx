import { useEffect, useState } from 'react'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, Kpi, LoadingBlock, PageTitle } from '../components/PageState'

export function GrowthPage() {
  const [kpis, setKpis] = useState<any>(null)
  const [cohorts, setCohorts] = useState<any>(null)
  const [digests, setDigests] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([adminApi.growthKpis(), adminApi.growthCohorts(28), adminApi.digests()])
      .then(([k, c, d]) => {
        setKpis(k)
        setCohorts(c)
        setDigests(d)
      })
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorBlock error={error} />
  if (!kpis) return <LoadingBlock />

  return (
    <div>
      <PageTitle title="Growth / Loops" subtitle="Levers, virality, digests — pas de vanity metrics" />
      <div className="fw-grid fw-grid-4" style={{ marginBottom: '0.85rem' }}>
        <Kpi label="WAU" value={kpis.wau ?? '—'} />
        <Kpi label="DAU" value={kpis.dau ?? '—'} />
        <Kpi label="Invites 7j" value={kpis.invites_7d ?? '—'} />
        <Kpi label="Shares 7j" value={kpis.shares_7d ?? '—'} />
      </div>
      <div className="fw-grid fw-grid-2">
        <div className="fw-card">
          <strong>Activation / cohortes</strong>
          <p className="fw-muted" style={{ fontSize: '0.88rem' }}>
            Signups {cohorts?.signups_total ?? '—'} · activated {cohorts?.activated_users ?? '—'} · rate{' '}
            {cohorts?.activation_rate ?? '—'}
          </p>
          <table className="fw-table">
            <thead>
              <tr>
                <th>Jour</th>
                <th>Signups</th>
              </tr>
            </thead>
            <tbody>
              {(cohorts?.signups_by_day || []).slice(-14).map((d: any) => (
                <tr key={d.day}>
                  <td>{d.day}</td>
                  <td>{d.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="fw-card">
          <strong>Digests health</strong>
          <p style={{ marginTop: '0.5rem' }}>
            Sent 7j: <strong>{digests?.sent_7d ?? 0}</strong>
            <br />
            Failed: <strong>{digests?.failed_7d ?? 0}</strong>
            <br />
            Queued: <strong>{digests?.queued ?? 0}</strong>
          </p>
          {(digests?.failed_7d || 0) > 0 ? (
            <span className="fw-badge warn">Growth brake — digest fails</span>
          ) : (
            <span className="fw-badge ok">Digests OK</span>
          )}
        </div>
      </div>
    </div>
  )
}
