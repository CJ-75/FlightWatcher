/**
 * Migration automatique des données localStorage vers Supabase
 * Appelée automatiquement au premier login
 */

import { getSupabaseClient } from '../lib/supabase'
import type { SavedSearch, SavedFavorite } from './storage'
import { getSavedSearches, getFavorites } from './storage'

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
  if (!supabase) {
    return {
      success: false,
      searchesMigrated: 0,
      favoritesMigrated: 0,
      error: 'Supabase n\'est pas configuré'
    }
  }

  try {
    // Vérifier si la migration a déjà été effectuée
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('migration_completed')
      .eq('id', userId)
      .single()

    if (profile?.migration_completed) {
      console.log('✅ Migration déjà effectuée')
      return {
        success: true,
        searchesMigrated: 0,
        favoritesMigrated: 0
      }
    }

    let searchesMigrated = 0
    let favoritesMigrated = 0

    // Migrer les recherches sauvegardées
    const localSearches = await getSavedSearches()
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

    // Migrer les favoris
    const localFavorites = await getFavorites()
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

    // Optionnel : vider localStorage après migration réussie
    // Décommenter si vous voulez supprimer les données locales après migration
    // if (searchesMigrated > 0 || favoritesMigrated > 0) {
    //   localStorage.removeItem('flightwatcher_saved_searches')
    //   localStorage.removeItem('flightwatcher_favorites')
    //   console.log('🗑️ localStorage nettoyé')
    // }

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

