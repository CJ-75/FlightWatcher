import { ScanRequest, TripResponse } from '../types'
import { getSupabaseClient, getCurrentUser } from '../lib/supabase'

export interface SavedSearch {
  id: string
  name: string
  request: ScanRequest
  createdAt: string
  lastUsed?: string
  autoCheckEnabled?: boolean
  autoCheckIntervalSeconds?: number  // Intervalle en secondes entre les vérifications
  lastCheckResults?: TripResponse[]  // Résultats de la dernière vérification
  lastCheckedAt?: string  // Date de la dernière vérification
}

export interface SavedFavorite {
  id: string
  trip: TripResponse
  searchRequest: ScanRequest
  createdAt: string
  lastChecked?: string
  isStillValid?: boolean
  archived?: boolean  // Indique si le voyage est archivé
}

const STORAGE_KEYS = {
  SEARCHES: 'flightwatcher_saved_searches',
  FAVORITES: 'flightwatcher_favorites',
  EXCLUDED_DESTINATIONS: 'flightwatcher_excluded_destinations',
  DEV_MODE: 'flightwatcher_dev_mode',
  NEW_RESULTS: 'flightwatcher_new_results',
  AUTO_EXPORT_ENABLED: 'flightwatcher_auto_export_enabled'
}

export interface NewResult {
  searchId: string
  searchName: string
  trips: TripResponse[]
  timestamp: string
  isTest?: boolean  // Indique si ce sont des résultats de test
}

// Mode développeur
export const setDevMode = (enabled: boolean): void => {
  localStorage.setItem(STORAGE_KEYS.DEV_MODE, JSON.stringify(enabled))
}

export const getDevMode = (): boolean => {
  const data = localStorage.getItem(STORAGE_KEYS.DEV_MODE)
  return data ? JSON.parse(data) : false
}

// Stocker les nouveaux résultats
export const saveNewResults = (searchId: string, searchName: string, trips: TripResponse[], isTest: boolean = false): void => {
  const allNewResults = getNewResults()
  allNewResults[searchId] = {
    searchId,
    searchName,
    trips,
    timestamp: new Date().toISOString(),
    isTest
  }
  localStorage.setItem(STORAGE_KEYS.NEW_RESULTS, JSON.stringify(allNewResults))
  autoExport() // Export automatique
}

export const getNewResults = (): Record<string, NewResult> => {
  const data = localStorage.getItem(STORAGE_KEYS.NEW_RESULTS)
  return data ? JSON.parse(data) : {}
}

export const getNewResultsForSearch = (searchId: string): NewResult | null => {
  const allNewResults = getNewResults()
  return allNewResults[searchId] || null
}

export const clearNewResults = (searchId: string): void => {
  const allNewResults = getNewResults()
  delete allNewResults[searchId]
  localStorage.setItem(STORAGE_KEYS.NEW_RESULTS, JSON.stringify(allNewResults))
}

