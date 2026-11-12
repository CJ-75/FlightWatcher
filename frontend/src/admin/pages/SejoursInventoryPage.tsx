import { useEffect, useState } from 'react'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, Kpi, LoadingBlock, PageTitle } from '../components/PageState'

export function SejoursInventoryPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminApi.sejoursInventory().then(setData).catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorBlock error={error} />
  if (!data) return <LoadingBlock />

  return (
    <div>
      <PageTitle title="Inventaire Séjours" subtitle="Fraîcheur, couverture origin, Fri→Sun" />
      <div className="fw-grid fw-grid-4" style={{ marginBottom: '0.85rem' }}>
        <Kpi label="Total actifs" value={data.total ?? 0} />
        <Kpi label="Freshness %" value={data.freshness_pct ?? 0} hint={`${data.stale ?? 0} stale`} />
        <Kpi label="Fri→Sun %" value={data.fri_sun_pct ?? 0} hint={`${data.fri_sun_count ?? 0} deals`} />
        <Kpi label="Sans hotel_top3" value={data.missing_hotel ?? 0} />
      </div>
      <div className="fw-grid fw-grid-2">
        <div className="fw-card">
          <strong>Top origins</strong>
          <table className="fw-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>N</th>
              </tr>
            </thead>
            <tbody>
              {(data.top_origins || []).map((o: any) => (
                <tr key={o.code}>
                  <td>{o.code}</td>
                  <td>{o.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="fw-card">
          <strong>Top destinations</strong>
          <table className="fw-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>N</th>
              </tr>
            </thead>
            <tbody>
              {(data.top_destinations || []).map((o: any) => (
                <tr key={o.code}>
                  <td>{o.code}</td>
                  <td>{o.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
