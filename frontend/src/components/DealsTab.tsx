import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { TravelDeal } from '../types'
import { getApiClient } from '../utils/apiClient'
import { DealCard } from './DealCard'
import { DealDetailModal } from './DealDetailModal'
import { useI18n } from '../contexts/I18nContext'

export function DealsTab() {
  const { t } = useI18n()
  const [deals, setDeals] = useState<TravelDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<TravelDeal | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await getApiClient().getDeals()
      setDeals(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
      setDeals([])
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6 sm:mb-8 px-1">
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          {t('nav.deals')}
        </h2>
        <p className="text-slate-500 mt-1 text-sm sm:text-base">
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
            <DealCard key={deal.id} deal={deal} onClick={() => setSelected(deal)} />
          ))}
        </motion.div>
      )}

      {selected ? (
        <DealDetailModal deal={selected} onClose={() => setSelected(null)} />
      ) : null}
    </div>
  )
}
