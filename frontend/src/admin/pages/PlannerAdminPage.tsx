import { useEffect, useState } from 'react'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, LoadingBlock, PageTitle } from '../components/PageState'

export function PlannerAdminPage() {
  const [funnel, setFunnel] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminApi
      .productFunnel(21)
      .then(setFunnel)
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorBlock error={error} />
  if (!funnel) return <LoadingBlock />

  const plannerEvents = (funnel.top_events || []).filter((e: any) =>
    /planner|invite|trip|booking/i.test(String(e.event || ''))
  )

  return (
    <div>
      <PageTitle title="Planner / booking" subtitle="Events planner · invites · booking" />
      <div className="fw-card">
        <table className="fw-table">
          <thead>
            <tr>
              <th>Event</th>
              <th>N</th>
            </tr>
          </thead>
          <tbody>
            {(plannerEvents.length ? plannerEvents : funnel.top_events || []).slice(0, 20).map((e: any) => (
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
