import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Modal,
  AppState,
  type AppStateStatus,
  Platform,
  RefreshControl,
  ScrollView,
  TextInput,
  ImageBackground,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  useScrollToTop,
} from '@react-navigation/native'
import type { RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import {
  ACTIVITY_ADDED_TO_PLANNER_FR,
  ACTIVITY_ADD_TO_PLANNER_FR,
  ACTIVITY_BOOKED_PROMPT_FR,
  ACTIVITY_CATEGORY_TAGS_FR,
  ACTIVITY_CHOOSE_TRIP_FR,
  ACTIVITY_CITY_OPTIONS_FR,
  ACTIVITY_EMPTY_BODY_FR,
  ACTIVITY_EMPTY_CHANGE_CITY_FR,
  ACTIVITY_EMPTY_CLEAR_FILTERS_FR,
  ACTIVITY_EMPTY_FILTERS_BODY_FR,
  ACTIVITY_EMPTY_FILTERS_TITLE_FR,
  ACTIVITY_EMPTY_KICKER_FR,
  ACTIVITY_EMPTY_RETRY_FR,
  ACTIVITY_EMPTY_SEE_SEJOURS_FR,
  ACTIVITY_EMPTY_TITLE_FR,
  ACTIVITY_PAGE_KICKER_FR,
  ACTIVITY_PAGE_SUBTITLE_FR,
  ACTIVITY_PAGE_TITLE_FR,
  ACTIVITY_KEEP_ADDING_FR,
  ACTIVITY_NO_PLANNER_TO_ADD_FR,
  ACTIVITY_SEARCH_PLACEHOLDER_CITY_FR,
  ACTIVITY_SEE_PLANNER_FR,
  ACTIVITY_SORT_LABEL_FR,
  ACTIVITY_SWITCH_TRIP_HINT_FR,
  canonicalViatorProductUrl,
  cityDisplayNameFr,
  cityImageUrl,
  filterActivitySwitcherWorkspaces,
  parseAirportCodes,
  resolveActivityCitySlug,
  activityDestinationLabelFr,
  activityMatchesCategories,
  activityMatchesSearchQuery,
  hasTripItemOwner,
  pickTripItemOwner,
  toActivityCardModel,
  toggleActivityCategory,
  translate,
  type ActivityCardModel,
  type PlannedTrip,
  type TravelWorkspace,
} from '@flightwatcher/shared'
import { useAuth } from '../context/AuthContext'
import { getGuestTrip, listGuestTrips } from '../dev/guestPreview'
import { auth, getApi } from '../lib/client'
import { listTravelWorkspacesCached } from '../lib/workspacesCache'
import { openInAppBrowser } from '../lib/openInApp'
import { listRememberedTrips, rememberTrip } from '../lib/tripRecovery'
import { ActivityCard } from '../components/ActivityCard'
import { ActivityCityPicker } from '../components/ActivityCityPicker'
import { ActivityDetailSheet } from '../components/ActivityDetailSheet'
import {
  ActivityPlannerPicker,
  type ActivityPlannerTarget,
} from '../components/ActivityPlannerPicker'
import { ActivityTripHero } from '../components/ActivityTripHero'
import { GuestAuthLanding } from '../components/GuestAuthLanding'
import { ScreenBackground } from '../components/ScreenBackground'
import { useLikedActivities } from '../hooks/useLikedActivities'
import type { MainTabParamList, RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, shadow, spacing } from '../theme'

function eventPlatform(): 'ios' | 'android' {
  return Platform.OS === 'ios' ? 'ios' : 'android'
}

function tripAsWorkspace(trip: PlannedTrip): TravelWorkspace {
  const dest = parseAirportCodes(trip.arrival_airport)[0] || null
  return {
    workspace_id: `planner:${trip.id}`,
    planned_trip_id: trip.id,
    proposal_id: trip.accepted_proposal?.id || null,
    scope: 'collaborative',
    phase: trip.status === 'locked' ? 'flight_selected' : 'planning',
    title: trip.name,
    city: dest ? cityDisplayNameFr(dest) : 'Destination libre',
    origin_iata: trip.departure_airport,
    dest_iata: trip.arrival_airport,
    out_date: trip.dates_depart?.[0]?.date || null,
    ret_date: trip.dates_retour?.[trip.dates_retour.length - 1]?.date || null,
    is_organizer: true,
    capabilities: {
      can_scan: trip.status !== 'locked',
      can_choose_flight: trip.status !== 'locked',
      can_compose_hotel: trip.status === 'locked',
      can_view_confirmation: false,
    },
    pipeline: {
      flight: trip.status === 'locked' ? 'selected' : 'none',
      hotel: 'none',
    },
    planned_trip: trip,
    updated_at: trip.updated_at || trip.created_at,
  }
}

function rememberedAsWorkspace(row: {
  draft_token: string
  city?: string | null
  at: number
}): TravelWorkspace {
  const city = String(row.city || '').trim() || 'Séjour'
  return {
    workspace_id: `draft:${row.draft_token}`,
    draft_token: row.draft_token,
    scope: 'personal',
    phase: 'composing',
    title: city,
    city,
    is_organizer: true,
    capabilities: {
      can_scan: false,
      can_choose_flight: false,
      can_compose_hotel: true,
      can_view_confirmation: true,
    },
    pipeline: { flight: 'none', hotel: 'none' },
    updated_at: new Date(row.at).toISOString(),
  }
}

function cityFromWorkspace(ws: TravelWorkspace): {
  slug: string
  label: string
  destIata: string | null
} {
  const destIata = parseAirportCodes(ws.dest_iata)[0] || null
  const cityLabel = String(ws.city || '').trim() || null
  const slug = resolveActivityCitySlug({
    citySlug: cityLabel,
    cityLabel,
    destIata,
  })
  const known = ACTIVITY_CITY_OPTIONS_FR.find((c) => c.slug === slug)
  return {
    slug,
    label: String(
      known?.label || cityLabel || activityDestinationLabelFr(slug),
    ),
    destIata,
  }
}

export function ActivitiesScreen() {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const route = useRoute<RouteProp<MainTabParamList, 'Activities'>>()
  const { viewUser, signInWithGoogle, user, session, isGuest, loading: authLoading } =
    useAuth()
  const [loginLoading, setLoginLoading] = useState(false)
  // Première connexion / aucun séjour : Paris par défaut, écrasé dès qu’un planner est repris.
  const [citySlug, setCitySlug] = useState(
    () => route.params?.city?.trim().toLowerCase() || 'paris',
  )
  const [tripReady, setTripReady] = useState(false)
  const authKey =
    user?.id ||
    (isGuest ? 'guest' : '') ||
    (session?.access_token ? 'session' : '')

  useEffect(() => {
    const fromRoute = route.params?.city?.trim().toLowerCase()
    if (fromRoute && fromRoute !== citySlug) setCitySlug(fromRoute)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.city])
  const [adults] = useState(2)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [header, setHeader] = useState<string | null>(null)
  const [fallbackHint, setFallbackHint] = useState<string | null>(null)
  const [sort, setSort] = useState<'recommended' | 'price' | 'rating'>('recommended')
  const [categories, setCategories] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [detail, setDetail] = useState<ActivityCardModel | null>(null)
  const [pendingBook, setPendingBook] = useState<ActivityCardModel | null>(null)
  const [askBooked, setAskBooked] = useState(false)
  const pendingRef = useRef<ActivityCardModel | null>(null)
  const draftFromRoute = route.params?.draftToken?.trim() || ''
  const plannedFromRoute = route.params?.plannedTripId?.trim() || ''
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
  const didAutoCity = useRef(false)
  /** Align city on trip once when planner boots (like web syncedOnOpen). */
  const syncedCityToTrip = useRef(false)
  const listRef = useRef<FlatList<ActivityCardModel>>(null)
  useScrollToTop(listRef)
  const { isLiked, toggleLike, refresh: refreshLikes } = useLikedActivities()

  useEffect(() => {
    void refreshLikes()
  }, [refreshLikes])

  useEffect(() => {
    if (authLoading) return
    let cancelled = false
    didAutoCity.current = false
    syncedCityToTrip.current = false
    setTripReady(false)
    const routeCity = route.params?.city?.trim().toLowerCase() || ''
    void (async () => {
      try {
        const applyItems = (items: unknown[] | null | undefined) => {
          const codes = new Set<string>()
          let n = 0
          for (const raw of items || []) {
            const it = raw as {
              item_type?: string
              status?: string
              meta?: { product_code?: string }
            }
            if (it.item_type && it.item_type !== 'activity') continue
            if (it.status === 'skipped') continue
            n += 1
            const code = it.meta?.product_code ? String(it.meta.product_code) : ''
            if (code) codes.add(code)
          }
          setPlannerCount(n)
          setAddedCodes(codes)
        }

        const lockCity = (slug: string) => {
          if (!slug) {
            didAutoCity.current = true
            return
          }
          didAutoCity.current = true
          setCitySlug(slug)
        }

        // Redirect planner → Activités : params route font foi (voyage + ville).
        if (plannedFromRoute || draftFromRoute) {
          let draftToken = draftFromRoute || undefined
          let plannedTripId = plannedFromRoute || undefined
          let cityLabel: string | null = routeCity || null
          let citySlugHint: string | null = routeCity || null
          let destIata: string | null = null

          let outDate: string | null = null
          let retDate: string | null = null

          if (plannedFromRoute) {
            const isDevTrip =
              __DEV__ && String(plannedFromRoute).startsWith('dev-trip-')
            const guest = isDevTrip ? getGuestTrip(plannedFromRoute) : null
            const trip =
              guest ||
              (isDevTrip
                ? null
                : await getApi()
                    .getPlannedTrip(plannedFromRoute)
                    .catch(() => null))
            if (trip) {
              const arrival = parseAirportCodes(trip.arrival_airport)[0] || ''
              destIata = arrival || null
              outDate =
                String(trip.dates_depart?.[0]?.date || '').slice(0, 10) || null
              retDate =
                String(
                  trip.dates_retour?.[trip.dates_retour.length - 1]?.date || '',
                ).slice(0, 10) || null
              if (!routeCity) {
                cityLabel = arrival
                  ? cityDisplayNameFr(arrival)
                  : String(trip.name || '').replace(/^Weekend\s+/i, '').trim() ||
                    null
                citySlugHint = cityLabel
              } else if (!cityLabel && arrival) {
                cityLabel = cityDisplayNameFr(arrival)
              }
            }
          }

          if (draftFromRoute) {
            const remembered = await listRememberedTrips()
            const rememberedHit = remembered.find(
              (t) => t.draft_token === draftFromRoute,
            )
            if (!routeCity && rememberedHit?.city) {
              cityLabel = String(rememberedHit.city).trim() || cityLabel
              citySlugHint = cityLabel
            }
            const row = await getApi()
              .getMyTrip(draftFromRoute)
              .catch(() => null)
            if (row) {
              const pl = (row.payload || {}) as Record<string, unknown>
              const fl = (pl.flight || {}) as Record<string, unknown>
              if (!routeCity) {
                cityLabel =
                  String(row.city_name || pl.city || cityLabel || '').trim() ||
                  null
                citySlugHint =
                  typeof pl.city_slug === 'string'
                    ? pl.city_slug
                    : cityLabel
              }
              destIata =
                destIata ||
                String(
                  fl.destination_iata ||
                    pl.destination ||
                    pl.dest_iata ||
                    row.dest_iata ||
                    '',
                ).trim() ||
                null
              plannedTripId =
                plannedTripId ||
                (row.source_planned_trip_id
                  ? String(row.source_planned_trip_id)
                  : undefined)
              outDate =
                outDate ||
                String(row.out_date || '').slice(0, 10) ||
                null
              retDate =
                retDate ||
                String(row.ret_date || '').slice(0, 10) ||
                null
            }
          }

          const slug = resolveActivityCitySlug({
            citySlug: routeCity || citySlugHint || cityLabel,
            cityLabel: cityLabel || routeCity || null,
            destIata: routeCity ? null : destIata,
          })
          const known = ACTIVITY_CITY_OPTIONS_FR.find((c) => c.slug === slug)
          const label = String(
            known?.label ||
              cityLabel ||
              (routeCity ? activityDestinationLabelFr(routeCity) : null) ||
              activityDestinationLabelFr(slug),
          )
          if (cancelled) return
          setActiveTrip({
            draftToken,
            plannedTripId,
            slug,
            label,
            outDate,
            retDate,
          })
          lockCity(slug)

          if (draftToken) {
            await rememberTrip({
              draft_token: draftToken,
              city: slug,
            })
          }

          const owner = pickTripItemOwner({
            draftToken,
            plannedTripId,
          })
          if (
            hasTripItemOwner(owner) &&
            !(
              plannedTripId &&
              String(plannedTripId).startsWith('dev-trip-')
            )
          ) {
            const itemsRes = await getApi()
              .listTripItems(owner)
              .catch(() => null)
            if (cancelled) return
            applyItems(itemsRes?.items)
          } else if (!cancelled) {
            setPlannerCount(0)
            setAddedCodes(new Set())
          }
          return
        }

        // Ouverture libre : reprendre le planner actif + sa ville d’arrivée.
        const local: TravelWorkspace[] = []
        if (__DEV__) {
          local.push(...listGuestTrips().map(tripAsWorkspace))
        }
        const remembered = await listRememberedTrips()
        local.push(...remembered.map(rememberedAsWorkspace))

        let remote: TravelWorkspace[] = []
        const loadRemote = async () => {
          try {
            const rows = await listTravelWorkspacesCached()
            return Array.isArray(rows) ? rows : []
          } catch (e) {
            const msg = e instanceof Error ? e.message : ''
            if (/401|403|auth|UNAUTHORIZED/i.test(msg)) {
              await auth.refreshAccessToken()
              try {
                const rows = await listTravelWorkspacesCached({ force: true })
                return Array.isArray(rows) ? rows : []
              } catch {
                /* fall through */
              }
            }
            try {
              const legacy = await getApi().listPlannedTrips()
              return (Array.isArray(legacy) ? legacy : []).map(tripAsWorkspace)
            } catch {
              return []
            }
          }
        }
        remote = await loadRemote()
        if (cancelled) return

        const candidates = filterActivitySwitcherWorkspaces([
          ...remote,
          ...local,
        ])
        const top = candidates[0]
        if (top) {
          let draftToken = top.draft_token
            ? String(top.draft_token)
            : undefined
          let plannedTripId = top.planned_trip_id
            ? String(top.planned_trip_id)
            : undefined
          let { slug, label } = cityFromWorkspace(top)

          if (draftToken) {
            const row = await getApi().getMyTrip(draftToken).catch(() => null)
            if (cancelled) return
            if (row) {
              plannedTripId =
                plannedTripId ||
                (row.source_planned_trip_id
                  ? String(row.source_planned_trip_id)
                  : undefined)
              // Draft seul : enrichir la ville depuis le payload.
              if (!plannedTripId) {
                const pl = (row.payload || {}) as Record<string, unknown>
                const fl = (pl.flight || {}) as Record<string, unknown>
                const cityLabel =
                  String(row.city_name || pl.city || top.city || '').trim() ||
                  null
                const citySlugHint =
                  typeof pl.city_slug === 'string' ? pl.city_slug : cityLabel
                const destIata =
                  String(
                    fl.destination_iata ||
                      pl.destination ||
                      pl.dest_iata ||
                      row.dest_iata ||
                      '',
                  ).trim() || null
                slug = resolveActivityCitySlug({
                  citySlug: citySlugHint || cityLabel,
                  cityLabel,
                  destIata,
                })
                const known = ACTIVITY_CITY_OPTIONS_FR.find(
                  (c) => c.slug === slug,
                )
                label = String(
                  known?.label ||
                    cityLabel ||
                    activityDestinationLabelFr(slug),
                )
              }
            }
          }

          // Planner chargé : ville d’arrivée du trip obligatoire.
          let outDate: string | null = null
          let retDate: string | null = null
          if (plannedTripId) {
            const isDevTrip =
              __DEV__ && String(plannedTripId).startsWith('dev-trip-')
            const guest = isDevTrip ? getGuestTrip(plannedTripId) : null
            const trip =
              guest ||
              (isDevTrip
                ? null
                : await getApi()
                    .getPlannedTrip(plannedTripId)
                    .catch(() => null))
            if (cancelled) return
            if (trip) {
              const arrival = parseAirportCodes(trip.arrival_airport)[0] || ''
              const cityLabel = arrival
                ? cityDisplayNameFr(arrival)
                : String(trip.name || '').replace(/^Weekend\s+/i, '').trim() ||
                  null
              slug = resolveActivityCitySlug({
                citySlug: cityLabel,
                cityLabel,
                destIata: arrival || null,
              })
              const known = ACTIVITY_CITY_OPTIONS_FR.find((c) => c.slug === slug)
              label = String(
                known?.label || cityLabel || activityDestinationLabelFr(slug),
              )
              outDate =
                String(trip.dates_depart?.[0]?.date || '').slice(0, 10) || null
              retDate =
                String(
                  trip.dates_retour?.[trip.dates_retour.length - 1]?.date || '',
                ).slice(0, 10) || null
            }
          } else if (draftToken) {
            const row = await getApi()
              .getMyTrip(draftToken)
              .catch(() => null)
            if (row) {
              outDate = String(row.out_date || '').slice(0, 10) || null
              retDate = String(row.ret_date || '').slice(0, 10) || null
            }
          }

          if (cancelled) return
          setActiveTrip({
            draftToken,
            plannedTripId,
            slug,
            label,
            outDate,
            retDate,
          })
          lockCity(slug)

          if (draftToken) {
            await rememberTrip({ draft_token: draftToken, city: slug })
          }

          const owner = pickTripItemOwner({ draftToken, plannedTripId })
          if (
            hasTripItemOwner(owner) &&
            !(plannedTripId && String(plannedTripId).startsWith('dev-trip-'))
          ) {
            const itemsRes = await getApi()
              .listTripItems(owner)
              .catch(() => null)
            if (cancelled) return
            applyItems(itemsRes?.items)
          } else if (!cancelled) {
            setPlannerCount(0)
            setAddedCodes(new Set())
          }
        } else if (!cancelled) {
          // Aucun planner : filtre de base Paris (1ʳᵉ connexion).
          setActiveTrip(null)
          setPlannerCount(0)
          setAddedCodes(new Set())
          lockCity(routeCity || 'paris')
        }
      } finally {
        if (!cancelled) setTripReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftFromRoute, plannedFromRoute, route.params?.city, authKey, authLoading])

  // Une fois au bootstrap du séjour : aligner la ville. Ensuite le picker
  // peut explorer d’autres villes (comme le web) ; « Sync » ramène au séjour.
  useEffect(() => {
    if (!activeTrip?.slug) {
      syncedCityToTrip.current = false
      if (draftFromRoute || plannedFromRoute || route.params?.city) return
      setCitySlug((prev) => (prev ? prev : 'paris'))
      return
    }
    if (syncedCityToTrip.current) return
    syncedCityToTrip.current = true
    setCitySlug((prev) =>
      prev === activeTrip.slug ? prev : activeTrip.slug,
    )
  }, [
    activeTrip?.slug,
    draftFromRoute,
    plannedFromRoute,
    route.params?.city,
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
    async (slug: string, opts?: { silent?: boolean }) => {
      if (!slug) return
      if (!opts?.silent) setLoading(true)
      setError(null)
      setHeader(null)
      setFallbackHint(null)
      try {
        const res = await getApi().listCityActivities(slug, adults)
        if (!res.ok) {
          const msg =
            res.error === 'unknown_city'
              ? 'Ville non reconnue'
              : String(res.error || '').includes('401') ||
                  String(res.error || '').includes('UNAUTHORIZED')
                ? 'Catalogue activités indisponible'
                : res.error || 'Chargement impossible'
          throw new Error(msg)
        }
        setItems(Array.isArray(res.items) ? res.items : [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur')
        setItems([])
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [adults],
  )

  useEffect(() => {
    if (!tripReady) return
    if (!citySlug) {
      // Sécurité : 1ʳᵉ connexion sans ville → Paris.
      setCitySlug('paris')
      return
    }
    void loadCity(citySlug)
  }, [tripReady, citySlug, loadCity])

  useEffect(() => {
    pendingRef.current = pendingBook
  }, [pendingBook])

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active' && pendingRef.current) setAskBooked(true)
    }
    const sub = AppState.addEventListener('change', onChange)
    return () => sub.remove()
  }, [])

  const track = (event: string, card?: ActivityCardModel | null) => {
    void getApi()
      .trackActivityEvent({
        domain: 'activity',
        event,
        surface: 'tab',
        platform: eventPlatform(),
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
    openInAppBrowser(navigation, url, card.title)
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
      await rememberTrip({
        draft_token: target.draftToken,
        city: tripSlug || citySlug || null,
      })
    }
    if (tripSlug && tripSlug !== citySlug) {
      setCitySlug(tripSlug)
    }
    try {
      const res = await getApi().listTripItems(
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
      await getApi().addTripItem({
        product_code: card.productCode,
        title: card.title,
        product_url: card.productUrl,
        photo_url: card.photoUrl || null,
        ...owner,
        platform: eventPlatform(),
        surface: 'tab',
      })
      track('add', card)
      setPlannerCount((n) => n + 1)
      await bindActiveTrip(target)
      // Après reload items : garder le code même si meta API est en retard.
      if (card.productCode) {
        setAddedCodes((prev) => new Set(prev).add(card.productCode))
      }
      setAddNotice(
        `${ACTIVITY_ADDED_TO_PLANNER_FR(target.label)}. ${ACTIVITY_KEEP_ADDING_FR}`,
      )
      setPendingAdd(null)
      setDetail(null)
    } catch (e) {
      setAddNotice(e instanceof Error ? e.message : 'Ajout impossible')
    } finally {
      setAddBusy(false)
    }
  }

  const openPlanner = () => {
    if (activeTrip?.plannedTripId) {
      navigation.navigate('TripDetail', { tripId: activeTrip.plannedTripId })
      return
    }
    if (activeTrip?.draftToken) {
      navigation.navigate('TripSummary', { draftToken: activeTrip.draftToken })
      return
    }
    navigation.navigate('Main', { screen: 'Planner' })
  }

  const onRefresh = () => {
    setRefreshing(true)
    if (citySlug) void loadCity(citySlug, { silent: true })
    else setRefreshing(false)
  }

  if (!viewUser) {
    const t = (key: string) => translate('fr', key as never)
    return (
      <GuestAuthLanding
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        kicker="ACTIVITÉS"
        title={t('activities.guest.title')}
        lead={t('activities.guest.lead')}
        steps={[
          {
            title: t('activities.guest.step1'),
            detail: t('activities.guest.step1.detail'),
          },
          {
            title: t('activities.guest.step2'),
            detail: t('activities.guest.step2.detail'),
          },
          {
            title: t('activities.guest.step3'),
            detail: t('activities.guest.step3.detail'),
          },
        ]}
        ctaLabel={t('activities.guest.cta')}
        hint={t('activities.guest.hint')}
        loginLoading={loginLoading}
        onLogin={() => {
          void (async () => {
            setLoginLoading(true)
            const { error } = await signInWithGoogle()
            if (error && __DEV__) console.warn('[auth] signIn', error.message)
            setLoginLoading(false)
          })()
        }}
      />
    )
  }

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <FlatList
        ref={listRef}
        data={cards}
        keyExtractor={(c) => c.productCode || c.title}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: spacing.xl,
          paddingBottom: insets.bottom + 120,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.kicker}>{ACTIVITY_PAGE_KICKER_FR}</Text>
            <Text style={styles.title}>{ACTIVITY_PAGE_TITLE_FR}</Text>
            <Text style={styles.subtitle}>{ACTIVITY_PAGE_SUBTITLE_FR}</Text>

            {activeTrip ? (
              <ActivityTripHero
                mode="active"
                cityLabel={activeTrip.label}
                plannerCount={plannerCount}
                outDate={activeTrip.outDate}
                retDate={activeTrip.retDate}
                showSyncCity={
                  Boolean(activeTrip.slug && citySlug && activeTrip.slug !== citySlug)
                }
                onSyncCity={() => setCitySlug(activeTrip.slug)}
                onOpenPlanner={openPlanner}
                onChangeTrip={() => {
                  setPendingAdd(null)
                  setTripPickerOpen(true)
                }}
              />
            ) : (
              <ActivityTripHero
                mode="empty"
                onBrowseTrips={() => navigation.navigate('Deals')}
                onChooseTrip={() => {
                  setPendingAdd(null)
                  setTripPickerOpen(true)
                }}
              />
            )}

            {addNotice ? (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>{addNotice}</Text>
                {activeTrip && addNotice.startsWith('Ajouté') ? (
                  <Pressable onPress={openPlanner}>
                    <Text style={styles.noticeLink}>{ACTIVITY_SEE_PLANNER_FR}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            <Text style={styles.label}>Ville</Text>
            <View style={{ marginBottom: spacing.md }}>
              <ActivityCityPicker
                valueSlug={citySlug || 'paris'}
                valueLabel={
                  activeTrip && activeTrip.slug === citySlug
                    ? activeTrip.label
                    : activityDestinationLabelFr(citySlug || 'paris')
                }
                onChange={(city) => {
                  setCitySlug(city.slug || 'paris')
                }}
              />
            </View>

            <View style={styles.searchShell}>
              <View style={styles.searchIconWrap} accessibilityElementsHidden>
                <View style={styles.searchIconCircle} />
                <View style={styles.searchIconHandle} />
              </View>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={ACTIVITY_SEARCH_PLACEHOLDER_CITY_FR(
                  activityDestinationLabelFr(citySlug),
                )}
                placeholderTextColor={colors.muted}
                style={styles.searchInput}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                accessibilityLabel="Rechercher une activité"
              />
              {searchQuery ? (
                <Pressable
                  onPress={() => setSearchQuery('')}
                  hitSlop={8}
                  style={styles.searchClearBtn}
                  accessibilityLabel="Effacer la recherche"
                >
                  <Text style={styles.searchClearX}>×</Text>
                </Pressable>
              ) : (
                <View style={styles.searchClearSpacer} />
              )}
            </View>
            {searchQuery.trim() ? (
              <Text style={styles.searchHint}>
                {cards.length === 0
                  ? `Aucun résultat pour « ${searchQuery.trim()} »`
                  : `${cards.length} résultat${cards.length > 1 ? 's' : ''} à ${activityDestinationLabelFr(citySlug)}`}
              </Text>
            ) : null}

            <View style={styles.catBlock}>
              <View style={styles.catHeader}>
                <View>
                  <Text style={styles.catKicker}>AFFINER</Text>
                  <Text style={styles.catTitle}>Catégories</Text>
                </View>
                {categories.length ? (
                  <Pressable onPress={() => setCategories([])} hitSlop={8}>
                    <Text style={styles.catClear}>Toutes</Text>
                  </Pressable>
                ) : null}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.catRail}
              >
                {ACTIVITY_CATEGORY_TAGS_FR.map((t) => {
                  const on = categories.includes(t.id)
                  return (
                    <Pressable
                      key={t.id}
                      onPress={() =>
                        setCategories((prev) =>
                          toggleActivityCategory(prev, t.id),
                        )
                      }
                      style={[styles.catCard, on && styles.catCardOn]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      <View
                        style={[styles.catIcon, on && styles.catIconOn]}
                      >
                        <Text style={styles.catEmoji}>{t.emoji}</Text>
                      </View>
                      <Text
                        style={[styles.catLabel, on && styles.catLabelOn]}
                        numberOfLines={2}
                      >
                        {t.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </ScrollView>
            </View>

            {header ? <Text style={styles.count}>{header}</Text> : null}
            {fallbackHint ? (
              <View style={styles.hintBox}>
                <Text style={styles.hintText}>{fallbackHint}</Text>
              </View>
            ) : null}

            {!loading && !error && cards.length > 0 ? (
              <View style={styles.countRow}>
                <Text style={styles.count}>
                  {cards.length} activité{cards.length > 1 ? 's' : ''}
                </Text>
                <View style={styles.sortRowCompact}>
                  {(
                    Object.keys(ACTIVITY_SORT_LABEL_FR) as Array<
                      keyof typeof ACTIVITY_SORT_LABEL_FR
                    >
                  ).map((k) => (
                    <Pressable
                      key={k}
                      onPress={() => setSort(k)}
                      style={[styles.sortChipSm, sort === k && styles.sortChipActive]}
                    >
                      <Text
                        style={[
                          styles.sortChipTextSm,
                          sort === k && styles.sortChipTextActive,
                        ]}
                      >
                        {ACTIVITY_SORT_LABEL_FR[k]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            {loading && !refreshing ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
            ) : null}
          </View>
        }
        renderItem={({ item: c }) => (
            <ActivityCard
              card={c}
              onPress={() => setDetail(c)}
              onBook={() => onBook(c)}
              onAdd={() => onAddToPlanner(c)}
              addLabel={ACTIVITY_ADD_TO_PLANNER_FR}
              addDisabled={addBusy}
              liked={isLiked(c.productCode)}
              onToggleLike={() => void toggleLike(c)}
              added={Boolean(c.productCode && addedCodes.has(c.productCode))}
            />
        )}
        ListEmptyComponent={
          loading ? null : error ? (
            <View style={[styles.emptyCard, shadow.soft]}>
              <Text style={styles.emptyTitle}>Oups</Text>
              <Text style={styles.emptyBody}>{error}</Text>
              <Pressable
                onPress={() => void loadCity(citySlug || 'paris')}
                style={styles.retryBtn}
              >
                <Text style={styles.retryText}>{ACTIVITY_EMPTY_RETRY_FR}</Text>
              </Pressable>
            </View>
          ) : (
            (() => {
              const filtered = items.length > 0
              const cityLabel = activityDestinationLabelFr(citySlug)
              return (
                <ImageBackground
                  source={{
                    uri: cityImageUrl(cityLabel || citySlug || null),
                  }}
                  style={[styles.emptyHero, shadow.soft]}
                  imageStyle={styles.emptyHeroImage}
                >
                  <LinearGradient
                    colors={[
                      'rgba(20,12,8,0.28)',
                      'rgba(20,12,8,0.55)',
                      'rgba(20,12,8,0.92)',
                    ]}
                    locations={[0, 0.4, 1]}
                    style={styles.emptyHeroOverlay}
                  >
                    <Text style={styles.emptyKicker}>
                      {ACTIVITY_EMPTY_KICKER_FR}
                    </Text>
                    <Text style={styles.emptyHeroTitle}>
                      {filtered
                        ? ACTIVITY_EMPTY_FILTERS_TITLE_FR
                        : ACTIVITY_EMPTY_TITLE_FR(cityLabel)}
                    </Text>
                    <Text style={styles.emptyHeroBody}>
                      {filtered
                        ? ACTIVITY_EMPTY_FILTERS_BODY_FR
                        : ACTIVITY_EMPTY_BODY_FR}
                    </Text>
                    <View style={styles.emptyActions}>
                      {filtered ? (
                        <Pressable
                          onPress={() => {
                            setCategories([])
                            setSearchQuery('')
                          }}
                          style={({ pressed }) => [
                            styles.emptyBtnPrimary,
                            pressed && { opacity: 0.92 },
                          ]}
                        >
                          <Text style={styles.emptyBtnPrimaryText}>
                            {ACTIVITY_EMPTY_CLEAR_FILTERS_FR}
                          </Text>
                        </Pressable>
                      ) : (
                        <>
                          <Pressable
                            onPress={() =>
                              listRef.current?.scrollToOffset({
                                offset: 0,
                                animated: true,
                              })
                            }
                            style={({ pressed }) => [
                              styles.emptyBtnPrimary,
                              pressed && { opacity: 0.92 },
                            ]}
                          >
                            <Text style={styles.emptyBtnPrimaryText}>
                              {ACTIVITY_EMPTY_CHANGE_CITY_FR}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => navigation.navigate('Deals')}
                            style={({ pressed }) => [
                              styles.emptyBtnGhost,
                              pressed && { opacity: 0.9 },
                            ]}
                          >
                            <Text style={styles.emptyBtnGhostText}>
                              {ACTIVITY_EMPTY_SEE_SEJOURS_FR}
                            </Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  </LinearGradient>
                </ImageBackground>
              )
            })()
          )
        }
        showsVerticalScrollIndicator={false}
      />

      <ActivityDetailSheet
        visible={!!detail}
        card={detail}
        adults={adults}
        addBusy={addBusy}
        alreadyAdded={Boolean(
          detail?.productCode && addedCodes.has(detail.productCode),
        )}
        addLabel={ACTIVITY_ADD_TO_PLANNER_FR}
        onBook={(c) => onBook(c)}
        onAdd={(c) => onAddToPlanner(c)}
        onClose={() => setDetail(null)}
      />

      <ActivityPlannerPicker
        visible={Boolean(pendingAdd) || tripPickerOpen}
        busy={addBusy}
        preferredPlannedTripId={activeTrip?.plannedTripId}
        preferredDraftToken={activeTrip?.draftToken}
        title={pendingAdd ? undefined : ACTIVITY_CHOOSE_TRIP_FR}
        hint={
          pendingAdd
            ? undefined
            : ACTIVITY_SWITCH_TRIP_HINT_FR
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
        onOpenPlanner={() => {
          setPendingAdd(null)
          setTripPickerOpen(false)
          navigation.navigate('Main', { screen: 'Planner' })
        }}
        onSignIn={() => {
          setPendingAdd(null)
          setTripPickerOpen(false)
          navigation.navigate('Main', { screen: 'Profile' })
        }}
      />

      <Modal visible={askBooked && !!pendingBook} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={[styles.modalCard, shadow.soft]}>
            <Text style={styles.modalTitle}>
              {ACTIVITY_BOOKED_PROMPT_FR(pendingBook?.title || 'cette activité')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                style={[styles.modalCta, { flex: 1, backgroundColor: colors.success }]}
                onPress={() => {
                  track('booked_yes', pendingBook)
                  setPendingBook(null)
                  setAskBooked(false)
                }}
              >
                <Text style={styles.modalCtaText}>Oui</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSecondary, { flex: 1 }]}
                onPress={() => {
                  track('booked_no', pendingBook)
                  setPendingBook(null)
                  setAskBooked(false)
                }}
              >
                <Text style={styles.modalSecondaryText}>Pas encore</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: { marginBottom: spacing.lg, gap: 4 },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.primary,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 32,
    letterSpacing: -1,
    color: colors.ink,
    includeFontPadding: false,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 12,
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
    includeFontPadding: false,
  },
  noticeBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
    padding: 12,
    marginBottom: spacing.md,
    gap: 6,
  },
  noticeText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primaryInk,
  },
  noticeLink: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  catBlock: {
    marginBottom: spacing.md,
  },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  catKicker: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.primary,
    marginBottom: 2,
  },
  catTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 14,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  catClear: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.primary,
  },
  catRail: {
    gap: 8,
    paddingRight: 8,
  },
  catCard: {
    width: 124,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  catCardOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  catIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catIconOn: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  catEmoji: {
    fontSize: 15,
    lineHeight: 18,
  },
  catLabel: {
    fontFamily: fonts.extrabold,
    fontSize: 12,
    color: colors.ink,
    lineHeight: 15,
  },
  catLabelOn: {
    color: colors.white,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
  },
  searchShell: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.white,
    minHeight: 48,
    paddingLeft: 12,
    paddingRight: 6,
    gap: 8,
  },
  searchIconWrap: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchIconCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.muted,
  },
  searchIconHandle: {
    position: 'absolute',
    width: 7,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.muted,
    right: 1,
    bottom: 2,
    transform: [{ rotate: '45deg' }],
  },
  searchInput: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
  },
  searchClearBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchClearX: {
    fontFamily: fonts.bold,
    fontSize: 20,
    lineHeight: 22,
    color: colors.primaryInk,
    marginTop: -1,
  },
  searchClearSpacer: { width: 8 },
  searchHint: {
    marginTop: -8,
    marginBottom: spacing.md,
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.muted,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: spacing.sm,
    marginTop: 4,
  },
  count: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.inkSoft,
    flexShrink: 1,
  },
  sortRowCompact: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sortChipSm: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  sortChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryMuted,
  },
  sortChipTextSm: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.muted,
  },
  sortChipTextActive: { color: colors.primaryInk },
  hintBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
  },
  hintText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.primaryInk,
  },
  emptyCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: 'center',
    gap: 8,
  },
  emptyHero: {
    minHeight: 220,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  emptyHeroImage: {
    borderRadius: radius.lg,
  },
  emptyHeroOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.lg,
    minHeight: 220,
    gap: 6,
  },
  emptyKicker: {
    fontFamily: fonts.extrabold,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 2,
  },
  emptyHeroTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.white,
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  emptyHeroBody: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: 'rgba(255,255,255,0.82)',
    lineHeight: 20,
    marginTop: 2,
  },
  emptyActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  emptyBtnPrimary: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 40,
    justifyContent: 'center',
  },
  emptyBtnPrimaryText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.ink,
  },
  emptyBtnGhost: {
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 40,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  emptyBtnGhostText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.white,
  },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    color: colors.ink,
  },
  emptyBody: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: 8,
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  retryText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  modalBg: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    gap: 10,
    paddingBottom: 36,
  },
  modalTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 20,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  modalMeta: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
  },
  modalCta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  modalCtaText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  modalSecondary: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalSecondaryText: {
    fontFamily: fonts.semibold,
    color: colors.ink,
    fontSize: 14,
  },
})
