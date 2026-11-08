import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  buildParcoursFeed,
  citySlugDisplayNameFr,
  isFeaturedToday,
  itineraryOccasionEmoji,
  type Itinerary,
  type ItineraryOccasion,
  type ParcoursFeedRow,
} from '@flightwatcher/shared'
import { getApiClient } from '../../utils/apiClient'
import { FwKicker } from '../ui/FwKicker'
import { ItineraryCard } from './ItineraryCard'

const CITY_CHOICES = [
  'paris',
  'marseille',
  'lyon',
  'nice',
  'bordeaux',
  'lisbon',
  'porto',
  'barcelona',
  'rome',
  'madrid',
]

const CITY_LS = 'fw_parcours_city'

type Props = {
  active: boolean
  /** Hub fournit déjà titre + tabs */
  embedded?: boolean
}

export function ParcoursCatalog({ active, embedded = false }: Props) {
  const navigate = useNavigate()
  const [city, setCity] = useState(() => {
    try {
      return localStorage.getItem(CITY_LS) || 'paris'
    } catch {
      return 'paris'
    }
  })
  const [cityOpen, setCityOpen] = useState(false)
  const [items, setItems] = useState<Itinerary[]>(() => {
    try {
      const raw = sessionStorage.getItem('fw_parcours_catalog_v1')
      if (!raw) return []
      const parsed = JSON.parse(raw) as Itinerary[]
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const [loading, setLoading] = useState(() => {
    try {
      const raw = sessionStorage.getItem('fw_parcours_catalog_v1')
      if (!raw) return true
      const parsed = JSON.parse(raw) as Itinerary[]
      return !(Array.isArray(parsed) && parsed.length > 0)
    } catch {
      return true
    }
  })
  const [error, setError] = useState<string | null>(null)
  const [occasion, setOccasion] = useState<ItineraryOccasion | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const api = getApiClient()
      const res = await api.listParcours({ limit: 80 })
      if (!res.ok) throw new Error('Catalogue indisponible')
      const next = (res.itineraries || []) as unknown as Itinerary[]
      setItems(next)
      try {
        sessionStorage.setItem('fw_parcours_catalog_v1', JSON.stringify(next))
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setItems((prev) => prev)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!active) return
    void load()
  }, [active, load])

  useEffect(() => {
    if (!active || loading) return
    void getApiClient()
      .trackActivityEvent({
        domain: 'itinerary',
        event: 'itinerary_list_viewed',
        surface: 'parcours',
        platform: 'web',
        meta: { city, count: items.length, occasion },
      })
      .catch(() => {})
  }, [active, loading, city, items.length, occasion])

  useEffect(() => {
    try {
      localStorage.setItem(CITY_LS, city)
    } catch {
      /* ignore */
    }
  }, [city])

  const rows = useMemo(
    () => buildParcoursFeed(items, { citySlug: city, occasionFilter: occasion }),
    [items, city, occasion],
  )

  const openCard = (it: Itinerary) => {
    void getApiClient()
      .trackActivityEvent({
        domain: 'itinerary',
        event: 'itinerary_card_clicked',
        surface: 'parcours',
        platform: 'web',
        meta: { id: it.id, slug: it.slug, city: it.city_slug },
      })
      .catch(() => {})
    navigate(`/parcours/${encodeURIComponent(it.slug || it.id)}`)
  }

  const pickOccasion = (o: ItineraryOccasion | null) => {
    setOccasion(o)
    if (o) {
      void getApiClient()
        .trackActivityEvent({
          domain: 'itinerary',
          event: 'itinerary_occasion_filtered',
          surface: 'parcours',
          platform: 'web',
          meta: { occasion: o },
        })
        .catch(() => {})
    }
  }

  const cityLabel = citySlugDisplayNameFr(city) || city

  return (
    <div className="w-full">
      {!embedded ? (
        <div className="mb-5 sm:mb-6 lg:mb-8">
          <FwKicker>Parcours</FwKicker>
          <h2 className="mt-1.5 text-2xl sm:text-3xl lg:text-4xl font-extrabold text-ink tracking-tight">
            Où aller, quoi faire
          </h2>
          <p className="app-subtitle mt-1 max-w-xl lg:max-w-2xl">
            Des balades et des week-ends choisis pour toi.
          </p>
        </div>
      ) : null}

      <div
        className={`relative inline-block ${
          embedded ? 'mb-5 lg:mb-6' : 'mb-5 -mt-1 lg:mb-6'
        }`}
      >
        <button
          type="button"
          onClick={() => setCityOpen((v) => !v)}
          className="rounded-full border border-line bg-white px-3.5 py-2 lg:px-4 lg:py-2.5 text-sm lg:text-[15px] font-bold text-ink shadow-sm"
        >
          Près de toi · {cityLabel} ▾
        </button>
        {cityOpen ? (
          <div className="absolute left-0 z-20 mt-2 max-h-64 w-56 overflow-auto rounded-2xl border border-line bg-white p-2 shadow-lg">
            {CITY_CHOICES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCity(c)
                  setCityOpen(false)
                }}
                className={`block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold ${
                  c === city
                    ? 'bg-[color:var(--fw-accent-soft)] text-ink'
                    : 'text-muted hover:bg-canvas'
                }`}
              >
                {citySlugDisplayNameFr(c) || c}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {occasion ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => pickOccasion(null)}
            className="text-sm font-bold text-[color:var(--fw-accent)]"
          >
            ← Tous les parcours
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-8 lg:space-y-12">
          <SkeletonRow landscape />
          <SkeletonRow />
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-red-600 font-medium">{error}</p>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyCity cityLabel={cityLabel} />
      ) : null}

      {!loading &&
      !occasion &&
      items.length > 0 &&
      !rows.some((r) => r.kind === 'near') ? (
        <EmptyCity cityLabel={cityLabel} nearby={nearbyCities(items, city)} />
      ) : null}

      {!loading &&
        rows.map((row) => (
          <FeedRow
            key={row.id}
            row={row}
            onOpen={openCard}
            onOccasion={pickOccasion}
          />
        ))}
    </div>
  )
}

