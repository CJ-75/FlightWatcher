import { useEffect, useState } from 'react'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, LoadingBlock, PageTitle } from '../components/PageState'

export function VolsPage() {
  const [partners, setPartners] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminApi.partnersHealth().then(setPartners).catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorBlock error={error} />
  if (!partners) return <LoadingBlock />

  const flight = (partners.partners || []).find((p: any) => p.id === 'flight_obs')

  return (
    <div>
      <PageTitle title="Vols" subtitle="Observations / fraîcheur scan" />
      <div className="fw-card">
        <strong>Flight observations</strong>
        <p style={{ marginTop: 8 }}>
          Status:{' '}
          <span className={`fw-badge ${flight?.ok ? 'ok' : 'bad'}`}>{flight?.ok ? 'OK' : 'STALE'}</span>
        </p>
        <p className="fw-muted">{flight?.detail}</p>
        {flight?.age_hours != null ? <p>Age: {flight.age_hours}h</p> : null}
      </div>
    </div>
  )
}
