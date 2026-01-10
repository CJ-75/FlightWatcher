/**
 * Page de gestion des plans d'abonnement
 */
import { useState } from 'react'
import { useAdminData } from '../hooks/useAdminData'
import { useTestMode } from '../context/TestModeContext'
import { StatsCard } from '../components/StatsCard'
import { DataTable } from '../components/DataTable'
import { PieChart } from '../components/Charts/PieChart'
import { getAccessToken } from '../../lib/supabase'
import { toast } from 'react-hot-toast'

export function PlansPage() {
  const { isTestMode } = useTestMode()
  const { data, loading, refetch } = useAdminData<{ plans: any[] }>({
    endpoint: '/api/admin/plans',
    autoFetch: true
  })

  const columns = [
    { key: 'name', label: 'Nom', sortable: true },
    { key: 'price_monthly', label: 'Prix mensuel', render: (p: any) => p.price_monthly ? `${p.price_monthly}€` : '-' },
    { key: 'price_yearly', label: 'Prix annuel', render: (p: any) => p.price_yearly ? `${p.price_yearly}€` : '-' },
    { key: 'max_searches_per_month', label: 'Max recherches/mois', render: (p: any) => p.max_searches_per_month || 'Illimité' },
    { key: 'active', label: 'Statut', render: (p: any) => p.active ? '✅ Actif' : '❌ Inactif' }
  ]

  const handleToggleActive = async (plan: any) => {
    if (isTestMode) {
      // En mode test, simuler l'action
      toast.success(`[TEST] Plan ${plan.active ? 'désactivé' : 'activé'} (simulé)`)
      refetch()
      return
    }

    try {
      const token = await getAccessToken()
      const apiUrl = window.location.origin.includes('localhost')
        ? `http://localhost:8000/api/admin/plans/${plan.id}`
        : `/api/admin/plans/${plan.id}`
      
      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ active: !plan.active })
      })

      if (response.ok) {
        toast.success(`Plan ${plan.active ? 'désactivé' : 'activé'}`)
        refetch()
      } else {
        toast.error('Erreur lors de la modification')
      }
    } catch (error) {
      toast.error('Erreur lors de la modification')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Plans</h1>
        <p className="text-gray-400 text-sm">Home - Dashboard</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard title="Total plans" value={data?.plans?.length || 0} icon="💳" />
        <StatsCard title="Plans actifs" value={data?.plans?.filter((p: any) => p.active).length || 0} icon="✅" />
        <StatsCard title="Plans inactifs" value={data?.plans?.filter((p: any) => !p.active).length || 0} icon="❌" />
      </div>

      <div className="bg-[#252836] rounded-xl border border-gray-700 shadow-lg p-6">
        <h2 className="text-xl font-semibold mb-4 text-white">Répartition des plans</h2>
        <PieChart
          data={data?.plans?.map((p: any) => ({
            name: p.name,
            value: 1
          })) || []}
        />
      </div>

      <DataTable
        data={data?.plans || []}
        columns={columns}
        keyExtractor={(p) => p.id}
        loading={loading}
      />
    </div>
  )
}