// Recherches sauvegardées
export const saveSearch = async (search: Omit<SavedSearch, 'id' | 'createdAt'>): Promise<SavedSearch> => {
  const user = await getCurrentUser()
  
  const supabase = await getSupabaseClient()
  if (supabase && user) {
    // Utiliser Supabase
    try {
      const { data, error } = await supabase
        .from('saved_searches')
        .insert({
          user_id: user.id,
          name: search.name,
          departure_airport: search.request.aeroport_depart || 'BVA',
          dates_depart: search.request.dates_depart,
          dates_retour: search.request.dates_retour,
          budget_max: search.request.budget_max || 200,
          limite_allers: search.request.limite_allers || 50,
          destinations_exclues: search.request.destinations_exclues || [],
          destinations_incluses: search.request.destinations_incluses || null,
          auto_check_enabled: search.autoCheckEnabled || false,
          check_interval_seconds: search.autoCheckIntervalSeconds || 3600,
          last_check_results: search.lastCheckResults || null,
          last_checked_at: search.lastCheckedAt || null
        })
        .select()
        .single()
      
      if (error) throw error
      
      const saved: SavedSearch = {
        id: data.id,
        name: data.name,
        request: {
          aeroport_depart: data.departure_airport,
          dates_depart: data.dates_depart,
          dates_retour: data.dates_retour,
          budget_max: data.budget_max,
          limite_allers: data.limite_allers,
          destinations_exclues: data.destinations_exclues || [],
          destinations_incluses: data.destinations_incluses
        },
        createdAt: data.created_at,
        lastUsed: data.last_used,
        autoCheckEnabled: data.auto_check_enabled,
        autoCheckIntervalSeconds: data.check_interval_seconds,
        lastCheckResults: data.last_check_results,
        lastCheckedAt: data.last_checked_at
      }
      
      autoExport()
      return saved
    } catch (error) {
      console.error('Erreur sauvegarde Supabase, fallback localStorage:', error)
      // Fallback localStorage
    }
  }
  
  // Fallback localStorage
  const saved: SavedSearch = {
    ...search,
    id: Date.now().toString(),
    createdAt: new Date().toISOString()
  }
  
  // Pour le fallback localStorage, on lit directement depuis localStorage
  const data = localStorage.getItem(STORAGE_KEYS.SEARCHES)
  const searches: SavedSearch[] = data ? JSON.parse(data) : []
  searches.push(saved)
  localStorage.setItem(STORAGE_KEYS.SEARCHES, JSON.stringify(searches))
  autoExport()
  return saved
}

export const getSavedSearches = async (): Promise<SavedSearch[]> => {
  const user = await getCurrentUser()
  
  if (supabase && user) {
    try {
      const { data, error } = await supabase
        .from('saved_searches')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      
      return (data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        request: {
          aeroport_depart: item.departure_airport,
          dates_depart: item.dates_depart,
          dates_retour: item.dates_retour,
          budget_max: item.budget_max,
          limite_allers: item.limite_allers,
          destinations_exclues: item.destinations_exclues || [],
          destinations_incluses: item.destinations_incluses
        },
        createdAt: item.created_at,
        lastUsed: item.last_used,
        autoCheckEnabled: item.auto_check_enabled,
        autoCheckIntervalSeconds: item.check_interval_seconds,
        lastCheckResults: item.last_check_results,
        lastCheckedAt: item.last_checked_at
      }))
    } catch (error) {
      console.error('Erreur récupération Supabase, fallback localStorage:', error)
      // Fallback localStorage
    }
  }
  
  // Fallback localStorage
  const data = localStorage.getItem(STORAGE_KEYS.SEARCHES)
  return data ? JSON.parse(data) : []
}

export const deleteSearch = async (id: string): Promise<void> => {
  const user = await getCurrentUser()
  
  if (supabase && user) {
    try {
      const { error } = await supabase
        .from('saved_searches')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
      
      if (error) throw error
      autoExport()
      return
    } catch (error) {
      console.error('Erreur suppression Supabase, fallback localStorage:', error)
      // Fallback localStorage
    }
  }
  
  // Fallback localStorage
  const searches = await getSavedSearches()
  const filtered = searches.filter(s => s.id !== id)
  localStorage.setItem(STORAGE_KEYS.SEARCHES, JSON.stringify(filtered))
  autoExport()
}

export const updateSearchLastUsed = async (id: string): Promise<void> => {
  const user = await getCurrentUser()
  
  if (supabase && user) {
    try {
      // Récupérer la valeur actuelle de times_used
      const { data: current } = await supabase
        .from('saved_searches')
        .select('times_used')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()
      
      const { error } = await supabase
        .from('saved_searches')
        .update({ 
          last_used: new Date().toISOString(),
          times_used: (current?.times_used || 0) + 1
        })
        .eq('id', id)
        .eq('user_id', user.id)
      
      if (error) throw error
      return
    } catch (error) {
      console.error('Erreur mise à jour Supabase, fallback localStorage:', error)
      // Fallback localStorage
    }
  }
  
  // Fallback localStorage
  const searches = await getSavedSearches()
  const updated = searches.map(s => 
    s.id === id ? { ...s, lastUsed: new Date().toISOString() } : s
  )
  localStorage.setItem(STORAGE_KEYS.SEARCHES, JSON.stringify(updated))
}

