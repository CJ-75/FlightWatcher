import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  buildParcoursFeed,
  cityDisplayNameFr,
  isFeaturedToday,
  type Itinerary,
  type ItineraryOccasion,
  type ParcoursFeedRow,
} from '@flightwatcher/shared'
import { getApiClient } from '../../utils/apiClient'
import { FwKicker } from '../ui/FwKicker'
import { ItineraryCard } from './ItineraryCard'
import { ItineraryOccasionIcon } from './ItineraryOccasionIcon'

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
}

export function ParcoursCatalog({ active }: Props) {
  const navigate = useNavigate()
  const [city, setCity] = useState(() => {
    try {
      return localStorage.getItem(CITY_LS) || 'paris'
    } catch {
      return 'paris'
    }
  })
  const [cityOpen, setCityOpen] = useState(false)
  const [items, setItems] = useState<Itinerary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [occasion, setOccasion] = useState<ItineraryOccasion | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const api = getApiClient()
      const res = await api.listParcours({ limit: 80 })
      if (!res.ok) throw new Error('Catalogue indisponible')
      setItems((res.itineraries || []) as unknown as Itinerary[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
      setItems([])
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

  const cityLabel = cityDisplayNameFr(null, city) || city

  return (
    <div className="w-full">
      <div className="mb-5 sm:mb-6">
        <FwKicker>Parcours</FwKicker>
        <h2 className="mt-1.5 text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
          Où aller, quoi faire
        </h2>
        <p className="app-subtitle mt-1 max-w-xl">
          Des balades et des week-ends choisis pour toi.
        </p>

        <div className="relative mt-4 inline-block">
          <button
            type="button"
            onClick={() => setCityOpen((v) => !v)}
            className="rounded-full border border-line bg-white px-3.5 py-2 text-sm font-bold text-ink shadow-sm"
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
                  {cityDisplayNameFr(null, c) || c}
                </button>
              ))}
            </div>
          ) : null}
        </div>
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
        <div className="space-y-8">
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

      {!loading && !occasion && items.length > 0 && !rows.some((r) => r.kind === 'near') ? (
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
      <section className="mb-10">
        <h3 className="mb-3 text-xl font-bold text-ink">{row.title}</h3>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none">
          {row.chips.map((chip) => (
            <button
              key={chip.occasion}
              type="button"
              onClick={() => onOccasion(chip.occasion)}
              className="min-w-[132px] shrink-0 rounded-2xl border border-line bg-white p-3 text-left shadow-sm"
            >
              <div
                className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl"
                style={{
                  background: 'var(--fw-accent-soft)',
                  color: 'var(--fw-accent)',
                }}
              >
                <ItineraryOccasionIcon occasion={chip.occasion} size={20} />
              </div>
              <p className="text-sm font-bold text-ink leading-snug">
                {chip.label}
              </p>
              <p className="mt-1 text-xs font-medium text-muted">
                {chip.count} parcours
              </p>
            </button>
          ))}
        </div>
      </section>
    )
  }

  if (row.kind === 'featured') {
    return (
      <section className="mb-10">
        <h3 className="mb-3 text-xl font-bold text-ink">{row.title}</h3>
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory -mx-1 px-1">
          {row.items.map((it) => (
            <div
              key={it.id}
              className="w-[min(100%,420px)] shrink-0 snap-start sm:w-[520px]"
            >
              <ItineraryCard
                itinerary={it}
                variant="landscape"
                badge={cardBadge(it)}
                onOpen={() => onOpen(it)}
              />
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section className="mb-10">
      <h3 className="mb-3 text-xl font-bold text-ink">{row.title}</h3>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {row.items.map((it) => (
          <div
            key={it.id}
            className="w-[70vw] max-w-[260px] shrink-0 sm:w-[240px]"
          >
            <ItineraryCard
              itinerary={it}
              variant="portrait"
              badge={cardBadge(it)}
              onOpen={() => onOpen(it)}
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
    .map(([c]) => cityDisplayNameFr(null, c) || c)
}

function EmptyCity({
  cityLabel,
  nearby,
}: {
  cityLabel: string
  nearby?: string[]
}) {
  return (
    <div className="mb-8 rounded-2xl border border-line bg-white px-4 py-5">
      <p className="text-sm font-semibold text-ink">
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
      <div className="mb-3 h-6 w-40 rounded bg-line/80" />
      <div className="flex gap-3 overflow-hidden">
        {[0, 1].map((i) => (
          <div
            key={i}
            className={`shrink-0 animate-pulse rounded-[24px] bg-line/70 ${
              landscape
                ? 'aspect-[16/10] w-[min(100%,420px)]'
                : 'aspect-[3/4] w-[70vw] max-w-[240px]'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
