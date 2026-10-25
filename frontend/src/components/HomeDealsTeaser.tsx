import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { TravelDeal } from '../types'
import { getApiClient } from '../utils/apiClient'
import { useI18n } from '../contexts/I18nContext'

/** 3–6 deals above the search form — P1 accueil. */
export function HomeDealsTeaser() {
  const { t } = useI18n()
  const [deals, setDeals] = useState<TravelDeal[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void getApiClient()
      .getDeals({ adults: 2, duration: 'weekend', limit: 12 })
      .then((list) => {
        if (cancelled) return
        const withPhoto = (Array.isArray(list) ? list : [])
          .filter((d) => Boolean(d.hotel?.photo || d.image_url))
          .slice(0, 6)
        setDeals(withPhoto)
      })
      .catch(() => {
        if (!cancelled) setDeals([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading && deals.length === 0) {
    return (
      <section className="mb-6" aria-busy="true" aria-label={t('nav.deals')}>
        <div className="flex items-end justify-between gap-3 mb-3">
          <div>
            <p className="app-kicker mb-0.5">Bons plans</p>
            <h2 className="text-base sm:text-lg font-extrabold text-ink tracking-tight">
              Week-ends vol + hôtel
            </h2>
          </div>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="shrink-0 w-[9.5rem] rounded-2xl border border-line bg-white overflow-hidden animate-pulse"
            >
              <div className="h-20 bg-primary-50" />
              <div className="p-2.5 space-y-2">
                <div className="h-3 w-16 bg-primary-50 rounded" />
                <div className="h-4 w-10 bg-primary-50 rounded" />
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  if (deals.length === 0) {
    return (
      <div className="mb-6 rounded-2xl border border-primary-100 bg-primary-50/60 px-4 py-4 text-center sm:text-left">
        <p className="text-sm font-extrabold text-ink tracking-tight">
          Week-ends vol + hôtel, prix clair
        </p>
        <p className="text-xs text-muted mt-1">
          Cherche un vol, ou parcours les{' '}
          <Link to="/deals" className="font-bold text-primary-600 underline-offset-2 hover:underline">
            bons plans
          </Link>
          .
        </p>
      </div>
    )
  }

  return (
    <section className="mb-6" aria-label={t('nav.deals')}>
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <p className="app-kicker mb-0.5">Bons plans</p>
          <h2 className="text-base sm:text-lg font-extrabold text-ink tracking-tight">
            Week-ends vol + hôtel
          </h2>
        </div>
        <Link
          to="/deals"
          className="text-xs font-bold text-primary-600 hover:text-primary-700 shrink-0"
        >
          Tout voir →
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {deals.map((d) => (
          <Link
            key={d.id || d.deal_key}
            to={`/deals?deal=${encodeURIComponent(d.deal_key || d.id)}`}
            className="shrink-0 w-[9.5rem] rounded-2xl border border-line bg-white overflow-hidden hover:border-primary-200 hover:shadow-soft transition-all"
          >
            <div className="h-20 bg-slate-100">
              {(d.hotel?.photo || d.image_url) && (
                <img
                  src={d.hotel?.photo || d.image_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="p-2.5">
              <p className="text-xs font-bold text-ink truncate">{d.city}</p>
              <p className="text-sm font-extrabold text-primary-600 tabular-nums">
                {Math.round(d.price_per_person)} €
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
