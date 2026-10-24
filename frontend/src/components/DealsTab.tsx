import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { formatDateFr, generateDatesFromPreset } from '@flightwatcher/shared'
import type { DateAvecHoraire, TravelDeal } from '../types'
import { getApiClient } from '../utils/apiClient'
import { getCurrentUser } from '../lib/supabase'
import { DealCard } from './DealCard'
import { DealDetailModal } from './DealDetailModal'
import { PassengerStepper } from './PassengerStepper'
import { CityAirportSelect } from './CityAirportSelect'
import { DatePresets, type DatePreset } from './DatePresets'
import { FlexibleDatesSelector } from './FlexibleDatesSelector'
import { useI18n } from '../contexts/I18nContext'
import { Toast } from './Toast'
import { openSearchFromDeals } from '../utils/searchPrefill'

const fullDay = (d: DateAvecHoraire): DateAvecHoraire => ({
  date: d.date.slice(0, 10),
  heure_min: d.heure_min || '06:00',
  heure_max: d.heure_max || '23:59',
})

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

  /** Empty = browse ~36 deals with hotels; set origin to prioritize matches. */
  const [origin, setOrigin] = useState('')
  const [adults, setAdults] = useState(2)
  const [readonlyBanner, setReadonlyBanner] = useState(false)
  const [queryOrigin, setQueryOrigin] = useState('')
  const [queryAdults, setQueryAdults] = useState(2)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sort, setSort] = useState<'recommended' | 'price_asc' | 'price_desc'>('recommended')
  const [datePreset, setDatePreset] = useState<DatePreset | null>('next-weekend')
  const [flexibleDates, setFlexibleDates] = useState<{
    dates_depart: DateAvecHoraire[]
    dates_retour: DateAvecHoraire[]
  }>({ dates_depart: [], dates_retour: [] })
  const [presetDates, setPresetDates] = useState(() => {
    const d = generateDatesFromPreset('next-weekend')
    return {
      dates_depart: d.dates_depart.map(fullDay),
      dates_retour: d.dates_retour.map(fullDay),
    }
  })
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeDates =
    datePreset === 'flexible' ? flexibleDates : presetDates

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
      setQueryOrigin(origin)
      setQueryAdults(adults)
    }, 280)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [origin, adults])

  const goSearch = (opts?: { destination?: string; city?: string }) => {
    openSearchFromDeals({
      origin: origin || undefined,
      destination: opts?.destination,
      city: opts?.city,
      adults,
    })
  }

  const datesReady =
    Boolean(origin?.trim()) &&
    activeDates.dates_depart.length > 0 &&
    activeDates.dates_retour.length > 0

  const runDatedSearch = () => {
    if (!origin?.trim()) {
      setToast('Choisis une origine pour lancer la recherche')
      return
    }
    if (
      activeDates.dates_depart.length === 0 ||
      activeDates.dates_retour.length === 0
    ) {
      setToast('Choisis des dates aller et retour (comme dans Search)')
      if (datePreset !== 'flexible') setDatePreset('flexible')
      return
    }
    const dates_depart = activeDates.dates_depart.map(fullDay)
    const dates_retour = activeDates.dates_retour.map(fullDay)
    openSearchFromDeals({
      origin: origin.trim(),
      adults,
      dates_depart,
      dates_retour,
      outbound: dates_depart[0]?.date,
      inbound: dates_retour[dates_retour.length - 1]?.date,
      autoSearch: true,
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
  }, [t, loadLikes, queryOrigin, queryAdults])

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
    const out = activeDates.dates_depart[0]?.date
    const ret = activeDates.dates_retour[activeDates.dates_retour.length - 1]?.date
    if (out && ret) {
      parts.push(
        activeDates.dates_depart.length + activeDates.dates_retour.length > 2
          ? `${activeDates.dates_depart.length} aller · ${activeDates.dates_retour.length} retour`
          : `${out.slice(5)} → ${ret.slice(5)}`,
      )
    }
    if (sort === 'price_asc') parts.push(t('deals.sortPriceAsc'))
    else if (sort === 'price_desc') parts.push(t('deals.sortPriceDesc'))
    return parts.join(' · ')
  }, [origin, adults, activeDates, sort, t])

  const matchedDeals = useMemo(
    () =>
      queryOrigin ? deals.filter((d) => d.flags?.match_origin !== false) : deals,
    [deals, queryOrigin],
  )

  /** Always separate — never mix into price sort (credibility). */
  const fillerDeals = useMemo(
    () =>
      queryOrigin ? deals.filter((d) => d.flags?.match_origin === false) : [],
    [deals, queryOrigin],
  )

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
              {filterLabel || 'Toutes origines · 2 voyageurs'}
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

            <div className="mt-4 pt-4 border-t border-line">
              <p className="text-xs text-muted mb-1">
                Même sélecteur que Search — lance une vraie recherche vols (pas le mur).
              </p>
              <DatePresets
                selected={datePreset}
                onChange={(preset) => {
                  setDatePreset(preset)
                  if (preset !== 'flexible') {
                    const generated = generateDatesFromPreset(preset)
                    setPresetDates({
                      dates_depart: generated.dates_depart.map(fullDay),
                      dates_retour: generated.dates_retour.map(fullDay),
                    })
                    setFlexibleDates({ dates_depart: [], dates_retour: [] })
                  }
                }}
                onFlexibleClick={() => setDatePreset('flexible')}
              />
              {datePreset === 'flexible' ? (
                <div className="mb-3">
                  <FlexibleDatesSelector
                    flexibleDates={flexibleDates}
                    onFlexibleDatesChange={setFlexibleDates}
                    formatDateFr={formatDateFr}
                  />
                </div>
              ) : null}
              <button
                type="button"
                onClick={runDatedSearch}
                disabled={!datesReady}
                className={`mt-1 w-full sm:w-auto rounded-full px-5 py-2.5 text-sm font-bold transition-colors ${
                  datesReady
                    ? 'bg-primary-500 text-white hover:bg-primary-600'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                Lancer la recherche
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-line">
              <label className="text-base sm:text-lg font-bold text-slate-900 block mb-2">
                {t('deals.sort')}
              </label>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['recommended', t('deals.sortRecommended')],
                    ['price_asc', t('deals.sortPriceAsc')],
                    ['price_desc', t('deals.sortPriceDesc')],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSort(id)}
                    className={`rounded-full px-3.5 py-2 text-xs font-bold border transition-colors ${
                      sort === id
                        ? 'bg-primary-500 text-white border-primary-500'
                        : 'bg-white text-ink border-line hover:border-primary-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
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
              <p className="text-sm font-bold text-ink mb-1">Depuis d’autres aéroports</p>
              <p className="text-xs text-muted mb-4">
                Hors de ton aéroport de départ — triés à part
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
