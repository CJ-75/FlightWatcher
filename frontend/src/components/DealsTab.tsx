import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { DealWindowKind, TravelDeal } from '../types'
import { getApiClient } from '../utils/apiClient'
import { getCurrentUser } from '../lib/supabase'
import { DealCard } from './DealCard'
import { DealDetailModal } from './DealDetailModal'
import { DealWeekendCalendar } from './DealWeekendCalendar'
import { useI18n } from '../contexts/I18nContext'
import { Toast } from './Toast'

const ORIGIN_OPTIONS = ['', 'BVA', 'ORY', 'CDG', 'MRS', 'NCE', 'LYS', 'TLS'] as const
const BUDGET_OPTIONS = [0, 200, 250, 300, 350, 450] as const

export function DealsTab() {
  const { t } = useI18n()
  const [deals, setDeals] = useState<TravelDeal[]>([])
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<TravelDeal | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [origin, setOrigin] = useState('')
  const [maxPp, setMaxPp] = useState(0)
  const [windowKind, setWindowKind] = useState<'' | DealWindowKind>('')
  const [adults, setAdults] = useState(2)
  const [occupancies, setOccupancies] = useState<number[]>([2])
  const [windowKinds, setWindowKinds] = useState<DealWindowKind[]>(['FRI_SUN'])

  useEffect(() => {
    void fetch('/api/config')
      .then((r) => r.json())
      .then((cfg) => {
        const occ = Array.isArray(cfg?.occupancies)
          ? cfg.occupancies.map(Number).filter((n: number) => n >= 1)
          : [2]
        setOccupancies(occ.length ? occ : [2])
        if (occ.length && !occ.includes(2)) setAdults(occ[0])
        const kinds = Array.isArray(cfg?.window_kinds)
          ? (cfg.window_kinds as DealWindowKind[])
          : (['FRI_SUN'] as DealWindowKind[])
        setWindowKinds(kinds.length ? kinds : ['FRI_SUN'])
      })
      .catch(() => undefined)
  }, [])

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
      const list = await getApiClient().getDeals({
        origin: origin || undefined,
        window: windowKind || undefined,
        max_pp: maxPp > 0 ? maxPp : undefined,
        adults,
      })
      setDeals(Array.isArray(list) ? list : [])
      await loadLikes()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
      setDeals([])
    } finally {
      setLoading(false)
    }
  }, [t, loadLikes, origin, windowKind, maxPp, adults])

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

  const filterLabel = useMemo(() => {
    const parts: string[] = []
    if (origin) parts.push(origin)
    if (maxPp > 0) parts.push(`≤ ${maxPp} €`)
    if (windowKind) parts.push(windowKind === 'FRI_SUN' ? 'ven→dim' : 'sam→lun')
    if (adults === 1) parts.push('solo')
    else if (adults !== 2) parts.push(`${adults} ad.`)
    return parts.join(' · ')
  }, [origin, maxPp, windowKind, adults])

  const calendarDeal = deals.find((d) => d.destination) || null

  return (
    <div className="w-full">
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="app-kicker mb-1.5">Deals</p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
            {t('nav.deals')}
          </h2>
          <p className="app-subtitle mt-1 max-w-xl">{t('deals.subtitle')}</p>
        </div>
        {!loading && !error && deals.length > 0 ? (
          <p className="text-sm font-semibold text-muted shrink-0">
            {deals.length} offre{deals.length > 1 ? 's' : ''}
            {filterLabel ? ` · ${filterLabel}` : ''}
          </p>
        ) : null}
      </div>

      <div className="mb-6 flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          {t('deals.filterOrigin')}
          <select
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-semibold text-ink min-w-[7rem]"
          >
            <option value="">{t('deals.filterAll')}</option>
            {ORIGIN_OPTIONS.filter(Boolean).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          {t('deals.filterBudget')}
          <select
            value={maxPp}
            onChange={(e) => setMaxPp(Number(e.target.value))}
            className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-semibold text-ink min-w-[8rem]"
          >
            <option value={0}>{t('deals.filterAll')}</option>
            {BUDGET_OPTIONS.filter((b) => b > 0).map((b) => (
              <option key={b} value={b}>
                {b} €
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          {t('deals.filterWindow')}
          <select
            value={windowKind}
            onChange={(e) => setWindowKind(e.target.value as '' | DealWindowKind)}
            className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-semibold text-ink min-w-[8rem]"
          >
            <option value="">{t('deals.filterAll')}</option>
            {windowKinds.includes('FRI_SUN') ? (
              <option value="FRI_SUN">Ven → Dim</option>
            ) : null}
            {windowKinds.includes('SAT_MON') ? (
              <option value="SAT_MON">Sam → Lun</option>
            ) : null}
          </select>
        </label>
        {occupancies.length > 1 ? (
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Occupants
            <select
              value={adults}
              onChange={(e) => setAdults(Number(e.target.value))}
              className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-semibold text-ink min-w-[7rem]"
            >
              {occupancies.map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? 'Solo (1)' : `${n} adultes`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {origin && calendarDeal?.destination ? (
        <DealWeekendCalendar
          iata={calendarDeal.destination}
          cityName={calendarDeal.city}
          origin={origin}
          adults={adults}
          windowKind={windowKind || 'FRI_SUN'}
        />
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-3xl border border-line bg-white overflow-hidden shadow-soft animate-pulse"
            >
              <div className="aspect-[16/10] bg-primary-50" />
              <div className="p-5 space-y-3">
                <div className="h-8 w-24 bg-primary-50 rounded-lg" />
                <div className="h-4 w-full bg-primary-50 rounded" />
                <div className="h-4 w-2/3 bg-primary-50 rounded" />
                <div className="h-11 w-full bg-primary-50 rounded-2xl mt-2" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-white rounded-3xl border border-line shadow-soft p-8 text-center max-w-md mx-auto">
          <p className="font-bold text-ink mb-2">{t('deals.errorTitle')}</p>
          <p className="text-sm text-muted mb-4 line-clamp-3">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="app-btn-primary rounded-2xl px-5 py-2.5 text-sm"
          >
            {t('deals.retry')}
          </button>
        </div>
      ) : deals.length === 0 ? (
        <div className="bg-white rounded-3xl border border-line shadow-soft p-8 text-center max-w-md mx-auto">
          <p className="font-bold text-ink mb-2">{t('deals.emptyTitle')}</p>
          <p className="text-sm text-muted">{t('deals.emptyBody')}</p>
        </div>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6"
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
