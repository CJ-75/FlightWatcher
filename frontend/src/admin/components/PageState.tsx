export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="fw-page-head">
      <div>
        <h1 className="fw-display">{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </div>
  )
}

export function LoadingBlock({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div aria-busy="true" aria-label={label}>
      <div className="fw-skeleton" style={{ height: 88, marginBottom: 12 }} />
      <div className="fw-grid fw-grid-3">
        <div className="fw-skeleton" />
        <div className="fw-skeleton" />
        <div className="fw-skeleton" />
      </div>
      <div className="fw-skeleton" style={{ height: 220, marginTop: 12 }} />
    </div>
  )
}

export function ErrorBlock({ error }: { error: string }) {
  return (
    <div className="fw-card" style={{ borderColor: 'rgba(190,18,60,0.25)', color: 'var(--fw-bad)' }}>
      {error}
    </div>
  )
}

export function Kpi({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="fw-kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  )
}
