/**
 * Page analytics Booking SAS (Activated)
 */
import { useState, useEffect } from 'react'
import { useAdminData } from '../hooks/useAdminData'
import { StatsCard } from '../components/StatsCard'
import { DataTable } from '../components/DataTable'
import { LineChart } from '../components/Charts/LineChart'
import { PieChart } from '../components/Charts/PieChart'

export function ActivatedPage() {
  const [page, setPage] = useState(1)
  const { data, loading } = useAdminData<{ events: any[], total: number }>({
    endpoint: '/api/admin/booking-sas',
    params: { page, page_size: 50 },
    autoFetch: true
  })
  const { data: stats, loading: statsLoading } = useAdminData({
    endpoint: '/api/admin/booking-sas/stats',
    autoFetch: true
  })

  // Debug: afficher les stats dans la console
  useEffect(() => {
    if (stats) {
      console.log('[ActivatedPage] Stats loaded:', stats)
      console.log('[ActivatedPage] clicks_by_day:', stats.clicks_by_day)
      console.log('[ActivatedPage] partner_distribution:', stats.partner_distribution)
    }
  }, [stats])

  const columns = [
    { key: 'created_at', label: 'Date', sortable: true, render: (e: any) => new Date(e.created_at).toLocaleString('fr-FR') },
    { key: 'destination_name', label: 'Destination', sortable: true },
    { key: 'total_price', label: 'Prix', sortable: true, render: (e: any) => `${e.total_price}€` },
    { key: 'partner_name', label: 'Partenaire', sortable: true },
    { 
      key: 'user_email', 
      label: 'User', 
      render: (e: any) => {
        // Afficher l'email si disponible, sinon "Anonyme"
        if (e.user_email) {
          return e.user_email
        }
        // Fallback: vérifier aussi dans user_profiles si l'email n'est pas directement disponible
        if (e.user_profiles) {
          const profiles = Array.isArray(e.user_profiles) ? e.user_profiles : [e.user_profiles]
          const email = profiles.find((p: any) => p?.email)?.email
          if (email) return email
        }
        return 'Anonyme'
      }
    }
  ]

  const partnerData = stats?.partner_distribution 
    ? Object.entries(stats.partner_distribution)
        .map(([key, value]: [string, any]) => ({
          name: value.name || key,
          value: value.count || 0
        }))
        .filter(item => item.value > 0) // Filtrer les valeurs nulles
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Activated (Booking SAS)</h1>
        <p className="text-gray-400 text-sm">Home - Dashboard</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatsCard title="Total clics" value={stats?.total_clicks || 0} icon="🖱️" />
        <StatsCard title="Prix moyen" value={`${stats?.avg_price || 0}€`} icon="💰" />
        <StatsCard title="Utilisateurs uniques" value={stats?.unique_users || 0} icon="👥" />
        <StatsCard title="Taux conversion" value={`${stats?.conversion_rate || 0}%`} icon="📈" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#252836] rounded-xl border border-gray-700 shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-white">Clics par jour</h2>
          {stats?.clicks_by_day && stats.clicks_by_day.length > 0 ? (
            <LineChart
              data={stats.clicks_by_day}
              xAxisKey="date"
              lines={[{ key: 'count', name: 'Clics', color: '#10B981' }]}
            />
          ) : (
            <div className="flex items-center justify-center h-[300px] text-gray-400">
              Aucune donnée disponible
            </div>
          )}
        </div>
        <div className="bg-[#252836] rounded-xl border border-gray-700 shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-white">Répartition par partenaire</h2>
          {partnerData && partnerData.length > 0 ? (
            <PieChart data={partnerData} />
          ) : (
            <div className="flex items-center justify-center h-[300px] text-gray-400">
              Aucune donnée disponible
            </div>
          )}
        </div>
      </div>

      <DataTable
        data={data?.events || []}
        columns={columns}
        keyExtractor={(e) => e.id}
        loading={loading}
      />
    </div>
  )
}

