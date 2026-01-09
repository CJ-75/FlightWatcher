/**
 * Migration automatique des données localStorage vers Supabase
 * Appelée automatiquement au premier login
 */

import { getSupabaseClient } from '../lib/supabase'
import type { SavedSearch, SavedFavorite } from './storage'

/**
 * Migre les données localStorage vers Supabase
 * @param userId ID de l'utilisateur connecté
 * @returns Nombre d'éléments migrés
 */
export const migrateLocalStorageToSupabase = async (userId: string): Promise<{
  success: boolean
  searchesMigrated: number
  favoritesMigrated: number
  error?: string
}> => {
  const supabase = await getSupabaseClient()
  if (!supabase) {
    return {
      success: false,
      searchesMigrated: 0,
      favoritesMigrated: 0,
      error: 'Supabase n\'est pas configuré'
    }
  }

  try {
    // Définir les clés de stockage
    const STORAGE_KEYS = {
      SEARCHES: 'flightwatcher_saved_searches',
      FAVORITES: 'flightwatcher_favorites'
    }
    
    // Vérifier s'il y a des données dans localStorage
    const localSearchesData = localStorage.getItem(STORAGE_KEYS.SEARCHES)
    const localFavoritesData = localStorage.getItem(STORAGE_KEYS.FAVORITES)
    const localSearches: SavedSearch[] = localSearchesData ? JSON.parse(localSearchesData) : []
    const hasLocalData = localSearches.length > 0 || (localFavoritesData && JSON.parse(localFavoritesData).length > 0)
    
    console.log('📦 Données localStorage trouvées:', { 
      searches: localSearches.length,
      favorites: localFavoritesData ? JSON.parse(localFavoritesData).length : 0,
      hasLocalData
    })
    
    // Vérifier si la migration a déjà été effectuée
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('migration_completed')
      .eq('id', userId)
      .single()

    // Si migration déjà effectuée ET pas de données localStorage, on peut skip
    if (profile?.migration_completed && !hasLocalData) {
      console.log('✅ Migration déjà effectuée et aucune donnée localStorage')
      return {
        success: true,
        searchesMigrated: 0,
        favoritesMigrated: 0
      }
    }
    
    // Si pas de données localStorage, rien à migrer
    if (!hasLocalData) {
      console.log('ℹ️ Aucune donnée localStorage à migrer')
      // Marquer quand même la migration comme terminée si ce n'est pas déjà fait
      if (!profile?.migration_completed) {
        await supabase
          .from('user_profiles')
          .upsert({
            id: userId,
            migration_completed: true,
            last_active: new Date().toISOString()
          })
      }
      return {
        success: true,
        searchesMigrated: 0,
        favoritesMigrated: 0
      }
    }

    let searchesMigrated = 0
    let favoritesMigrated = 0
    
    if (localSearches.length > 0) {
      const searchesToInsert = localSearches.map((search: SavedSearch) => ({
        user_id: userId,
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
        last_checked_at: search.lastCheckedAt || null,
        last_check_results: search.lastCheckResults || null,
        times_used: 0,
        last_used: search.lastUsed || null
      }))

      const { error: searchesError } = await supabase
        .from('saved_searches')
        .insert(searchesToInsert)

      if (searchesError) {
        console.error('Erreur migration recherches:', searchesError)
      } else {
        searchesMigrated = localSearches.length
        console.log(`✅ ${searchesMigrated} recherche(s) migrée(s)`)
      }
    }

    // Migrer les favoris depuis localStorage directement
    // localFavoritesData a déjà été déclaré plus haut, on réutilise la variable
    const localFavorites: SavedFavorite[] = localFavoritesData ? JSON.parse(localFavoritesData) : []
    
    if (localFavorites.length > 0) {
      const favoritesToInsert = localFavorites.map((favorite: SavedFavorite) => ({
        user_id: userId,
        search_id: null, // Pas de référence pour les anciens favoris
        destination_code: favorite.trip.destination_code,
        destination_name: favorite.trip.aller.destinationFull,
        outbound_date: new Date(favorite.trip.aller.departureTime).toISOString().split('T')[0],
        return_date: new Date(favorite.trip.retour.departureTime).toISOString().split('T')[0],
        total_price: favorite.trip.prix_total,
        outbound_flight: favorite.trip.aller,
        return_flight: favorite.trip.retour,
        search_request: favorite.searchRequest,
        is_archived: favorite.archived || false,
        is_available: favorite.isStillValid !== undefined ? favorite.isStillValid : true,
        last_availability_check: favorite.lastChecked || null,
        booking_url: null,
        booked: false
      }))

      const { error: favoritesError } = await supabase
        .from('favorites')
        .insert(favoritesToInsert)

      if (favoritesError) {
        console.error('Erreur migration favoris:', favoritesError)
      } else {
        favoritesMigrated = localFavorites.length
        console.log(`✅ ${favoritesMigrated} favori(s) migré(s)`)
      }
    }

    // Marquer la migration comme terminée
    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert({
        id: userId,
        migration_completed: true,
        last_active: new Date().toISOString()
      })

    if (profileError) {
      console.error('Erreur mise à jour profil:', profileError)
    }

    // Vider localStorage après migration réussie
    if (searchesMigrated > 0 || favoritesMigrated > 0) {
      if (searchesMigrated > 0) {
        localStorage.removeItem(STORAGE_KEYS.SEARCHES)
        console.log('🗑️ Recherches supprimées de localStorage')
      }
      if (favoritesMigrated > 0) {
        localStorage.removeItem(STORAGE_KEYS.FAVORITES)
        console.log('🗑️ Favoris supprimés de localStorage')
      }
      console.log('✅ localStorage nettoyé après migration réussie')
    }

    return {
      success: true,
      searchesMigrated,
      favoritesMigrated
    }
  } catch (error) {
    console.error('Erreur lors de la migration:', error)
    return {
      success: false,
      searchesMigrated: 0,
      favoritesMigrated: 0,
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    }
  }
}

/**
 * Vérifie si la migration est nécessaire
 */
export const needsMigration = async (userId: string): Promise<boolean> => {
  const supabase = await getSupabaseClient()
  if (!supabase) return false

  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('migration_completed')
      .eq('id', userId)
      .single()

    // Si pas de profil ou migration pas complétée, migration nécessaire
    return !profile || !profile.migration_completed
  } catch (error) {
    // Si erreur, on considère que la migration est nécessaire
    return true
  }
}

