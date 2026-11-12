import { useEffect, useState } from 'react'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, LoadingBlock, PageTitle } from '../components/PageState'

export function AuditPage() {
  const [items, setItems] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminApi
      .audit(150)
      .then((r: any) => setItems(r.items || []))
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorBlock error={error} />
  if (!items) return <LoadingBlock />

  return (
    <div>
      <PageTitle title="Audit" subtitle="Append-only — who / action / target" />
      <div className="fw-card" style={{ overflowX: 'auto' }}>
        <table className="fw-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id || `${row.created_at}-${row.action}`}>
                <td style={{ whiteSpace: 'nowrap' }}>{row.created_at}</td>
                <td>{row.actor_email || row.actor_user_id || '—'}</td>
                <td>{row.action}</td>
                <td>{row.target || '—'}</td>
                <td>{row.result || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items.length ? <p className="fw-muted">Aucun événement pour l’instant.</p> : null}
      </div>
    </div>
  )
}
