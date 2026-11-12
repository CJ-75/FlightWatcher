import { useEffect, useState } from 'react'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, LoadingBlock, PageTitle } from '../components/PageState'

export function AgentsRunsPage() {
  const [runs, setRuns] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminApi
      .agentRuns()
      .then((r: any) => setRuns(r.runs || []))
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorBlock error={error} />
  if (!runs) return <LoadingBlock />

  return (
    <div>
      <PageTitle title="Agent runs" subtitle="Historique des exécutions" />
      <div className="fw-card" style={{ overflowX: 'auto' }}>
        <table className="fw-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Agent</th>
              <th>Status</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{r.created_at}</td>
                <td>{r.agent_id}</td>
                <td>{r.status}</td>
                <td>{r.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!runs.length ? <p className="fw-muted">Aucun run.</p> : null}
      </div>
    </div>
  )
}
