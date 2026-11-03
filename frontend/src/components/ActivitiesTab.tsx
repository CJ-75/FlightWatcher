/**
 * Onglet Activités — UI alignée Séjours / Deals (grille desktop 3 col).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ACTIVITY_ADDED_BADGE_FR,
  ACTIVITY_ADDED_TO_PLANNER_FR,
  ACTIVITY_ADD_TO_PLANNER_FR,
  ACTIVITY_BOOKED_PROMPT_FR,
  ACTIVITY_CATEGORY_TAGS_FR,
  ACTIVITY_CHOOSE_TRIP_FR,
  ACTIVITY_CITY_OPTIONS_FR,
  ACTIVITY_PAGE_KICKER_FR,
  ACTIVITY_PAGE_SUBTITLE_FR,
  ACTIVITY_PAGE_TITLE_FR,
  ACTIVITY_KEEP_ADDING_FR,
  ACTIVITY_NO_PLANNER_TO_ADD_FR,
  ACTIVITY_NO_TRIP_CTA_BUTTON_FR,
  ACTIVITY_SEARCH_PLACEHOLDER_CITY_FR,
  ACTIVITY_SEE_PLANNER_FR,
  ACTIVITY_SORT_LABEL_FR,
  activitiesCityPath,
  activityCategoriesSummaryFr,
  canonicalViatorProductUrl,
  cityDisplayNameFr,
  resolveActivityCitySlug,
  activityDestinationLabelFr,
  activityMatchesCategories,
  activityMatchesSearchQuery,
  hasTripItemOwner,
  parseAirportCodes,
  pickTripItemOwner,
  savedIdeasTitleFr,
  toActivityCardModel,
  toggleActivityCategory,
  type ActivityCardModel,
} from '@flightwatcher/shared'
import { getCurrentSession } from '../lib/supabase'
import { getApiClient } from '../utils/apiClient'
import {
  fetchActivitiesCatalog,
  peekActivitiesCatalog,
} from '../utils/activitiesCatalogCache'
import { listRememberedTrips, rememberTrip } from '../utils/tripRecovery'
import { ActivityCitySelect } from './ActivityCitySelect'
import { ActivityDetailSheet } from './ActivityDetailSheet'
import {
  ActivityPlannerPicker,
  type ActivityPlannerTarget,
} from './ActivityPlannerPicker'
import { ActivityTripHero } from './ActivityTripHero'
import { RatingStars } from './RatingStars'

const springConfig = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 28,
  mass: 0.5,
}

function openViatorSync(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function ActivityHeartSvg({ filled }: { filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

function ActivityCard({
  card,
  onOpen,
  onBook,
  onAdd,
  liked,
  onToggleLike,
  addLabel = ACTIVITY_ADD_TO_PLANNER_FR,
  addDisabled = false,
  hideAdd = false,
  added = false,
}: {
  card: ActivityCardModel
  onOpen: () => void
  onBook: () => void
  onAdd: () => void
  liked?: boolean
  onToggleLike?: () => void
  addLabel?: string
  addDisabled?: boolean
  hideAdd?: boolean
  added?: boolean
}) {
  const chips = [card.durationLabel, card.distanceLabel].filter(
    Boolean,
  ) as string[]
  const reviewLabel =
    card.reviewCount != null && card.reviewCount > 0
      ? `${card.reviewCount.toLocaleString('fr-FR')} avis`
      : null

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springConfig}
      whileHover={{ y: -3, transition: { duration: 0.18 } }}
      className={`group flex flex-col rounded-2xl overflow-hidden border bg-canvas shadow-soft hover:shadow-lift transition-all duration-200 text-left ${
        added
          ? 'border-emerald-400 hover:border-emerald-500'
          : 'border-line/80 hover:border-primary-200'
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="relative block w-full text-left aspect-[16/10] overflow-hidden"
      >
        {card.photoUrl ? (
          <img
            src={card.photoUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 bg-slate-200" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/25 to-transparent" />
        <div className="absolute top-2.5 left-2.5 z-[3] flex flex-col gap-1 items-start">
          {added ? (
            <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 bg-emerald-600 text-white text-[10px] font-bold shadow-soft">
              <span aria-hidden>✓</span>
              {ACTIVITY_ADDED_BADGE_FR}
            </span>
          ) : null}
          {card.freeCancellation ? (
            <span className="rounded-md px-2 py-1 bg-white/90 text-ink text-[10px] font-bold shadow-soft">
              Annulation gratuite
            </span>
          ) : null}
        </div>
        {onToggleLike ? (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onToggleLike()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                e.preventDefault()
                onToggleLike()
              }
            }}
            aria-label={liked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            className={`absolute top-2.5 right-2.5 z-[3] w-9 h-9 rounded-full flex items-center justify-center shadow-soft transition-colors ${
              liked
                ? 'bg-white text-primary-500'
                : 'bg-white/90 text-ink-soft hover:text-primary-500'
            }`}
          >
            <ActivityHeartSvg filled={!!liked} />
          </span>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 z-[2] p-2.5 sm:p-3 space-y-1">
          <h3 className="font-bold text-white text-[13px] sm:text-sm leading-snug line-clamp-2 drop-shadow-sm">
            {card.title}
          </h3>
          {chips.length ? (
            <div className="flex flex-wrap gap-1">
              {chips.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center rounded-md bg-white/15 px-1.5 py-0.5 text-[9px] font-semibold text-white/90 backdrop-blur-sm"
                >
                  {label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </button>

      <div className="flex items-center justify-between gap-2 px-2.5 py-2 sm:px-3 sm:py-2.5 bg-white/70 border-t border-line/60">
        <div className="min-w-0">
          {card.rating != null ? (
            <div className="flex items-center gap-1.5 mb-1 min-w-0">
              <RatingStars rating={card.rating} size={12} />
              {reviewLabel ? (
                <span className="text-[10px] font-semibold text-muted truncate leading-none">
                  {reviewLabel}
                </span>
              ) : null}
            </div>
          ) : null}
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted leading-none mb-0.5">
            À partir de
          </p>
          <p className="text-base font-extrabold text-primary-500 tabular-nums leading-none truncate">
            {card.priceLabel || 'Voir'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!hideAdd ? (
            <button
              type="button"
              onClick={onAdd}
              disabled={addDisabled}
              aria-label={addLabel}
              title={addLabel}
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-line text-ink text-[11px] font-bold min-h-[36px] min-w-[36px] px-2 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-50"
            >
              <span className="text-base leading-none font-extrabold" aria-hidden>
                +
              </span>
              <span>{addLabel}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onBook}
            className="rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-xs font-bold px-2.5 py-1.5 min-h-[36px]"
          >
            Réserver
          </button>
        </div>
      </div>
    </motion.article>
  )
}

export function ActivitiesTab(props?: { citySlug?: string; active?: boolean }) {
  const params = useParams<{ city?: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const tabActive = props?.active !== false
  // Paris immédiat si pas de ville (warm-mount / /activites nu).
  const citySlug = (
    props?.citySlug ||
    params.city ||
    'paris'
  )
    .trim()
    .toLowerCase()
  const draftFromUrl = searchParams.get('draft')?.trim() || ''
  const plannedFromUrl = searchParams.get('planned')?.trim() || ''
  const [adults] = useState(2)
  const [loading, setLoading] = useState(() => !peekActivitiesCatalog(citySlug, 2)?.ok)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<Record<string, unknown>[]>(() => {
    const cached = peekActivitiesCatalog(citySlug, 2)
    return cached?.ok && Array.isArray(cached.items) ? cached.items : []
  })
  const [header, setHeader] = useState<string | null>(null)
  const [fallbackHint, setFallbackHint] = useState<string | null>(null)
  const [sort, setSort] = useState<'recommended' | 'price' | 'rating'>('recommended')
  const [categories, setCategories] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [detail, setDetail] = useState<ActivityCardModel | null>(null)
  const [pendingBook, setPendingBook] = useState<ActivityCardModel | null>(null)
  const [askBooked, setAskBooked] = useState(false)
  const [savedIdeas, setSavedIdeas] = useState<
    { city: string; title: string; productCode?: string }[]
  >([])
  const [activeTrip, setActiveTrip] = useState<{
    draftToken?: string
    plannedTripId?: string
    slug: string
    label: string
    outDate?: string | null
    retDate?: string | null
  } | null>(null)
  const [plannerCount, setPlannerCount] = useState(0)
  const [addedCodes, setAddedCodes] = useState<Set<string>>(new Set())
  const [addBusy, setAddBusy] = useState(false)
  const [addNotice, setAddNotice] = useState<string | null>(null)
  const [pendingAdd, setPendingAdd] = useState<ActivityCardModel | null>(null)
  const [tripPickerOpen, setTripPickerOpen] = useState(false)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const didAutoCity = useRef(false)
  const syncedOnOpen = useRef(false)

  const catalogNavOpts = useMemo(
    () => ({
      draftToken: draftFromUrl || activeTrip?.draftToken || undefined,
      plannedTripId: plannedFromUrl || activeTrip?.plannedTripId || undefined,
    }),
    [draftFromUrl, plannedFromUrl, activeTrip],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const session = await getCurrentSession()
        if (!session?.user || cancelled) return
        const ids = await getApiClient().getLikedActivityIds()
        if (!cancelled) setLikedIds(new Set(Array.isArray(ids) ? ids : []))
      } catch {
        if (!cancelled) setLikedIds(new Set())
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!tabActive) return
    // Remplacer /activites nu sans attendre le bootstrap trip.
    const p = window.location.pathname.replace(/\/+$/, '') || '/'
    if (p === '/activites' && !params.city) {
      navigate(
        activitiesCityPath('paris', {
          draftToken: draftFromUrl || undefined,
          plannedTripId: plannedFromUrl || undefined,
        }),
        { replace: true },
      )
    }
  }, [tabActive, params.city, draftFromUrl, plannedFromUrl, navigate])

  // Une fois à l’ouverture de l’onglet : aligner la ville sur le séjour bootstrappé.
  useEffect(() => {
    if (!tabActive) {
      syncedOnOpen.current = false
      return
    }
    if (syncedOnOpen.current || !activeTrip?.slug) return
    syncedOnOpen.current = true
    if (activeTrip.slug === citySlug) return
    navigate(
      activitiesCityPath(activeTrip.slug, {
        draftToken: activeTrip.draftToken,
        plannedTripId: activeTrip.plannedTripId,
      }),
      { replace: true },
    )
  }, [
    tabActive,
    activeTrip?.slug,
    activeTrip?.draftToken,
    activeTrip?.plannedTripId,
    citySlug,
    navigate,
  ])

  useEffect(() => {
    setSearchQuery('')
  }, [citySlug])

  const cards = useMemo(() => {
    const matched = items.filter(
      (r) =>
        activityMatchesCategories(r, categories) &&
        activityMatchesSearchQuery(r, searchQuery),
    )
    let list = matched.map((r) => toActivityCardModel(r, adults))
    if (sort === 'price') {
      list = [...list].sort((a, b) => {
        const pa = a.priceLabel ? parseInt(a.priceLabel.replace(/\D/g, ''), 10) : 9999
        const pb = b.priceLabel ? parseInt(b.priceLabel.replace(/\D/g, ''), 10) : 9999
        return pa - pb
      })
    } else if (sort === 'rating') {
      list = [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0))
    }
    return list
  }, [items, adults, sort, categories, searchQuery])

  const loadCity = useCallback(
    async (slug: string) => {
      if (!slug) return
      const cached = peekActivitiesCatalog(slug, adults)
      if (cached?.ok) {
        setItems(Array.isArray(cached.items) ? cached.items : [])
        setError(null)
        setLoading(false)
      } else {
        setLoading(true)
      }
      setHeader(null)
      setFallbackHint(null)
      try {
        // Fetch public — ne bloque pas sur JWT / Supabase config.
        const res = await fetchActivitiesCatalog(slug, adults)
        if (!res.ok) {
          const hint =
            res.error === 'unknown_city'
              ? 'Ville non reconnue — essaie Paris, Rome, Barcelone…'
              : res.error === 'viator_disabled'
                ? 'Catalogue activités indisponible'
                : String(res.error || '').includes('401') ||
                    String(res.error || '').includes('UNAUTHORIZED')
                  ? 'Catalogue activités indisponible'
                  : res.error || 'Chargement impossible'
          throw new Error(hint)
        }
        setItems(Array.isArray(res.items) ? res.items : [])
        setError(null)
      } catch (e) {
        if (!cached?.ok) {
          setError(e instanceof Error ? e.message : 'Erreur')
          setItems([])
        }
      } finally {
        setLoading(false)
      }
    },
    [adults],
  )

  // Catalogue tout de suite — indépendant du bootstrap trip.
  useEffect(() => {
    if (!citySlug) return
    void loadCity(citySlug)
  }, [citySlug, loadCity])

  useEffect(() => {
    let cancelled = false
    didAutoCity.current = false
    const remembered = listRememberedTrips()
    const fromUrl = draftFromUrl
      ? remembered.find((t) => t.draft_token === draftFromUrl) || {
          draft_token: draftFromUrl,
          city: citySlug || null,
          at: Date.now(),
        }
      : null
    const latest = fromUrl || remembered[0]

    const applyTripCity = (
      tripSlug: string,
      tripLabel: string,
      opts: {
        draftToken?: string
        plannedTripId?: string
        outDate?: string | null
        retDate?: string | null
      },
    ) => {
      if (cancelled) return
      setActiveTrip({
        draftToken: opts.draftToken,
        plannedTripId: opts.plannedTripId,
        slug: tripSlug,
        label: tripLabel,
        outDate: opts.outDate ?? null,
        retDate: opts.retDate ?? null,
      })
      // Force the Ville filter onto the trip destination city (only on Activités).
      if (
        tabActive &&
        tripSlug &&
        (opts.draftToken || opts.plannedTripId) &&
        tripSlug !== citySlug
      ) {
        if (!didAutoCity.current) {
          didAutoCity.current = true
          navigate(
            activitiesCityPath(tripSlug, {
              draftToken: opts.draftToken,
              plannedTripId: opts.plannedTripId,
            }),
            { replace: true },
          )
        }
      } else {
        didAutoCity.current = true
      }
    }

    void (async () => {
      let linkedPlanned = plannedFromUrl || undefined
      try {
        if (plannedFromUrl && !draftFromUrl) {
          const trip = await getApiClient()
            .getPlannedTrip(plannedFromUrl)
            .catch(() => null)
          if (cancelled) return
          const arrival = trip
            ? parseAirportCodes(trip.arrival_airport)[0] || ''
            : ''
          const cityLabel = arrival
            ? cityDisplayNameFr(arrival)
            : citySlug || null
          const tripSlug = resolveActivityCitySlug({
            citySlug: cityLabel || citySlug || null,
            cityLabel,
            destIata: arrival || null,
          })
          applyTripCity(tripSlug, activityDestinationLabelFr(tripSlug), {
            plannedTripId: plannedFromUrl,
            outDate: trip?.dates_depart?.[0]?.date
              ? String(trip.dates_depart[0].date).slice(0, 10)
              : null,
            retDate: trip?.dates_retour?.length
              ? String(
                  trip.dates_retour[trip.dates_retour.length - 1]?.date || '',
                ).slice(0, 10) || null
              : null,
          })
        } else if (latest?.draft_token) {
          let cityLabel = String(latest.city || '').trim() || null
          let citySlugHint: string | null = null
          let destIata: string | null = null
          let outDate: string | null = null
          let retDate: string | null = null

          const tripPromise = getApiClient()
            .getMyTrip(latest.draft_token)
            .catch(() => null)
          const ownerHint = pickTripItemOwner({
            draftToken: latest.draft_token,
            plannedTripId: plannedFromUrl || undefined,
          })
          const itemsPromise = hasTripItemOwner(ownerHint)
            ? getApiClient().listTripItems(ownerHint).catch(() => null)
            : Promise.resolve(null)

          const [row, itemsRes] = await Promise.all([tripPromise, itemsPromise])
          if (cancelled) return

          if (row) {
            const pl = (row.payload || {}) as Record<string, unknown>
            const fl = (pl.flight || {}) as Record<string, unknown>
            cityLabel =
              String(row.city_name || pl.city || cityLabel || '').trim() || null
            citySlugHint =
              typeof pl.city_slug === 'string' ? pl.city_slug : null
            destIata =
              String(
                fl.destination_iata ||
                  pl.destination ||
                  pl.dest_iata ||
                  row.dest_iata ||
                  '',
              ).trim() || null
            linkedPlanned =
              linkedPlanned ||
              (row.source_planned_trip_id
                ? String(row.source_planned_trip_id)
                : undefined)
            outDate = String(row.out_date || '').slice(0, 10) || null
            retDate = String(row.ret_date || '').slice(0, 10) || null
          }

          const tripSlug = resolveActivityCitySlug({
            citySlug: citySlugHint || cityLabel,
            cityLabel,
            destIata,
          })
          const known = ACTIVITY_CITY_OPTIONS_FR.find((c) => c.slug === tripSlug)
          const tripLabel = String(
            known?.label || cityLabel || activityDestinationLabelFr(tripSlug),
          )
          if (draftFromUrl || fromUrl) {
            rememberTrip({
              draft_token: latest.draft_token,
              city: tripSlug,
            })
          }
          applyTripCity(tripSlug, tripLabel, {
            draftToken: latest.draft_token,
            plannedTripId: linkedPlanned,
            outDate,
            retDate,
          })

          // If planned id only appeared after getMyTrip, refresh items with preferred owner.
          let res = itemsRes
          const ownerFinal = pickTripItemOwner({
            draftToken: latest.draft_token,
            plannedTripId: linkedPlanned,
          })
          if (
            linkedPlanned &&
            ownerHint.planned_trip_id !== ownerFinal.planned_trip_id
          ) {
            res = await getApiClient().listTripItems(ownerFinal).catch(() => null)
          }
          if (cancelled) return
          const out: { city: string; title: string; productCode?: string }[] = []
          let count = 0
          for (const raw of res?.items || []) {
            const it = raw as {
              item_type?: string
              status?: string
              places?: { name?: string }
              meta?: { title?: string; product_code?: string }
            }
            if (it.item_type && it.item_type !== 'activity') continue
            if (it.status === 'skipped') continue
            count += 1
            if (it.status === 'booked') continue
            out.push({
              city: latest?.city || citySlug || 'voyage',
              title: String(it.places?.name || it.meta?.title || 'Activité'),
              productCode: it.meta?.product_code
                ? String(it.meta.product_code)
                : undefined,
            })
          }
          setSavedIdeas(out.slice(0, 12))
          setPlannerCount(count)
          setAddedCodes(
            new Set(
              out
                .map((x) => x.productCode)
                .filter((c): c is string => Boolean(c)),
            ),
          )
        } else {
          if (!cancelled) {
            setActiveTrip(null)
            didAutoCity.current = true
            setSavedIdeas([])
            setPlannerCount(0)
          }
        }
      } catch {
        /* trip bootstrap best-effort */
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftFromUrl, plannedFromUrl])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && pendingBook) setAskBooked(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [pendingBook])

  const track = (event: string, card?: ActivityCardModel | null) => {
    void getApiClient()
      .trackActivityEvent({
        domain: 'activity',
        event,
        surface: 'tab',
        platform: 'web',
        meta: card ? { product_code: card.productCode } : undefined,
      })
      .catch(() => undefined)
  }

  const onBook = (card: ActivityCardModel) => {
    const url = canonicalViatorProductUrl(card.productUrl, {
      productCode: card.productCode,
    })
    if (!url) return
    setPendingBook(card)
    track('book_click', card)
    openViatorSync(url)
  }

  const plannerHref = activeTrip?.plannedTripId
    ? `/planner/${encodeURIComponent(activeTrip.plannedTripId)}`
    : activeTrip?.draftToken
      ? `/trip/${encodeURIComponent(activeTrip.draftToken)}?activities=1`
      : null

  const toggleLike = async (card: ActivityCardModel) => {
    if (!card.productCode) return
    const user = await getCurrentUser()
    if (!user) {
      setAddNotice('Connecte-toi pour liker une activité.')
      return
    }
    const wasLiked = likedIds.has(card.productCode)
    setLikedIds((prev) => {
      const next = new Set(prev)
      if (wasLiked) next.delete(card.productCode)
      else next.add(card.productCode)
      return next
    })
    try {
      if (wasLiked) {
        await getApiClient().unlikeActivity(card.productCode)
        setAddNotice('Retiré des favoris')
      } else {
        await getApiClient().likeActivity(card)
        setAddNotice('Ajouté aux favoris')
      }
      track(wasLiked ? 'unlike' : 'like', card)
    } catch {
      setLikedIds((prev) => {
        const next = new Set(prev)
        if (wasLiked) next.add(card.productCode)
        else next.delete(card.productCode)
        return next
      })
      setAddNotice('Impossible de mettre à jour le favori')
    }
  }

  const bindActiveTrip = async (target: ActivityPlannerTarget) => {
    const tripSlug = resolveActivityCitySlug({
      citySlug: target.city || null,
      cityLabel: target.city || target.label,
      destIata: target.destIata || null,
    })
    const known = ACTIVITY_CITY_OPTIONS_FR.find((c) => c.slug === tripSlug)
    const label =
      target.label ||
      String(known?.label || target.city || activityDestinationLabelFr(tripSlug))
    setActiveTrip({
      draftToken: target.draftToken,
      plannedTripId: target.plannedTripId,
      slug: tripSlug || citySlug || 'voyage',
      label,
      outDate: target.outDate || null,
      retDate: target.retDate || null,
    })
    if (target.draftToken) {
      rememberTrip({
        draft_token: target.draftToken,
        city: tripSlug || citySlug || null,
      })
    }
    if (tripSlug && tripSlug !== citySlug) {
      navigate(
        activitiesCityPath(tripSlug, {
          draftToken: target.draftToken,
          plannedTripId: target.plannedTripId,
        }),
        { replace: true },
      )
    }
    try {
      const res = await getApiClient().listTripItems(
        pickTripItemOwner({
          draftToken: target.draftToken,
          plannedTripId: target.plannedTripId,
        }),
      )
      const codes = new Set<string>()
      let count = 0
      for (const raw of res.items || []) {
        const it = raw as {
          item_type?: string
          status?: string
          meta?: { product_code?: string }
        }
        if (it.item_type && it.item_type !== 'activity') continue
        if (it.status === 'skipped') continue
        count += 1
        const code = it.meta?.product_code ? String(it.meta.product_code) : ''
        if (code) codes.add(code)
      }
      setPlannerCount(count)
      setAddedCodes(codes)
    } catch {
      setPlannerCount(0)
      setAddedCodes(new Set())
    }
  }

  const onAddToPlanner = (card: ActivityCardModel) => {
    setAddNotice(null)
    setTripPickerOpen(false)
    setPendingAdd(card)
  }

  const confirmAddToTarget = async (target: ActivityPlannerTarget) => {
    const card = pendingAdd
    if (!card) return
    const owner = pickTripItemOwner({
      draftToken: target.draftToken,
      plannedTripId: target.plannedTripId,
    })
    if (!hasTripItemOwner(owner)) {
      setAddNotice(ACTIVITY_NO_PLANNER_TO_ADD_FR)
      return
    }
    setAddBusy(true)
    try {
      await getApiClient().addTripItem({
        product_code: card.productCode,
        title: card.title,
        product_url: card.productUrl,
        ...owner,
        platform: 'web',
        surface: 'tab',
      })
      track('add', card)
      setPlannerCount((n) => n + 1)
      if (card.productCode) {
        setAddedCodes((prev) => new Set(prev).add(card.productCode))
      }
      await bindActiveTrip(target)
      setAddNotice(
        `${ACTIVITY_ADDED_TO_PLANNER_FR(target.label)} — ${ACTIVITY_KEEP_ADDING_FR}`,
      )
      setPendingAdd(null)
      setDetail(null)
    } catch (e) {
      setAddNotice(e instanceof Error ? e.message : 'Ajout impossible')
    } finally {
      setAddBusy(false)
    }
  }

  return (
    <div className="w-full">
      <div className="mb-5 sm:mb-6">
        <p className="app-kicker mb-1.5">{ACTIVITY_PAGE_KICKER_FR}</p>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
          {ACTIVITY_PAGE_TITLE_FR}
        </h2>
        <p className="app-subtitle mt-1 max-w-xl">{ACTIVITY_PAGE_SUBTITLE_FR}</p>
      </div>

      {activeTrip && plannerHref ? (
        <ActivityTripHero
          mode="active"
          cityLabel={activeTrip.label}
          plannerCount={plannerCount}
          plannerHref={plannerHref}
          outDate={activeTrip.outDate}
          retDate={activeTrip.retDate}
          showSyncCity={activeTrip.slug !== citySlug}
          onSyncCity={() =>
            navigate(activitiesCityPath(activeTrip.slug, catalogNavOpts))
          }
          onChangeTrip={() => {
            setPendingAdd(null)
            setTripPickerOpen(true)
          }}
        />
      ) : (
        <ActivityTripHero
          mode="empty"
          emptyHref="/sejours"
          onChooseTrip={() => {
            setPendingAdd(null)
            setTripPickerOpen(true)
          }}
        />
      )}

      <div className="mb-3 sm:mb-4 space-y-1.5">
        <label className="text-xs font-bold text-ink">Ville</label>
        <ActivityCitySelect
          valueSlug={citySlug}
          valueLabel={activityDestinationLabelFr(citySlug)}
          onChange={(city) => {
            if (city.slug) navigate(activitiesCityPath(city.slug, catalogNavOpts))
          }}
        />
      </div>

      <div className="mb-3 sm:mb-4">
        <label className="sr-only" htmlFor="activity-search">
          Rechercher une activité
        </label>
        <div className="relative group">
          <span
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-primary-500 transition-colors"
            aria-hidden
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle
                cx="11"
                cy="11"
                r="6.5"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M16.2 16.2L20 20"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <input
            id="activity-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={ACTIVITY_SEARCH_PLACEHOLDER_CITY_FR(
              activityDestinationLabelFr(citySlug),
            )}
            autoComplete="off"
            enterKeyHint="search"
            className="w-full min-h-[44px] rounded-xl border-2 border-slate-200 bg-white pl-11 pr-11 py-2.5 sm:py-3 text-sm sm:text-base text-ink placeholder:text-muted shadow-soft hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-500 transition-colors [&::-webkit-search-cancel-button]:hidden"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-ink transition-colors"
              aria-label="Effacer la recherche"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null}
        </div>
        {searchQuery.trim() ? (
          <p className="mt-1.5 text-[11px] font-semibold text-muted">
            {cards.length === 0
              ? `Aucun résultat pour « ${searchQuery.trim()} »`
              : `${cards.length} résultat${cards.length > 1 ? 's' : ''} à ${activityDestinationLabelFr(citySlug)}`}
          </p>
        ) : null}
      </div>

      {addNotice ? (
        <div className="mb-3 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-xs text-primary-800 font-medium flex flex-wrap items-center gap-2 justify-between">
          <span>{addNotice}</span>
          <span className="flex gap-3">
            {plannerHref && addNotice.startsWith('Ajouté') ? (
              <Link to={plannerHref} className="font-bold text-primary-700 underline">
                {ACTIVITY_SEE_PLANNER_FR}
              </Link>
            ) : null}
            {!activeTrip ? (
              <Link to="/sejours" className="font-bold text-primary-700 underline">
                {ACTIVITY_NO_TRIP_CTA_BUTTON_FR}
              </Link>
            ) : null}
          </span>
        </div>
      ) : null}

      <div className="mb-4 sm:mb-5 flex flex-wrap items-center gap-1.5">
        {ACTIVITY_CATEGORY_TAGS_FR.map((t) => {
          const on = categories.includes(t.id)
          return (
            <button
              key={t.id}
              type="button"
              onClick={() =>
                setCategories((prev) => toggleActivityCategory(prev, t.id))
              }
              aria-pressed={on}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 sm:px-3 py-1.5 text-xs font-semibold border transition-colors min-h-[36px] ${
                on
                  ? 'bg-primary-500 text-white border-primary-500 shadow-soft'
                  : 'bg-canvas text-ink-soft border-line hover:bg-primary-50 hover:text-primary-700'
              }`}
            >
              <span className="text-sm leading-none" aria-hidden>
                {t.emoji}
              </span>
              <span className="truncate">{t.label}</span>
            </button>
          )
        })}
        {categories.length ? (
          <button
            type="button"
            onClick={() => setCategories([])}
            className="text-[11px] font-semibold text-primary-600 hover:underline px-2 py-1.5"
          >
            Effacer
          </button>
        ) : null}
      </div>

      {header ? (
        <p className="text-xs font-bold text-ink mb-2">{header}</p>
      ) : null}
      {fallbackHint ? (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-3 font-medium">
          {fallbackHint}
        </p>
      ) : null}
      {error ? (
        <div className="app-card p-6 sm:p-8 text-center max-w-md mx-auto mb-6">
          <p className="font-bold text-ink mb-1">Impossible de charger</p>
          <p className="text-sm text-muted">{error}</p>
        </div>
      ) : null}

      {!loading && !error && cards.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-xs font-semibold text-muted">
            {cards.length} activité{cards.length > 1 ? 's' : ''}
            {categories.length
              ? ` · ${activityCategoriesSummaryFr(categories)}`
              : ''}
          </p>
          <div className="flex flex-wrap gap-1">
            {(
              Object.keys(ACTIVITY_SORT_LABEL_FR) as Array<
                keyof typeof ACTIVITY_SORT_LABEL_FR
              >
            ).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold border transition-colors ${
                  sort === k
                    ? 'bg-primary-500 text-white border-primary-500'
                    : 'bg-white text-muted border-line hover:border-primary-200 hover:text-ink'
                }`}
              >
                {ACTIVITY_SORT_LABEL_FR[k]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!citySlug && savedIdeas.length ? (
        <section className="app-card p-4 sm:p-5 mb-5 sm:mb-6">
          <h3 className="font-bold text-ink text-sm mb-3">
            {savedIdeasTitleFr(savedIdeas[0]?.city || 'tes voyages')}
          </h3>
          <ul className="grid sm:grid-cols-2 gap-2">
            {savedIdeas.map((s, i) => (
              <li
                key={`${s.productCode || s.title}-${i}`}
                className="text-sm text-ink-soft rounded-xl border border-line px-3 py-2.5"
              >
                <span className="font-semibold text-ink">{s.title}</span>
                <span className="text-xs text-muted"> · {s.city}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl overflow-hidden border border-line/80 bg-canvas animate-pulse"
            >
              <div className="aspect-[16/10] bg-slate-200" />
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-white/70">
                <div className="h-7 w-20 rounded bg-slate-200" />
                <div className="h-9 w-28 rounded-lg bg-slate-200" />
              </div>
            </div>
          ))}
        </div>
      ) : cards.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
          {cards.map((c) => (
              <ActivityCard
                key={c.productCode || c.title}
                card={c}
                onOpen={() => setDetail(c)}
                onBook={() => onBook(c)}
                onAdd={() => onAddToPlanner(c)}
                liked={likedIds.has(c.productCode)}
                onToggleLike={() => void toggleLike(c)}
                addLabel={ACTIVITY_ADD_TO_PLANNER_FR}
                addDisabled={addBusy}
                added={Boolean(c.productCode && addedCodes.has(c.productCode))}
              />
          ))}
        </div>
      ) : !error && !loading ? (
        <div className="app-card p-8 text-center max-w-md mx-auto">
          <p className="font-bold text-ink">Aucune activité</p>
          <p className="text-sm text-muted mt-1">Choisis une ville ci-dessus.</p>
        </div>
      ) : null}

      {detail ? (
        <ActivityDetailSheet
          card={detail}
          adults={adults}
          liked={likedIds.has(detail.productCode)}
          addBusy={addBusy}
          alreadyAdded={false}
          addLabel={ACTIVITY_ADD_TO_PLANNER_FR}
          onToggleLike={() => void toggleLike(detail)}
          onBook={() => onBook(detail)}
          onAdd={() => onAddToPlanner(detail)}
          onClose={() => setDetail(null)}
        />
      ) : null}

      <ActivityPlannerPicker
        open={Boolean(pendingAdd) || tripPickerOpen}
        busy={addBusy}
        preferredPlannedTripId={activeTrip?.plannedTripId}
        preferredDraftToken={activeTrip?.draftToken}
        catalogCity={
          pendingAdd?.destinationLabel || citySlug || null
        }
        title={pendingAdd ? undefined : ACTIVITY_CHOOSE_TRIP_FR}
        hint={
          pendingAdd
            ? undefined
            : 'Le séjour choisi devient le voyage en cours pour le catalogue.'
        }
        onClose={() => {
          if (addBusy) return
          setPendingAdd(null)
          setTripPickerOpen(false)
        }}
        onPick={(target) => {
          if (pendingAdd) {
            void confirmAddToTarget(target)
            return
          }
          void (async () => {
            await bindActiveTrip(target)
            setTripPickerOpen(false)
          })()
        }}
      />

      {askBooked && pendingBook ? (
        <div className="app-dialog-root">
          <div className="app-dialog-backdrop" />
          <div className="app-dialog-panel app-dialog-md p-5 sm:p-6 space-y-4">
            <p className="font-extrabold text-lg text-ink">
              {ACTIVITY_BOOKED_PROMPT_FR(pendingBook.title)}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl bg-emerald-600 text-white font-bold py-3"
                onClick={() => {
                  track('booked_yes', pendingBook)
                  setPendingBook(null)
                  setAskBooked(false)
                }}
              >
                Oui
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl border border-line font-semibold py-3"
                onClick={() => {
                  track('booked_no', pendingBook)
                  setPendingBook(null)
                  setAskBooked(false)
                }}
              >
                Pas encore
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  )
}

export default ActivitiesTab
