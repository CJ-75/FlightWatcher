import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { DealWindowKind, TravelDeal } from '../types'
import { getApiClient } from '../utils/apiClient'
import { getCurrentUser } from '../lib/supabase'
import { DealCard } from './DealCard'
import { DealDetailModal } from './DealDetailModal'
import { DealWeekendCalendar } from './DealWeekendCalendar'
import { PassengerStepper } from './PassengerStepper'
import { CityAirportSelect } from './CityAirportSelect'
import { useI18n } from '../contexts/I18nContext'
import { Toast } from './Toast'
import { openSearchFromDeals } from '../utils/searchPrefill'

const springConfig = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 20,
  mass: 0.5,
}

export function DealsTab() {
  const { t } = useI18n()
  const [deals, setDeals] = useState<TravelDeal[]>([])
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<TravelDeal | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [origin, setOrigin] = useState('')
  const [adults, setAdults] = useState(2)
  const [windowKinds, setWindowKinds] = useState<DealWindowKind[]>(['FRI_SUN'])
  const [readonlyBanner, setReadonlyBanner] = useState(false)
  const [calendarEnabled, setCalendarEnabled] = useState(false)

  useEffect(() => {
    void fetch('/api/config')
      .then((r) => r.json())
      .then((cfg) => {
        const kinds = Array.isArray(cfg?.window_kinds)
          ? (cfg.window_kinds as DealWindowKind[])
          : (['FRI_SUN'] as DealWindowKind[])
        setWindowKinds(kinds.length ? kinds : ['FRI_SUN'])
        setReadonlyBanner(Boolean(cfg?.prod_readonly) || cfg?.booking_enabled === false)
        setCalendarEnabled(Boolean(cfg?.calendar_enabled))
      })
      .catch(() => undefined)
  }, [])

  const goSearch = (opts?: { destination?: string; city?: string }) => {
    openSearchFromDeals({
      origin: origin || undefined,
      destination: opts?.destination,
      city: opts?.city,
      adults,
    })
  }

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
  }, [t, loadLikes, origin, adults])

  useEffect(() => {
    void load()
  }, [load])

  // Lot F — deep link from Mon voyage hôtel CTA (?deal=&book_hotel=1)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const dealKey = params.get('deal')
      if (!dealKey || deals.length === 0) return
      const found = deals.find((d) => d.id === dealKey || d.deal_key === dealKey)
      if (found) {
        setSelected(found)
        if (params.get('book_hotel') === '1') {
          sessionStorage.setItem(
            'fw_book_hotel',
            JSON.stringify({
              deal_key: dealKey,
              checkin: params.get('checkin'),
              checkout: params.get('checkout'),
            }),
          )
        }
        window.history.replaceState({}, '', window.location.pathname)
      }
    } catch {
      /* ignore */
    }
  }, [deals])

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
    if (origin) parts.push(origin.split(',')[0] || origin)
    if (adults === 1) parts.push('solo')
    else if (adults !== 2) parts.push(`${adults} ad.`)
    return parts.join(' · ')
  }, [origin, adults])

  const calendarDeal = deals.find((d) => d.destination) || null
  const calendarWindow: DealWindowKind =
    windowKinds.includes('FRI_SUN') ? 'FRI_SUN' : windowKinds[0] || 'FRI_SUN'

  return (
    <div className="w-full">
      <div className="mb-5 sm:mb-6">
        <p className="app-kicker mb-1.5">Deals</p>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
          {t('nav.deals')}
        </h2>
        <p className="app-subtitle mt-1 max-w-xl">{t('deals.subtitle')}</p>
        {readonlyBanner ? (
          <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mt-2 max-w-xl">
            {t('deals.readonlyBanner')}
          </p>
        ) : null}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
        className="w-full app-card p-4 sm:p-6 md:p-8 mb-6 sm:mb-8"
      >
        <div className="mb-4 sm:mb-5">
          <div className="flex items-center justify-between gap-3 mb-2 sm:mb-3">
            <label className="text-base sm:text-lg font-bold text-slate-900 block">
              {t('deals.filterOrigin')}
            </label>
            {origin ? (
              <button
                type="button"
                onClick={() => setOrigin('')}
                className="text-xs sm:text-sm font-semibold text-primary-600 hover:underline"
              >
                Toutes les origines
              </button>
            ) : null}
          </div>
          <CityAirportSelect value={origin} onChange={setOrigin} />
          {!origin ? (
            <p className="text-xs text-slate-500 mt-2">
              Laisse vide pour voir toutes les origines, ou choisis une ville de départ.
            </p>
          ) : null}
        </div>

        <PassengerStepper value={adults} onChange={setAdults} min={1} max={6} />
      </motion.div>

      {!loading && !error && deals.length > 0 ? (
        <p className="text-sm font-semibold text-muted mb-4">
          {deals.length} offre{deals.length > 1 ? 's' : ''}
          {filterLabel ? ` · ${filterLabel}` : ''}
        </p>
      ) : null}

      {calendarEnabled && origin && calendarDeal?.destination ? (
        <DealWeekendCalendar
          iata={calendarDeal.destination}
          cityName={calendarDeal.city}
          origin={origin}
          adults={adults}
          windowKind={calendarWindow}
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
        <div className="app-card p-8 text-center max-w-md mx-auto">
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
        <div className="app-card p-8 text-center max-w-md mx-auto">
          <p className="font-bold text-ink mb-2">{t('deals.emptyTitle')}</p>
          <p className="text-sm text-muted mb-4">
            {origin ? t('deals.emptyBody', { origin }) : t('deals.emptyBodyAll')}
          </p>
          <button
            type="button"
            onClick={() => goSearch()}
            className="app-btn-primary rounded-2xl px-5 py-2.5 text-sm"
          >
            {t('deals.openSearch')}
          </button>
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
          onOtherDates={() => {
            setSelected(null)
            goSearch({
              destination: selected.destination,
              city: selected.city,
            })
          }}
        />
      ) : null}

      {toast ? <Toast message={toast} onClose={() => setToast(null)} /> : null}
    </div>
  )
}
