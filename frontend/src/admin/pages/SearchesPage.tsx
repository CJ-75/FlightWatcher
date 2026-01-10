/**
 * Page de gestion des recherches sauvegardées
 */
import { useState } from 'react'
import { useAdminData } from '../hooks/useAdminData'
import { StatsCard } from '../components/StatsCard'
import { DataTable } from '../components/DataTable'
import { LineChart } from '../components/Charts/LineChart'
import { BarChart } from '../components/Charts/BarChart'

export function SearchesPage() {
  const [page, setPage] = useState(1)
  const { data, loading } = useAdminData<{ searches: any[], total: number }>({
    endpoint: '/api/admin/searches',
    params: { page, page_size: 50 },
    autoFetch: true
  })
  const { data: stats } = useAdminData({
    endpoint: '/api/admin/searches/stats',
    autoFetch: true
  })

  const columns = [
    { key: 'name', label: 'Nom', sortable: true },
    { key: 'departure_airport', label: 'Aéroport', sortable: true },
    { key: 'budget_max', label: 'Budget max', sortable: true },
    { key: 'auto_check_enabled', label: 'Auto-check', render: (s: any) => s.auto_check_enabled ? '✅' : '❌' },
    { key: 'times_used', label: 'Utilisations', sortable: true },
    { key: 'created_at', label: 'Créée le', sortable: true, render: (s: any) => new Date(s.created_at).toLocaleDateString('fr-FR') }
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Recherches</h1>
        <p className="text-gray-400 text-sm">Home - Dashboard</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatsCard title="Total recherches" value={stats?.total_searches || 0} icon="🔍" />
        <StatsCard title="Avec auto-check" value={stats?.auto_check_enabled || 0} icon="🔄" />
        <StatsCard title="Utilisées (7j)" value={stats?.recent_searches || 0} icon="📅" />
        <StatsCard title="Moyenne/user" value={data?.total ? Math.round((stats?.total_searches || 0) / data.total) : 0} icon="📊" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#252836] rounded-xl border border-gray-700 shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-white">Volume par jour</h2>
          <LineChart
            data={stats?.searches_by_day || []}
            xAxisKey="date"
            lines={[{ key: 'count', name: 'Recherches', color: '#3B82F6' }]}
          />
        </div>
        <div className="bg-[#252836] rounded-xl border border-gray-700 shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-white">Par aéroport</h2>
          <BarChart
            data={stats?.searches_by_airport || []}
            xAxisKey="airport"
            bars={[{ key: 'count', name: 'Recherches', color: '#3B82F6' }]}
          />
        </div>
      </div>

      <DataTable
        data={data?.searches || []}
        columns={columns}
        keyExtractor={(s) => s.id}
        loading={loading}
      />
    </div>
  )
}

