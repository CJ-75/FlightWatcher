export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <h1 className="fw-display" style={{ margin: 0, fontSize: '1.45rem', letterSpacing: '-0.03em' }}>
        {title}
      </h1>
      {subtitle ? (
        <p className="fw-muted" style={{ margin: '0.25rem 0 0', fontSize: '0.9rem' }}>
          {subtitle}
        </p>
      ) : null}
    </div>
  )
}

export function LoadingBlock({ label = 'Chargement…' }: { label?: string }) {
  return <div className="fw-card fw-muted">{label}</div>
}

export function ErrorBlock({ error }: { error: string }) {
  return (
    <div className="fw-card" style={{ borderColor: '#fecaca', color: 'var(--fw-bad)' }}>
      {error}
    </div>
  )
}

export function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="fw-card fw-kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint ? <div className="fw-muted" style={{ fontSize: '0.78rem' }}>{hint}</div> : null}
    </div>
  )
}
