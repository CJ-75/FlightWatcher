import { useEffect, useState } from 'react'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, Kpi, LoadingBlock } from '../components/PageState'

type Growth = {
  wau?: number
  dau?: number
  stickiness?: number
  invites_7d?: number
  shares_7d?: number
  virality_proxy?: number
}

export function ActivitePage() {
  const [growth, setGrowth] = useState<Growth | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      // Un seul endpoint léger — pas de product-funnel (scan events)
      setGrowth((await adminApi.growthKpis()) as Growth)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (loading && !growth) return <LoadingBlock label="Chargement activité…" />
  if (error && !growth) return <ErrorBlock error={error} />

  return (
    <div>
      <div className="fw-page-head">
        <div>
          <h1 className="fw-display">Activité</h1>
          <p>Usage produit — WAU / DAU (sans scan funnel). </p>
        </div>
        <button type="button" className="fw-btn" onClick={() => void load()} disabled={loading}>
          {loading ? '…' : 'Rafraîchir'}
        </button>
      </div>

      <div className="fw-grid fw-grid-3" style={{ marginBottom: '1.15rem' }}>
        <Kpi label="WAU" value={growth?.wau ?? '—'} hint="Utilisateurs / 7 j" />
        <Kpi label="DAU" value={growth?.dau ?? '—'} hint="Utilisateurs / 24 h" />
        <Kpi
          label="Stickiness"
          value={growth?.stickiness != null ? `${growth.stickiness}%` : '—'}
          hint="DAU / WAU"
        />
      </div>

      <div className="fw-grid fw-grid-2">
        <Kpi label="Invites 7 j" value={growth?.invites_7d ?? '—'} />
        <Kpi label="Shares 7 j" value={growth?.shares_7d ?? '—'} />
      </div>
    </div>
  )
}