export const updateSearchAutoCheck = async (
  id: string, 
  enabled: boolean, 
  intervalSeconds?: number
): Promise<void> => {
  const user = await getCurrentUser()
  
  if (supabase && user) {
    try {
      const updateData: any = { auto_check_enabled: enabled }
      if (intervalSeconds !== undefined) {
        updateData.check_interval_seconds = intervalSeconds
      }
      
      const { error } = await supabase
        .from('saved_searches')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', user.id)
      
      if (error) throw error
      autoExport()
      return
    } catch (error) {
      console.error('Erreur mise à jour Supabase, fallback localStorage:', error)
      // Fallback localStorage
    }
  }
  
  // Fallback localStorage
  const searches = await getSavedSearches()
  const updated = searches.map(s => 
    s.id === id ? { 
      ...s, 
      autoCheckEnabled: enabled,
      autoCheckIntervalSeconds: intervalSeconds || s.autoCheckIntervalSeconds || 300
    } : s
  )
  localStorage.setItem(STORAGE_KEYS.SEARCHES, JSON.stringify(updated))
  autoExport()
}

export const updateSearchLastCheckResults = async (
  id: string, 
  results: TripResponse[]
): Promise<void> => {
  const user = await getCurrentUser()
  
  if (supabase && user) {
    try {
      const { error } = await supabase
        .from('saved_searches')
        .update({
          last_check_results: results,
          last_checked_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('user_id', user.id)
      
      if (error) throw error
      return
    } catch (error) {
      console.error('Erreur mise à jour Supabase, fallback localStorage:', error)
      // Fallback localStorage
    }
  }
  
  // Fallback localStorage
  const searches = await getSavedSearches()
  const updated = searches.map(s => 
    s.id === id ? { 
      ...s, 
      lastCheckResults: results,
      lastCheckedAt: new Date().toISOString()
    } : s
  )
  localStorage.setItem(STORAGE_KEYS.SEARCHES, JSON.stringify(updated))
}

export const getActiveAutoChecks = async (): Promise<SavedSearch[]> => {
  const searches = await getSavedSearches()
  return searches.filter(s => s.autoCheckEnabled === true)
}

// Favoris
export const saveFavorite = async (trip: TripResponse, searchRequest: ScanRequest): Promise<SavedFavorite> => {
  const user = await getCurrentUser()
  
  if (supabase && user) {
    try {
      const { data, error } = await supabase
        .from('favorites')
        .insert({
          user_id: user.id,
          destination_code: trip.destination_code,
          destination_name: trip.aller.destinationFull,
          outbound_date: new Date(trip.aller.departureTime).toISOString().split('T')[0],
          return_date: new Date(trip.retour.departureTime).toISOString().split('T')[0],
          total_price: trip.prix_total,
          outbound_flight: trip.aller,
          return_flight: trip.retour,
          search_request: searchRequest,
          is_archived: false,
          is_available: true
        })
        .select()
        .single()
      
      if (error) throw error
      
      const favorite: SavedFavorite = {
        id: data.id,
        trip,
        searchRequest,
        createdAt: data.created_at,
        lastChecked: data.last_availability_check,
        isStillValid: data.is_available,
        archived: data.is_archived
      }
      
      autoExport()
      return favorite
    } catch (error) {
      console.error('Erreur sauvegarde Supabase, fallback localStorage:', error)
      // Fallback localStorage
    }
  }
  
  // Fallback localStorage
  const favorite: SavedFavorite = {
    id: Date.now().toString(),
    trip,
    searchRequest,
    createdAt: new Date().toISOString()
  }
  
  const favorites = await getFavorites()
  favorites.push(favorite)
  localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favorites))
  autoExport()
  return favorite
}

