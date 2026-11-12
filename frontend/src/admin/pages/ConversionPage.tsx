import { useEffect, useState } from 'react'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, Kpi, LoadingBlock, PageTitle } from '../components/PageState'

export function ConversionPage() {
  const [funnel, setFunnel] = useState<any>(null)
  const [cohorts, setCohorts] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([adminApi.productFunnel(14), adminApi.growthCohorts(28)])
      .then(([f, c]) => {
        setFunnel(f)
        setCohorts(c)
      })
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorBlock error={error} />
  if (!funnel) return <LoadingBlock />

  return (
    <div>
      <PageTitle title="Conversion" subtitle="Funnels produit + activation cohortes" />
      <div className="fw-grid fw-grid-3" style={{ marginBottom: '0.85rem' }}>
        <Kpi label="Signups fenêtre" value={cohorts?.signups_total ?? '—'} />
        <Kpi label="Activated" value={cohorts?.activated_users ?? '—'} />
        <Kpi label="Activation rate" value={cohorts?.activation_rate ?? '—'} />
      </div>
      <div className="fw-card">
        <strong>Top events {funnel.days}j</strong>
        <table className="fw-table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {(funnel.top_events || []).map((e: any) => (
              <tr key={e.event}>
                <td>{e.event}</td>
                <td>{e.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
