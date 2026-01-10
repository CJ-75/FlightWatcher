/**
 * Hook pour récupérer les données admin
 * Supporte le mode test avec données mockées
 */
import { useState, useEffect } from 'react'
import { getAccessToken } from '../../lib/supabase'
import {
  mockUsers,
  mockSearches,
  mockBookingSasEvents,
  mockPlans,
  mockSearchStats,
  mockBookingSasStats,
  generateMockChartData
} from '../utils/mockData'

interface UseAdminDataOptions {
  endpoint: string
  params?: Record<string, any>
  autoFetch?: boolean
}

// Fonction pour simuler un délai de chargement
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Fonction helper pour vérifier le mode test depuis localStorage
const getTestMode = (): boolean => {
  try {
    return localStorage.getItem('admin_test_mode') === 'true'
  } catch {
    return false
  }
}

export function useAdminData<T = any>(options: UseAdminDataOptions) {
  const { endpoint, params = {}, autoFetch = true } = options
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(autoFetch)
  const [error, setError] = useState<string | null>(null)
  
  // Vérifier le mode test depuis localStorage (plus fiable que le contexte)
  const [isTestMode, setIsTestMode] = useState(getTestMode)

  const fetchMockData = async () => {
    // Simuler un délai de chargement
    await delay(500)

    // Mapper les endpoints aux données mockées
    if (endpoint.includes('/admin/users')) {
      const page = params.page || 1
      const pageSize = params.page_size || 50
      const emailFilter = params.email
      
      let filteredUsers = [...mockUsers]
      
      if (emailFilter) {
        filteredUsers = filteredUsers.filter(u => 
          u.email.toLowerCase().includes(emailFilter.toLowerCase())
        )
      }
      
      const start = (page - 1) * pageSize
      const end = start + pageSize
      
      return {
        users: filteredUsers.slice(start, end),
        total: filteredUsers.length,
        page,
        page_size: pageSize
      } as T
    }


    if (endpoint.includes('/admin/searches/stats')) {
      return mockSearchStats as T
    }

    // IMPORTANT: Vérifier les endpoints stats AVANT les endpoints de liste
    // pour éviter que /admin/booking-sas/stats soit intercepté par /admin/booking-sas
    
    if (endpoint.includes('/admin/searches/stats')) {
      return mockSearchStats as T
    }

    if (endpoint.includes('/admin/booking-sas/stats')) {
      return mockBookingSasStats as T
    }

    if (endpoint.includes('/admin/searches')) {
      const page = params.page || 1
      const pageSize = params.page_size || 50
      const start = (page - 1) * pageSize
      const end = start + pageSize
      
      let filteredSearches = [...mockSearches]
      
      // Appliquer les filtres si fournis
      if (params.user_id) {
        filteredSearches = filteredSearches.filter(s => 
          s.user_profiles?.email?.includes(params.user_id) || 
          s.user_profiles?.full_name?.includes(params.user_id)
        )
      }
      if (params.departure_airport) {
        filteredSearches = filteredSearches.filter(s => 
          s.departure_airport === params.departure_airport
        )
      }
      if (params.auto_check_enabled !== undefined) {
        filteredSearches = filteredSearches.filter(s => 
          s.auto_check_enabled === params.auto_check_enabled
        )
      }
      
      return {
        searches: filteredSearches.slice(start, end),
        total: filteredSearches.length,
        page,
        page_size: pageSize
      } as T
    }

    if (endpoint.includes('/admin/booking-sas')) {
      const page = params.page || 1
      const pageSize = params.page_size || 50
      const start = (page - 1) * pageSize
      const end = start + pageSize
      
      let filteredEvents = [...mockBookingSasEvents]
      
      // Appliquer les filtres si fournis
      if (params.user_id) {
        filteredEvents = filteredEvents.filter(e => e.user_id === params.user_id)
      }
      if (params.partner_id) {
        filteredEvents = filteredEvents.filter(e => e.partner_id === params.partner_id)
      }
      if (params.destination_code) {
        filteredEvents = filteredEvents.filter(e => e.destination_code === params.destination_code)
      }
      if (params.date_from) {
        const dateFrom = new Date(params.date_from)
        filteredEvents = filteredEvents.filter(e => new Date(e.created_at) >= dateFrom)
      }
      if (params.date_to) {
        const dateTo = new Date(params.date_to)
        filteredEvents = filteredEvents.filter(e => new Date(e.created_at) <= dateTo)
      }
      
      return {
        events: filteredEvents.slice(start, end),
        total: filteredEvents.length,
        page,
        page_size: pageSize
      } as T
    }

    if (endpoint.includes('/admin/plans')) {
      return {
        plans: mockPlans
      } as T
    }

    if (endpoint.includes('/admin/settings')) {
      return {
        plans: mockPlans,
        features_by_plan: {}
      } as T
    }

    return null
  }

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Vérifier le mode test à chaque appel (pour être sûr d'avoir la dernière valeur)
      const currentTestMode = getTestMode()
      
      // Si mode test activé, utiliser les données mockées
      if (currentTestMode) {
        const mockData = await fetchMockData()
        if (mockData) {
          console.log(`[TEST MODE] Mock data for ${endpoint}:`, mockData)
          setData(mockData)
          setLoading(false)
          return
        } else {
          console.warn(`[TEST MODE] No mock data found for endpoint: ${endpoint}`)
        }
      }

      const token = await getAccessToken()
      if (!token) {
        throw new Error('Token d\'accès non disponible')
      }

      // Construire l'URL avec les paramètres
      let fullUrl: string
      if (endpoint.startsWith('http')) {
        fullUrl = endpoint
      } else {
        const baseUrl = window.location.origin.includes('localhost')
          ? 'http://localhost:8000'
          : window.location.origin
        fullUrl = `${baseUrl}${endpoint}`
      }
      const url = new URL(fullUrl)
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value))
        }
      })

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include' // Important pour envoyer les cookies (admin_password_verified)
      })

      if (!response.ok) {
        throw new Error(`Erreur ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      setData(result)
    } catch (err: any) {
      setError(err.message)
      console.error('Erreur récupération données admin:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (autoFetch) {
      fetchData()
    }
  }, [endpoint, JSON.stringify(params), autoFetch])
  
  // Écouter les changements de mode test depuis localStorage
  useEffect(() => {
    const handleTestModeChange = () => {
      setIsTestMode(getTestMode())
      if (autoFetch) {
        // Recharger les données quand le mode test change
        fetchData()
      }
    }
    
    window.addEventListener('testModeChanged', handleTestModeChange)
    window.addEventListener('storage', handleTestModeChange)
    
    return () => {
      window.removeEventListener('testModeChanged', handleTestModeChange)
      window.removeEventListener('storage', handleTestModeChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetch])

  return {
    data,
    loading,
    error,
    refetch: fetchData
  }
}

