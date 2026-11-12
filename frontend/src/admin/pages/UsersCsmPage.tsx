import { useCallback, useEffect, useState } from 'react'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, LoadingBlock } from '../components/PageState'

type OnboardingFilter = 'all' | 'done' | 'pending'

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

export function UsersCsmPage() {
  const [users, setUsers] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState({
    onboarded: 0,
    pending: 0,
    onboarded_pct: 0,
    inscrits_total: 0,
  })
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [qDraft, setQDraft] = useState('')
  const [onboarding, setOnboarding] = useState<OnboardingFilter>('all')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminApi.inscrits({
        page,
        page_size: 50,
        q: q || undefined,
        onboarding,
      })
      setUsers(res.users || [])
      setTotal(res.total || 0)
      setStats({
        onboarded: res.onboarded || 0,
        pending: res.pending || 0,
        onboarded_pct: res.onboarded_pct || 0,
        inscrits_total: res.inscrits_total || 0,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [page, q, onboarding])

  useEffect(() => {
    void load()
  }, [load])

  const pageCount = Math.max(1, Math.ceil(total / 50))

  return (
    <div>
      <div className="fw-page-head">
        <div>
          <h1 className="fw-display">Utilisateurs</h1>
          <p>
            {stats.inscrits_total} inscrits · {stats.onboarded} onboardés ({stats.onboarded_pct}
            %) · {stats.pending} en attente
          </p>
        </div>
      </div>

      <div className="fw-toolbar">
        <input
          className="fw-input"
          style={{ flex: '1 1 200px' }}
          placeholder="Rechercher email ou nom…"
          value={qDraft}
          onChange={(e) => setQDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(1)
              setQ(qDraft.trim())
            }
          }}
        />
        <button
          type="button"
          className="fw-btn fw-btn-primary"
          onClick={() => {
            setPage(1)
            setQ(qDraft.trim())
          }}
        >
          Chercher
        </button>
        <select
          className="fw-select"
          value={onboarding}
          onChange={(e) => {
            setPage(1)
            setOnboarding(e.target.value as OnboardingFilter)
          }}
        >
          <option value="all">Tous</option>
          <option value="done">Onboarding fait</option>
          <option value="pending">Onboarding en attente</option>
        </select>
      </div>

      {error ? (
        <div style={{ marginBottom: '0.75rem' }}>
          <ErrorBlock error={error} />
        </div>
      ) : null}

      {loading ? <LoadingBlock label="Chargement des inscrits…" /> : null}

      {!loading && (
        <>
          <div className="fw-table-wrap">
            <table className="fw-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Nom</th>
                  <th>Inscrit le</th>
                  <th>Onboarding</th>
                  <th>Onboarding le</th>
                  <th>Ville / aéroport</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 560 }}>{u.email || '—'}</td>
                    <td>{u.nom || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(u.inscrit_le)}</td>
                    <td>
                      <span className={`fw-badge ${u.onboarding_fait ? 'ok' : 'warn'}`}>
                        {u.onboarding_fait ? 'Oui' : 'Non'}
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
              <p className="fw-muted" style={{ padding: '1rem 1.1rem', margin: 0 }}>
                Aucun inscrit pour ces filtres.
              </p>
            ) : null}
          </div>

          <div
            style={{
              display: 'flex',
              gap: '0.55rem',
              alignItems: 'center',
              marginTop: '0.95rem',
              flexWrap: 'wrap',
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
              Page {page} / {pageCount} · {total} résultat(s)
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
