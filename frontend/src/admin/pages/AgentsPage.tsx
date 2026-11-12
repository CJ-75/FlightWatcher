import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi, AgentRow } from '../api/adminApi'
import { ErrorBlock, LoadingBlock, PageTitle } from '../components/PageState'

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = () =>
    adminApi
      .agents()
      .then((r) => setAgents(r.agents || []))
      .catch((e) => setError(e.message))

  useEffect(() => {
    void load()
  }, [])

  const toggle = async (agent: AgentRow) => {
    setBusy(agent.id)
    try {
      await adminApi.updateAgent(agent.id, { enabled: !agent.enabled })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(null)
    }
  }

  if (!agents.length && !error) return <LoadingBlock />

  return (
    <div>
      <PageTitle title="Agentic AI" subtitle="On/off · prompts éditables · approve obligatoire" />
      {error ? <div style={{ marginBottom: '0.75rem' }}><ErrorBlock error={error} /></div> : null}
      <div className="fw-grid fw-grid-2">
        {agents.map((a) => (
          <div key={a.id} className="fw-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong>{a.name || a.id}</strong>
              <span className={`fw-badge ${a.enabled ? 'ok' : 'warn'}`}>
                {a.enabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <p className="fw-muted" style={{ fontSize: '0.85rem' }}>
              {a.description}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="fw-btn" disabled={!!busy} onClick={() => toggle(a)}>
                {a.enabled ? 'Disable' : 'Enable'}
              </button>
              <Link className="fw-btn fw-btn-primary" style={{ textDecoration: 'none' }} to={`/admin/agents/${a.id}`}>
                Ouvrir
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
