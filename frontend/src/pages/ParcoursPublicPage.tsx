import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  buildItineraryMapsUrl,
  buildItinerarySticky,
  citySlugDisplayNameFr,
  cityImageUrl,
  itineraryDatedLabelFr,
  itineraryHeroMetaChips,
  itineraryOccasionPhaseLabel,
  resolveParcoursCoverUrl,
  sanitizeUserFacingText,
  type Itinerary,
  type ItineraryItem,
} from '@waypop/shared'
import { parcoursWebCoverUrl } from '../utils/parcoursCover'
import { getApiClient } from '../utils/apiClient'
import {
  getParcoursCached,
  getParcoursDetailMemory,
  hydrateParcoursCatalogMemory,
  setParcoursDetailMemory,
} from '../utils/parcoursCache'
import { getCurrentUser } from '../lib/supabase'
import { useAuthSheet } from '../components/onboarding/AuthSheetHost'
import { ItineraryDetailChrome } from '../components/parcours/ItineraryDetailChrome'
import { ItineraryEditorialSections } from '../components/parcours/ItineraryEditorialSections'
import { ItineraryStepsTimeline } from '../components/parcours/ItineraryStepsTimeline'
import { MakeTripSheet } from '../components/parcours/MakeTripSheet'
import { peekConfigFlag } from '../lib/configFlags'
import { publicPopPath } from '../lib/popLinks'

const CITY_LS = 'fw_parcours_city'

function popVPreviewForcedToSpa(): boolean {
  try {
    return /(?:^|;\s*)pop_v=1(?:;|$)/.test(document.cookie || '')
  } catch {
    return false
  }
}

