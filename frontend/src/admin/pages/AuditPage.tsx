import { useEffect, useState } from 'react'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, LoadingBlock } from '../components/PageState'

type AuditRow = {
  id?: string
  created_at?: string
  actor_email?: string
  actor_user_id?: string
  action?: string
  target?: string
  result?: string
}

function fmtWhen(iso?: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function AuditPage() {
  const [items, setItems] = useState<AuditRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = (await adminApi.audit(50)) as { items?: AuditRow[] }
      setItems(r.items || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (loading && !items) return <LoadingBlock />
  if (error && !items) return <ErrorBlock error={error} />

  return (
    <div>
      <div className="fw-page-head">
        <div>
          <h1 className="fw-display">Journal</h1>
          <p>Audit append-only — qui / action / cible.</p>
        </div>
        <button type="button" className="fw-btn" onClick={() => void load()} disabled={loading}>
          {loading ? '…' : 'Rafraîchir'}
        </button>
      </div>

      <div className="fw-table-wrap">
        <table className="fw-table">
          <thead>
            <tr>
              <th>Quand</th>
              <th>Acteur</th>
              <th>Action</th>
              <th>Cible</th>
              <th>Résultat</th>
            </tr>
          </thead>
          <tbody>
            {(items || []).map((row, i) => (
              <tr key={row.id || `${row.created_at}-${row.action}-${i}`}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtWhen(row.created_at)}</td>
                <td>{row.actor_email || row.actor_user_id || '—'}</td>
                <td>
                  <span className="fw-badge">{row.action || '—'}</span>
                </td>
                <td>{row.target || '—'}</td>
                <td>{row.result || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!items?.length ? (
          <p className="fw-muted" style={{ padding: '1rem' }}>
            Aucun événement pour l’instant.
          </p>
        ) : null}
      </div>
    </div>
  )
}
