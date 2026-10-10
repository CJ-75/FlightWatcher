import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { TravelDeal } from '../types'
import { getApiClient } from '../utils/apiClient'
import { getCurrentUser } from '../lib/supabase'
import { DealCard } from './DealCard'
import { DealDetailModal } from './DealDetailModal'
import { useI18n } from '../contexts/I18nContext'
import { Toast } from './Toast'

export function DealsTab() {
  const { t } = useI18n()
  const [deals, setDeals] = useState<TravelDeal[]>([])
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<TravelDeal | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const loadLikes = useCallback(async () => {
    try {
      const user = await getCurrentUser()
      if (!user) {
        setLikedIds(new Set())
        return
      }
      const ids = await getApiClient().getLikedDealIds()
      setLikedIds(new Set(Array.isArray(ids) ? ids : []))
    } catch {
      setLikedIds(new Set())
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await getApiClient().getDeals()
      setDeals(Array.isArray(list) ? list : [])
      await loadLikes()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
      setDeals([])
    } finally {
      setLoading(false)
    }
  }, [t, loadLikes])

  useEffect(() => {
    void load()
  }, [load])

  const toggleLike = async (deal: TravelDeal) => {
    const user = await getCurrentUser()
    if (!user) {
      setToast(t('deals.loginRequired'))
      return
    }

    const wasLiked = likedIds.has(deal.id)
    setLikedIds((prev) => {
      const next = new Set(prev)
      if (wasLiked) next.delete(deal.id)
      else next.add(deal.id)
      return next
    })

    try {
      if (wasLiked) {
        await getApiClient().unlikeDeal(deal.id)
        setToast(t('deals.unliked'))
      } else {
        await getApiClient().likeDeal(deal)
        setToast(t('deals.liked'))
      }
    } catch {
      setLikedIds((prev) => {
        const next = new Set(prev)
        if (wasLiked) next.add(deal.id)
        else next.delete(deal.id)
        return next
      })
      setToast(t('app.error'))
    }
  }

  return (
    <div className="w-full">
      <div className="mb-6 sm:mb-8">
        <p className="app-kicker mb-1.5">Deals</p>
        <h2 className="app-title text-2xl sm:text-3xl">
          {t('nav.deals')}
        </h2>
        <p className="app-subtitle mt-1">
          {t('deals.subtitle')}
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin mb-4" />
          <p className="font-medium">{t('deals.loading')}</p>
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-md mx-auto">
          <p className="font-bold text-slate-900 mb-2">{t('deals.errorTitle')}</p>
          <p className="text-sm text-slate-500 mb-4 line-clamp-3">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="bg-primary-500 text-white font-bold px-5 py-2.5 rounded-xl"
          >
            {t('deals.retry')}
          </button>
        </div>
      ) : deals.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-md mx-auto">
          <p className="font-bold text-slate-900 mb-2">{t('deals.emptyTitle')}</p>
          <p className="text-sm text-slate-500">{t('deals.emptyBody')}</p>
        </div>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6"
        >
          {deals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              liked={likedIds.has(deal.id)}
              onToggleLike={() => void toggleLike(deal)}
              onClick={() => setSelected(deal)}
            />
          ))}
        </motion.div>
      )}

      {selected ? (
        <DealDetailModal
          deal={selected}
          liked={likedIds.has(selected.id)}
          onToggleLike={() => void toggleLike(selected)}
          onClose={() => setSelected(null)}
        />
      ) : null}

      <Toast
        message={toast || ''}
        type="info"
        isVisible={!!toast}
        onClose={() => setToast(null)}
      />
    </div>
  )
}
