import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  buildItineraryAppleMapsUrl,
  buildItineraryMapsUrl,
  buildItineraryMarkerTiles,
  buildItinerarySticky,
  citySlugDisplayNameFr,
  cityImageUrl,
  itineraryDatedLabelFr,
  itineraryInfoChips,
  itineraryOccasionPhaseLabel,
  itineraryUnsplashUrl,
  type Itinerary,
  type ItineraryItem,
} from '@flightwatcher/shared'
import { getApiClient } from '../utils/apiClient'
import { getCurrentUser, signInWithGoogle } from '../lib/supabase'
import { ItineraryDetailChrome } from '../components/parcours/ItineraryDetailChrome'
import { ItineraryMarkerTiles } from '../components/parcours/ItineraryMarkerTiles'
import { ItineraryStepsTimeline } from '../components/parcours/ItineraryStepsTimeline'
import { MakeTripSheet } from '../components/parcours/MakeTripSheet'

const CITY_LS = 'fw_parcours_city'

export default function ParcoursPublicPage() {
  const { itineraryId } = useParams<{ itineraryId: string }>()
  const navigate = useNavigate()
  const [itin, setItin] = useState<Itinerary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [liked, setLiked] = useState(false)
  const [makeTripOpen, setMakeTripOpen] = useState(false)

  const userCity = useMemo(() => {
    try {
      return localStorage.getItem(CITY_LS) || 'paris'
    } catch {
      return 'paris'
    }
  }, [])

  const refreshLiked = useCallback(async (id: string) => {
    try {
      const user = await getCurrentUser()
      if (!user) {
        setLiked(false)
        return
      }
      const res = await getApiClient().listLikedItineraryIds()
      setLiked((res.ids || []).includes(id))
    } catch {
      setLiked(false)
    }
  }, [])

  useEffect(() => {
    if (!itineraryId) return
    setLoading(true)
    void getApiClient()
      .getParcours(itineraryId)
      .then((r) => {
        if (!r.ok || !r.itinerary) throw new Error('not_found')
        const row = r.itinerary as unknown as Itinerary
        setItin(row)
        setError(null)
        document.title = `${row.title} · FlightWatcher`
        const desc = row.subtitle || row.intro || ''
        let meta = document.querySelector('meta[name="description"]')
        if (!meta) {
          meta = document.createElement('meta')
          meta.setAttribute('name', 'description')
          document.head.appendChild(meta)
        }
        meta.setAttribute('content', desc.slice(0, 160))
        // OG basics (SPA — crawlers limités sans SSR)
        const setOg = (property: string, content: string) => {
          let el = document.querySelector(`meta[property="${property}"]`)
          if (!el) {
            el = document.createElement('meta')
            el.setAttribute('property', property)
            document.head.appendChild(el)
          }
          el.setAttribute('content', content)
        }
        const cover =
          row.cover_image ||
          (row.city_slug ? cityImageUrl(row.city_slug) : '')
        setOg('og:title', row.title)
        setOg('og:description', desc.slice(0, 160))
        if (cover) setOg('og:image', cover)
        setOg('og:type', 'article')
        void refreshLiked(row.id)
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
  }, [itineraryId, refreshLiked])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(t)
  }, [toast])

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
    itineraryUnsplashUrl({
      slug: itin.slug,
      citySlug: itin.city_slug,
      width: 1280,
    }) ||
    itin.cover_image ||
    (itin.city_slug ? cityImageUrl(itin.city_slug) : cityImageUrl('paris'))
  const cityLabel = citySlugDisplayNameFr(itin.city_slug) || itin.city_slug
  const chips = [cityLabel, ...itineraryInfoChips(itin)].filter(Boolean) as string[]
  const phaseLabel = itineraryOccasionPhaseLabel(itin)
  const dateLabel = itineraryDatedLabelFr(itin)
  const markers = buildItineraryMarkerTiles(itin)
  const items = (itin.itinerary_items || []) as ItineraryItem[]
  const sticky = buildItinerarySticky({
    itinerary: itin,
    userCitySlug: userCity,
  })
  const shareUrl = `${window.location.origin}/parcours/${itin.slug || itin.id}`

  const requireAuth = async (): Promise<boolean> => {
    const user = await getCurrentUser()
    if (user) return true
    const { error: authErr } = await signInWithGoogle()
    if (authErr) {
      setToast('Connexion requise')
      return false
    }
    return !!(await getCurrentUser())
  }

  const onSticky = async () => {
    if (sticky.ctaAction === 'launch_maps') {
      const isApple = /Mac|iPhone|iPad/i.test(navigator.userAgent)
      const url = isApple
        ? buildItineraryAppleMapsUrl(items) || buildItineraryMapsUrl(items)
        : buildItineraryMapsUrl(items)
      if (url) {
        void getApiClient()
          .trackActivityEvent({
            domain: 'itinerary',
            event: 'itinerary_launch_maps',
            surface: 'parcours',
            platform: 'web',
            meta: { id: itin.id },
          })
          .catch(() => {})
        window.open(url, '_blank', 'noopener,noreferrer')
      } else setToast('Ajoute des lieux pour lancer le parcours.')
      return
    }
    if (!(await requireAuth())) return
    setMakeTripOpen(true)
  }

  const toggleLike = async () => {
    if (!(await requireAuth())) return
    try {
      const api = getApiClient()
      if (liked) {
        await api.unlikeItinerary(itin.id)
        setLiked(false)
        void api.trackActivityEvent({
          domain: 'itinerary',
          event: 'itinerary_unliked',
          surface: 'parcours',
          platform: 'web',
          meta: { id: itin.id },
        })
      } else {
        await api.likeItinerary({
          itinerary_id: itin.id,
          itinerary_data: {
            id: itin.id,
            slug: itin.slug,
            title: itin.title,
            city_slug: itin.city_slug,
            cover_image: itin.cover_image,
            subtitle: itin.subtitle,
          },
        })
        setLiked(true)
        void api.trackActivityEvent({
          domain: 'itinerary',
          event: 'itinerary_liked',
          surface: 'parcours',
          platform: 'web',
          meta: { id: itin.id },
        })
      }
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Favori impossible')
    }
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
        phaseLabel={phaseLabel}
        dateLabel={dateLabel}
        onBack={() => navigate('/sejours')}
        liked={liked}
        onLike={() => void toggleLike()}
        onShare={() => {
          if (navigator.share) {
            void navigator.share({ title: itin.title, url: shareUrl }).catch(() => {})
            return
          }
          void navigator.clipboard?.writeText(shareUrl).then(
            () => setToast('Lien copié'),
            () => setToast(shareUrl),
          )
        }}
        stickyLeft={sticky.leftLabel}
        stickyCta={sticky.ctaLabel}
        onStickyCta={() => void onSticky()}
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
        </div>
      </ItineraryDetailChrome>

      {makeTripOpen ? (
        <MakeTripSheet
          itinerary={itin}
          onClose={() => setMakeTripOpen(false)}
          onCreated={(tripId) => {
            setMakeTripOpen(false)
            navigate(`/planner/${tripId}`, { state: { autoScan: true } })
          }}
        />
      ) : null}

      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[#1A120E] px-4 py-2.5 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </>
  )
}
