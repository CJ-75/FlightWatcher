import { useEffect, useState } from 'react'
import { adminApi, AdminApiError } from '../api/adminApi'
import { StepUpModal } from '../components/StepUpModal'
import { ErrorBlock, LoadingBlock, PageTitle } from '../components/PageState'

export function SejoursOpsPage() {
  const [jobs, setJobs] = useState<any[]>([])
  const [log, setLog] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [stepUpOpen, setStepUpOpen] = useState(false)
  const [pending, setPending] = useState<{ id: string; step_up?: boolean } | null>(null)

  useEffect(() => {
    adminApi
      .opsJobs()
      .then((r) => setJobs(r.jobs || []))
      .catch((e) => setError(e.message))
  }, [])

  const run = async (job: any, afterStepUp = false) => {
    setBusy(job.id)
    setError(null)
    try {
      const needsConfirm = job.step_up || job.risk === 'high'
      const out = await adminApi.runOps(job.id, {}, needsConfirm)
      setLog(JSON.stringify(out, null, 2))
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 403 && !afterStepUp) {
        setPending(job)
        setStepUpOpen(true)
      } else {
        setError(e instanceof Error ? e.message : 'Ops failed')
      }
    } finally {
      setBusy(null)
    }
  }

  if (!jobs.length && !error) return <LoadingBlock />

  return (
    <div>
      <PageTitle
        title="Séjours Ops"
        subtitle="Jobs whitelist sous require_admin — jamais de CRON_SECRET navigateur"
      />
      {error ? <div style={{ marginBottom: '0.75rem' }}><ErrorBlock error={error} /></div> : null}
      <div className="fw-grid fw-grid-2">
        {jobs.map((job) => (
          <div key={job.id} className="fw-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <strong>{job.label || job.id}</strong>
              <span className={`fw-badge ${job.risk === 'high' ? 'bad' : job.risk === 'medium' ? 'warn' : 'ok'}`}>
                {job.risk}
              </span>
            </div>
            <p className="fw-muted" style={{ fontSize: '0.85rem' }}>
              {job.description}
            </p>
            <button
              type="button"
              className="fw-btn fw-btn-primary"
              disabled={!!busy}
              onClick={() => run(job)}
            >
              {busy === job.id ? 'Running…' : 'Run'}
            </button>
          </div>
        ))}
      </div>
      {log ? (
        <pre
          className="fw-card"
          style={{ marginTop: '1rem', overflow: 'auto', fontSize: '0.78rem', maxHeight: 360 }}
        >
          {log}
        </pre>
      ) : null}
      <StepUpModal
        open={stepUpOpen}
        onClose={() => {
          setStepUpOpen(false)
          setPending(null)
        }}
        onSuccess={() => {
          if (pending) void run(pending, true)
        }}
      />
    </div>
  )
}
