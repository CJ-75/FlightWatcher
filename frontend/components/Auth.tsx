/**
 * Composant d'authentification pour FlightWatcher
 * Gère le login/logout avec Google OAuth
 */

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient, getCurrentUser, signInWithGoogle, signOut, onAuthStateChange, isSupabaseAvailable } from '../lib/supabase'
import { migrateLocalStorageToSupabase } from '../utils/migration'
import { checkSupabaseStatus } from '../utils/supabase'
import type { User } from '@supabase/supabase-js'

export default function Auth() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [migrating, setMigrating] = useState(false)
  const [migrationStatus, setMigrationStatus] = useState<string | null>(null)
  const [supabaseStatus, setSupabaseStatus] = useState<{ available: boolean; message: string } | null>(null)
  const [supabaseClient, setSupabaseClient] = useState<any>(null)

  useEffect(() => {
    // Charger le client Supabase
    const initSupabase = async () => {
      const client = await getSupabaseClient()
      setSupabaseClient(client)
    }
    initSupabase()

    // Vérifier le statut Supabase
    checkSupabaseConnection()

    // Vérifier l'état initial
    checkUser()

    // Écouter les changements d'authentification
    const unsubscribe = onAuthStateChange(async (event, session) => {
      console.log('Auth event:', event, session?.user?.email)
      
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user)
        // Déclencher la migration automatique
        await handleMigration(session.user.id)
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setMigrationStatus(null)
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        setUser(session.user)
      }
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [])

  const checkSupabaseConnection = async () => {
    try {
      // Attendre un peu pour laisser le temps au backend de démarrer
      await new Promise(resolve => setTimeout(resolve, 1000))
      const status = await checkSupabaseStatus()
      setSupabaseStatus(status)
      // Si Supabase est disponible, mettre à jour aussi le statut frontend
      if (status.available) {
        const available = await isSupabaseAvailable()
        setFrontendSupabaseAvailable(available)
      }
    } catch (error) {
      console.error('Erreur vérification Supabase:', error)
      // Ne pas définir le statut en erreur immédiatement, peut-être que le backend n'est pas encore démarré
      // Réessayer après un délai
      setTimeout(() => {
        checkSupabaseConnection()
      }, 3000)
    }
  }

  const checkUser = async () => {
    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)
      
      if (currentUser) {
        // Vérifier si migration nécessaire
        await handleMigration(currentUser.id)
      }
    } catch (error) {
      console.error('Erreur vérification utilisateur:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleMigration = async (userId: string) => {
    if (migrating) return

    setMigrating(true)
    try {
      const result = await migrateLocalStorageToSupabase(userId)
      
      if (result.success) {
        if (result.searchesMigrated > 0 || result.favoritesMigrated > 0) {
          setMigrationStatus(
            `✅ ${result.searchesMigrated} recherche(s) et ${result.favoritesMigrated} favori(s) migré(s)`
          )
          // Masquer le message après 5 secondes
          setTimeout(() => setMigrationStatus(null), 5000)
        }
      } else {
        console.error('Erreur migration:', result.error)
      }
    } catch (error) {
      console.error('Erreur migration:', error)
    } finally {
      setMigrating(false)
    }
  }

  const handleSignIn = async () => {
    setLoading(true)
    const { error } = await signInWithGoogle()
    
    if (error) {
      console.error('Erreur connexion:', error)
      alert(`Erreur de connexion: ${error.message}`)
    }
    // La redirection OAuth se fait automatiquement
    setLoading(false)
  }

  const handleSignOut = async () => {
    setLoading(true)
    const { error } = await signOut()
    
    if (error) {
      console.error('Erreur déconnexion:', error)
      alert(`Erreur de déconnexion: ${error.message}`)
    } else {
      setUser(null)
      // Rafraîchir la page après déconnexion
      router.refresh()
    }
    setLoading(false)
  }

  // Vérifier si Supabase est configuré côté frontend
  const [frontendSupabaseAvailable, setFrontendSupabaseAvailable] = useState<boolean | null>(null)
  
  useEffect(() => {
    const check = async () => {
      // Attendre un peu pour laisser le temps au backend de charger la config
      await new Promise(resolve => setTimeout(resolve, 500))
      const available = await isSupabaseAvailable()
      setFrontendSupabaseAvailable(available)
    }
    check()
  }, [])
  
  // Ne pas afficher d'erreur si le backend indique que Supabase est disponible
  // ou si on est encore en train de charger
  const shouldShowError = supabaseStatus && !supabaseStatus.available && 
                          frontendSupabaseAvailable === false && 
                          !loading
  
  if (shouldShowError) {
    return (
      <div className="flex flex-col gap-2">
        <div className="px-4 py-2 text-sm text-gray-600 bg-yellow-50 border border-yellow-200 rounded">
          ⚠️ Supabase non configuré
          <div className="text-xs mt-1 text-gray-500">
            Configurez SUPABASE_URL et SUPABASE_ANON_KEY dans backend/.env
          </div>
        </div>
        {supabaseStatus && (
          <div className={`px-4 py-2 text-sm rounded border ${
            supabaseStatus.available 
              ? 'bg-green-50 text-green-700 border-green-200' 
              : 'bg-red-50 text-red-700 border-red-200'
          }`}>
            {supabaseStatus.available ? '✅' : '❌'} Backend: {supabaseStatus.message}
          </div>
        )}
      </div>
    )
  }

  if (loading && !user) {
    return (
      <div className="px-4 py-2 text-sm text-gray-600">
        Chargement...
      </div>
    )
  }

  if (user) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          {migrationStatus && (
            <div className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg border border-green-200 animate-pulse">
              {migrationStatus}
            </div>
          )}
          {migrating && (
            <div className="px-3 py-1.5 text-xs bg-blue-100 text-blue-700 rounded-lg border border-blue-200">
              ⏳ Migration en cours...
            </div>
          )}
          <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-2.5 shadow-sm hover:shadow-md transition-shadow">
            {/* Avatar Google */}
            {user.user_metadata?.avatar_url ? (
              <img 
                src={user.user_metadata.avatar_url} 
                alt={user.email || 'User'} 
                className="w-8 h-8 rounded-full border-2 border-gray-200"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-semibold text-sm border-2 border-gray-200">
                {user.email?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
            <div className="flex flex-col min-w-0">
              {user.user_metadata?.full_name && (
                <div className="text-sm font-semibold text-gray-800 truncate">
                  {user.user_metadata.full_name}
                </div>
              )}
              <div className="text-xs text-gray-500 truncate">
                {user.email}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors whitespace-nowrap"
              title="Se déconnecter"
            >
              {loading ? '...' : 'Déconnexion'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleSignIn}
        disabled={loading}
        className="group relative px-5 py-2.5 bg-white border-2 border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center gap-3 font-medium text-gray-700 hover:text-gray-900"
      >
        <div className="flex items-center justify-center w-5 h-5">
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
        </div>
        <span className="text-sm">
          {loading ? 'Connexion...' : 'Se connecter'}
        </span>
        {loading && (
          <svg className="animate-spin h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        )}
      </button>
    </div>
  )
}

