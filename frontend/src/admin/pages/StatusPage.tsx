import { useEffect, useState } from 'react'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, LoadingBlock } from '../components/PageState'

type Check = { id: string; ok: boolean; detail?: string }
type Status = {
  ok?: boolean
  env?: string
  generated_at?: string
  checks?: Check[]
}

export function StatusPage() {
  const [data, setData] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setData((await adminApi.status()) as Status)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (loading && !data) return <LoadingBlock />
  if (error && !data) return <ErrorBlock error={error} />

  const checks = data?.checks || []
  const allOk = checks.length > 0 && checks.every((c) => c.ok)

  return (
    <div>
      <div className="fw-page-head">
        <div>
          <h1 className="fw-display">Santé</h1>
          <p>
            Environnement {data?.env || '—'}
            {data?.generated_at ? ` · ${data.generated_at}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center' }}>
          <span className={`fw-badge ${allOk ? 'ok' : 'bad'}`}>
            {allOk ? 'Tous OK' : 'Incident'}
          </span>
          <button type="button" className="fw-btn" onClick={() => void load()} disabled={loading}>
            {loading ? '…' : 'Rafraîchir'}
          </button>
        </div>
      </div>

      <div className="fw-grid fw-grid-2">
        {checks.map((c) => (
          <div key={c.id} className="fw-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <strong style={{ textTransform: 'capitalize' }}>{c.id.replace(/_/g, ' ')}</strong>
              <span className={`fw-badge ${c.ok ? 'ok' : 'bad'}`}>{c.ok ? 'OK' : 'FAIL'}</span>
            </div>
            <p className="fw-muted" style={{ margin: '0.45rem 0 0', fontSize: '0.88rem' }}>
              {c.detail || '—'}
            </p>
          </div>
        ))}
        {!checks.length ? (
          <div className="fw-card fw-muted">Aucun check renvoyé par l’API.</div>
        ) : null}
      </div>
    </div>
  )
}