export const getFavorites = async (): Promise<SavedFavorite[]> => {
  const user = await getCurrentUser()
  
  if (supabase && user) {
    try {
      const { data, error } = await supabase
        .from('favorites')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      
      return (data || []).map((item: any) => ({
        id: item.id,
        trip: {
          aller: item.outbound_flight,
          retour: item.return_flight,
          prix_total: item.total_price,
          destination_code: item.destination_code
        },
        searchRequest: item.search_request,
        createdAt: item.created_at,
        lastChecked: item.last_availability_check,
        isStillValid: item.is_available,
        archived: item.is_archived
      }))
    } catch (error) {
      console.error('Erreur récupération Supabase, fallback localStorage:', error)
      // Fallback localStorage
    }
  }
  
  // Fallback localStorage
  const data = localStorage.getItem(STORAGE_KEYS.FAVORITES)
  return data ? JSON.parse(data) : []
}

export const deleteFavorite = async (id: string): Promise<void> => {
  const user = await getCurrentUser()
  
  if (supabase && user) {
    try {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id)
      
      if (error) throw error
      autoExport()
      return
    } catch (error) {
      console.error('Erreur suppression Supabase, fallback localStorage:', error)
      // Fallback localStorage
    }
  }
  
  // Fallback localStorage
  const favorites = await getFavorites()
  const filtered = favorites.filter(f => f.id !== id)
  localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(filtered))
  autoExport()
}

export const isFavorite = async (trip: TripResponse): Promise<boolean> => {
  const favorites = await getFavorites()
  return favorites.some(f => 
    f.trip.aller.flightNumber === trip.aller.flightNumber &&
    f.trip.aller.departureTime === trip.aller.departureTime &&
    f.trip.retour.flightNumber === trip.retour.flightNumber &&
    f.trip.retour.departureTime === trip.retour.departureTime
  )
}

export const updateFavoriteStatus = async (id: string, isStillValid: boolean): Promise<void> => {
  const user = await getCurrentUser()
  
  if (supabase && user) {
    try {
      const { error } = await supabase
        .from('favorites')
        .update({
          is_available: isStillValid,
          last_availability_check: new Date().toISOString()
        })
        .eq('id', id)
        .eq('user_id', user.id)
      
      if (error) throw error
      autoExport()
      return
    } catch (error) {
      console.error('Erreur mise à jour Supabase, fallback localStorage:', error)
      // Fallback localStorage
    }
  }
  
  // Fallback localStorage
  const favorites = await getFavorites()
  const updated = favorites.map(f => 
    f.id === id ? { 
      ...f, 
      isStillValid,
      lastChecked: new Date().toISOString() 
    } : f
  )
  localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(updated))
  autoExport()
}

export const toggleFavoriteArchived = async (id: string): Promise<void> => {
  const user = await getCurrentUser()
  
  if (supabase && user) {
    try {
      // Récupérer l'état actuel
      const { data: favorite } = await supabase
        .from('favorites')
        .select('is_archived')
        .eq('id', id)
        .eq('user_id', user.id)
        .single()
      
      if (favorite) {
        const { error } = await supabase
          .from('favorites')
          .update({ is_archived: !favorite.is_archived })
          .eq('id', id)
          .eq('user_id', user.id)
        
        if (error) throw error
        autoExport()
        return
      }
    } catch (error) {
      console.error('Erreur mise à jour Supabase, fallback localStorage:', error)
      // Fallback localStorage
    }
  }
  
  // Fallback localStorage
  const favorites = await getFavorites()
  const updated = favorites.map(f => 
    f.id === id ? { 
      ...f, 
      archived: !f.archived
    } : f
  )
  localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(updated))
  autoExport()
}

