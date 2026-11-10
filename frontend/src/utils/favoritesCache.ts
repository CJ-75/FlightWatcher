/**
 * Favorites composite cache — durable L2 + progressive paint (parity mobile).
 */
import type {
  LikedActivity,
  LikedDeal,
  LikedItinerary,
  SavedFavorite,
} from '@flightwatcher/shared'
import { readDurableJson, writeDurableJson, removeDurable } from './durableStore'

const KEY = 'fw_favorites_cache_v1'

export type FavCachePayload = {
  favorites: SavedFavorite[]
  likedDeals: LikedDeal[]
  likedActivities: LikedActivity[]
  likedParcours: LikedItinerary[]
  at?: number
}

export function readFavoritesCache(userId: string): FavCachePayload | null {
  if (!userId) return null
  const packed = readDurableJson<FavCachePayload & { userId?: string }>(
    `${KEY}_${userId}`,
  )
  if (!packed || packed.userId !== userId) return null
  return {
    favorites: Array.isArray(packed.favorites) ? packed.favorites : [],
    likedDeals: Array.isArray(packed.likedDeals) ? packed.likedDeals : [],
    likedActivities: Array.isArray(packed.likedActivities)
      ? packed.likedActivities
      : [],
    likedParcours: Array.isArray(packed.likedParcours)
      ? packed.likedParcours
      : [],
    at: packed.at,
  }
}

export function writeFavoritesCache(userId: string, payload: FavCachePayload) {
  if (!userId) return
  writeDurableJson(`${KEY}_${userId}`, {
    userId,
    at: Date.now(),
    favorites: (payload.favorites || []).slice(0, 100),
    likedDeals: (payload.likedDeals || []).slice(0, 100),
    likedActivities: (payload.likedActivities || []).slice(0, 100),
    likedParcours: (payload.likedParcours || []).slice(0, 100),
  })
}

export function clearFavoritesCache(userId: string) {
  if (!userId) return
  removeDurable(`${KEY}_${userId}`)
}
