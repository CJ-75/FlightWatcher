import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, Kpi, LoadingBlock } from '../components/PageState'
import { useAdminQuery } from '../hooks/useAdminQuery'

export function OverviewPage() {
  const { data, error, loading, stale, fromCache, refresh } = useAdminQuery({
    key: ['dashboard', 30],
    fetcher: () => adminApi.dashboard(30, false),
    ttlMs: 60_000,
    staleMs: 300_000,
  })

  const k = data?.kpis
  const contenu = data?.contenu

  const insight = useMemo(() => {
    if (!k) return null
    const bits: string[] = []
    if (k.new_7d > 0) bits.push(`${k.new_7d} nouveaux / 7 j`)
    if (k.pending > 0) bits.push(`${k.pending} onboarding en attente`)
    if (contenu?.parcours_published != null) {
      bits.push(`${contenu.parcours_published} parcours publiés`)
    }
    return bits.join(' · ') || 'Vue rapide inscrits / onboarding / contenu.'
  }, [k, contenu])

  if (loading && !data) return <LoadingBlock label="Chargement accueil…" />
  if (error && !data) return <ErrorBlock error={error} />

  const cacheHint = fromCache
    ? stale
      ? ' · cache (rafraîchi…)'
      : ' · cache'
    : data?.cached
      ? ' · cache serveur'
      : ''

  return (
    <div>
      <section className="fw-hero-accueil">
        <p className="eyebrow">Pilotage</p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div>
            <h1 className="fw-display">Accueil</h1>
            <p className="lede">
              {insight}
              {cacheHint}
              {typeof data?.elapsed_ms === 'number' ? ` · ${data.elapsed_ms} ms` : ''}
            </p>
          </div>
          <button
            type="button"
            className="fw-btn"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? '…' : 'Rafraîchir'}
          </button>
        </div>
      </section>

      <div className="fw-grid fw-grid-3" style={{ marginBottom: '1.15rem' }}>
        <Kpi
          label="Inscrits"
          value={k?.total ?? '—'}
          hint={`+${k?.new_24h ?? 0} / 24h · +${k?.new_7d ?? 0} / 7j`}
        />
        <Kpi
          label="Onboarding terminé"
          value={k?.onboarded ?? '—'}
          hint={`${k?.onboarded_pct ?? 0}% · ${k?.pending ?? 0} en attente`}
        />
        <Kpi
          label="Parcours publiés"
          value={contenu?.parcours_published ?? '—'}
          hint="Catalogue éditorial"
        />
      </div>

      <div className="fw-grid fw-grid-2">
        <div className="fw-card">
          <h2 className="fw-section-title">Utilisateurs</h2>
          <p className="fw-muted" style={{ margin: '0 0 1rem', fontSize: '0.9rem' }}>
            Fiches : email, nom, inscription, ville.
          </p>
          <Link to="/admin/users" className="fw-btn fw-btn-primary" style={{ textDecoration: 'none' }}>
            Ouvrir
          </Link>
        </div>
        <div className="fw-card">
          <h2 className="fw-section-title">Onboarding</h2>
          <p className="fw-muted" style={{ margin: '0 0 1rem', fontSize: '0.9rem' }}>
            Qui a terminé · filtrable terminé / en attente.
          </p>
          <Link
            to="/admin/onboarding"
            className="fw-btn fw-btn-primary"
            style={{ textDecoration: 'none' }}
          >
            Ouvrir
          </Link>
        </div>
      </div>
    </div>
  )
}
