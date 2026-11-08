import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ITINERARY_DURATION_LABELS,
  ITINERARY_OCCASION_LABELS,
  cityDisplayNameFr,
  cityImageUrl,
  type Itinerary,
  type ItineraryDurationKind,
  type ItineraryOccasion,
} from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'
import { FwKicker } from '../components/ui/FwKicker'

/** Détail public catalogue — chrome Path complet en Lot 4. */
export default function ParcoursPublicPage() {
  const { itineraryId } = useParams<{ itineraryId: string }>()
  const [itin, setItin] = useState<Itinerary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!itineraryId) return
    setLoading(true)
    void getApiClient()
      .getParcours(itineraryId)
      .then((r) => {
        if (!r.ok || !r.itinerary) throw new Error('not_found')
        setItin(r.itinerary as unknown as Itinerary)
        setError(null)
      })
      .catch(() => {
        setItin(null)
        setError('Parcours introuvable')
      })
      .finally(() => setLoading(false))
  }, [itineraryId])

  if (loading) {
    return (
      <div className="app-col py-16 text-muted text-sm font-medium">
        Chargement…
      </div>
    )
  }

  if (error || !itin) {
    return (
      <div className="app-col py-16 space-y-3">
        <p className="text-ink font-semibold">{error || 'Introuvable'}</p>
        <Link to="/sejours" className="text-[color:var(--fw-accent)] font-bold">
          ← Parcours
        </Link>
      </div>
    )
  }

  const cover =
    itin.cover_image ||
    (itin.city_slug ? cityImageUrl(itin.city_slug) : null)
  const city = cityDisplayNameFr(null, itin.city_slug || '') || itin.city_slug
  const dur = itin.duration_kind
    ? ITINERARY_DURATION_LABELS[itin.duration_kind as ItineraryDurationKind]
    : null
  const occasions = (itin.occasions || [])
    .map((o) => ITINERARY_OCCASION_LABELS[o as ItineraryOccasion] || o)
    .join(' · ')
  const items = itin.itinerary_items || []

  return (
    <div className="min-h-screen bg-[color:var(--fw-bg-from)]">
      <div className="relative h-[42vh] min-h-[280px] w-full overflow-hidden">
        {cover ? (
          <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#FFF9F5] to-[#FFE9DD]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute left-4 top-4">
          <Link
            to="/sejours"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-ink font-bold shadow"
          >
            ←
          </Link>
        </div>
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
          <FwKicker className="text-white/80">Parcours</FwKicker>
          <h1
            className="mt-2 max-w-2xl text-4xl sm:text-5xl font-normal italic text-white leading-tight"
            style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}
          >
            {itin.title}
          </h1>
          <p className="mt-2 text-sm font-medium text-white/85">
            {[city, dur, occasions].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      <div className="app-col -mt-6 relative z-10 pb-24">
        <div className="rounded-[28px] bg-white border border-line shadow-sm px-5 py-6 sm:px-8 space-y-5">
          {itin.intro ? (
            <p className="text-[15px] leading-relaxed text-ink whitespace-pre-line">
              {itin.intro}
            </p>
          ) : null}

          {itin.budget_estimate_eur != null ? (
            <p className="text-sm font-semibold text-muted">
              ~{itin.budget_estimate_eur} €{' '}
              {itin.budget_basis === 'for_two' ? 'pour deux' : 'par personne'}{' '}
              sur place
            </p>
          ) : null}

          <div>
            <h2 className="text-lg font-bold text-ink mb-3">Les étapes</h2>
            <ol className="space-y-4">
              {items.map((it, i) => (
                <li key={it.id || i} className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--fw-accent-soft)] text-sm font-bold text-[color:var(--fw-accent)]">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-bold text-ink">
                      {it.title || it.places?.name || `Étape ${i + 1}`}
                    </p>
                    {it.note ? (
                      <p className="text-sm text-muted mt-0.5">{it.note}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}
