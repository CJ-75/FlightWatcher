import { useEffect, useState } from 'react'
import { adminApi } from '../api/adminApi'
import { ErrorBlock, Kpi, LoadingBlock, PageTitle } from '../components/PageState'

export function DigestsPage() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminApi.digests().then(setData).catch((e) => setError(e.message))
  }, [])

  if (error) return <ErrorBlock error={error} />
  if (!data) return <LoadingBlock />

  return (
    <div>
      <PageTitle title="Digests / Alerts" subtitle="Santé des envois 7 jours" />
      <div className="fw-grid fw-grid-3">
        <Kpi label="Sent 7j" value={data.sent_7d ?? 0} />
        <Kpi label="Failed 7j" value={data.failed_7d ?? 0} />
        <Kpi label="Queued" value={data.queued ?? 0} hint={data.source_table || 'no table'} />
      </div>
    </div>
  )
}
