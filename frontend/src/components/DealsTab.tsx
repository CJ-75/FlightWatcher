import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { TravelDeal } from '../types'
import { getApiClient } from '../utils/apiClient'
import { getCurrentUser } from '../lib/supabase'
import { DealCard } from './DealCard'
import { DealDetailModal } from './DealDetailModal'
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

  /** Arrival city first (hotel axis); origin optional for flight priority. */
  const [destination, setDestination] = useState('')
  const [origin, setOrigin] = useState('')
  const [adults, setAdults] = useState(2)
  const [readonlyBanner, setReadonlyBanner] = useState(false)
  const [queryDestination, setQueryDestination] = useState('')
  const [queryOrigin, setQueryOrigin] = useState('')
  const [queryAdults, setQueryAdults] = useState(2)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sort, setSort] = useState<'recommended' | 'price_asc' | 'price_desc'>('recommended')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void fetch('/api/config')
      .then((r) => r.json())
      .then((cfg) => {
        setReadonlyBanner(Boolean(cfg?.prod_readonly) || cfg?.booking_enabled === false)
      })
      .catch(() => undefined)
  }, [])

  // Debounce filter → query (avoids reload on every stepper tick)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setQueryDestination(destination)
      setQueryOrigin(origin)
      setQueryAdults(adults)
    }, 280)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [destination, origin, adults])

  const goSearch = (opts?: { destination?: string; city?: string }) => {
    openSearchFromDeals({
      origin: origin || undefined,
      destination: opts?.destination || destination || undefined,
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
      const listPromise = getApiClient().getDeals({
        origin: queryOrigin || undefined,
        destination: queryDestination || undefined,
        adults: queryAdults,
        limit: 36,
      })
      void loadLikes()
      const list = await listPromise
      // Deals = hôtel photo only (no city stock fallback)
      const withHotelPhoto = (Array.isArray(list) ? list : []).filter(
        (d) => Boolean(d.hotel?.photo || (d.image_url && String(d.image_url).trim())),
      )
      setDeals(withHotelPhoto)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('app.error'))
      setDeals([])
    } finally {
      setLoading(false)
    }
  }, [t, loadLikes, queryOrigin, queryDestination, queryAdults])

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
    const from = origin ? origin.split(',')[0] || origin : null
    const to = destination ? destination.split(',')[0] || destination : null
    const parts: string[] = []
    if (from && to) parts.push(`${from} → ${to}`)
    else if (from) parts.push(`de ${from}`)
    else if (to) parts.push(`→ ${to}`)
    if (adults === 1) parts.push('solo')
    else if (adults !== 2) parts.push(`${adults} ad.`)
    return parts.join(' · ')
  }, [destination, origin, adults])

  const hasWallFilter = Boolean(queryOrigin || queryDestination)

  const matchedDeals = useMemo(() => {
    if (!hasWallFilter) return deals
    return deals.filter((d) => {
      if (queryOrigin && d.flags?.match_origin === false) return false
      if (queryDestination && d.flags?.match_destination === false) return false
      return true
    })
  }, [deals, queryOrigin, queryDestination, hasWallFilter])

  /** Always separate — never mix into price sort (credibility). */
  const fillerDeals = useMemo(() => {
    if (!hasWallFilter) return []
    return deals.filter((d) => {
      if (queryOrigin && d.flags?.match_origin === false) return true
      if (queryDestination && d.flags?.match_destination === false) return true
      return false
    })
  }, [deals, queryOrigin, queryDestination, hasWallFilter])

  const gridDeals = useMemo(() => {
    if (sort === 'recommended') return matchedDeals
    const dir = sort === 'price_asc' ? 1 : -1
    return [...matchedDeals].sort(
      (a, b) => dir * ((a.price_per_person || 0) - (b.price_per_person || 0)),
    )
  }, [sort, matchedDeals])

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

      <div className="w-full app-card mb-5 sm:mb-6 overflow-hidden">
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-3.5 text-left hover:bg-canvas/60 transition-colors"
        >
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink">Affiner</p>
            <p className="text-xs text-muted truncate mt-0.5">
              {filterLabel || 'Tous trajets · 2 voyageurs'}
            </p>
          </div>
          <span
            className={`shrink-0 text-muted text-lg leading-none transition-transform ${
              filtersOpen ? 'rotate-180' : ''
            }`}
            aria-hidden
          >
            ▾
          </span>
        </button>
        {filtersOpen ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={springConfig}
            className="px-4 pb-4 sm:px-5 sm:pb-5 border-t border-line"
          >
            <div className="pt-4 mb-4 sm:mb-5">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 sm:gap-2 sm:items-start">
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-2 h-7">
                    <label className="text-sm font-bold text-ink">
                      {t('deals.filterOrigin')}
                    </label>
                    {origin ? (
                      <button
                        type="button"
                        onClick={() => setOrigin('')}
                        className="text-xs font-semibold text-primary-600 hover:underline shrink-0"
                      >
                        {t('deals.clearOrigin')}
                      </button>
                    ) : (
                      <span className="w-12 shrink-0" aria-hidden />
                    )}
                  </div>
                  <CityAirportSelect value={origin} onChange={setOrigin} />
                </div>

                <div
                  className="hidden sm:flex items-center justify-center pt-9 px-1 text-muted"
                  aria-hidden
                >
                  <span className="text-lg font-semibold leading-none">→</span>
                </div>
                <div
                  className="flex sm:hidden items-center justify-center -my-0.5 text-muted"
                  aria-hidden
                >
                  <span className="text-sm font-semibold">↓</span>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-2 h-7">
                    <label className="text-sm font-bold text-ink">
                      {t('deals.filterDestination')}
                    </label>
                    {destination ? (
                      <button
                        type="button"
                        onClick={() => setDestination('')}
                        className="text-xs font-semibold text-primary-600 hover:underline shrink-0"
                      >
                        {t('deals.clearDestination')}
                      </button>
                    ) : (
                      <span className="w-12 shrink-0" aria-hidden />
                    )}
                  </div>
                  <CityAirportSelect value={destination} onChange={setDestination} />
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2.5">
                {t('deals.filterRouteHint')}
              </p>
            </div>

            <PassengerStepper value={adults} onChange={setAdults} min={1} max={6} />
          </motion.div>
        ) : null}
      </div>

      {!loading && !error && deals.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <p className="text-sm font-semibold text-muted">
            {deals.length} offre{deals.length > 1 ? 's' : ''}
            {filterLabel ? ` · ${filterLabel}` : ''}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['recommended', t('deals.sortRecommended')],
                ['price_asc', 'Prix ↑'],
                ['price_desc', 'Prix ↓'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSort(id)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold border transition-colors ${
                  sort === id
                    ? 'bg-primary-500 text-white border-primary-500'
                    : 'bg-white text-muted border-line hover:border-primary-200 hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
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
            {destination || origin
              ? t('deals.emptyBody', {
                  origin:
                    filterLabel ||
                    origin ||
                    destination,
                })
              : t('deals.emptyBodyAll')}
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
        <div className="space-y-8">
          <motion.div
            layout
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6"
          >
            {gridDeals.map((deal) => (
              <DealCard
                key={deal.id}
                deal={deal}
                liked={likedIds.has(deal.id)}
                onToggleLike={() => void toggleLike(deal)}
                onClick={() => setSelected(deal)}
              />
            ))}
          </motion.div>
          {fillerDeals.length > 0 ? (
            <div>
              <p className="text-sm font-bold text-ink mb-1">
                {queryDestination && !queryOrigin
                  ? 'Autres villes d’arrivée'
                  : queryOrigin && !queryDestination
                    ? 'Depuis d’autres aéroports'
                    : 'Autres correspondances'}
              </p>
              <p className="text-xs text-muted mb-4">
                Hors de ton filtre — triés à part
              </p>
              <motion.div
                layout
                className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6"
              >
                {fillerDeals.map((deal) => (
                  <DealCard
                    key={deal.id}
                    deal={deal}
                    liked={likedIds.has(deal.id)}
                    onToggleLike={() => void toggleLike(deal)}
                    onClick={() => setSelected(deal)}
                  />
                ))}
              </motion.div>
            </div>
          ) : null}
        </div>
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

      {toast ? (
        <Toast message={toast} isVisible onClose={() => setToast(null)} />
      ) : null}
    </div>
  )
}
