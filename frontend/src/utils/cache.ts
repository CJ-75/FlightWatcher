/**
 * Module de gestion du cache pour optimiser les performances Supabase
 * Implémente un système de cache à deux niveaux : mémoire + localStorage
 * Utilise le pattern write-through pour des performances optimales
 */

export interface CacheEntry<T> {
  data: T
  timestamp: number
  userId: string
  synced?: boolean // Indique si les données sont synchronisées avec Supabase
}

export type CacheKey = 'favorites' | 'searches'

const CACHE_TTL: Record<CacheKey, number> = {
  favorites: 5 * 60 * 1000, // 5 minutes
  searches: 10 * 60 * 1000, // 10 minutes
}

// Cache en mémoire (par userId)
const memoryCache: Map<string, Map<CacheKey, CacheEntry<any>>> = new Map()

/**
 * Obtient la clé de cache localStorage pour un type et un userId
 */
function getLocalStorageKey(key: CacheKey, userId: string): string {
  return `flightwatcher_cache_${key}_${userId}`
}

/**
 * Obtient le cache mémoire pour un userId et un type
 */
function getMemoryCache<T>(userId: string, key: CacheKey): CacheEntry<T> | null {
  const userCache = memoryCache.get(userId)
  if (!userCache) return null
  
  const entry = userCache.get(key)
  if (!entry) return null
  
  // Vérifier si le cache est encore valide
  const age = Date.now() - entry.timestamp
  const ttl = CACHE_TTL[key]
  
  if (age > ttl) {
    // Cache expiré, le supprimer
    userCache.delete(key)
    return null
  }
  
  return entry
}

/**
 * Définit le cache mémoire pour un userId et un type
 */
function setMemoryCache<T>(userId: string, key: CacheKey, data: T, synced: boolean = true): void {
  if (!memoryCache.has(userId)) {
    memoryCache.set(userId, new Map())
  }
  
  const userCache = memoryCache.get(userId)!
  userCache.set(key, {
    data,
    timestamp: Date.now(),
    userId,
    synced
  })
}

/**
 * Supprime le cache mémoire pour un userId et un type
 */
function clearMemoryCache(userId: string, key: CacheKey): void {
  const userCache = memoryCache.get(userId)
  if (userCache) {
    userCache.delete(key)
  }
}

/**
 * Obtient le cache localStorage pour un userId et un type
 */
function getLocalStorageCache<T>(userId: string, key: CacheKey): CacheEntry<T> | null {
  try {
    const storageKey = getLocalStorageKey(key, userId)
    const stored = localStorage.getItem(storageKey)
    
    if (!stored) return null
    
    const entry: CacheEntry<T> = JSON.parse(stored)
    
    // Vérifier si le cache est encore valide
    const age = Date.now() - entry.timestamp
    const ttl = CACHE_TTL[key]
    
    if (age > ttl) {
      // Cache expiré, le supprimer
      localStorage.removeItem(storageKey)
      return null
    }
    
    // Vérifier que le userId correspond
    if (entry.userId !== userId) {
      localStorage.removeItem(storageKey)
      return null
    }
    
    return entry
  } catch (error) {
    console.error('Erreur lecture cache localStorage:', error)
    return null
  }
}

/**
 * Définit le cache localStorage pour un userId et un type
 */
function setLocalStorageCache<T>(userId: string, key: CacheKey, data: T, synced: boolean = true): void {
  try {
    const storageKey = getLocalStorageKey(key, userId)
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      userId,
      synced
    }
    localStorage.setItem(storageKey, JSON.stringify(entry))
  } catch (error) {
    console.error('Erreur écriture cache localStorage:', error)
    // Si localStorage est plein, essayer de nettoyer les anciens caches
    try {
      const keys = Object.keys(localStorage)
      const cacheKeys = keys.filter(k => k.startsWith('flightwatcher_cache_'))
      // Supprimer les caches les plus anciens
      cacheKeys.forEach(k => {
        try {
          const entry = JSON.parse(localStorage.getItem(k) || '{}')
          const age = Date.now() - (entry.timestamp || 0)
          if (age > 24 * 60 * 60 * 1000) { // Plus de 24h
            localStorage.removeItem(k)
          }
        } catch {}
      })
      // Réessayer
      localStorage.setItem(storageKey, JSON.stringify(entry))
    } catch (retryError) {
      console.error('Impossible d\'écrire dans localStorage:', retryError)
    }
  }
}

/**
 * Supprime le cache localStorage pour un userId et un type
 */
function clearLocalStorageCache(userId: string, key: CacheKey): void {
  try {
    const storageKey = getLocalStorageKey(key, userId)
    localStorage.removeItem(storageKey)
  } catch (error) {
    console.error('Erreur suppression cache localStorage:', error)
  }
}

/**
 * Obtient les données depuis le cache (mémoire puis localStorage)
 * Retourne null si le cache n'est pas valide
 */
export function getFromCache<T>(userId: string, key: CacheKey): T | null {
  // 1. Vérifier le cache mémoire
  const memoryEntry = getMemoryCache<T>(userId, key)
  if (memoryEntry) {
    return memoryEntry.data
  }
  
  // 2. Vérifier le cache localStorage
  const storageEntry = getLocalStorageCache<T>(userId, key)
  if (storageEntry) {
    // Mettre à jour le cache mémoire avec les données localStorage
    setMemoryCache(userId, key, storageEntry.data, storageEntry.synced ?? true)
    return storageEntry.data
  }
  
  return null
}

/**
 * Met à jour le cache avec de nouvelles données (write-through)
 * Met à jour immédiatement le cache mémoire et localStorage
 */
export function setCache<T>(userId: string, key: CacheKey, data: T, synced: boolean = true): void {
  setMemoryCache(userId, key, data, synced)
  setLocalStorageCache(userId, key, data, synced)
}

/**
 * Invalide le cache pour un userId et un type
 */
export function invalidateCache(userId: string, key: CacheKey): void {
  clearMemoryCache(userId, key)
  clearLocalStorageCache(userId, key)
}

/**
 * Invalide tout le cache pour un userId
 */
export function invalidateAllCache(userId: string): void {
  clearMemoryCache(userId, 'favorites')
  clearMemoryCache(userId, 'searches')
  clearLocalStorageCache(userId, 'favorites')
  clearLocalStorageCache(userId, 'searches')
}

/**
 * Nettoie les caches expirés de localStorage
 */
export function cleanExpiredCaches(): void {
  try {
    const keys = Object.keys(localStorage)
    const cacheKeys = keys.filter(k => k.startsWith('flightwatcher_cache_'))
    
    cacheKeys.forEach(storageKey => {
      try {
        const stored = localStorage.getItem(storageKey)
        if (!stored) return
        
        const entry: CacheEntry<any> = JSON.parse(stored)
        
        // Déterminer le type de cache depuis la clé
        const key: CacheKey = storageKey.includes('_favorites_') ? 'favorites' : 'searches'
        const ttl = CACHE_TTL[key]
        const age = Date.now() - entry.timestamp
        
        if (age > ttl) {
          localStorage.removeItem(storageKey)
        }
      } catch (error) {
        // Supprimer les entrées corrompues
        localStorage.removeItem(storageKey)
      }
    })
  } catch (error) {
    console.error('Erreur nettoyage cache:', error)
  }
}

/**
 * Vérifie si le cache est valide pour un userId et un type
 */
export function isCacheValid(userId: string, key: CacheKey): boolean {
  return getFromCache(userId, key) !== null
}

// Nettoyer les caches expirés au démarrage
if (typeof window !== 'undefined') {
  cleanExpiredCaches()
}

