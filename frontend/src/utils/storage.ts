import { ScanRequest, TripResponse } from '../types'
import { getSupabaseClient, getCurrentUser } from '../lib/supabase'
import { getFromCache, setCache, invalidateCache } from './cache'

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
  
  console.log('💾 saveSearch appelé:', { user: user?.id, hasSupabase: !!supabase, searchName: search.name });
  if (supabase && user) {
    // Utiliser Supabase
    try {
      const insertData = {
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
      };
      
      console.log('📤 Insertion dans Supabase saved_searches:', insertData);
      
      const { data, error } = await supabase
        .from('saved_searches')
        .insert(insertData)
        .select()
        .single()
      
      if (error) {
        console.error('❌ Erreur insertion Supabase saved_searches:', error);
        throw error;
      }
      
      console.log('✅ Recherche insérée avec succès:', data);
      
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
      
      // Write-through cache : mettre à jour le cache immédiatement
      const currentSearches = await getSavedSearches()
      const updatedSearches = [saved, ...currentSearches]
      setCache(user.id, 'searches', updatedSearches, true)
      
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
  
  // Mettre à jour le cache si utilisateur connecté
  if (user) {
    setCache(user.id, 'searches', searches, false)
  }
  
  autoExport()
  return saved
}

/**
 * Mappe les données Supabase vers SavedSearch
 */
function mapSupabaseSearchToSavedSearch(item: any): SavedSearch {
  // Gérer les deux noms de colonnes possibles (ancien schéma vs nouveau)
  const departureAirport = item.departure_airport || item.aeroport_depart;
  // Gérer les deux noms de colonnes pour l'intervalle de vérification
  const checkInterval = item.check_interval_seconds || item.auto_check_interval_seconds || 3600;
  
  return {
    id: item.id,
    name: item.name,
    request: {
      aeroport_depart: departureAirport,
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
    autoCheckIntervalSeconds: checkInterval,
    lastCheckResults: item.last_check_results,
    lastCheckedAt: item.last_checked_at
  };
}

export const getSavedSearches = async (forceRefresh: boolean = false): Promise<SavedSearch[]> => {
  const user = await getCurrentUser()
  const supabase = await getSupabaseClient()
  
  console.log('📥 getSavedSearches appelé:', { user: user?.id, hasSupabase: !!supabase, forceRefresh });
  
  // Si pas d'utilisateur, fallback localStorage classique
  if (!user) {
    const data = localStorage.getItem(STORAGE_KEYS.SEARCHES)
    return data ? JSON.parse(data) : []
  }
  
  // 1. Vérifier le cache si pas de refresh forcé
  if (!forceRefresh) {
    const cachedData = getFromCache<SavedSearch[]>(user.id, 'searches')
    if (cachedData !== null) {
      console.log('✅ Données récupérées depuis le cache:', cachedData.length, 'recherches');
      return cachedData
    }
  }
  
  // 2. Si Supabase disponible, faire la requête
  if (supabase) {
    try {
      console.log('🔍 Requête Supabase saved_searches pour user_id:', user.id);
      const { data, error } = await supabase
        .from('saved_searches')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      
      if (error) {
        console.error('❌ Erreur récupération Supabase saved_searches:', error);
        throw error;
      }
      
      console.log('✅ Données récupérées depuis Supabase saved_searches:', { 
        count: data?.length || 0
      });
      
      // Mapper les données
      const mappedSearches = (data || []).map(mapSupabaseSearchToSavedSearch)
      
      // Mettre à jour le cache avec les données Supabase
      setCache(user.id, 'searches', mappedSearches, true)
      
      return mappedSearches
    } catch (error) {
      console.error('❌ Erreur récupération Supabase, fallback cache/localStorage:', error);
      // En cas d'erreur, essayer le cache (même expiré) ou localStorage
      const cachedData = getFromCache<SavedSearch[]>(user.id, 'searches')
      if (cachedData !== null) {
        console.log('📦 Utilisation du cache en cas d\'erreur Supabase');
        return cachedData
      }
    }
  }
  
  // 3. Fallback localStorage classique (pour compatibilité)
  const data = localStorage.getItem(STORAGE_KEYS.SEARCHES)
  if (data) {
    const searches = JSON.parse(data)
    // Mettre en cache pour la prochaine fois
    if (user) {
      setCache(user.id, 'searches', searches, false)
    }
    return searches
  }
  
  return []
}

export const deleteSearch = async (id: string): Promise<void> => {
  const user = await getCurrentUser()
  const supabase = await getSupabaseClient()
  
  // Write-through cache : mettre à jour le cache immédiatement
  if (user) {
    const currentSearches = await getSavedSearches()
    const filtered = currentSearches.filter(s => s.id !== id)
    setCache(user.id, 'searches', filtered, false) // Marquer comme non synchronisé temporairement
  }
  
  if (supabase && user) {
    // Synchroniser avec Supabase en arrière-plan
    supabase
      .from('saved_searches')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .then(({ error }) => {
        if (error) {
          console.error('Erreur suppression Supabase:', error)
          // En cas d'erreur, recharger depuis Supabase pour restaurer le cache
          getSavedSearches(true).then(searches => {
            setCache(user.id, 'searches', searches, true)
          })
        } else {
          // Marquer comme synchronisé
          const currentSearches = getFromCache<SavedSearch[]>(user.id, 'searches')
          if (currentSearches) {
            setCache(user.id, 'searches', currentSearches, true)
          }
          autoExport()
        }
      })
      .catch((error) => {
        console.error('Erreur suppression Supabase:', error)
        // Recharger depuis Supabase pour restaurer le cache
        getSavedSearches(true).then(searches => {
          setCache(user.id, 'searches', searches, true)
        })
      })
    return
  }
  
  // Fallback localStorage
  const searches = await getSavedSearches()
  const filtered = searches.filter(s => s.id !== id)
  localStorage.setItem(STORAGE_KEYS.SEARCHES, JSON.stringify(filtered))
  
  // Mettre à jour le cache si utilisateur connecté
  if (user) {
    setCache(user.id, 'searches', filtered, false)
  }
  
  autoExport()
}

export const updateSearchLastUsed = async (id: string): Promise<void> => {
  const user = await getCurrentUser()
  const supabase = await getSupabaseClient()
  
  // Write-through cache : mettre à jour le cache immédiatement
  if (user) {
    const currentSearches = await getSavedSearches()
    const updated = currentSearches.map(s => 
      s.id === id ? { ...s, lastUsed: new Date().toISOString() } : s
    )
    setCache(user.id, 'searches', updated, false) // Marquer comme non synchronisé temporairement
  }
  
  if (supabase && user) {
    // Synchroniser avec Supabase en arrière-plan
    supabase
      .from('saved_searches')
      .select('times_used')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
      .then(({ data: current, error: selectError }) => {
        if (selectError) {
          console.error('Erreur récupération times_used:', selectError)
          // Recharger depuis Supabase pour restaurer le cache
          getSavedSearches(true).then(searches => {
            setCache(user.id, 'searches', searches, true)
          })
          return
        }
        
        return supabase
          .from('saved_searches')
          .update({ 
            last_used: new Date().toISOString(),
            times_used: (current?.times_used || 0) + 1
          })
          .eq('id', id)
          .eq('user_id', user.id)
      })
      .then((result) => {
        if (result?.error) {
          console.error('Erreur mise à jour Supabase:', result.error)
          // Recharger depuis Supabase pour restaurer le cache
          getSavedSearches(true).then(searches => {
            setCache(user.id, 'searches', searches, true)
          })
        } else {
          // Marquer comme synchronisé
          const currentSearches = getFromCache<SavedSearch[]>(user.id, 'searches')
          if (currentSearches) {
            setCache(user.id, 'searches', currentSearches, true)
          }
        }
      })
      .catch((error) => {
        console.error('Erreur mise à jour Supabase:', error)
        // Recharger depuis Supabase pour restaurer le cache
        getSavedSearches(true).then(searches => {
          setCache(user.id, 'searches', searches, true)
        })
      })
    return
  }
  
  // Fallback localStorage
  const searches = await getSavedSearches()
  const updated = searches.map(s => 
    s.id === id ? { ...s, lastUsed: new Date().toISOString() } : s
  )
  localStorage.setItem(STORAGE_KEYS.SEARCHES, JSON.stringify(updated))
  
  // Mettre à jour le cache si utilisateur connecté
  if (user) {
    setCache(user.id, 'searches', updated, false)
  }
}

export const updateSearchAutoCheck = async (
  id: string, 
  enabled: boolean, 
  intervalSeconds?: number
): Promise<void> => {
  const user = await getCurrentUser()
  const supabase = await getSupabaseClient()
  
  // Write-through cache : mettre à jour le cache immédiatement
  if (user) {
    const currentSearches = await getSavedSearches()
    const updated = currentSearches.map(s => 
      s.id === id ? { 
        ...s, 
        autoCheckEnabled: enabled,
        autoCheckIntervalSeconds: intervalSeconds || s.autoCheckIntervalSeconds || 300
      } : s
    )
    setCache(user.id, 'searches', updated, false) // Marquer comme non synchronisé temporairement
  }
  
  if (supabase && user) {
    // Synchroniser avec Supabase en arrière-plan
    const updateData: any = { auto_check_enabled: enabled }
    if (intervalSeconds !== undefined) {
      updateData.check_interval_seconds = intervalSeconds
    }
    
    supabase
      .from('saved_searches')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .then(({ error }) => {
        if (error) {
          console.error('Erreur mise à jour Supabase:', error)
          // Recharger depuis Supabase pour restaurer le cache
          getSavedSearches(true).then(searches => {
            setCache(user.id, 'searches', searches, true)
          })
        } else {
          // Marquer comme synchronisé
          const currentSearches = getFromCache<SavedSearch[]>(user.id, 'searches')
          if (currentSearches) {
            setCache(user.id, 'searches', currentSearches, true)
          }
          autoExport()
        }
      })
      .catch((error) => {
        console.error('Erreur mise à jour Supabase:', error)
        // Recharger depuis Supabase pour restaurer le cache
        getSavedSearches(true).then(searches => {
          setCache(user.id, 'searches', searches, true)
        })
      })
    return
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
  
  // Mettre à jour le cache si utilisateur connecté
  if (user) {
    setCache(user.id, 'searches', updated, false)
  }
  
  autoExport()
}

export const updateSearchLastCheckResults = async (
  id: string, 
  results: TripResponse[]
): Promise<void> => {
  const user = await getCurrentUser()
  const supabase = await getSupabaseClient()
  
  // Write-through cache : mettre à jour le cache immédiatement
  if (user) {
    const currentSearches = await getSavedSearches()
    const updated = currentSearches.map(s => 
      s.id === id ? { 
        ...s, 
        lastCheckResults: results,
        lastCheckedAt: new Date().toISOString()
      } : s
    )
    setCache(user.id, 'searches', updated, false) // Marquer comme non synchronisé temporairement
  }
  
  if (supabase && user) {
    // Synchroniser avec Supabase en arrière-plan
    supabase
      .from('saved_searches')
      .update({
        last_check_results: results,
        last_checked_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .then(({ error }) => {
        if (error) {
          console.error('Erreur mise à jour Supabase:', error)
          // Recharger depuis Supabase pour restaurer le cache
          getSavedSearches(true).then(searches => {
            setCache(user.id, 'searches', searches, true)
          })
        } else {
          // Marquer comme synchronisé
          const currentSearches = getFromCache<SavedSearch[]>(user.id, 'searches')
          if (currentSearches) {
            setCache(user.id, 'searches', currentSearches, true)
          }
        }
      })
      .catch((error) => {
        console.error('Erreur mise à jour Supabase:', error)
        // Recharger depuis Supabase pour restaurer le cache
        getSavedSearches(true).then(searches => {
          setCache(user.id, 'searches', searches, true)
        })
      })
    return
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
  
  // Mettre à jour le cache si utilisateur connecté
  if (user) {
    setCache(user.id, 'searches', updated, false)
  }
}

export const getActiveAutoChecks = async (): Promise<SavedSearch[]> => {
  const searches = await getSavedSearches()
  return searches.filter(s => s.autoCheckEnabled === true)
}

// Favoris
export const saveFavorite = async (trip: TripResponse, searchRequest: ScanRequest): Promise<SavedFavorite> => {
  const user = await getCurrentUser()
  const supabase = await getSupabaseClient()
  
  console.log('💾 saveFavorite appelé:', { user: user?.id, hasSupabase: !!supabase, trip: trip.destination_code });
  
  if (supabase && user) {
    try {
      const insertData = {
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
      };
      
      console.log('📤 Insertion dans Supabase favorites:', insertData);
      
      const { data, error } = await supabase
        .from('favorites')
        .insert(insertData)
        .select()
        .single()
      
      if (error) {
        console.error('❌ Erreur insertion Supabase:', error);
        throw error;
      }
      
      console.log('✅ Favori inséré avec succès:', data);
      
      const favorite: SavedFavorite = {
        id: data.id,
        trip,
        searchRequest,
        createdAt: data.created_at,
        lastChecked: data.last_availability_check,
        isStillValid: data.is_available,
        archived: data.is_archived
      }
      
      // Write-through cache : mettre à jour le cache immédiatement
      const currentFavorites = await getFavorites()
      const updatedFavorites = [favorite, ...currentFavorites]
      setCache(user.id, 'favorites', updatedFavorites, true)
      
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
  
  // Mettre à jour le cache si utilisateur connecté
  if (user) {
    setCache(user.id, 'favorites', favorites, false)
  }
  
  autoExport()
  return favorite
}

/**
 * Mappe les données Supabase vers SavedFavorite
 */
function mapSupabaseFavoriteToSavedFavorite(item: any): SavedFavorite {
  // S'assurer que les JSONB sont correctement parsés
  const outboundFlight = typeof item.outbound_flight === 'string' 
    ? JSON.parse(item.outbound_flight) 
    : item.outbound_flight;
  const returnFlight = typeof item.return_flight === 'string' 
    ? JSON.parse(item.return_flight) 
    : item.return_flight;
  const searchRequest = typeof item.search_request === 'string' 
    ? JSON.parse(item.search_request) 
    : item.search_request;
  
  // Debug: vérifier les données
  if (!outboundFlight || !outboundFlight.departureTime) {
    console.warn('Favori avec données incomplètes:', {
      id: item.id,
      outboundFlight,
      returnFlight,
      item
    });
  }
  
  return {
    id: item.id,
    trip: {
      aller: outboundFlight || {},
      retour: returnFlight || {},
      prix_total: parseFloat(item.total_price) || 0,
      destination_code: item.destination_code || outboundFlight?.destination || ''
    },
    searchRequest: searchRequest || {},
    createdAt: item.created_at,
    lastChecked: item.last_availability_check,
    isStillValid: item.is_available !== false,
    archived: item.is_archived === true
  };
}

export const getFavorites = async (forceRefresh: boolean = false): Promise<SavedFavorite[]> => {
  const user = await getCurrentUser()
  const supabase = await getSupabaseClient()
  
  console.log('📥 getFavorites appelé:', { user: user?.id, hasSupabase: !!supabase, forceRefresh });
  
  // Si pas d'utilisateur, fallback localStorage classique
  if (!user) {
    const data = localStorage.getItem(STORAGE_KEYS.FAVORITES)
    return data ? JSON.parse(data) : []
  }
  
  // 1. Vérifier le cache si pas de refresh forcé
  if (!forceRefresh) {
    const cachedData = getFromCache<SavedFavorite[]>(user.id, 'favorites')
    if (cachedData !== null) {
      console.log('✅ Données récupérées depuis le cache:', cachedData.length, 'favoris');
      return cachedData
    }
  }
  
  // 2. Si Supabase disponible, faire la requête
  if (supabase) {
    try {
      console.log('🔍 Requête Supabase favorites pour user_id:', user.id);
      const { data, error } = await supabase
        .from('favorites')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      
      if (error) {
        console.error('❌ Erreur récupération Supabase favorites:', error);
        throw error;
      }
      
      console.log('✅ Données récupérées depuis Supabase:', { count: data?.length || 0 });
      
      // Mapper les données
      const mappedFavorites = (data || []).map(mapSupabaseFavoriteToSavedFavorite)
      
      // Mettre à jour le cache avec les données Supabase
      setCache(user.id, 'favorites', mappedFavorites, true)
      
      return mappedFavorites
    } catch (error) {
      console.error('Erreur récupération Supabase, fallback cache/localStorage:', error)
      // En cas d'erreur, essayer le cache (même expiré) ou localStorage
      const cachedData = getFromCache<SavedFavorite[]>(user.id, 'favorites')
      if (cachedData !== null) {
        console.log('📦 Utilisation du cache en cas d\'erreur Supabase');
        return cachedData
      }
    }
  }
  
  // 3. Fallback localStorage classique (pour compatibilité)
  const data = localStorage.getItem(STORAGE_KEYS.FAVORITES)
  if (data) {
    const favorites = JSON.parse(data)
    // Mettre en cache pour la prochaine fois
    if (user) {
      setCache(user.id, 'favorites', favorites, false)
    }
    return favorites
  }
  
  return []
}

export const deleteFavorite = async (id: string): Promise<void> => {
  const user = await getCurrentUser()
  const supabase = await getSupabaseClient()
  
  // Write-through cache : mettre à jour le cache immédiatement
  if (user) {
    const currentFavorites = await getFavorites()
    const filtered = currentFavorites.filter(f => f.id !== id)
    setCache(user.id, 'favorites', filtered, false) // Marquer comme non synchronisé temporairement
  }
  
  if (supabase && user) {
    // Synchroniser avec Supabase en arrière-plan
    supabase
      .from('favorites')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)
      .then(({ error }) => {
        if (error) {
          console.error('Erreur suppression Supabase:', error)
          // En cas d'erreur, recharger depuis Supabase pour restaurer le cache
          getFavorites(true).then(favorites => {
            setCache(user.id, 'favorites', favorites, true)
          })
        } else {
          // Marquer comme synchronisé
          const currentFavorites = getFromCache<SavedFavorite[]>(user.id, 'favorites')
          if (currentFavorites) {
            setCache(user.id, 'favorites', currentFavorites, true)
          }
          autoExport()
        }
      })
      .catch((error) => {
        console.error('Erreur suppression Supabase:', error)
        // Recharger depuis Supabase pour restaurer le cache
        getFavorites(true).then(favorites => {
          setCache(user.id, 'favorites', favorites, true)
        })
      })
    return
  }
  
  // Fallback localStorage
  const favorites = await getFavorites()
  const filtered = favorites.filter(f => f.id !== id)
  localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(filtered))
  
  // Mettre à jour le cache si utilisateur connecté
  if (user) {
    setCache(user.id, 'favorites', filtered, false)
  }
  
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
  const supabase = await getSupabaseClient()
  
  // Write-through cache : mettre à jour le cache immédiatement
  if (user) {
    const currentFavorites = await getFavorites()
    const updated = currentFavorites.map(f => 
      f.id === id ? { 
        ...f, 
        isStillValid,
        lastChecked: new Date().toISOString() 
      } : f
    )
    setCache(user.id, 'favorites', updated, false) // Marquer comme non synchronisé temporairement
  }
  
  if (supabase && user) {
    // Synchroniser avec Supabase en arrière-plan
    supabase
      .from('favorites')
      .update({
        is_available: isStillValid,
        last_availability_check: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .then(({ error }) => {
        if (error) {
          console.error('Erreur mise à jour Supabase:', error)
          // Recharger depuis Supabase pour restaurer le cache
          getFavorites(true).then(favorites => {
            setCache(user.id, 'favorites', favorites, true)
          })
        } else {
          // Marquer comme synchronisé
          const currentFavorites = getFromCache<SavedFavorite[]>(user.id, 'favorites')
          if (currentFavorites) {
            setCache(user.id, 'favorites', currentFavorites, true)
          }
          autoExport()
        }
      })
      .catch((error) => {
        console.error('Erreur mise à jour Supabase:', error)
        // Recharger depuis Supabase pour restaurer le cache
        getFavorites(true).then(favorites => {
          setCache(user.id, 'favorites', favorites, true)
        })
      })
    return
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
  
  // Mettre à jour le cache si utilisateur connecté
  if (user) {
    setCache(user.id, 'favorites', updated, false)
  }
  
  autoExport()
}

export const toggleFavoriteArchived = async (id: string): Promise<void> => {
  const user = await getCurrentUser()
  const supabase = await getSupabaseClient()
  
  // Write-through cache : mettre à jour le cache immédiatement
  if (user) {
    const currentFavorites = await getFavorites()
    const updated = currentFavorites.map(f => 
      f.id === id ? { 
        ...f, 
        archived: !f.archived
      } : f
    )
    setCache(user.id, 'favorites', updated, false) // Marquer comme non synchronisé temporairement
  }
  
  if (supabase && user) {
    // Synchroniser avec Supabase en arrière-plan
    supabase
      .from('favorites')
      .select('is_archived')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()
      .then(({ data: favorite, error: selectError }) => {
        if (selectError || !favorite) {
          console.error('Erreur récupération état favori:', selectError)
          // Recharger depuis Supabase pour restaurer le cache
          getFavorites(true).then(favorites => {
            setCache(user.id, 'favorites', favorites, true)
          })
          return
        }
        
        return supabase
          .from('favorites')
          .update({ is_archived: !favorite.is_archived })
          .eq('id', id)
          .eq('user_id', user.id)
      })
      .then((result) => {
        if (result?.error) {
          console.error('Erreur mise à jour Supabase:', result.error)
          // Recharger depuis Supabase pour restaurer le cache
          getFavorites(true).then(favorites => {
            setCache(user.id, 'favorites', favorites, true)
          })
        } else {
          // Marquer comme synchronisé
          const currentFavorites = getFromCache<SavedFavorite[]>(user.id, 'favorites')
          if (currentFavorites) {
            setCache(user.id, 'favorites', currentFavorites, true)
          }
          autoExport()
        }
      })
      .catch((error) => {
        console.error('Erreur mise à jour Supabase:', error)
        // Recharger depuis Supabase pour restaurer le cache
        getFavorites(true).then(favorites => {
          setCache(user.id, 'favorites', favorites, true)
        })
      })
    return
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
  
  // Mettre à jour le cache si utilisateur connecté
  if (user) {
    setCache(user.id, 'favorites', updated, false)
  }
  
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

/**
 * Recharge les favoris depuis Supabase en forçant l'invalidation du cache
 * @param force Si true, force le rechargement même si le cache est valide
 * @returns Les favoris mis à jour depuis Supabase
 */
export const refreshFavorites = async (force: boolean = true): Promise<SavedFavorite[]> => {
  return getFavorites(force)
}

/**
 * Recharge les recherches sauvegardées depuis Supabase en forçant l'invalidation du cache
 * @param force Si true, force le rechargement même si le cache est valide
 * @returns Les recherches sauvegardées mises à jour depuis Supabase
 */
export const refreshSavedSearches = async (force: boolean = true): Promise<SavedSearch[]> => {
  return getSavedSearches(force)
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

