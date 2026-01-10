/**
 * Page de configuration des limites et fonctionnalités par plan
 */
import { useState, useEffect } from 'react'
import { useAdminData } from '../hooks/useAdminData'
import { useTestMode } from '../context/TestModeContext'
import { getAccessToken } from '../../lib/supabase'
import { toast } from 'react-hot-toast'

export function SettingsPage() {
  const { isTestMode } = useTestMode()
  const { data, loading, refetch } = useAdminData<{ plans: any[], features_by_plan: Record<string, any[]> }>({
    endpoint: '/api/admin/settings',
    autoFetch: true
  })

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null)
  const [features, setFeatures] = useState<Record<string, { enabled: boolean; limit_value?: number }>>({})

  useEffect(() => {
    if (selectedPlan && data?.features_by_plan) {
      const planFeatures = data.features_by_plan[selectedPlan] || []
      const featuresMap: Record<string, { enabled: boolean; limit_value?: number }> = {}
      planFeatures.forEach((f: any) => {
        featuresMap[f.feature_name] = {
          enabled: f.enabled,
          limit_value: f.limit_value
        }
      })
      setFeatures(featuresMap)
    }
  }, [selectedPlan, data])

  const availableFeatures = [
    { name: 'auto_check', label: 'Auto-check activé' },
    { name: 'email_notifications', label: 'Notifications email' },
    { name: 'export_data', label: 'Export données' },
    { name: 'api_access', label: 'Accès API' },
    { name: 'priority_support', label: 'Support prioritaire' }
  ]

  const handleSave = async () => {
    if (!selectedPlan) return

    if (isTestMode) {
      // En mode test, simuler la sauvegarde
      toast.success('[TEST] Configuration sauvegardée (simulé)')
      refetch()
      return
    }

    try {
      const token = await getAccessToken()
      const apiUrl = window.location.origin.includes('localhost')
        ? 'http://localhost:8000/api/admin/settings'
        : '/api/admin/settings'
      
      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          plan_id: selectedPlan,
          features
        })
      })

      if (response.ok) {
        toast.success('Configuration sauvegardée')
        refetch()
      } else {
        toast.error('Erreur lors de la sauvegarde')
      }
    } catch (error) {
      toast.error('Erreur lors de la sauvegarde')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Settings</h1>
        <p className="text-gray-400 text-sm">Home - Dashboard</p>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      ) : (
        <div className="bg-[#252836] rounded-xl border border-gray-700 shadow-lg p-6">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sélectionner un plan
            </label>
            <select
              value={selectedPlan || ''}
              onChange={(e) => setSelectedPlan(e.target.value)}
              className="w-full px-4 py-2 bg-[#1a1d29] border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="">-- Sélectionner un plan --</option>
              {data?.plans?.map((plan: any) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </div>

          {selectedPlan && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Fonctionnalités</h2>
              {availableFeatures.map((feature) => (
                <div key={feature.name} className="flex items-center justify-between p-4 bg-[#1a1d29] border border-gray-700 rounded-lg">
                  <div>
                    <label className="font-medium text-gray-200">{feature.label}</label>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={features[feature.name]?.enabled || false}
                        onChange={(e) => {
                          setFeatures({
                            ...features,
                            [feature.name]: {
                              ...features[feature.name],
                              enabled: e.target.checked
                            }
                          })
                        }}
                        className="w-4 h-4 text-blue-600 bg-[#252836] border-gray-600 rounded focus:ring-blue-500"
                      />
                      <span>Activé</span>
                    </label>
                    {feature.name === 'auto_check' && (
                      <input
                        type="number"
                        placeholder="Limite"
                        value={features[feature.name]?.limit_value || ''}
                        onChange={(e) => {
                          setFeatures({
                            ...features,
                            [feature.name]: {
                              ...features[feature.name],
                              limit_value: e.target.value ? parseInt(e.target.value) : undefined
                            }
                          })
                        }}
                        className="w-24 px-2 py-1 bg-[#252836] border border-gray-700 rounded text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    )}
                  </div>
                </div>
              ))}
              <button
                onClick={handleSave}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors shadow-lg shadow-blue-600/20"
              >
                Sauvegarder
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

