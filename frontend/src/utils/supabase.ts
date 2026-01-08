/**
 * Utilitaires Supabase pour FlightWatcher
 * 
 * Note: La configuration Supabase est chargée depuis le backend.
 * Configurez SUPABASE_URL et SUPABASE_ANON_KEY dans backend/.env
 * 
 * Pour le client Supabase côté frontend, utilisez lib/supabase.ts
 */

// Fonctions utilitaires pour interagir avec Supabase via l'API backend
// (Le backend gère la connexion Supabase pour des raisons de sécurité)

export const checkSupabaseStatus = async (): Promise<{ available: boolean; message: string }> => {
  try {
    const response = await fetch('/api/supabase/status');
    if (!response.ok) {
      return { available: false, message: 'Erreur lors de la vérification' };
    }
    return await response.json();
  } catch (error) {
    return { available: false, message: 'Supabase non disponible' };
  }
};

