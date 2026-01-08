/**
 * Client Supabase pour FlightWatcher
 * Gère l'authentification et les appels à la base de données
 * Les variables d'environnement sont chargées depuis le backend
 */

import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js'

// Variables d'environnement - toujours chargées depuis le backend
let supabaseUrl: string | undefined = undefined
let supabaseAnonKey: string | undefined = undefined

// État du chargement de la configuration
let supabaseConfigLoaded = false
let supabaseConfigPromise: Promise<void> | null = null

/**
 * Charge la configuration Supabase depuis le backend
 */
async function loadSupabaseConfig(): Promise<void> {
  if (supabaseConfigLoaded) return
  
  try {
    const response = await fetch('/api/config')
    if (!response.ok) {
      console.warn('⚠️ Impossible de charger la configuration depuis le backend')
      return
    }
    
    const config = await response.json()
    if (config.available && config.supabase_url && config.supabase_anon_key) {
      supabaseUrl = config.supabase_url
      supabaseAnonKey = config.supabase_anon_key
      supabaseConfigLoaded = true
      console.log('✅ Configuration Supabase chargée depuis le backend')
    } else {
      console.warn('⚠️ Supabase n\'est pas configuré dans le backend')
    }
  } catch (error) {
    console.warn('⚠️ Erreur lors du chargement de la configuration:', error)
  }
}

// Toujours charger la configuration depuis le backend au démarrage
supabaseConfigPromise = loadSupabaseConfig()

// Créer le client Supabase (sera mis à jour après le chargement de la config)
let supabase: SupabaseClient | null = null

/**
 * Initialise le client Supabase (appelé après le chargement de la config)
 */
function initializeSupabaseClient(): SupabaseClient | null {
  if (supabaseUrl && supabaseAnonKey) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    })
  }
  return null
}

// Attendre le chargement depuis le backend avant d'initialiser le client
if (supabaseConfigPromise) {
  supabaseConfigPromise.then(() => {
    supabase = initializeSupabaseClient()
  })
}

/**
 * Obtient le client Supabase, en chargeant la config si nécessaire
 */
export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (supabase) return supabase
  
  // Attendre le chargement de la configuration
  if (supabaseConfigPromise) {
    await supabaseConfigPromise
  } else if (!supabaseConfigLoaded) {
    await loadSupabaseConfig()
  }
  
  // Réinitialiser le client avec la nouvelle configuration
  if (supabaseUrl && supabaseAnonKey && !supabase) {
    supabase = initializeSupabaseClient()
  }
  
  return supabase
}

// Export du client (peut être null jusqu'à ce que la config soit chargée)
export { supabase }

/**
 * Vérifie si Supabase est configuré
 */
export const isSupabaseAvailable = async (): Promise<boolean> => {
  const client = await getSupabaseClient()
  return client !== null
}

/**
 * Obtient l'utilisateur actuellement connecté
 */
export const getCurrentUser = async (): Promise<User | null> => {
  const client = await getSupabaseClient()
  if (!client) return null
  const { data: { user } } = await client.auth.getUser()
  return user
}

/**
 * Obtient la session actuelle
 */
export const getCurrentSession = async (): Promise<Session | null> => {
  const client = await getSupabaseClient()
  if (!client) return null
  const { data: { session } } = await client.auth.getSession()
  return session
}

/**
 * Se connecter avec email et mot de passe
 */
export const signInWithEmail = async (email: string, password: string): Promise<{ error: Error | null }> => {
  const client = await getSupabaseClient()
  if (!client) {
    return { error: new Error('Supabase n\'est pas configuré') }
  }

  const { error } = await client.auth.signInWithPassword({
    email,
    password
  })

  return { error: error ? new Error(error.message) : null }
}

/**
 * S'inscrire avec email et mot de passe
 */
export const signUpWithEmail = async (email: string, password: string): Promise<{ error: Error | null, user: any }> => {
  const client = await getSupabaseClient()
  if (!client) {
    return { error: new Error('Supabase n\'est pas configuré'), user: null }
  }

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`
    }
  })

  return { error: error ? new Error(error.message) : null, user: data.user }
}

/**
 * Réinitialiser le mot de passe
 */
export const resetPassword = async (email: string): Promise<{ error: Error | null }> => {
  const client = await getSupabaseClient()
  if (!client) {
    return { error: new Error('Supabase n\'est pas configuré') }
  }

  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`
  })

  return { error: error ? new Error(error.message) : null }
}

/**
 * Se connecter avec Google OAuth
 */
export const signInWithGoogle = async (): Promise<{ error: Error | null }> => {
  const client = await getSupabaseClient()
  if (!client) {
    return { error: new Error('Supabase n\'est pas configuré') }
  }

  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`
    }
  })

  return { error }
}

/**
 * Se déconnecter
 */
export const signOut = async (): Promise<{ error: Error | null }> => {
  const client = await getSupabaseClient()
  if (!client) {
    return { error: new Error('Supabase n\'est pas configuré') }
  }

  const { error } = await client.auth.signOut()
  return { error }
}

/**
 * Écouter les changements d'authentification
 * Retourne une fonction de cleanup
 */
export const onAuthStateChange = (
  callback: (event: string, session: Session | null) => void
): (() => void) => {
  // Initialiser le listener de manière asynchrone
  let unsubscribe: (() => void) | null = null
  
  getSupabaseClient().then(client => {
    if (client) {
      const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
        callback(event, session)
      })
      unsubscribe = () => subscription.unsubscribe()
    }
  })
  
  // Retourner une fonction de cleanup qui fonctionne même si le client n'est pas encore chargé
  return () => {
    if (unsubscribe) unsubscribe()
  }
}

/**
 * Vérifie si l'utilisateur est connecté
 */
export const isAuthenticated = async (): Promise<boolean> => {
  const client = await getSupabaseClient()
  if (!client) return false
  const user = await getCurrentUser()
  return user !== null
}

/**
 * Obtient le token d'accès pour les appels API backend
 */
export const getAccessToken = async (): Promise<string | null> => {
  if (!supabase) return null
  const session = await getCurrentSession()
  return session?.access_token || null
}

export default supabase

