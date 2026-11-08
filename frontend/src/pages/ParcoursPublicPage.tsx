import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  buildItineraryMapsUrl,
  buildItineraryMarkerTiles,
  buildItinerarySticky,
  cityDisplayNameFr,
  cityImageUrl,
  itineraryBudgetLabel,
  itineraryInfoChips,
  type Itinerary,
  type ItineraryItem,
} from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'
import { ItineraryDetailChrome } from '../components/parcours/ItineraryDetailChrome'
import { ItineraryMarkerTiles } from '../components/parcours/ItineraryMarkerTiles'
import { ItineraryStepsTimeline } from '../components/parcours/ItineraryStepsTimeline'

const CITY_LS = 'fw_parcours_city'

export default function ParcoursPublicPage() {
  const { itineraryId } = useParams<{ itineraryId: string }>()
  const navigate = useNavigate()
  const [itin, setItin] = useState<Itinerary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

  const userCity = useMemo(() => {
    try {
      return localStorage.getItem(CITY_LS) || 'paris'
    } catch {
      return 'paris'
    }
  }, [])

  useEffect(() => {
    if (!itineraryId) return
    setLoading(true)
    void getApiClient()
      .getParcours(itineraryId)
      .then((r) => {
        if (!r.ok || !r.itinerary) throw new Error('not_found')
        setItin(r.itinerary as unknown as Itinerary)
        setError(null)
        void getApiClient()
          .trackActivityEvent({
            domain: 'itinerary',
            event: 'view',
            surface: 'parcours',
            platform: 'web',
            meta: { id: itineraryId },
          })
          .catch(() => {})
      })
      .catch(() => {
        setItin(null)
        setError('Parcours introuvable')
      })
      .finally(() => setLoading(false))
  }, [itineraryId])

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm font-medium text-[#8A7B6E]">
        Chargement…
      </div>
    )
  }

  if (error || !itin) {
    return (
      <div className="app-col space-y-3 py-16">
        <p className="font-semibold text-ink">{error || 'Introuvable'}</p>
        <button
          type="button"
          onClick={() => navigate('/sejours')}
          className="font-bold text-[color:var(--fw-accent)]"
        >
          ← Parcours
        </button>
      </div>
    )
  }

  const cover =
    itin.cover_image ||
    (itin.city_slug ? cityImageUrl(itin.city_slug) : cityImageUrl('paris'))
  const cityLabel = cityDisplayNameFr(null, itin.city_slug || '') || itin.city_slug
  const chips = [cityLabel, ...itineraryInfoChips(itin)].filter(Boolean) as string[]
  const budget = itineraryBudgetLabel(itin)
  const markers = buildItineraryMarkerTiles(itin)
  const items = (itin.itinerary_items || []) as ItineraryItem[]
  const sticky = buildItinerarySticky({
    itinerary: itin,
    userCitySlug: userCity,
  })
  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/parcours/${itin.slug || itin.id}`
      : `/parcours/${itin.slug || itin.id}`

  const onSticky = () => {
    if (sticky.ctaAction === 'launch_maps') {
      const url = buildItineraryMapsUrl(items)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      else setToast('Ajoute des lieux pour lancer le parcours.')
      return
    }
    // Lot 5 — sheet dates / apply. Pour l’instant on ouvre le planner.
    setToast('Bientôt : créer un voyage depuis ce parcours.')
    navigate('/planner')
  }

  const openPlaceMaps = (item: ItineraryItem) => {
    const name = item.places?.name || item.title
    if (!name) return
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  const openActivity = (item: ItineraryItem) => {
    const code = item.viator_product_code
    if (!code) return
    window.open(
      `https://www.viator.com/tours/-/${encodeURIComponent(code)}`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  return (
    <>
      <ItineraryDetailChrome
        heroUrl={cover}
        title={itin.title}
        metaChips={chips}
        budgetLabel={budget}
        onBack={() => navigate('/sejours')}
        onShare={() => {
          void navigator.clipboard?.writeText(shareUrl).then(
            () => setToast('Lien copié'),
            () => setToast(shareUrl),
          )
        }}
        stickyLeft={sticky.leftLabel}
        stickyCta={sticky.ctaLabel}
        onStickyCta={onSticky}
      >
        <div className="space-y-7">
          {itin.intro ? (
            <p className="text-[15px] leading-relaxed text-[#3D342C] whitespace-pre-line">
              {itin.intro}
            </p>
          ) : null}

          <ItineraryMarkerTiles tiles={markers} />

          <section>
            <h2 className="mb-4 text-lg font-bold text-[#1A120E]">Les étapes</h2>
            <ItineraryStepsTimeline
              items={items}
              onOpenMaps={openPlaceMaps}
              onBookActivity={openActivity}
            />
          </section>

          <p className="text-[11px] leading-relaxed text-[#A3988C]">
            Photos et lieux : sources autorisées (OpenStreetMap, Geoapify, Viator,
            Wikimedia, Panoramax). Signaler une erreur — bientôt.
          </p>
        </div>
      </ItineraryDetailChrome>

      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[#1A120E] px-4 py-2.5 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </>
  )
}
