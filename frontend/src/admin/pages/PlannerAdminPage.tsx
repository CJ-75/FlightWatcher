import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, Kpi, LoadingBlock } from '../components/PageState'
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
  from_pop?: boolean
  want_flight?: boolean | null
  want_hotel?: boolean | null
  issues?: string[]
  updated_at?: string | null
}

type OpsKpis = {
  trips_sample: number
  from_pop: number
  want_flight: number
  want_hotel: number
  hotel_booked: number
  issues: number
}

type OpsIssue = {
  id: string
  name?: string
  user: string
  status: string
  destination: string
  from_pop?: boolean
  issues: string[]
  issue_labels: string[]
  updated_at?: string | null
}

type TripDetail = NonNullable<
  Awaited<ReturnType<typeof adminApi.plannerDetail>>['trip']
>

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

function yn(v: boolean | null | undefined) {
  if (v === true) return 'oui'
  if (v === false) return 'non'
  return '—'
}

export function PlannerAdminPage() {
  const [rows, setRows] = useState<PlannerRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasRows = useRef(false)

  const [kpis, setKpis] = useState<OpsKpis | null>(null)
  const [opsIssues, setOpsIssues] = useState<OpsIssue[]>([])
  const [opsSample, setOpsSample] = useState(0)
  const [opsLoading, setOpsLoading] = useState(true)

  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<TripDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const loadOps = useCallback(async (force = false) => {
    const key = adminCacheKey(['planners-ops', 80])
    const cached = peekAdminCache<{
      kpis: OpsKpis
      issues: OpsIssue[]
      sample: number
    }>(key)
    if (cached && !force) {
      setKpis(cached.kpis)
      setOpsIssues(cached.issues || [])
      setOpsSample(cached.sample || 0)
      setOpsLoading(false)
    } else {
      setOpsLoading(true)
    }
    try {
      const { data: res } = await adminSwr({
        key,
        force,
        ttlMs: 30_000,
        staleMs: 120_000,
        fetcher: () => adminApi.plannersOps(80),
      })
      if (!res.ok && res.error) throw new Error(res.error)
      setKpis(res.kpis || null)
      setOpsIssues(res.issues || [])
      setOpsSample(res.sample || res.kpis?.trips_sample || 0)
    } catch {
      /* keep cache */
    } finally {
      setOpsLoading(false)
    }
  }, [])

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

  const openDetail = useCallback(async (id: string) => {
    setDetailId(id)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const res = await adminApi.plannerDetail(id)
      if (!res.ok || !res.trip) throw new Error(res.error || 'Introuvable')
      setDetail(res.trip)
    } catch (e) {
      setDetailError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void loadOps()
  }, [loadOps])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)

  return (
    <div>
      <div className="fw-page-head">
        <div>
          <h1 className="fw-display">Planner</h1>
          <p>
            Séjours — {total} au total
            {opsSample ? ` · ops sur ${opsSample} récents` : ''}
          </p>
        </div>
        <button
          type="button"
          className="fw-btn"
          onClick={() => {
            void load(true)
            void loadOps(true)
          }}
          disabled={loading || opsLoading}
        >
          {loading || opsLoading ? '…' : 'Rafraîchir'}
        </button>
      </div>

      <div className="fw-grid fw-grid-3" style={{ marginBottom: '1rem' }}>
        <Kpi
          label="Pops → séjours"
          value={kpis?.from_pop ?? '—'}
          hint={`sur ${kpis?.trips_sample ?? opsSample ?? '—'} récents`}
        />
        <Kpi
          label="Opt-in vol / hôtel"
          value={
            kpis
              ? `${kpis.want_flight} / ${kpis.want_hotel}`
              : '—'
          }
          hint={`hôtel réservé : ${kpis?.hotel_booked ?? '—'}`}
        />
        <Kpi
          label="Problèmes"
          value={kpis?.issues ?? '—'}
          hint="Pop source, draft, hôtel"
        />
      </div>

      {opsIssues.length > 0 ? (
        <section style={{ marginBottom: '1.15rem' }}>
          <h2 className="fw-section-title" style={{ marginBottom: 8 }}>
            À traiter
          </h2>
          <div className="fw-table-wrap">
            <table className="fw-table">
              <thead>
                <tr>
                  <th>Séjour</th>
                  <th>User</th>
                  <th>Problème</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {opsIssues.slice(0, 12).map((it) => (
                  <tr key={it.id}>
                    <td>
                      <strong>{it.destination}</strong>
                      <div className="fw-muted" style={{ fontSize: '0.75rem' }}>
                        {it.name || shortId(it.id)}
                        {it.from_pop ? ' · Pop' : ''}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>{it.user}</td>
                    <td>
                      {(it.issue_labels || []).map((lab) => (
                        <span
                          key={lab}
                          className="fw-badge warn"
                          style={{ marginRight: 4 }}
                        >
                          {lab}
                        </span>
                      ))}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="fw-btn"
                        style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                        onClick={() => void openDetail(it.id)}
                      >
                        Fiche
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {detailId ? (
        <section
          className="fw-card"
          style={{
            marginBottom: '1.15rem',
            padding: '1rem 1.1rem',
            border: '1px solid var(--fw-border, #e8dfd6)',
            borderRadius: 12,
            background: 'var(--fw-card, #fff)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'flex-start',
              marginBottom: 10,
            }}
          >
            <div>
              <p className="eyebrow" style={{ margin: 0 }}>
                Fiche séjour
              </p>
              <h2 className="fw-section-title" style={{ margin: '4px 0 0' }}>
                {detail?.destination || shortId(detailId)}
              </h2>
            </div>
            <button
              type="button"
              className="fw-btn"
              onClick={() => {
                setDetailId(null)
                setDetail(null)
              }}
            >
              Fermer
            </button>
          </div>
          {detailLoading ? <LoadingBlock label="Chargement fiche…" /> : null}
          {detailError ? <ErrorBlock error={detailError} /> : null}
          {detail ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 10,
                fontSize: '0.9rem',
              }}
            >
              <div>
                <div className="fw-muted">User</div>
                <strong>{detail.user}</strong>
              </div>
              <div>
                <div className="fw-muted">Statut</div>
                <strong>{STATUS_LABEL[detail.status] || detail.status}</strong>
              </div>
              <div>
                <div className="fw-muted">Dates</div>
                <strong>
                  {formatDate(detail.out_date)} → {formatDate(detail.ret_date)}
                </strong>
              </div>
              <div>
                <div className="fw-muted">Pop</div>
                <strong>{detail.from_pop ? 'oui' : 'non'}</strong>
              </div>
              <div>
                <div className="fw-muted">Want vol / hôtel</div>
                <strong>
                  {yn(detail.want_flight)} / {yn(detail.want_hotel)}
                </strong>
              </div>
              <div>
                <div className="fw-muted">Vol / hôtel</div>
                <strong>
                  {PIPE_LABEL[detail.flight]} / {PIPE_LABEL[detail.hotel]}
                </strong>
              </div>
              <div>
                <div className="fw-muted">Externes</div>
                <strong>
                  vol {detail.flight_external ? 'oui' : 'non'} · hôtel{' '}
                  {detail.hotel_external ? 'oui' : 'non'}
                </strong>
              </div>
              <div>
                <div className="fw-muted">Activités</div>
                <strong>
                  {detail.activities.active} actives
                  {detail.activities.viator
                    ? ` · ${detail.activities.viator} Viator`
                    : ''}
                  {detail.activities.pop
                    ? ` · ${detail.activities.pop} Pop`
                    : ''}
                  {detail.activities.skipped
                    ? ` · ${detail.activities.skipped} retirées`
                    : ''}
                </strong>
              </div>
              {detail.source_itinerary_id ? (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div className="fw-muted">Source Pop</div>
                  <code style={{ fontSize: '0.8rem' }}>
                    {detail.source_itinerary_id}
                  </code>
                </div>
              ) : null}
              {detail.issue_labels?.length ? (
                <div style={{ gridColumn: '1 / -1' }}>
                  {(detail.issue_labels || []).map((lab) => (
                    <span
                      key={lab}
                      className="fw-badge warn"
                      style={{ marginRight: 6 }}
                    >
                      {lab}
                    </span>
                  ))}
                </div>
              ) : null}
              <div
                style={{
                  gridColumn: '1 / -1',
                  display: 'flex',
                  gap: 8,
                  flexWrap: 'wrap',
                  marginTop: 4,
                }}
              >
                <Link
                  className="fw-btn"
                  to={`/planner/${encodeURIComponent(detail.id)}`}
                >
                  Ouvrir séjour
                </Link>
                {detail.draft_token ? (
                  <Link
                    className="fw-btn"
                    to={`/trip/${encodeURIComponent(detail.draft_token)}`}
                  >
                    Ouvrir draft
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

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
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="fw-muted" style={{ textAlign: 'center' }}>
                    Aucun séjour
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <button
                        type="button"
                        onClick={() => void openDetail(r.id)}
                        title={r.id}
                        style={{
                          fontFamily: 'ui-monospace, monospace',
                          fontSize: '0.8rem',
                          color: 'var(--fw-accent)',
                          background: 'none',
                          border: 0,
                          padding: 0,
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
                      >
                        {shortId(r.id)}
                      </button>
                      {r.name ? (
                        <div className="fw-muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                          {r.name}
                          {r.from_pop ? ' · Pop' : ''}
                        </div>
                      ) : r.from_pop ? (
                        <div className="fw-muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                          Pop
                        </div>
                      ) : null}
                      {r.issues?.length ? (
                        <div style={{ marginTop: 2 }}>
                          <span className="fw-badge warn" style={{ fontSize: '0.7rem' }}>
                            {r.issues.length} pb
                          </span>
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
                    <td>
                      <button
                        type="button"
                        className="fw-btn"
                        style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                        onClick={() => void openDetail(r.id)}
                      >
                        Fiche
                      </button>
                    </td>
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
              style={{
                alignSelf: 'center',
                fontSize: '0.85rem',
                minWidth: 64,
                textAlign: 'center',
              }}
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
