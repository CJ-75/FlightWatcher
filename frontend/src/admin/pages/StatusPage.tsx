import { useEffect, useState } from 'react'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, LoadingBlock, PageTitle } from '../components/PageState'

export function StatusPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminApi
      .status()
      .then(setData)
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorBlock error={error} />
  if (!data) return <LoadingBlock />

  return (
    <div>
      <PageTitle title="Status / Prod" subtitle={`Env: ${data.env || '—'} · ${data.generated_at || ''}`} />
      <div className="fw-grid fw-grid-2">
        {(data.checks || []).map((c: any) => (
          <div key={c.id} className="fw-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <strong>{c.id}</strong>
              <span className={`fw-badge ${c.ok ? 'ok' : 'bad'}`}>{c.ok ? 'OK' : 'FAIL'}</span>
            </div>
            <p className="fw-muted" style={{ margin: '0.45rem 0 0', fontSize: '0.88rem' }}>
              {c.detail}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
