import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, LoadingBlock } from '../components/PageState'
import { adminCacheKey, adminSwr, peekAdminCache } from '../lib/adminCache'

type Pipeline = 'none' | 'selected' | 'booked'

type PlannerRow = {
  id: string
  name?: string
  user_id?: string | null
  user: string
  status: string
  destination: string
  departure_airport?: string | null
  out_date?: string | null
  ret_date?: string | null
  flight: Pipeline
  hotel: Pipeline
  activities: number
  updated_at?: string | null
}

const PAGE_SIZE = 20

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  planning: 'Planning',
  scanning: 'Scan',
  locked: 'Vol choisi',
  completed: 'Terminé',
  archived: 'Archivé',
}

const PIPE_LABEL: Record<Pipeline, string> = {
  none: '—',
  selected: 'Choisi',
  booked: 'Réservé',
}

function shortId(id: string) {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id
}

function formatDate(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso.slice(0, 10)
  }
}

function pipeBadge(state: Pipeline) {
  if (state === 'booked') return 'ok'
  if (state === 'selected') return 'warn'
  return ''
}

export function PlannerAdminPage() {
  const [rows, setRows] = useState<PlannerRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasRows = useRef(false)

  const load = useCallback(
    async (force = false) => {
      const key = adminCacheKey(['planners', page, PAGE_SIZE, status])
      const cached = peekAdminCache<{
        items: PlannerRow[]
        total: number
      }>(key)
      if (cached && !force) {
        setRows(cached.items || [])
        setTotal(cached.total || 0)
        hasRows.current = true
        setLoading(false)
      } else if (!hasRows.current) {
        setLoading(true)
      }
      setError(null)
      try {
        const { data: res } = await adminSwr({
          key,
          force,
          ttlMs: 20_000,
          staleMs: 90_000,
          fetcher: () =>
            adminApi.planners({
              page,
              page_size: PAGE_SIZE,
              status: status === 'all' ? undefined : status,
            }),
        })
        if (!res.ok && res.error) throw new Error(res.error)
        setRows(res.items || [])
        setTotal(res.total || 0)
        hasRows.current = true
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur')
      } finally {
        setLoading(false)
      }
    },
    [page, status],
  )

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)

  return (
    <div>
      <div className="fw-page-head">
        <div>
          <h1 className="fw-display">Planner</h1>
          <p>Séjours créés — {total} au total · {PAGE_SIZE} / page</p>
        </div>
        <button
          type="button"
          className="fw-btn"
          onClick={() => void load(true)}
          disabled={loading}
        >
          {loading ? '…' : 'Rafraîchir'}
        </button>
      </div>

      <div
        className="fw-toolbar"
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '0.85rem' }}
      >
        <select
          className="fw-input"
          value={status}
          onChange={(e) => {
            setPage(1)
            setStatus(e.target.value)
            hasRows.current = false
          }}
          aria-label="Filtrer statut"
        >
          <option value="all">Tous les statuts</option>
          <option value="planning">Planning</option>
          <option value="scanning">Scan</option>
          <option value="locked">Vol choisi</option>
          <option value="completed">Terminé</option>
          <option value="draft">Brouillon</option>
        </select>
      </div>

      {error ? (
        <div style={{ marginBottom: '0.75rem' }}>
          <ErrorBlock error={error} />
        </div>
      ) : null}
      {loading && !rows.length ? <LoadingBlock label="Chargement planners…" /> : null}

      {!loading || rows.length ? (
        <div className="fw-table-wrap">
          <table className="fw-table">
            <thead>
              <tr>
                <th>Id</th>
                <th>User</th>
                <th>Statut</th>
                <th>Destination</th>
                <th>Départ</th>
                <th>Vol</th>
                <th>Hôtel</th>
                <th>Activités</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="fw-muted" style={{ textAlign: 'center' }}>
                    Aucun séjour
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link
                        to={`/planner/${encodeURIComponent(r.id)}`}
                        title={r.id}
                        style={{
                          fontFamily: 'ui-monospace, monospace',
                          fontSize: '0.8rem',
                          color: 'var(--fw-accent)',
                          textDecoration: 'none',
                          fontWeight: 600,
                        }}
                      >
                        {shortId(r.id)}
                      </Link>
                      {r.name ? (
                        <div className="fw-muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                          {r.name}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.85rem' }}>{r.user}</span>
                    </td>
                    <td>
                      <span
                        className={`fw-badge ${
                          r.status === 'completed'
                            ? ''
                            : r.status === 'locked'
                              ? 'ok'
                              : r.status === 'scanning'
                                ? 'warn'
                                : 'warn'
                        }`}
                      >
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </td>
                    <td>
                      <strong>{r.destination}</strong>
                      {r.departure_airport ? (
                        <div className="fw-muted" style={{ fontSize: '0.75rem' }}>
                          ← {r.departure_airport}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                      {formatDate(r.out_date)}
                      {r.ret_date ? (
                        <span className="fw-muted"> → {formatDate(r.ret_date)}</span>
                      ) : null}
                    </td>
                    <td>
                      <span className={`fw-badge ${pipeBadge(r.flight)}`}>
                        {PIPE_LABEL[r.flight]}
                      </span>
                    </td>
                    <td>
                      <span className={`fw-badge ${pipeBadge(r.hotel)}`}>
                        {PIPE_LABEL[r.hotel]}
                      </span>
                    </td>
                    <td>{r.activities > 0 ? r.activities : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {total > 0 ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginTop: '0.85rem',
            flexWrap: 'wrap',
          }}
        >
          <p className="fw-muted" style={{ margin: 0, fontSize: '0.85rem' }}>
            {from}–{to} sur {total}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="fw-btn"
              disabled={page <= 1 || loading}
              onClick={() => {
                hasRows.current = false
                setPage((p) => Math.max(1, p - 1))
              }}
            >
              ← Préc.
            </button>
            <span
              className="fw-muted"
              style={{ alignSelf: 'center', fontSize: '0.85rem', minWidth: 64, textAlign: 'center' }}
            >
              {page} / {totalPages}
            </span>
            <button
              type="button"
              className="fw-btn"
              disabled={page >= totalPages || loading}
              onClick={() => {
                hasRows.current = false
                setPage((p) => p + 1)
              }}
            >
              Suiv. →
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
