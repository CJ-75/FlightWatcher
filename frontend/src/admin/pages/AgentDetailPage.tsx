import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { adminApi, AdminApiError, AgentRow } from '../api/adminApi'
import { StepUpModal } from '../components/StepUpModal'
import { ErrorBlock, LoadingBlock, PageTitle } from '../components/PageState'

export function AgentDetailPage() {
  const { agentId = '' } = useParams()
  const [agent, setAgent] = useState<AgentRow | null>(null)
  const [prompt, setPrompt] = useState('')
  const [run, setRun] = useState<any>(null)
  const [proposals, setProposals] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [stepUpOpen, setStepUpOpen] = useState(false)
  const [pendingApproveId, setPendingApproveId] = useState<string | null>(null)

  const load = async () => {
    const [list, props] = await Promise.all([
      adminApi.agents(),
      adminApi.agentProposals('pending'),
    ])
    const found = (list.agents || []).find((a) => a.id === agentId) || null
    setAgent(found)
    setPrompt(found?.prompt || '')
    setProposals(((props as any).proposals || []).filter((p: any) => p.agent_id === agentId))
  }

  useEffect(() => {
    load().catch((e) => setError(e.message))
  }, [agentId])

  const savePrompt = async () => {
    setBusy(true)
    setError(null)
    try {
      await adminApi.updateAgent(agentId, { prompt })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const runNow = async () => {
    setBusy(true)
    setError(null)
    try {
      const out = (await adminApi.runAgent(agentId)) as { run?: unknown }
      setRun(out.run)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run failed')
    } finally {
      setBusy(false)
    }
  }

  const decide = async (id: string, approve: boolean, afterStepUp = false) => {
    setBusy(true)
    setError(null)
    try {
      await adminApi.decideProposal(id, approve)
      await load()
    } catch (e) {
      if (approve && e instanceof AdminApiError && e.status === 403 && !afterStepUp) {
        setPendingApproveId(id)
        setStepUpOpen(true)
      } else {
        setError(e instanceof Error ? e.message : 'Decide failed')
      }
    } finally {
      setBusy(false)
    }
  }

  if (!agent && !error) return <LoadingBlock />
  if (!agent) return <ErrorBlock error={error || 'Agent introuvable'} />

  return (
    <div>
      <PageTitle title={agent.name || agent.id} subtitle={agent.description} />
      {error ? <div style={{ marginBottom: '0.75rem' }}><ErrorBlock error={error} /></div> : null}
      <div className="fw-card" style={{ marginBottom: '0.85rem' }}>
        <strong>Prompt</strong>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
          style={{
            width: '100%',
            marginTop: 8,
            borderRadius: 10,
            border: '1px solid var(--fw-border)',
            padding: 10,
            fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="button" className="fw-btn" disabled={busy} onClick={savePrompt}>
            Sauver prompt
          </button>
          <button
            type="button"
            className="fw-btn fw-btn-primary"
            disabled={busy || !agent.enabled}
            onClick={runNow}
          >
            Run
          </button>
        </div>
      </div>

      {run ? (
        <div className="fw-card" style={{ marginBottom: '0.85rem' }}>
          <strong>Dernier run</strong>
          <pre style={{ fontSize: '0.78rem', overflow: 'auto' }}>{JSON.stringify(run, null, 2)}</pre>
        </div>
      ) : null}

      <div className="fw-card">
        <strong>Propositions pending</strong>
        <table className="fw-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Payload</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {proposals.map((p) => (
              <tr key={p.id}>
                <td>{p.action}</td>
                <td>
                  <code style={{ fontSize: '0.75rem' }}>{JSON.stringify(p.payload)}</code>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {p.status === 'pending' ? (
                    <>
                      <button
                        type="button"
                        className="fw-btn fw-btn-primary"
                        disabled={busy}
                        onClick={() => decide(p.id, true)}
                      >
                        Approve
                      </button>{' '}
                      <button
                        type="button"
                        className="fw-btn fw-btn-danger"
                        disabled={busy}
                        onClick={() => decide(p.id, false)}
                      >
                        Reject
                      </button>
                    </>
                  ) : (
                    p.status
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!proposals.length ? <p className="fw-muted">Aucune proposition en attente.</p> : null}
      </div>

      <StepUpModal
        open={stepUpOpen}
        onClose={() => {
          setStepUpOpen(false)
          setPendingApproveId(null)
        }}
        onSuccess={() => {
          if (pendingApproveId) void decide(pendingApproveId, true, true)
        }}
      />
    </div>
  )
}
