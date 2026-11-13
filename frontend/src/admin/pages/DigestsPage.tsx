import { useEffect, useState } from 'react'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, Kpi, LoadingBlock } from '../components/PageState'

type Digests = {
  sent_7d?: number
  failed_7d?: number
  queued?: number
  source_table?: string
  ok?: boolean
}

export function DigestsPage() {
  const [data, setData] = useState<Digests | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      setData((await adminApi.digests()) as Digests)
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

  const failed = data?.failed_7d ?? 0

  return (
    <div>
      <div className="fw-page-head">
        <div>
          <h1 className="fw-display">Digests</h1>
          <p>Santé des envois (7 jours) — emails / alertes.</p>
        </div>
        <button type="button" className="fw-btn" onClick={() => void load()} disabled={loading}>
          {loading ? '…' : 'Rafraîchir'}
        </button>
      </div>

      <div className="fw-grid fw-grid-3" style={{ marginBottom: '1.15rem' }}>
        <Kpi label="Envoyés 7 j" value={data?.sent_7d ?? 0} />
        <Kpi label="Échecs 7 j" value={failed} hint={failed > 0 ? 'À investiguer' : 'OK'} />
        <Kpi label="En file" value={data?.queued ?? 0} hint={data?.source_table || '—'} />
      </div>

      <div className="fw-card">
        {failed > 0 ? (
          <span className="fw-badge warn">Frein growth — échecs digest</span>
        ) : (
          <span className="fw-badge ok">Digests OK</span>
        )}
        <p className="fw-muted" style={{ margin: '0.75rem 0 0', fontSize: '0.9rem' }}>
          Source : {data?.source_table || 'aucune table détectée'}
        </p>
      </div>
    </div>
  )
}
