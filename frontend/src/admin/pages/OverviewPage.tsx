import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, Kpi, LoadingBlock } from '../components/PageState'

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
      <section className="fw-hero-accueil">
        <p className="eyebrow">FlightWatcher</p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
          }}
        >
          <div>
            <h1 className="fw-display">Accueil</h1>
            <p className="lede">
              Vue simple des inscrits et de l’onboarding — données fraîches
              {data?.cached ? ' (cache)' : ''}.
            </p>
          </div>
          <button
            type="button"
            className="fw-btn"
            onClick={() => load(true)}
            disabled={loading}
          >
            {loading ? '…' : 'Rafraîchir'}
          </button>
        </div>
      </section>

      <div className="fw-grid fw-grid-3" style={{ marginBottom: '1.15rem' }}>
        <Kpi label="Inscrits" value={data?.total ?? '—'} />
        <Kpi label="Onboarding terminé" value={data?.onboarded ?? '—'} />
        <Kpi
          label="Taux onboarding"
          value={data != null ? `${data.onboarded_pct}%` : '—'}
          hint={`${data?.pending ?? 0} encore en attente`}
        />
      </div>

      <div className="fw-card">
        <h2 className="fw-display" style={{ margin: '0 0 0.4rem', fontSize: '1.15rem' }}>
          Utilisateurs
        </h2>
        <p className="fw-muted" style={{ margin: '0 0 1rem', fontSize: '0.92rem' }}>
          Consulter chaque inscrit et savoir si l’onboarding est fait.
        </p>
        <div className="fw-cta-row">
          <Link to="/admin/users" className="fw-btn fw-btn-primary" style={{ textDecoration: 'none' }}>
            Voir les utilisateurs
          </Link>
          <Link to="/admin/parcours" className="fw-btn" style={{ textDecoration: 'none' }}>
            Parcours
          </Link>
        </div>
      </div>
    </div>
  )
}
