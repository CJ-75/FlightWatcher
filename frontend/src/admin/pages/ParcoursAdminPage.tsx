import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ITINERARY_DURATION_LABELS,
  ITINERARY_OCCASION_LABELS,
  cityDisplayNameFr,
  cityImageUrl,
  cityUnsplashUrl,
  type Itinerary,
  type ItineraryDurationKind,
  type ItineraryOccasion,
} from '@flightwatcher/shared'
import { getApiClient } from '../../utils/apiClient'
import { ParcoursCoverImg } from '../../components/parcours/ParcoursCoverImg'
import { ErrorBlock, LoadingBlock } from '../components/PageState'
import { adminCacheKey, adminSwr, invalidateAdminCache, peekAdminCache } from '../lib/adminCache'

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  published: 'Publié',
  retired: 'Retiré',
}

export function ParcoursAdminPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Itinerary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [city, setCity] = useState('')
  const [status, setStatus] = useState('')
  const [occasion, setOccasion] = useState('')
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async (force = false) => {
    const key = adminCacheKey(['parcours-list', city, status, occasion])
    const cached = peekAdminCache<{ ok?: boolean; itineraries?: Itinerary[]; error?: string }>(key)
    if (cached?.itineraries && !force) {
      setRows(cached.itineraries)
      setLoading(false)
    } else if (!cached) {
      setLoading(true)
    }
    setError(null)
    try {
      const { data: res } = await adminSwr({
        key,
        force,
        ttlMs: 30_000,
        staleMs: 120_000,
        fetcher: async () => {
          const api = getApiClient()
          return api.adminListParcours({
            city: city || undefined,
            status: status || undefined,
            occasion: occasion || undefined,
          })
        },
      })
      if (!res.ok) throw new Error(res.error || 'Chargement impossible')
      setRows((res.itineraries || []) as unknown as Itinerary[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [city, status, occasion])

  useEffect(() => {
    void load()
  }, [load])

  const onDelete = async (id: string, title?: string) => {
    if (!window.confirm(`Supprimer le parcours « ${title || id} » ?`)) return
    setBusyId(id)
    setError(null)
    try {
      const api = getApiClient()
      const res = await api.adminDeleteParcours(id)
      if (!res.ok) throw new Error(res.error || 'Suppression impossible')
      invalidateAdminCache('parcours-list')
      invalidateAdminCache('dashboard')
      await load(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur suppression')
    } finally {
      setBusyId(null)
    }
  }

  const onCreate = async () => {
    setCreating(true)
    try {
      const api = getApiClient()
      const res = await api.adminCreateParcours({
        title: 'Nouveau parcours',
        city_slug: 'paris',
        cover_image: cityUnsplashUrl('paris') || cityImageUrl('paris'),
      })
      if (!res.ok || !res.itinerary?.id) {
        throw new Error(res.error || 'Création impossible')
      }
      invalidateAdminCache('parcours-list')
      invalidateAdminCache('dashboard')
      navigate(`/admin/parcours/${res.itinerary.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur création')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <div className="fw-page-head">
        <div>
          <h1 className="fw-display">Parcours</h1>
          <p>Catalogue éditorial — publier un parcours rapidement.</p>
        </div>
        <button
          type="button"
          className="fw-btn fw-btn-primary"
          onClick={() => void onCreate()}
          disabled={creating}
        >
          {creating ? 'Création…' : 'Nouveau parcours'}
        </button>
      </div>

      <div className="fw-toolbar">
        <input
          className="fw-input"
          value={city}
          onChange={(e) => setCity(e.target.value.trim().toLowerCase())}
          placeholder="Ville (slug)"
          style={{ width: 140 }}
        />
        <select className="fw-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous statuts</option>
          <option value="draft">Brouillon</option>
          <option value="published">Publié</option>
          <option value="retired">Retiré</option>
        </select>
        <select
          className="fw-select"
          value={occasion}
          onChange={(e) => setOccasion(e.target.value)}
        >
          <option value="">Toutes occasions</option>
          {(Object.keys(ITINERARY_OCCASION_LABELS) as ItineraryOccasion[]).map((k) => (
            <option key={k} value={k}>
              {ITINERARY_OCCASION_LABELS[k]}
            </option>
          ))}
        </select>
        <button type="button" className="fw-btn" onClick={() => void load()}>
          Filtrer
        </button>
      </div>

      {error ? (
        <div style={{ marginBottom: '0.75rem' }}>
          <ErrorBlock error={error} />
        </div>
      ) : null}
      {loading ? <LoadingBlock /> : null}

      {!loading && (
        <div className="fw-table-wrap">
          <table className="fw-table">
            <thead>
              <tr>
                <th> </th>
                <th>Titre</th>
                <th>Ville</th>
                <th>Durée</th>
                <th>Occasions</th>
                <th>Statut</th>
                <th>Mise en avant</th>
                <th>Modifié</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const dur = r.duration_kind
                  ? ITINERARY_DURATION_LABELS[r.duration_kind as ItineraryDurationKind] ||
                    r.duration_kind
                  : '—'
                return (
                  <tr key={r.id}>
                    <td>
                      <div
                        style={{
                          height: 40,
                          width: 40,
                          borderRadius: 10,
                          background: '#e2e8f0',
                          overflow: 'hidden',
                        }}
                      >
                        <ParcoursCoverImg
                          coverImage={r.cover_image}
                          citySlug={r.city_slug}
                          slug={r.slug}
                          width={160}
                          style={{
                            height: 40,
                            width: 40,
                            objectFit: 'cover',
                            display: 'block',
                          }}
                        />
                      </div>
                    </td>
                    <td>
                      <Link
                        to={`/admin/parcours/${r.id}`}
                        style={{ fontWeight: 600, color: 'var(--fw-accent)', textDecoration: 'none' }}
                      >
                        {r.title}
                      </Link>
                      {r.is_demo ? (
                        <span className="fw-badge warn" style={{ marginLeft: 6 }}>
                          demo
                        </span>
                      ) : null}
                    </td>
                    <td>{r.city_slug ? cityDisplayNameFr(null, r.city_slug) : '—'}</td>
                    <td>{dur}</td>
                    <td className="fw-muted" style={{ fontSize: '0.8rem' }}>
                      {(r.occasions || [])
                        .map((o) => ITINERARY_OCCASION_LABELS[o as ItineraryOccasion] || o)
                        .join(', ') || '—'}
                    </td>
                    <td>
                      <span
                        className={`fw-badge ${
                          r.status === 'published' ? 'ok' : r.status === 'retired' ? '' : 'warn'
                        }`}
                      >
                        {STATUS_LABEL[r.status || ''] || r.status}
                      </span>
                    </td>
                    <td className="fw-muted" style={{ fontSize: '0.8rem' }}>
                      {r.featured_from && r.featured_to
                        ? `${r.featured_from} → ${r.featured_to}`
                        : '—'}
                    </td>
                    <td className="fw-muted" style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {(r as { updated_at?: string }).updated_at
                        ? new Date((r as { updated_at?: string }).updated_at!).toLocaleString('fr-FR')
                        : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <Link
                          to={`/admin/parcours/${r.id}`}
                          className="fw-btn"
                          style={{
                            padding: '0.3rem 0.55rem',
                            fontSize: '0.75rem',
                            textDecoration: 'none',
                          }}
                        >
                          Éditer
                        </Link>
                        <button
                          type="button"
                          className="fw-btn fw-btn-danger"
                          style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }}
                          disabled={busyId === r.id}
                          onClick={() => void onDelete(r.id, r.title)}
                        >
                          {busyId === r.id ? '…' : 'Suppr.'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!rows.length ? (
            <p className="fw-muted" style={{ padding: '1rem', margin: 0 }}>
              Aucun parcours. Crée-en un pour commencer.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
