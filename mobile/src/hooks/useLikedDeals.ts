import { useCallback, useState } from 'react'
import { Alert } from 'react-native'
import type { TravelDeal } from '@flightwatcher/shared'
import { translate } from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { useAuth } from '../context/AuthContext'

export function useLikedDeals() {
  const { user, viewUser } = useAuth()
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!viewUser) {
      setLikedIds(new Set())
      return
    }
    setLoading(true)
    try {
      const ids = await getApi().getLikedDealIds()
      setLikedIds(new Set(Array.isArray(ids) ? ids : []))
    } catch {
      setLikedIds(new Set())
    } finally {
      setLoading(false)
    }
  }, [viewUser])

  const isLiked = useCallback((dealId: string) => likedIds.has(dealId), [likedIds])

  const toggleLike = useCallback(
    async (deal: TravelDeal) => {
      if (!user) {
        Alert.alert('Connexion requise', translate('fr', 'deals.loginRequired'))
        return
      }

      const currentlyLiked = likedIds.has(deal.id)
      setLikedIds((prev) => {
        const next = new Set(prev)
        if (currentlyLiked) next.delete(deal.id)
        else next.add(deal.id)
        return next
      })

      try {
        if (currentlyLiked) {
          await getApi().unlikeDeal(deal.id)
        } else {
          await getApi().likeDeal(deal)
        }
      } catch {
        setLikedIds((prev) => {
          const next = new Set(prev)
          if (currentlyLiked) next.add(deal.id)
          else next.delete(deal.id)
          return next
        })
        Alert.alert('Erreur', 'Impossible de mettre à jour le favori')
      }
    },
    [user, likedIds],
  )

  return { likedIds, isLiked, toggleLike, refresh, loading }
}