export default function ParcoursPublicPage() {
  const { itineraryId } = useParams<{ itineraryId: string }>()
  const navigate = useNavigate()
  const { openAuthSheet } = useAuthSheet()
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

    const applyRow = (row: Itinerary) => {
      const clean: Itinerary = {
        ...row,
        title: sanitizeUserFacingText(row.title) || row.title,
        subtitle: row.subtitle
          ? sanitizeUserFacingText(row.subtitle)
          : row.subtitle,
        intro: row.intro
          ? sanitizeUserFacingText(row.intro, { multiline: true })
          : row.intro,
        itinerary_items: (row.itinerary_items || []).map((it) => ({
          ...it,
          title: it.title ? sanitizeUserFacingText(it.title) : it.title,
          note: it.note
            ? sanitizeUserFacingText(it.note, { multiline: true })
            : it.note,
        })),
      }
      setItin(clean)
      setError(null)
      document.title = `${clean.title} · WayPop`
      const desc = clean.subtitle || clean.intro || ''
      let meta = document.querySelector('meta[name="description"]')
      if (!meta) {
        meta = document.createElement('meta')
        meta.setAttribute('name', 'description')
        document.head.appendChild(meta)
      }
      meta.setAttribute('content', desc.slice(0, 160))
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
        resolveParcoursCoverUrl({
          coverImage: row.cover_image,
          citySlug: row.city_slug,
          slug: row.slug,
          width: 1200,
        }) ||
        (row.city_slug ? cityImageUrl(row.city_slug) : '')
      setOg('og:title', clean.title)
      setOg('og:description', desc.slice(0, 160))
      if (cover) setOg('og:image', cover)
      setOg('og:type', 'article')
      void refreshLiked(clean.id)
      void getApiClient()
        .trackActivityEvent({
          domain: 'itinerary',
          event: 'view',
          surface: 'parcours',
          platform: 'web',
          meta: { id: itineraryId },
        })
        .catch(() => {})
    }

    // Instant paint from durable catalogue / detail memory.
    hydrateParcoursCatalogMemory()
    const mem = getParcoursDetailMemory(itineraryId)
    if (mem && Array.isArray(mem.itinerary_items) && mem.itinerary_items.length) {
      applyRow(mem)
      setLoading(false)
      void getParcoursCached(itineraryId)
        .then((row) => applyRow(row))
        .catch(() => {})
      return
    }

    void getParcoursCached(itineraryId)
      .then((row) => {
        setParcoursDetailMemory(row)
        applyRow(row)
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

  // POP_PAGE_V2 on → hard redirect to Next /pop/{ville}/{slug} (301-equivalent client).
  // Local Vite :5173 → :3001. Preview cookie pop_v=1 keeps SPA for A/B.
  useEffect(() => {
    if (!itin || loading) return
    if (popVPreviewForcedToSpa()) return
    let cancelled = false
    void import('../utils/configCache')
      .then(({ getAppConfig }) => getAppConfig())
      .then(() => {
        if (cancelled) return
        if (!peekConfigFlag('pop_page_v2_enabled')) return
        void import('../lib/popLinks').then(({ publicPopHref }) => {
          if (cancelled) return
          const target = publicPopHref({
            citySlug: itin.city_slug,
            slug: itin.slug || itineraryId,
            id: itin.id,
          })
          if (!target || target.startsWith('/parcours')) return
          const here = `${window.location.origin}${window.location.pathname}`
          if (target === here || target === window.location.pathname) return
          window.location.replace(target)
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [itin, loading, itineraryId])

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
          onClick={() => navigate('/pop')}
          className="font-bold text-[color:var(--fw-accent)]"
        >
          ← Pops
        </button>
      </div>
    )
  }

  const cover =
    parcoursWebCoverUrl({
      coverImage: itin.cover_image,
      citySlug: itin.city_slug,
      slug: itin.slug,
      width: 1920,
    }) || cityImageUrl('paris')
  const cityLabel = citySlugDisplayNameFr(itin.city_slug) || itin.city_slug
  const chips = [cityLabel, ...itineraryHeroMetaChips(itin)].filter(
    Boolean,
  ) as string[]
  const phaseLabel = itineraryOccasionPhaseLabel(itin)
  const dateLabel = itineraryDatedLabelFr(itin)
  const items = (itin.itinerary_items || []) as ItineraryItem[]
  const dayCount = new Set(items.map((it) => it.day_offset ?? 0)).size || 1
  const h2Programme =
    dayCount === 1
      ? `Programme d’une journée à ${cityLabel}`
      : `Programme de ${dayCount} jours à ${cityLabel}`
  const sticky = buildItinerarySticky({
    itinerary: itin,
    userCitySlug: userCity,
  })
  const shareUrl = `${window.location.origin}${publicPopPath({
    citySlug: itin.city_slug,
    slug: itin.slug,
    id: itin.id,
  })}`

  const doLike = async () => {
    const next = !liked
    setLiked(next)
    try {
      const api = getApiClient()
      if (next) {
        await api.likeItinerary({
          itinerary_id: itin!.id,
          itinerary_data: {
            id: itin!.id,
            slug: itin!.slug,
            title: itin!.title,
            city_slug: itin!.city_slug,
            cover_image: itin!.cover_image,
            subtitle: itin!.subtitle,
          },
        })
        void api.trackActivityEvent({
          domain: 'itinerary',
          event: 'itinerary_liked',
          surface: 'parcours',
          platform: 'web',
          meta: { id: itin!.id },
        })
      } else {
        await api.unlikeItinerary(itin!.id)
        void api.trackActivityEvent({
          domain: 'itinerary',
          event: 'itinerary_unliked',
          surface: 'parcours',
          platform: 'web',
          meta: { id: itin!.id },
        })
      }
    } catch (e) {
      setLiked(!next)
      setToast(e instanceof Error ? e.message : 'Favori impossible')
    }
  }

  const onSticky = async () => {
    if (sticky.ctaAction === 'launch_maps') {
      // Toujours Google Maps multi-étapes (pas Apple Maps)
      const url = buildItineraryMapsUrl(items)
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
    // MakeTripSheet gère auth au moment de create — ouvrir sans auth
    setMakeTripOpen(true)
  }

  const toggleLike = async () => {
    const user = await getCurrentUser()
    if (!user) {
      openAuthSheet({
        trigger: 'favorite',
        pending: {
          type: 'like_itinerary',
          trigger: 'favorite',
          payload: { itineraryId: itin.id },
          createdAt: Date.now(),
        },
        onAuthenticated: () => {
          void doLike()
        },
      })
      return
    }
    await doLike()
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
        coverImage={itin.cover_image}
        citySlug={itin.city_slug}
        slug={itin.slug}
        title={itin.title}
        subtitle={itin.subtitle}
        metaChips={chips}
        phaseLabel={phaseLabel}
        authorName={
          String(itin.author_kind || 'admin') === 'user'
            ? 'Communauté'
            : 'Waypop'
        }
        authorVerified={String(itin.author_kind || 'admin') !== 'user'}
        dateLabel={dateLabel}
        onBack={() => navigate('/pop')}
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
        <div className="space-y-8">
          {itin.intro ? (
            <p className="text-[15px] leading-relaxed text-[#3D342C] whitespace-pre-line">
              {itin.intro}
            </p>
          ) : null}

          <ItineraryEditorialSections
            itinerary={itin}
            cityLabel={cityLabel}
            sections="facts"
          />

          <section>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#A3988C]">
              Itinéraire
            </p>
            <h2 className="mb-4 mt-1 text-lg font-bold text-[#1A120E]">
              {h2Programme}
            </h2>
            <ItineraryStepsTimeline
              items={items}
              onBookActivity={openActivity}
            />
          </section>

          <ItineraryEditorialSections
            itinerary={itin}
            cityLabel={cityLabel}
            sections="blocks"
          />
        </div>
      </ItineraryDetailChrome>

      {makeTripOpen ? (
        <MakeTripSheet
          itinerary={itin}
          onClose={() => setMakeTripOpen(false)}
          onCreated={({ tripId, wantFlight, wantHotel }) => {
            setMakeTripOpen(false)
            navigate(`/planner/${tripId}`, {
              state: {
                autoScan: wantFlight,
                openHotel: wantHotel && !wantFlight,
                wantFlight,
                wantHotel,
              },
            })
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
