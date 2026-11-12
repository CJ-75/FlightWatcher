import { useEffect, useState } from 'react'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, LoadingBlock, PageTitle } from '../components/PageState'

export function StorePage() {
  const [config, setConfig] = useState<any>(null)
  const [readiness, setReadiness] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = () =>
    Promise.all([adminApi.storeConfig(), adminApi.storeReadiness()])
      .then(([c, r]) => {
        const cfg = c as { config?: Record<string, unknown> }
        setConfig(cfg.config || {})
        setReadiness(r)
      })
      .catch((e) => setError(e.message))

  useEffect(() => {
    void load()
  }, [])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const out = (await adminApi.updateStoreConfig({
        min_ios_version: config.min_ios_version,
        min_android_version: config.min_android_version,
        force_update: !!config.force_update,
        feature_kills: config.feature_kills || {},
      })) as { config?: Record<string, unknown> }
      setConfig(out.config || config)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!config && !error) return <LoadingBlock />

  return (
    <div>
      <PageTitle title="Store readiness" subtitle="Min versions · force update · feature kills" />
      {error ? <div style={{ marginBottom: '0.75rem' }}><ErrorBlock error={error} /></div> : null}
      <div className="fw-grid fw-grid-2">
        <div className="fw-card">
          <label className="fw-muted" style={{ display: 'block', marginBottom: 4 }}>
            Min iOS
          </label>
          <input
            className="fw-btn"
            style={{ width: '100%', marginBottom: 12 }}
            value={config?.min_ios_version || ''}
            onChange={(e) => setConfig({ ...config, min_ios_version: e.target.value })}
          />
          <label className="fw-muted" style={{ display: 'block', marginBottom: 4 }}>
            Min Android
          </label>
          <input
            className="fw-btn"
            style={{ width: '100%', marginBottom: 12 }}
            value={config?.min_android_version || ''}
            onChange={(e) => setConfig({ ...config, min_android_version: e.target.value })}
          />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={!!config?.force_update}
              onChange={(e) => setConfig({ ...config, force_update: e.target.checked })}
            />
            Force update
          </label>
          <button type="button" className="fw-btn fw-btn-primary" disabled={saving} onClick={save}>
            {saving ? '…' : 'Enregistrer'}
          </button>
        </div>
        <div className="fw-card">
          <strong>Checklist</strong>
          <ul style={{ marginTop: 8, paddingLeft: 18 }}>
            {(readiness?.checklist || []).map((c: any) => (
              <li key={c.id}>
                <span className={`fw-badge ${c.ok ? 'ok' : 'warn'}`}>{c.ok ? 'OK' : 'TODO'}</span>{' '}
                {c.label}
                {c.hint ? <div className="fw-muted" style={{ fontSize: '0.8rem' }}>{c.hint}</div> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
