import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminFetch } from '../api/adminApi'
import { ErrorBlock, Kpi, LoadingBlock } from '../components/PageState'

type VolumeRow = {
  slug: string
  label?: string
  count: number
  badge_count?: number
  meets_chip_min?: boolean
  verified?: boolean
  kind?: string
  push?: boolean
}

type OccasionsAdmin = {
  ok?: boolean
  today?: string
  weather_enabled?: boolean
  wall_active?: number
  active_chips?: VolumeRow[]
  tag_volume?: VolumeRow[]
  unverified?: { slug: string; label?: string; kind?: string }[]
  pushable?: string[]
  recent_sends?: {
    channel?: string
    occasion_slug?: string
    sent_at?: string
    deal_count?: number
  }[]
  error?: string
}

export function OccasionsPage() {
  const [data, setData] = useState<OccasionsAdmin | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const json = await adminFetch<OccasionsAdmin>('/api/admin/deals-occasions')
        if (!cancelled) setData(json)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const volume = data?.tag_volume || []
  const chips = data?.active_chips || []
  const unverified = data?.unverified || []

  return (
    <div>
      <div className="fw-page-head">
        <div>
          <h1 className="fw-display">Occasions séjours</h1>
          <p>
            Suivi des filtres du mur Séjours (ponts, fêtes, météo…) — pas les tags des parcours.
            {data?.today ? ` · ${data.today}` : ''}
          </p>
        </div>
      </div>

      <div
        className="fw-card"
        style={{
          marginBottom: '1.15rem',
          background:
            'linear-gradient(125deg, rgba(15,118,110,0.08), transparent 55%), #fff',
        }}
      >
        <h2 className="fw-section-title">À quoi ça sert ?</h2>
        <p style={{ margin: '0 0 0.65rem', fontSize: '0.92rem', lineHeight: 1.5 }}>
          Sur l’app, le mur <strong>Séjours</strong> propose des chips du type « pont de mai »,
          « Saint-Valentin », « grand soleil ». Cette page montre combien de deals sont taggés
          pour chaque occasion, lesquels ont assez de volume pour afficher un chip (≥ 3), et
          lesquels ne sont pas encore vérifiés.
        </p>
        <p className="fw-muted" style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.45 }}>
          À ne pas confondre avec les occasions d’un <Link to="/admin/parcours">parcours</Link>{' '}
          (En amoureux, Férié, Au soleil…) : celles-là se choisissent dans l’éditeur de parcours.
        </p>
      </div>

      {loading ? <LoadingBlock /> : null}
      {error ? (
        <div style={{ marginBottom: '0.75rem' }}>
          <ErrorBlock error={error} />
        </div>
      ) : null}
      {data?.error ? (
        <p className="fw-muted" style={{ marginBottom: '0.75rem' }}>
          Snapshot partiel : {data.error}
        </p>
      ) : null}

      {!loading && (
        <>
          <div className="fw-grid fw-grid-3" style={{ marginBottom: '1rem' }}>
            <Kpi
              label="Séjours actifs"
              value={data?.wall_active ?? '—'}
              hint="Deals sur le mur"
            />
            <Kpi
              label="Chips visibles"
              value={chips.length}
              hint="Occasions avec ≥ 3 deals"
            />
            <Kpi
              label="Météo"
              value={data?.weather_enabled ? 'ON' : 'OFF'}
              hint={`${data?.pushable?.length ?? 0} prêtes à push`}
            />
          </div>

          <div className="fw-card" style={{ marginBottom: '0.95rem' }}>
            <h2 className="fw-section-title">Chips actifs aujourd’hui</h2>
            <p className="fw-muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
              Filtres que l’utilisateur peut vraiment voir (assez de volume).
            </p>
            {chips.length === 0 ? (
              <p className="fw-muted" style={{ margin: 0, fontSize: '0.88rem' }}>
                Aucun chip avec ≥ 3 deals pour l’instant.
              </p>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                {chips.map((c) => (
                  <span key={c.slug} className="fw-badge">
                    {c.label || c.slug} · {c.count}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="fw-table-wrap" style={{ marginBottom: '0.95rem' }}>
            <table className="fw-table">
              <thead>
                <tr>
                  <th>Occasion</th>
                  <th>Deals taggés</th>
                  <th>Type</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {volume.map((row) => (
                  <tr key={row.slug}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.label || row.slug}</div>
                      <div
                        className="fw-muted"
                        style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.72rem' }}
                      >
                        {row.slug}
                      </div>
                    </td>
                    <td>{row.count}</td>
                    <td className="fw-muted">{row.kind || '—'}</td>
                    <td>
                      {!row.verified ? (
                        <span className="fw-badge warn">À vérifier</span>
                      ) : row.meets_chip_min ? (
                        <span className="fw-badge ok">Chip OK</span>
                      ) : (
                        <span className="fw-muted">Volume &lt; 3</span>
                      )}
                      {row.push ? (
                        <span className="fw-badge" style={{ marginLeft: 6 }}>
                          push
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {!volume.length ? (
                  <tr>
                    <td colSpan={4} className="fw-muted">
                      Aucun volume tag pour l’instant.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="fw-card" style={{ marginBottom: '0.95rem' }}>
            <h2 className="fw-section-title">Events non vérifiés</h2>
            <p className="fw-muted" style={{ margin: '0 0 0.65rem', fontSize: '0.85rem' }}>
              Occasions calendrier / météo pas encore validées — elles ne doivent pas pousser
              de chips foireux.
            </p>
            {unverified.length === 0 ? (
              <p className="fw-muted" style={{ margin: 0 }}>
                Tout est vérifié.
              </p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {unverified.map((u) => (
                  <li key={u.slug} style={{ marginBottom: 4 }}>
                    <strong>{u.label || u.slug}</strong>{' '}
                    <span className="fw-muted">({u.kind || '—'})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(data?.recent_sends || []).length > 0 ? (
            <div className="fw-card">
              <h2 className="fw-section-title">Derniers envois liés</h2>
              <ul
                className="fw-muted"
                style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.85rem' }}
              >
                {(data?.recent_sends || []).slice(0, 12).map((s, i) => (
                  <li key={`${s.sent_at}-${i}`}>
                    {s.sent_at?.slice(0, 16)} · {s.channel} · {s.occasion_slug} ·{' '}
                    {s.deal_count} deals
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
