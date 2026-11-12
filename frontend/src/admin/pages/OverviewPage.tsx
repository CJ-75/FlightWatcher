import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, Kpi, LoadingBlock, PageTitle } from '../components/PageState'

export function OverviewPage() {
  const [data, setData] = useState<{
    total: number
    onboarded: number
    pending: number
    onboarded_pct: number
    cached?: boolean
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async (force = false) => {
    setLoading(true)
    setError(null)
    try {
      const s = await adminApi.inscritsStats(force)
      setData(s)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (loading && !data) return <LoadingBlock label="Chargement…" />
  if (error && !data) return <ErrorBlock error={error} />

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <PageTitle
          title="Accueil"
          subtitle={data?.cached ? 'Inscrits & onboarding (cache)' : 'Inscrits & onboarding'}
        />
        <button type="button" className="fw-btn" onClick={() => load(true)} disabled={loading}>
          {loading ? '…' : 'Rafraîchir'}
        </button>
      </div>

      <div className="fw-grid fw-grid-3" style={{ marginBottom: '1rem' }}>
        <Kpi label="Inscrits" value={data?.total ?? '—'} />
        <Kpi label="Onboarding terminé" value={data?.onboarded ?? '—'} />
        <Kpi
          label="Taux onboarding"
          value={data != null ? `${data.onboarded_pct}%` : '—'}
          hint={`${data?.pending ?? 0} en attente`}
        />
      </div>

      <div className="fw-card">
        <p style={{ margin: '0 0 0.75rem' }}>
          Voir la liste des inscrits et le statut d’onboarding de chacun.
        </p>
        <Link to="/admin/users" className="fw-btn fw-btn-primary" style={{ textDecoration: 'none' }}>
          Ouvrir les utilisateurs
        </Link>
      </div>
    </div>
  )
}
