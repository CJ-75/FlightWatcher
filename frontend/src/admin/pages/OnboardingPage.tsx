import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, Kpi, LoadingBlock } from '../components/PageState'

type Filter = 'done' | 'pending' | 'all'

function formatDate(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function OnboardingPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [users, setUsers] = useState<any[]>([])
  const [stats, setStats] = useState({
    total: 0,
    onboarded: 0,
    pending: 0,
    onboarded_pct: 0,
  })
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminApi.inscrits({
        page,
        page_size: 50,
        onboarding: filter,
      })
      setUsers(res.users || [])
      setTotal(res.total || 0)
      setStats({
        total: res.inscrits_total || 0,
        onboarded: res.onboarded || 0,
        pending: res.pending || 0,
        onboarded_pct: res.onboarded_pct || 0,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [page, filter])

  useEffect(() => {
    void load()
  }, [load])

  const pageCount = Math.max(1, Math.ceil(total / 50))

  return (
    <div>
      <section className="fw-hero-accueil">
        <p className="eyebrow">Activation</p>
        <h1 className="fw-display">Onboarding</h1>
        <p className="lede">
          Qui a terminé le parcours d’accueil — séparé des fiches utilisateurs.
        </p>
      </section>

      <div className="fw-grid fw-grid-3" style={{ marginBottom: '1.15rem' }}>
        <Kpi label="Inscrits (base)" value={stats.total} />
        <Kpi label="Onboarding fait" value={stats.onboarded} />
        <Kpi
          label="Taux"
          value={`${stats.onboarded_pct}%`}
          hint={`${stats.pending} en attente`}
        />
      </div>

      <div className="fw-toolbar">
        {(
          [
            ['all', 'Tous'],
            ['done', 'Terminé'],
            ['pending', 'En attente'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`fw-btn${filter === id ? ' fw-btn-primary' : ''}`}
            onClick={() => {
              setPage(1)
              setFilter(id)
            }}
          >
            {label}
          </button>
        ))}
        <Link to="/admin/users" className="fw-btn" style={{ textDecoration: 'none', marginLeft: 'auto' }}>
          Fiches utilisateurs →
        </Link>
      </div>

      {error ? (
        <div style={{ marginBottom: '0.75rem' }}>
          <ErrorBlock error={error} />
        </div>
      ) : null}
      {loading ? <LoadingBlock /> : null}

      {!loading && (
        <>
          <div className="fw-table-wrap">
            <table className="fw-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Statut</th>
                  <th>Terminé le</th>
                  <th>Ville / aéroport</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 560 }}>{u.email || '—'}</td>
                    <td>
                      <span className={`fw-badge ${u.onboarding_fait ? 'ok' : 'warn'}`}>
                        {u.onboarding_fait ? 'Terminé' : 'En attente'}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(u.onboarding_le)}</td>
                    <td className="fw-muted">
                      {[u.ville, u.aeroport].filter(Boolean).join(' · ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!users.length ? (
              <p className="fw-muted" style={{ padding: '1rem', margin: 0 }}>
                Aucun résultat pour ce filtre.
              </p>
            ) : null}
          </div>
          <div
            style={{
              display: 'flex',
              gap: '0.55rem',
              alignItems: 'center',
              marginTop: '0.95rem',
            }}
          >
            <button
              type="button"
              className="fw-btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Précédent
            </button>
            <span className="fw-muted" style={{ fontSize: '0.85rem' }}>
              Page {page} / {pageCount}
            </span>
            <button
              type="button"
              className="fw-btn"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
            </button>
          </div>
        </>
      )}
    </div>
  )
}
