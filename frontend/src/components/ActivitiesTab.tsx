/**
 * Onglet Activités — UI alignée Séjours / Deals (grille desktop 3 col).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ACTIVITY_ADDED_TO_PLANNER_FR,
  ACTIVITY_ADD_TO_PLANNER_FR,
  ACTIVITY_BACK_TO_PLANNER_FR,
  ACTIVITY_BOOKED_PROMPT_FR,
  ACTIVITY_CATEGORY_TAGS_FR,
  ACTIVITY_CITY_OPTIONS_FR,
  ACTIVITY_KEEP_ADDING_FR,
  ACTIVITY_NO_TRIP_CTA_BUTTON_FR,
  ACTIVITY_SEE_PLANNER_FR,
  ACTIVITY_SESSION_ADDED_FR,
  ACTIVITY_SORT_LABEL_FR,
  activitiesCityPath,
  activityCategoriesSummaryFr,
  activityCitySlugFromLabel,
  activityDestinationLabelFr,
  activityMatchesCategories,
  savedIdeasTitleFr,
  toActivityCardModel,
  toggleActivityCategory,
  type ActivityCardModel,
} from '@flightwatcher/shared'
import { getCurrentUser } from '../lib/supabase'
import { getApiClient } from '../utils/apiClient'
import { listRememberedTrips, rememberTrip } from '../utils/tripRecovery'
import { ActivityCitySelect } from './ActivityCitySelect'
import { ActivityTripHero } from './ActivityTripHero'

const springConfig = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 28,
  mass: 0.5,
}

function openViatorSync(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function SoftChip({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-line bg-canvas text-ink-soft px-2 py-0.5 text-[10px] font-bold leading-tight">
      {children}
    </span>
  )
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
}: {
  card: ActivityCardModel
  onOpen: () => void
  onBook: () => void
  onAdd: () => void
  liked?: boolean
  onToggleLike?: () => void
  addLabel?: string
  addDisabled?: boolean
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springConfig}
      whileHover={{ y: -4, transition: { duration: 0.18 } }}
      className="group flex flex-col h-full rounded-3xl overflow-hidden bg-white border border-line shadow-soft hover:shadow-lift hover:border-primary-200 transition-all duration-200 text-left"
    >
      <button type="button" onClick={onOpen} className="relative block w-full text-left">
        {card.photoUrl ? (
          <img
            src={card.photoUrl}
            alt=""
            className="h-48 sm:h-52 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="h-48 sm:h-52 w-full bg-canvas" />
        )}
        {card.freeCancellation ? (
          <span className="absolute top-3 left-3 z-[3] rounded-full px-2.5 py-1 bg-emerald-600 text-white text-[11px] font-bold shadow-soft">
            Annulation gratuite
          </span>
        ) : null}
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
            className={`absolute top-3 right-3 z-[3] w-10 h-10 rounded-full flex items-center justify-center shadow-soft transition-colors ${
              liked
                ? 'bg-white text-primary-500'
                : 'bg-white/95 text-ink-soft hover:text-primary-500'
            }`}
          >
            <ActivityHeartSvg filled={!!liked} />
          </span>
        ) : null}
      </button>

      <div className="flex flex-col flex-1 p-4 sm:p-5 gap-2">
        <h3 className="font-extrabold text-ink text-[15px] sm:text-base leading-snug line-clamp-2">
          {card.title}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {card.rating != null ? (
            <SoftChip>{`${card.rating.toFixed(1)} · ${card.reviewCount || 0} avis`}</SoftChip>
          ) : null}
          {card.durationLabel ? <SoftChip>{card.durationLabel}</SoftChip> : null}
          {card.distanceLabel ? <SoftChip>{card.distanceLabel}</SoftChip> : null}
        </div>

        <div className="mt-auto pt-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted mb-0.5">
              À partir de
            </p>
            <p className="text-2xl font-black text-primary-500 tabular-nums leading-none">
              {card.priceLabel || 'Voir'}
            </p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button
              type="button"
              onClick={onBook}
              className="rounded-xl bg-primary-500 hover:bg-primary-600 text-white text-sm font-bold px-3.5 py-2.5 min-h-[44px]"
            >
              Réserver
            </button>
            <button
              type="button"
              onClick={onAdd}
              disabled={addDisabled}
              className="rounded-xl border border-line text-ink text-xs font-bold px-3 py-2 hover:border-primary-200 hover:bg-primary-50/50 disabled:opacity-50"
            >
              {addLabel}
            </button>
          </div>
        </div>
      </div>
    </motion.article>
  )
}

export function ActivitiesTab(props?: { citySlug?: string }) {
  const params = useParams<{ city?: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const citySlug = props?.citySlug || params.city || ''
  const draftFromUrl = searchParams.get('draft')?.trim() || ''
  const plannedFromUrl = searchParams.get('planned')?.trim() || ''
  const [adults] = useState(2)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [header, setHeader] = useState<string | null>(null)
  const [fallbackHint, setFallbackHint] = useState<string | null>(null)
  const [sort, setSort] = useState<'recommended' | 'price' | 'rating'>('recommended')
  const [categories, setCategories] = useState<string[]>([])
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
  } | null>(null)
  const [plannerCount, setPlannerCount] = useState(0)
  const [sessionAdded, setSessionAdded] = useState(0)
  const [addedCodes, setAddedCodes] = useState<Set<string>>(new Set())
  const [addBusy, setAddBusy] = useState(false)
  const [addNotice, setAddNotice] = useState<string | null>(null)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const didAutoCity = useRef(false)

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
        const user = await getCurrentUser()
        if (!user || cancelled) return
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
    if (!citySlug && !header) {
      navigate('/activites/paris', { replace: true })
    }
  }, [citySlug, header, navigate])

  const cards = useMemo(() => {
    const matched = items.filter((r) => activityMatchesCategories(r, categories))
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
  }, [items, adults, sort, categories])

  const loadCity = useCallback(
    async (slug: string) => {
      if (!slug) return
      setLoading(true)
      setError(null)
      setHeader(null)
      setFallbackHint(null)
      try {
        const res = await getApiClient().listCityActivities(slug, adults)
        if (!res.ok) {
          const hint =
            res.error === 'unknown_city'
              ? 'Ville non reconnue — essaie Paris, Rome, Barcelone…'
              : res.error === 'viator_disabled'
                ? 'Viator non configuré (VIATOR_API_KEY)'
                : String(res.error || '').includes('401') ||
                    String(res.error || '').includes('UNAUTHORIZED')
                  ? 'Clé Viator invalide — vérifie VIATOR_API_KEY (sandbox)'
                  : res.error || 'Chargement impossible'
          throw new Error(hint)
        }
        setItems(Array.isArray(res.items) ? res.items : [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur')
        setItems([])
      } finally {
        setLoading(false)
      }
    },
    [adults],
  )

  useEffect(() => {
    if (citySlug) void loadCity(citySlug)
  }, [citySlug, loadCity])

  useEffect(() => {
    const remembered = listRememberedTrips()
    const fromUrl = draftFromUrl
      ? remembered.find((t) => t.draft_token === draftFromUrl) || {
          draft_token: draftFromUrl,
          city: citySlug || null,
          at: Date.now(),
        }
      : null
    const latest = fromUrl || remembered[0]
    let tripSlug = ''
    let tripLabel = ''

    if (plannedFromUrl && !draftFromUrl) {
      const raw = (citySlug || 'paris').trim().toLowerCase()
      tripSlug = activityCitySlugFromLabel(raw) || raw || 'paris'
      tripLabel = activityDestinationLabelFr(tripSlug)
      setActiveTrip({
        plannedTripId: plannedFromUrl,
        slug: tripSlug,
        label: tripLabel,
      })
      didAutoCity.current = true
    } else if (latest?.draft_token) {
      const raw = String(latest.city || citySlug || '')
        .trim()
        .toLowerCase()
      const known = raw
        ? ACTIVITY_CITY_OPTIONS_FR.find(
            (c) => c.slug === raw || c.label.toLowerCase() === raw,
          )
        : null
      tripSlug = known?.slug || (raw ? activityCitySlugFromLabel(raw) : '') || 'paris'
      tripLabel = String(known?.label || latest.city || tripSlug)
      setActiveTrip({
        draftToken: latest.draft_token,
        slug: tripSlug,
        label: tripLabel,
      })
      if (draftFromUrl || fromUrl) {
        rememberTrip({
          draft_token: latest.draft_token,
          city: latest.city || tripLabel,
        })
      }
      if (
        !didAutoCity.current &&
        tripSlug &&
        (!citySlug || citySlug === 'paris') &&
        tripSlug !== 'paris'
      ) {
        didAutoCity.current = true
        navigate(
          activitiesCityPath(tripSlug, {
            draftToken: latest.draft_token,
            plannedTripId: plannedFromUrl || undefined,
          }),
          { replace: true },
        )
      } else {
        didAutoCity.current = true
      }
    } else {
      setActiveTrip(null)
      didAutoCity.current = true
    }

    const bindToken = latest?.draft_token
    if (!bindToken && !plannedFromUrl) {
      setSavedIdeas([])
      setPlannerCount(0)
      return
    }
    let cancelled = false
    void (async () => {
      const out: { city: string; title: string; productCode?: string }[] = []
      let count = 0
      try {
        const res = await getApiClient().listTripItems({
          draft_token: bindToken || undefined,
          planned_trip_id: plannedFromUrl || undefined,
        })
        for (const raw of res.items || []) {
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
            city: latest?.city || tripLabel || 'voyage',
            title: String(it.places?.name || it.meta?.title || 'Activité'),
            productCode: it.meta?.product_code
              ? String(it.meta.product_code)
              : undefined,
          })
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) {
        setSavedIdeas(out.slice(0, 12))
        setPlannerCount(count)
        setAddedCodes(
          new Set(
            out
              .map((x) => x.productCode)
              .filter((c): c is string => Boolean(c)),
          ),
        )
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
    if (!card.productUrl) return
    setPendingBook(card)
    track('book_click', card)
    openViatorSync(card.productUrl)
  }

  const plannerHref = activeTrip?.draftToken
    ? `/trip/${encodeURIComponent(activeTrip.draftToken)}?activities=1`
    : activeTrip?.plannedTripId
      ? '/planner'
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

  const onAddToPlanner = async (card: ActivityCardModel) => {
    setAddNotice(null)
    if (!activeTrip?.draftToken && !activeTrip?.plannedTripId) {
      setAddNotice(
        'Ouvre ton séjour (planner) puis « Parcourir le catalogue » pour lier les ajouts.',
      )
      setDetail(card)
      return
    }
    if (card.productCode && addedCodes.has(card.productCode)) {
      setAddNotice('Déjà dans ce planner — continue avec une autre idée.')
      setDetail(null)
      return
    }
    setAddBusy(true)
    try {
      await getApiClient().addTripItem({
        product_code: card.productCode,
        title: card.title,
        product_url: card.productUrl,
        draft_token: activeTrip.draftToken || undefined,
        planned_trip_id: activeTrip.plannedTripId || undefined,
        platform: 'web',
        surface: 'tab',
      })
      track('add', card)
      setPlannerCount((n) => n + 1)
      setSessionAdded((n) => n + 1)
      if (card.productCode) {
        setAddedCodes((prev) => new Set(prev).add(card.productCode))
      }
      setAddNotice(
        `${ACTIVITY_ADDED_TO_PLANNER_FR(activeTrip.label)} — ${ACTIVITY_KEEP_ADDING_FR}`,
      )
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
        <p className="app-kicker mb-1.5">Activités</p>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
          Que faire sur place
        </h2>
        <p className="mt-2 text-sm text-muted">
          Où manger à {citySlug || 'cette ville'} ?{' '}
          <Link
            to={
              plannerHref
                ? `${plannerHref}${plannerHref.includes('?') ? '&' : '?'}restaurants=1`
                : '/favoris'
            }
            className="font-bold text-primary-700 hover:underline"
          >
            Ajoute tes adresses à ton voyage
          </Link>
        </p>
      </div>

      {activeTrip && plannerHref ? (
        <ActivityTripHero
          mode="active"
          cityLabel={activeTrip.label}
          plannerCount={plannerCount}
          plannerHref={plannerHref}
          showSyncCity={activeTrip.slug !== citySlug}
          onSyncCity={() =>
            navigate(activitiesCityPath(activeTrip.slug, catalogNavOpts))
          }
        />
      ) : (
        <ActivityTripHero mode="empty" emptyHref="/sejours" />
      )}

      <div className="mb-4 sm:mb-5 space-y-2">
        <label className="text-sm font-bold text-ink">Ville</label>
        <ActivityCitySelect
          valueSlug={citySlug}
          valueLabel={activityDestinationLabelFr(citySlug)}
          onChange={(city) => {
            if (city.slug) navigate(activitiesCityPath(city.slug, catalogNavOpts))
          }}
        />
      </div>

      {addNotice ? (
        <div className="mb-4 rounded-xl border border-primary-200 bg-primary-50 px-3.5 py-2.5 text-sm text-primary-800 font-medium flex flex-wrap items-center gap-2 justify-between">
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

      <div className="mb-5 sm:mb-6 flex flex-wrap items-center gap-2">
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
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 sm:px-4 py-2.5 text-sm font-semibold border transition-colors min-h-[44px] ${
                on
                  ? 'bg-primary-500 text-white border-primary-500 shadow-soft'
                  : 'bg-canvas text-ink-soft border-line hover:bg-primary-50 hover:text-primary-700'
              }`}
            >
              <span className="text-base leading-none" aria-hidden>
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
            className="text-xs font-semibold text-primary-600 hover:underline px-2 py-2"
          >
            Effacer
          </button>
        ) : null}
      </div>

      {header ? (
        <p className="text-sm font-bold text-ink mb-3">{header}</p>
      ) : null}
      {fallbackHint ? (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 mb-4 font-medium">
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <p className="text-sm font-semibold text-muted">
            {cards.length} activité{cards.length > 1 ? 's' : ''}
            {categories.length
              ? ` · ${activityCategoriesSummaryFr(categories)}`
              : ''}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(
              Object.keys(ACTIVITY_SORT_LABEL_FR) as Array<
                keyof typeof ACTIVITY_SORT_LABEL_FR
              >
            ).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold border transition-colors ${
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="app-card overflow-hidden animate-pulse">
              <div className="h-48 bg-canvas" />
              <div className="p-5 space-y-3">
                <div className="h-4 bg-canvas rounded w-4/5" />
                <div className="h-3 bg-canvas rounded w-2/5" />
                <div className="h-8 bg-canvas rounded w-1/3 mt-4" />
              </div>
            </div>
          ))}
        </div>
      ) : cards.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 sm:gap-6">
          {cards.map((c) => {
            const already = Boolean(c.productCode && addedCodes.has(c.productCode))
            return (
              <ActivityCard
                key={c.productCode || c.title}
                card={c}
                onOpen={() => setDetail(c)}
                onBook={() => onBook(c)}
                onAdd={() => {
                  void onAddToPlanner(c)
                }}
                liked={likedIds.has(c.productCode)}
                onToggleLike={() => void toggleLike(c)}
                addLabel={already ? 'Dans le planner' : ACTIVITY_ADD_TO_PLANNER_FR}
                addDisabled={addBusy || already}
              />
            )
          })}
        </div>
      ) : !error && !loading ? (
        <div className="app-card p-8 text-center max-w-md mx-auto">
          <p className="font-bold text-ink">Aucune activité</p>
          <p className="text-sm text-muted mt-1">Choisis une ville ci-dessus.</p>
        </div>
      ) : null}

      {detail ? (
        <div className="app-dialog-root">
          <button
            type="button"
            className="app-dialog-backdrop"
            aria-label="Fermer"
            onClick={() => setDetail(null)}
          />
          <div className="app-dialog-panel app-dialog-md p-5 sm:p-6 space-y-4">
            {detail.photoUrl ? (
              <img
                src={detail.photoUrl}
                alt=""
                className="w-full h-48 object-cover rounded-2xl"
              />
            ) : null}
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-extrabold text-xl text-ink">{detail.title}</h3>
              <button
                type="button"
                onClick={() => void toggleLike(detail)}
                aria-label={
                  likedIds.has(detail.productCode)
                    ? 'Retirer des favoris'
                    : 'Ajouter aux favoris'
                }
                className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center border ${
                  likedIds.has(detail.productCode)
                    ? 'bg-primary-50 text-primary-500 border-primary-200'
                    : 'bg-white text-ink-soft border-line'
                }`}
              >
                <ActivityHeartSvg filled={likedIds.has(detail.productCode)} />
              </button>
            </div>
            <p className="text-sm text-muted">
              {detail.priceLabel} · {detail.durationLabel || 'Durée variable'}
            </p>
            <button
              type="button"
              className="w-full rounded-xl bg-primary-500 hover:bg-primary-600 text-white font-bold py-3.5 min-h-[48px]"
              onClick={() => onBook(detail)}
            >
              Réserver sur Viator
            </button>
            <button
              type="button"
              disabled={addBusy}
              className="w-full rounded-xl border border-line font-bold py-3 min-h-[48px] disabled:opacity-50"
              onClick={() => void onAddToPlanner(detail)}
            >
              {activeTrip ? `Ajouter au planner · ${activeTrip.label}` : 'Ajouter au planner'}
            </button>
            <button
              type="button"
              className="w-full rounded-xl border border-transparent font-semibold py-2 text-muted"
              onClick={() => setDetail(null)}
            >
              Fermer
            </button>
          </div>
        </div>
      ) : null}

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

      {activeTrip && plannerHref && (sessionAdded > 0 || plannerCount > 0) ? (
        <div className="sticky bottom-20 sm:bottom-4 z-30 mt-6 rounded-2xl border border-primary-200 bg-white/95 backdrop-blur shadow-lift px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-ink">
              {sessionAdded > 0
                ? ACTIVITY_SESSION_ADDED_FR(sessionAdded)
                : ACTIVITY_ADDED_TO_PLANNER_FR(activeTrip.label)}
            </p>
            <p className="text-xs text-muted mt-0.5">{ACTIVITY_KEEP_ADDING_FR}</p>
          </div>
          <Link
            to={plannerHref}
            className="shrink-0 inline-flex items-center justify-center rounded-xl bg-ink text-white px-4 py-2.5 text-sm font-bold min-h-[44px]"
          >
            {ACTIVITY_BACK_TO_PLANNER_FR}
          </Link>
        </div>
      ) : null}
    </div>
  )
}

export default ActivitiesTab
