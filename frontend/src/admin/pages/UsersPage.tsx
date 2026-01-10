/**
 * Page de gestion des utilisateurs
 */
import { useState, useEffect } from 'react'
import { useAdminData } from '../hooks/useAdminData'
import { useImpersonation } from '../hooks/useImpersonation'
import { useTestMode } from '../context/TestModeContext'
import { getAccessToken } from '../../lib/supabase'
import { StatsCard } from '../components/StatsCard'
import { DataTable } from '../components/DataTable'
import { LineChart } from '../components/Charts/LineChart'
import { PieChart } from '../components/Charts/PieChart'
import { toast } from 'react-hot-toast'

interface User {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  created_at: string
  last_active?: string
  is_admin?: boolean
  home_airport?: string
  stats?: {
    searches_count: number
    favorites_count: number
    search_events_count: number
  }
}

export function UsersPage() {
  const [page, setPage] = useState(1)
  const [emailFilter, setEmailFilter] = useState('')
  const { isTestMode } = useTestMode()
  const { data, loading, refetch } = useAdminData<{ users: User[], total: number, page: number, page_size: number }>({
    endpoint: '/api/admin/users',
    params: { page, page_size: 50, email: emailFilter || undefined },
    autoFetch: true
  })
  const { startImpersonation } = useImpersonation()

  const handleImpersonate = async (user: User) => {
    if (!confirm(`Êtes-vous sûr de vouloir vous connecter en tant que ${user.email} ?`)) {
      return
    }

    if (isTestMode) {
      // En mode test, simuler l'impersonation
      toast.success(`[TEST] Impersonation démarrée pour ${user.email} (simulé)`)
      return
    }

    const result = await startImpersonation(user.id)
    if (result.success) {
      toast.success(`Impersonation démarrée pour ${user.email}`)
      // Rediriger vers l'application principale avec le token d'impersonation
      window.location.href = '/'
    } else {
      toast.error(result.error || 'Erreur lors de l\'impersonation')
    }
  }


  const columns = [
    {
      key: 'email',
      label: 'Email',
      sortable: true
    },
    {
      key: 'full_name',
      label: 'Nom',
      sortable: true,
      render: (user: User) => user.full_name || '-'
    },
    {
      key: 'created_at',
      label: 'Inscription',
      sortable: true,
      render: (user: User) => new Date(user.created_at).toLocaleDateString('fr-FR')
    },
    {
      key: 'last_active',
      label: 'Dernière activité',
      sortable: true,
      render: (user: User) => user.last_active ? new Date(user.last_active).toLocaleDateString('fr-FR') : '-'
    },
    {
      key: 'stats',
      label: 'Recherches',
      render: (user: User) => user.stats?.searches_count || 0
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (user: User) => (
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleImpersonate(user)
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            Log as
          </button>
        </div>
      )
    }
  ]

  // Données pour les graphiques (à récupérer depuis l'API)
  const registrationsData = data?.users?.slice(0, 30).map((user, index) => ({
    date: user.created_at,
    count: index + 1
  })) || []

  const airportsData = data?.users?.reduce((acc: Record<string, number>, user) => {
    const airport = user.home_airport || 'Non défini'
    acc[airport] = (acc[airport] || 0) + 1
    return acc
  }, {}) || {}

  const pieData = Object.entries(airportsData).map(([name, value]) => ({
    name,
    value: value as number
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Utilisateurs</h1>
        <p className="text-gray-400 text-sm">Home - Dashboard</p>
      </div>

      {/* Statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatsCard
          title="Total utilisateurs"
          value={data?.total || 0}
          icon="👥"
        />
        <StatsCard
          title="Utilisateurs actifs"
          value={data?.users?.filter(u => {
            if (!u.last_active) return false
            const lastActive = new Date(u.last_active)
            const thirtyDaysAgo = new Date()
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
            return lastActive > thirtyDaysAgo
          }).length || 0}
          icon="✅"
        />
        <StatsCard
          title="Nouveaux (7j)"
          value={data?.users?.filter(u => {
            const created = new Date(u.created_at)
            const sevenDaysAgo = new Date()
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
            return created > sevenDaysAgo
          }).length || 0}
          icon="🆕"
        />
        <StatsCard
          title="Administrateurs"
          value={data?.users?.filter(u => u.is_admin).length || 0}
          icon="👑"
        />
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#252836] rounded-xl border border-gray-700 shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-white">Évolution des inscriptions</h2>
          <LineChart
            data={registrationsData}
            xAxisKey="date"
            lines={[{ key: 'count', name: 'Inscriptions', color: '#3B82F6' }]}
          />
        </div>
        <div className="bg-[#252836] rounded-xl border border-gray-700 shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4 text-white">Répartition par aéroport</h2>
          <PieChart data={pieData} />
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-[#252836] rounded-xl border border-gray-700 shadow-lg p-4">
        <input
          type="text"
          placeholder="Filtrer par email..."
          value={emailFilter}
          onChange={(e) => setEmailFilter(e.target.value)}
          className="w-full px-4 py-2 bg-[#1a1d29] border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
      </div>

      {/* Tableau */}
      <DataTable
        data={data?.users || []}
        columns={columns}
        keyExtractor={(user) => user.id}
        loading={loading}
      />

      {/* Pagination */}
      {data && data.total > data.page_size && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-[#252836] border border-gray-700 text-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-700 transition-colors"
          >
            Précédent
          </button>
          <span className="px-4 py-2 text-gray-300 flex items-center">
            Page {page} sur {Math.ceil(data.total / data.page_size)}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page >= Math.ceil(data.total / data.page_size)}
            className="px-4 py-2 bg-[#252836] border border-gray-700 text-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-700 transition-colors"
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  )
}

