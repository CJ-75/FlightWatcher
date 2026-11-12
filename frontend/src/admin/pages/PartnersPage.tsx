import { useEffect, useState } from 'react'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, LoadingBlock, PageTitle } from '../components/PageState'

export function PartnersPage() {
  const [data, setData] = useState<any>(null)
  const [fails, setFails] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([adminApi.partnersHealth(), adminApi.bookingFails()])
      .then(([p, f]) => {
        setData(p)
        setFails(f)
      })
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorBlock error={error} />
  if (!data) return <LoadingBlock />

  return (
    <div>
      <PageTitle title="Partners" subtitle="LiteAPI · observations · bookings" />
      <div className="fw-grid fw-grid-3" style={{ marginBottom: '0.85rem' }}>
        {(data.partners || []).map((p: any) => (
          <div key={p.id} className="fw-card">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{p.name}</strong>
              <span className={`fw-badge ${p.ok ? 'ok' : 'bad'}`}>{p.ok ? 'OK' : 'ISSUE'}</span>
            </div>
            <p className="fw-muted" style={{ fontSize: '0.85rem' }}>
              {p.detail}
            </p>
          </div>
        ))}
      </div>
      <div className="fw-card">
        <strong>Booking fails récents</strong>
        <table className="fw-table">
          <thead>
            <tr>
              <th>Id</th>
              <th>Status</th>
              <th>Hotel</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {(fails?.items || []).map((b: any) => (
              <tr key={b.id}>
                <td style={{ fontSize: '0.75rem' }}>{String(b.id).slice(0, 8)}</td>
                <td>{b.status}</td>
                <td>{b.hotel_name || '—'}</td>
                <td>{b.created_at || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