function FeedRow({
  row,
  onOpen,
  onOccasion,
}: {
  row: ParcoursFeedRow
  onOpen: (it: Itinerary) => void
  onOccasion: (o: ItineraryOccasion | null) => void
}) {
  if (row.kind === 'envies') {
    return (
      <section className="mb-10 lg:mb-14" aria-label="Envies">
        <p className="mb-2 px-0.5 text-xs font-extrabold uppercase tracking-wider text-ink-soft">
          Inspire-toi
        </p>
        <h3 className="mb-3 lg:mb-4 text-xl lg:text-2xl font-bold text-ink">
          {row.title}
        </h3>
        <div className="flex flex-wrap gap-2 lg:gap-2.5 -mx-0.5 px-0.5">
          {row.chips.map((chip) => (
            <button
              key={chip.occasion}
              type="button"
              onClick={() => onOccasion(chip.occasion)}
              className="inline-flex items-center gap-1.5 shrink-0 rounded-full border border-line bg-white px-3 py-1.5 lg:px-3.5 lg:py-2 text-left transition-all hover:border-[color:var(--fw-accent,#FF6B35)]/40"
            >
              <span className="inline-flex h-6 w-6 lg:h-7 lg:w-7 items-center justify-center rounded-lg bg-[color:var(--fw-accent-soft,#FFE7DC)] text-[13px] lg:text-[14px] leading-none">
                {itineraryOccasionEmoji(chip.occasion)}
              </span>
              <span className="text-[12px] lg:text-[13px] font-bold whitespace-nowrap text-ink">
                {chip.label}
              </span>
              {chip.count > 0 ? (
                <span className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-[color:var(--fw-accent-soft,#FFE7DC)] px-1.5 py-0.5 text-[10px] lg:text-[11px] font-bold tabular-nums leading-none text-[color:var(--fw-accent,#FF6B35)]">
                  {chip.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </section>
    )
  }

  if (row.kind === 'featured') {
    return (
      <section className="mb-10 lg:mb-14">
        <h3 className="mb-3 lg:mb-4 text-xl lg:text-2xl font-bold text-ink">
          {row.title}
        </h3>
        {/* Mobile: carrousel · Desktop: grille large */}
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory -mx-1 px-1 lg:mx-0 lg:px-0 lg:grid lg:grid-cols-2 lg:gap-5 lg:overflow-visible lg:pb-0 xl:gap-6">
          {row.items.map((it) => (
            <div
              key={it.id}
              className="w-[min(100%,420px)] shrink-0 snap-start sm:w-[520px] lg:w-auto lg:min-w-0 lg:shrink"
            >
              <ItineraryCard
                itinerary={it}
                variant="landscape"
                badge={cardBadge(it)}
                onOpen={() => onOpen(it)}
                className="lg:hover:scale-[1.01] lg:transition-transform"
              />
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="mb-10 lg:mb-14">
      <h3 className="mb-3 lg:mb-4 text-xl lg:text-2xl font-bold text-ink">
        {row.title}
      </h3>
      {/* Mobile: carrousel · Desktop: grille portraits */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 lg:mx-0 lg:px-0 lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:pb-0 xl:grid-cols-4 xl:gap-6">
        {row.items.map((it) => (
          <div
            key={it.id}
            className="w-[70vw] max-w-[260px] shrink-0 sm:w-[240px] lg:w-auto lg:max-w-none lg:shrink"
          >
            <ItineraryCard
              itinerary={it}
              variant="portrait"
              badge={cardBadge(it)}
              onOpen={() => onOpen(it)}
              className="lg:hover:scale-[1.015] lg:transition-transform"
            />
          </div>
        ))}
      </div>
    </section>
  )
}

function cardBadge(it: Itinerary): string | null {
  if ((it.occasions || []).includes('ferie')) return 'Férié'
  if (isFeaturedToday(it)) return 'Nouveau'
  return null
}

function nearbyCities(items: Itinerary[], city: string): string[] {
  const counts = new Map<string, number>()
  for (const it of items) {
    const c = (it.city_slug || '').toLowerCase()
    if (!c || c === city) continue
    counts.set(c, (counts.get(c) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([c]) => citySlugDisplayNameFr(c) || c)
}

function EmptyCity({
  cityLabel,
  nearby,
}: {
  cityLabel: string
  nearby?: string[]
}) {
  return (
    <div className="mb-8 rounded-2xl border border-line bg-white px-4 py-5 lg:px-6 lg:py-6">
      <p className="text-sm lg:text-base font-semibold text-ink">
        Pas encore de parcours à {cityLabel}
      </p>
      {nearby && nearby.length ? (
        <p className="mt-1 text-sm text-muted">
          À côté : {nearby.join(', ')}
        </p>
      ) : null}
    </div>
  )
}

function SkeletonRow({ landscape }: { landscape?: boolean }) {
  return (
    <div>
      <div className="mb-3 h-6 w-40 rounded bg-line/80 lg:mb-4 lg:h-7 lg:w-52" />
      <div
        className={`flex gap-3 overflow-hidden lg:gap-5 ${
          landscape
            ? 'lg:grid lg:grid-cols-2 lg:overflow-visible'
            : 'lg:grid lg:grid-cols-3 xl:grid-cols-4 lg:overflow-visible'
        }`}
      >
        {[0, 1, 2, 3].slice(0, landscape ? 2 : 4).map((i) => (
          <div
            key={i}
            className={`shrink-0 animate-pulse rounded-[24px] bg-line/70 lg:w-auto lg:shrink ${
              landscape
                ? 'aspect-[16/10] w-[min(100%,420px)] lg:w-full'
                : 'aspect-[3/4] w-[70vw] max-w-[240px] lg:max-w-none lg:w-full'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
