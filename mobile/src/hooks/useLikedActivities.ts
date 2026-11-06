import { useCallback, useState } from 'react'
import { Alert } from 'react-native'
import type { ActivityCardModel } from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { useAuth } from '../context/AuthContext'
import {
  likeGuestActivity,
  listGuestLikedActivityIds,
  unlikeGuestActivity,
} from '../dev/guestPreview'

export function useLikedActivities() {
  const { user, viewUser, isGuest } = useAuth()
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!viewUser) {
      setLikedIds(new Set())
      return
    }
    setLoading(true)
    try {
      if (__DEV__ && isGuest) {
        setLikedIds(new Set(listGuestLikedActivityIds()))
      } else {
        const ids = await getApi().getLikedActivityIds()
        setLikedIds(new Set(Array.isArray(ids) ? ids : []))
      }
    } catch {
      setLikedIds(new Set())
    } finally {
      setLoading(false)
    }
  }, [viewUser, isGuest])

  const isLiked = useCallback(
    (productCode: string) => likedIds.has(productCode),
    [likedIds],
  )

  const toggleLike = useCallback(
    async (card: ActivityCardModel) => {
      if (!card.productCode) return
      if (!user && !(__DEV__ && isGuest)) {
        Alert.alert('Connexion requise', 'Connecte-toi pour liker une activité.')
        return
      }

      const currentlyLiked = likedIds.has(card.productCode)
      setLikedIds((prev) => {
        const next = new Set(prev)
        if (currentlyLiked) next.delete(card.productCode)
        else next.add(card.productCode)
        return next
      })

      try {
        if (__DEV__ && isGuest) {
          if (currentlyLiked) unlikeGuestActivity(card.productCode)
          else likeGuestActivity(card)
        } else if (currentlyLiked) {
          await getApi().unlikeActivity(card.productCode)
        } else {
          await getApi().likeActivity(card)
        }
      } catch (e) {
        setLikedIds((prev) => {
          const next = new Set(prev)
          if (currentlyLiked) next.add(card.productCode)
          else next.delete(card.productCode)
          return next
        })
        const detail = e instanceof Error ? e.message : ''
        Alert.alert(
          'Erreur',
          detail.includes('liked_activities')
            ? 'Table liked_activities manquante — applique apply_liked_activities_migration.sql dans Supabase.'
            : detail || 'Impossible de mettre à jour le favori',
        )
      }
    },
    [user, isGuest, likedIds],
  )

  return { likedIds, isLiked, toggleLike, refresh, loading }
}