export const getArchivedFavorites = async (): Promise<SavedFavorite[]> => {
  const favorites = await getFavorites()
  return favorites.filter(f => f.archived === true)
}

export const getActiveFavorites = async (): Promise<SavedFavorite[]> => {
  const favorites = await getFavorites()
  return favorites.filter(f => !f.archived)
}

// Destinations exclues par aéroport de départ
export const saveExcludedDestinations = (airport: string, excludedDestinations: string[]): void => {
  const allExcluded = getExcludedDestinations()
  allExcluded[airport] = excludedDestinations
  localStorage.setItem(STORAGE_KEYS.EXCLUDED_DESTINATIONS, JSON.stringify(allExcluded))
  autoExport() // Export automatique
}

export const getExcludedDestinations = (): Record<string, string[]> => {
  const data = localStorage.getItem(STORAGE_KEYS.EXCLUDED_DESTINATIONS)
  return data ? JSON.parse(data) : {}
}

export const getExcludedDestinationsForAirport = (airport: string): string[] => {
  const allExcluded = getExcludedDestinations()
  return allExcluded[airport] || []
}

// Export automatique des données
export interface ExportData {
  version: string
  exportDate: string
  searches: SavedSearch[]
  favorites: SavedFavorite[]
  excludedDestinations: Record<string, string[]>
  newResults: Record<string, NewResult>
  devMode: boolean
}

/**
 * Collecte toutes les données et les exporte automatiquement dans un fichier JSON
 */
export const exportAllData = async (): Promise<void> => {
  try {
    const exportData: ExportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      searches: await getSavedSearches(),
      favorites: await getFavorites(),
      excludedDestinations: getExcludedDestinations(),
      newResults: getNewResults(),
      devMode: getDevMode()
    }

    const dataStr = JSON.stringify(exportData, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `flightwatcher_backup_${new Date().toISOString().split('T')[0]}_${Date.now()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Erreur lors de l\'export des données:', error)
  }
}

// Préférence d'export automatique
export const setAutoExportEnabled = (enabled: boolean): void => {
  localStorage.setItem(STORAGE_KEYS.AUTO_EXPORT_ENABLED, JSON.stringify(enabled))
}

export const getAutoExportEnabled = (): boolean => {
  const data = localStorage.getItem(STORAGE_KEYS.AUTO_EXPORT_ENABLED)
  return data ? JSON.parse(data) : false // Par défaut désactivé
}

/**
 * Export automatique déclenché après chaque modification
 * Utilise un debounce pour éviter trop d'exports
 * Ne s'exécute que si l'export automatique est activé
 */
let exportTimeout: NodeJS.Timeout | null = null
let lastExportTime: number = 0
const MIN_EXPORT_INTERVAL = 30000 // Minimum 30 secondes entre deux exports

export const autoExport = (delay: number = 5000): void => {
  // Vérifier si l'export automatique est activé
  if (!getAutoExportEnabled()) {
    return
  }
  
  // Vérifier si on n'a pas déjà exporté récemment
  const now = Date.now()
  if (now - lastExportTime < MIN_EXPORT_INTERVAL) {
    // Réinitialiser le timeout pour reporter l'export
    if (exportTimeout) {
      clearTimeout(exportTimeout)
    }
    exportTimeout = setTimeout(() => {
      autoExport(delay)
    }, MIN_EXPORT_INTERVAL - (now - lastExportTime))
    return
  }
  
  // Annuler l'export précédent s'il existe
  if (exportTimeout) {
    clearTimeout(exportTimeout)
  }
  
  // Programmer un nouvel export après le délai
  exportTimeout = setTimeout(() => {
    exportAllData()
    lastExportTime = Date.now()
    exportTimeout = null
  }, delay)
}

