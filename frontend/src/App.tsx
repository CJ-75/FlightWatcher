import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { flushSync } from 'react-dom'
import { ScanResponse, TripResponse, ScanRequest, DateAvecHoraire, Destination, Airport, EnrichedTripResponse } from './types'
import { 
  saveSearch, getSavedSearches, deleteSearch, updateSearchLastUsed,
  saveFavorite, getFavorites, deleteFavorite, updateFavoriteStatus,
  saveExcludedDestinations,
  updateSearchAutoCheck, updateSearchLastCheckResults, updateSearchPassengers,
  getActiveAutoChecks,
  setDevMode, getDevMode, saveNewResults, getNewResultsForSearch, clearNewResults,
  toggleFavoriteArchived,
  isFavorite
} from './utils/storage'
import type { NewResult } from './utils/storage'
import type { SavedSearch, SavedFavorite } from './utils/storage'
import { UserMenu } from './components/UserMenu'
import { getCurrentUser, onAuthStateChange } from './lib/supabase'
import { SimpleSearch } from './components/SimpleSearch'
import { DealsTab } from './components/DealsTab'
import { HomeDealsTeaser } from './components/HomeDealsTeaser'
import { SiteFooter } from './components/SiteFooter'
import { DealCard } from './components/DealCard'
import { DealDetailModal } from './components/DealDetailModal'
import { PlannerTab } from './components/PlannerTab'
import { FavoritesGuestLanding } from './components/FavoritesGuestLanding'
import { AlertsGuestLanding } from './components/AlertsGuestLanding'
import { PassengerStepper } from './components/PassengerStepper'
import type { LikedDeal, TravelDeal } from './types'
import { DestinationCard } from './components/DestinationCard'
import { RouletteMode } from './components/RouletteMode'
import { TripComboWizard } from './components/TripComboWizard'
import { LoadingSpinner } from './components/LoadingSpinner'
import { Calendar } from './components/Calendar'
import { SaveSearchModal } from './components/SaveSearchModal'
import { Toast } from './components/Toast'
import { motion } from 'framer-motion'
import { getSessionId } from './utils/session'
import {
  OPEN_SEARCH_EVENT,
  consumeSearchPrefill,
  type SearchPrefill,
} from './utils/searchPrefill'
import { useI18n } from './contexts/I18nContext'
import { getApiClient } from './utils/apiClient'
import { getAppConfig } from './utils/configCache'
import { prefetchHotelCacheForTrips } from './utils/prefetchHotelCache'
import { useAirports } from './hooks/useAirports'
import { useDestinations } from './hooks/useDestinations'
import {
  buildBookingUrl,
  findCityGroupByCodes,
  groupAirportsByCity,
  parseAirportCodes,
  resolvePopularAirports,
} from '@flightwatcher/shared'
import { CityAirportSelect } from './components/CityAirportSelect'

type Tab = 'search' | 'deals' | 'planner' | 'alerts' | 'saved'

const TAB_PATH: Record<Tab, string> = {
  search: '/recherche',
  deals: '/deals',
  planner: '/planner',
  alerts: '/alertes',
  saved: '/favoris',
}

function tabFromPath(pathname: string): Tab | null {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (p === '/recherche' || p === '/search') return 'search'
  if (p === '/deals') return 'deals'
  if (p === '/planner') return 'planner'
  if (p === '/alertes' || p === '/alerts') return 'alerts'
  if (p === '/favoris' || p === '/saved') return 'saved'
  return null
}

function Dashboard() {
  const { t } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()
  const [activeTab, setActiveTabState] = useState<Tab>(() => {
    const fromPath = tabFromPath(window.location.pathname)
    if (fromPath) return fromPath
    try {
      const saved = sessionStorage.getItem('fw_active_tab')
      if (saved === 'planner' || saved === 'deals' || saved === 'saved' || saved === 'search' || saved === 'alerts') {
        sessionStorage.removeItem('fw_active_tab')
        return saved as Tab
      }
    } catch {
      /* ignore */
    }
    return 'search'
  })

  const setActiveTab = useCallback(
    (tab: Tab) => {
      setActiveTabState(tab)
      const path = TAB_PATH[tab]
      const search = tab === 'deals' ? location.search : ''
      if (location.pathname !== path || (tab !== 'deals' && location.search)) {
        navigate({ pathname: path, search: tab === 'deals' ? location.search : '' }, { replace: false })
      }
    },
    [navigate, location.pathname, location.search],
  )

  // After login restore: sessionStorage tab may disagree with URL
  useEffect(() => {
    const fromPath = tabFromPath(location.pathname)
    if (fromPath && fromPath !== activeTab) {
      // Prefer URL when user used back/forward or deep link
      setActiveTabState(fromPath)
      return
    }
    if (!fromPath && activeTab) {
      navigate(TAB_PATH[activeTab], { replace: true })
    }
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps -- sync from URL only

  // If tab was restored from sessionStorage on /recherche, push the right path once
  useEffect(() => {
    const fromPath = tabFromPath(location.pathname)
    if (fromPath === activeTab) return
    if (activeTab && location.pathname === '/recherche' && activeTab !== 'search') {
      navigate(
        {
          pathname: TAB_PATH[activeTab],
          search: activeTab === 'deals' ? location.search : '',
        },
        { replace: true },
      )
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- mount only
  const [loading, setLoading] = useState(false)
  const [dealsUiEnabled, setDealsUiEnabled] = useState(true)
  const [data, setData] = useState<ScanResponse | null>(null)
  const [simpleResults, setSimpleResults] = useState<EnrichedTripResponse[]>([])
  const [originFilter, setOriginFilter] = useState<Set<string> | null>(null)
  const [showRoulette, setShowRoulette] = useState(false)
  const [rouletteBudget, setRouletteBudget] = useState(100)
  const [error, setError] = useState<string | null>(null)
  const [bookingTrip, setBookingTrip] = useState<EnrichedTripResponse | null>(null)
  const [currentSearchEventId, setCurrentSearchEventId] = useState<string | null>(null) // ID de l'événement de recherche actuel
  const [lastSearchInfo, setLastSearchInfo] = useState<{
    datePreset: string | null
    airport: string
    budget: number
    passengers: number
    datesDepart: DateAvecHoraire[]
    datesRetour: DateAvecHoraire[]
    excludedDestinations: string[]
  } | null>(null)
  const resultsSectionRef = useRef<HTMLDivElement>(null)
  const { airports, isValidAirportCode } = useAirports(true)
  const {
    destinations,
    loading: loadingDestinations,
    load: loadDestinationsForAirport,
  } = useDestinations()
  const [showSaveSearchModal, setShowSaveSearchModal] = useState(false)
  const [isSavingSearch, setIsSavingSearch] = useState(false)
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success')
  const [favorites, setFavorites] = useState<SavedFavorite[]>([])
  
  // États pour les paramètres de recherche
  const [aeroportDepart, setAeroportDepart] = useState('')
  const [datesDepart, setDatesDepart] = useState<DateAvecHoraire[]>([])
  const [datesRetour, setDatesRetour] = useState<DateAvecHoraire[]>([])
  const [budgetMax, setBudgetMax] = useState(100)
  const [limiteAllers, setLimiteAllers] = useState(50)
  const [currentRequest, setCurrentRequest] = useState<ScanRequest | null>(null)
  const [destinationsExclues, setDestinationsExclues] = useState<string[]>([])
  const [searchPassengers, setSearchPassengers] = useState(1)
  const [searchLoadToken, setSearchLoadToken] = useState(0)
  const [searchSeed, setSearchSeed] = useState<{
    token: number
    airport: string
    dates_depart: DateAvecHoraire[]
    dates_retour: DateAvecHoraire[]
    budget: number
    passengers: number
    autoSearch?: boolean
  } | null>(null)
  const isLoadingFromStorage = useRef(false)
  const loadingSavedSearchRef = useRef(false)
  const shouldScrollToResults = useRef(false)

  const handleScan = async (request?: ScanRequest) => {
    const req = request || {
      aeroport_depart: aeroportDepart,
      dates_depart: datesDepart,
      dates_retour: datesRetour,
      budget_max: budgetMax,
      limite_allers: limiteAllers,
      destinations_exclues: destinationsExclues.length > 0 ? destinationsExclues : undefined
    }

    // Validation de l'aéroport de départ
    if (!req.aeroport_depart || req.aeroport_depart.trim() === '') {
      setError('⚠️ Veuillez sélectionner un aéroport de départ avant de lancer le scan')
      return
    }

    if (!isValidAirportCode(req.aeroport_depart)) {
      setError('⚠️ Veuillez sélectionner un aéroport valide depuis la liste avant de lancer le scan')
      return
    }

    if (!req.dates_depart || req.dates_depart.length === 0 || !req.dates_retour || req.dates_retour.length === 0) {
      setError('Veuillez sélectionner au moins une date de départ et une date de retour')
      return
    }

    setLoading(true)
    setError(null)
    setData(null)
    setCurrentRequest(req)

    try {
      const result = await getApiClient().scan(req)
      setData(result)
      // Toujours revenir à l'onglet recherche pour voir les résultats
      setActiveTab('search')
      // Scroller vers la section des résultats après un court délai
      if (result.resultats && result.resultats.length > 0) {
        setTimeout(() => {
          resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 300)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSearch = async () => {
    // Construire la requête à partir de currentRequest ou des informations disponibles
    let requestToSave: ScanRequest | null = currentRequest

    // Si currentRequest n'est pas disponible, essayer de le construire depuis lastSearchInfo
    if (!requestToSave && lastSearchInfo) {
      requestToSave = {
        aeroport_depart: lastSearchInfo.airport,
        dates_depart: lastSearchInfo.datesDepart,
        dates_retour: lastSearchInfo.datesRetour,
        budget_max: lastSearchInfo.budget,
        passengers: lastSearchInfo.passengers || 1,
        limite_allers: limiteAllers,
        destinations_exclues: lastSearchInfo.excludedDestinations.length > 0 ? lastSearchInfo.excludedDestinations : undefined
      }
    }

    // Si toujours pas de requête, essayer depuis les états actuels
    if (!requestToSave && datesDepart.length > 0 && datesRetour.length > 0) {
      requestToSave = {
        aeroport_depart: aeroportDepart,
        dates_depart: datesDepart,
        dates_retour: datesRetour,
        budget_max: budgetMax,
        limite_allers: limiteAllers,
        destinations_exclues: destinationsExclues.length > 0 ? destinationsExclues : undefined
      }
    }

    if (!requestToSave) {
      setError(t('saved.noSearchToSave'))
      return
    }

    const user = await getCurrentUser()
    if (!user) {
      alert(t('saved.loginRequired'))
      return
    }

    // Sauvegarder temporairement la requête pour la modal
    setCurrentRequest(requestToSave)
    setShowSaveSearchModal(true)
  }

  const handleConfirmSaveSearch = async (name: string) => {
    if (!currentRequest) {
      setError(t('saved.noSearchToSave'))
      return
    }

    setIsSavingSearch(true)
    try {
      // Sauvegarder la recherche avec les résultats actuels s'ils existent
      const searchToSave = {
        name,
        request: currentRequest,
        lastCheckResults: simpleResults.length > 0 ? simpleResults : undefined,
        lastCheckedAt: simpleResults.length > 0 ? new Date().toISOString() : undefined
      };
      
      console.log('💾 Sauvegarde de la recherche avec résultats:', {
        name,
        resultsCount: simpleResults.length,
        hasResults: simpleResults.length > 0
      });
      
      await saveSearch(searchToSave)
      // Afficher un message de succès temporaire
      setSaveSuccessMessage(t('saved.saveSuccess'))
      setError(null)
      // Masquer le message après 3 secondes
      setTimeout(() => setSaveSuccessMessage(null), 3000)
      // La modal se fermera automatiquement via onClose dans SaveSearchModal
    } catch (error) {
      setError(t('saved.saveError'))
      console.error(error)
      throw error // Pour que la modal puisse afficher l'erreur
    } finally {
      setIsSavingSearch(false)
    }
  }

  const handleLoadSearch = async (
    savedSearch: SavedSearch,
    options?: { editOnly?: boolean },
  ) => {
    const req = savedSearch.request
    const excluded = req.destinations_exclues || []
    const airport = (req.aeroport_depart || 'BVA').trim().toUpperCase()

    const normalizeDates = (raw: unknown): DateAvecHoraire[] => {
      let list: unknown = raw
      if (typeof list === 'string') {
        try {
          list = JSON.parse(list)
        } catch {
          return []
        }
      }
      if (!Array.isArray(list)) return []
      return list
        .map((item) => {
          if (typeof item === 'string') {
            const date = item.trim()
            if (!date) return null
            return { date, heure_min: '06:00', heure_max: '23:59' } as DateAvecHoraire
          }
          if (!item || typeof item !== 'object') return null
          const d = item as Record<string, unknown>
          const date = String(d.date || d.Date || '').trim()
          if (!date) return null
          return {
            date,
            heure_min: String(d.heure_min || d.heureMin || '06:00'),
            heure_max: String(d.heure_max || d.heureMax || '23:59'),
          } as DateAvecHoraire
        })
        .filter((d): d is DateAvecHoraire => !!d)
    }

    const datesDepartLoaded = normalizeDates(req.dates_depart)
    const datesRetourLoaded = normalizeDates(req.dates_retour)
    const passengersLoaded =
      req.passengers && req.passengers > 0 ? req.passengers : 1
    const budgetLoaded = req.budget_max || 100
    const nextToken = searchLoadToken + 1

    loadingSavedSearchRef.current = true
    isLoadingFromStorage.current = true

    // flushSync: le formulaire Recherche monte avec les dates déjà en state
    flushSync(() => {
      setAeroportDepart(airport)
      setDatesDepart(datesDepartLoaded)
      setDatesRetour(datesRetourLoaded)
      setBudgetMax(budgetLoaded)
      setLimiteAllers(req.limite_allers || 50)
      setSearchPassengers(passengersLoaded)
      setDestinationsExclues(excluded)
      setCurrentRequest({
        ...req,
        aeroport_depart: airport,
        dates_depart: datesDepartLoaded,
        dates_retour: datesRetourLoaded,
        passengers: passengersLoaded,
        budget_max: budgetLoaded,
      })
      setSearchLoadToken(nextToken)
      setSearchSeed({
        token: nextToken,
        airport,
        dates_depart: datesDepartLoaded,
        dates_retour: datesRetourLoaded,
        budget: budgetLoaded,
        passengers: passengersLoaded,
      })
      setError(null)

      const editOnly = options?.editOnly === true
      if (!editOnly && savedSearch.lastCheckResults && savedSearch.lastCheckResults.length > 0) {
        const enrichedResults: EnrichedTripResponse[] = savedSearch.lastCheckResults
          .map((trip: any) => {
            if (!trip.aller || !trip.retour) return null
            return { ...trip } as EnrichedTripResponse
          })
          .filter((trip): trip is EnrichedTripResponse => trip !== null)

        if (enrichedResults.length > 0) {
          setSimpleResults(enrichedResults)
          setLastSearchInfo({
            datePreset: 'flexible',
            airport,
            budget: budgetLoaded,
            passengers: passengersLoaded,
            datesDepart: datesDepartLoaded,
            datesRetour: datesRetourLoaded,
            excludedDestinations: excluded,
          })
          shouldScrollToResults.current = true
        } else {
          setSimpleResults([])
          setLastSearchInfo(null)
        }
      } else {
        setSimpleResults([])
        setLastSearchInfo(null)
        shouldScrollToResults.current = false
      }
    })

    setActiveTab('search')

    window.setTimeout(() => {
      setDestinationsExclues(excluded)
      loadingSavedSearchRef.current = false
      isLoadingFromStorage.current = false
    }, 200)

    void updateSearchLastUsed(savedSearch.id)
  }

  useEffect(() => {
    void getAppConfig().then((cfg) => {
      if (!cfg) return
      const on = cfg.ui_enabled !== false
      setDealsUiEnabled(on)
      if (!on && activeTab === 'deals') setActiveTab('search')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap flag once
  }, [])

  // Lot F — deep link hôtel depuis Mon voyage
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('deal')) {
        setActiveTab('deals')
      }
    } catch {
      /* ignore */
    }
  }, [])

  // Lot E / Affiner dates — Deals → Search prérempli (+ auto inspire si dates)
  useEffect(() => {
    const day = (ymd: string): DateAvecHoraire => ({
      date: ymd.slice(0, 10),
      heure_min: '06:00',
      heure_max: '23:59',
    })

    const applyPrefill = (prefill: SearchPrefill | null) => {
      if (!prefill) return
      const origin = prefill.origin
        ? String(prefill.origin).trim().toUpperCase()
        : ''
      if (origin) setAeroportDepart(origin)

      const pax =
        prefill.adults && prefill.adults >= 1
          ? Math.min(6, Math.max(1, Number(prefill.adults)))
          : null
      if (pax) setSearchPassengers(pax)

      const fromArrays =
        Array.isArray(prefill.dates_depart) &&
        Array.isArray(prefill.dates_retour) &&
        prefill.dates_depart.length > 0 &&
        prefill.dates_retour.length > 0

      const out = prefill.outbound?.slice(0, 10)
      const ret = prefill.inbound?.slice(0, 10)
      const hasSingle = Boolean(out && ret && ret > out)

      if (fromArrays || hasSingle) {
        const dates_depart = fromArrays
          ? prefill.dates_depart!.map((d) => ({
              date: String(d.date).slice(0, 10),
              heure_min: d.heure_min || '06:00',
              heure_max: d.heure_max || '23:59',
            }))
          : [day(out!)]
        const dates_retour = fromArrays
          ? prefill.dates_retour!.map((d) => ({
              date: String(d.date).slice(0, 10),
              heure_min: d.heure_min || '06:00',
              heure_max: d.heure_max || '23:59',
            }))
          : [day(ret!)]
        const labelOut = dates_depart[0]?.date || out || '?'
        const labelRet =
          dates_retour[dates_retour.length - 1]?.date || ret || '?'
        setSearchLoadToken((n) => {
          const nextToken = n + 1
          setDatesDepart(dates_depart)
          setDatesRetour(dates_retour)
          setSearchSeed({
            token: nextToken,
            airport: origin || aeroportDepart,
            dates_depart,
            dates_retour,
            budget: budgetMax,
            passengers: pax || searchPassengers,
            autoSearch: Boolean(prefill.autoSearch && origin),
          })
          return nextToken
        })
        setToastType('info')
        setToastMessage(
          prefill.autoSearch
            ? `Recherche live ${labelOut} → ${labelRet}…`
            : `Dates ${labelOut} → ${labelRet} prêtes — lance le scan.`,
        )
      } else {
        if (pax) setSearchLoadToken((n) => n + 1)
        const destLabel = prefill.city || prefill.destination
        if (destLabel) {
          setToastType('info')
          setToastMessage(
            `Recherche pour ${destLabel} — choisis tes dates puis lance le scan.`,
          )
        }
      }
      setActiveTab('search')
    }

    const onOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<SearchPrefill>).detail
      applyPrefill(detail || consumeSearchPrefill())
    }
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen)
    applyPrefill(consumeSearchPrefill())
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, onOpen)
    // intentionally mount-only; setters are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recentrer la vue sur les résultats (pas le formulaire) dès qu'ils sont prêts
  useEffect(() => {
    if (!shouldScrollToResults.current || activeTab !== 'search' || simpleResults.length === 0) {
      return
    }
    if (loading) return // wait until skeleton → results swap
    let cancelled = false
    const run = () => {
      if (cancelled || !resultsSectionRef.current) return
      resultsSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
      shouldScrollToResults.current = false
    }
    // Double rAF + short delay: form collapses, results mount, layout settles
    const t = window.setTimeout(() => {
      requestAnimationFrame(() => requestAnimationFrame(run))
    }, 80)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [activeTab, simpleResults.length, loading])

  const handleSaveFavorite = async (trip: TripResponse) => {
    if (!currentRequest) {
      setToastMessage('Impossible de sauvegarder le favori')
      setToastType('error')
      return
    }
    
    const user = await getCurrentUser()
    if (!user) {
      setToastMessage('Veuillez vous connecter pour sauvegarder un favori')
      setToastType('error')
      return
    }
    
    // Vérifier si c'est déjà un favori
    const isFav = favorites.some(f => 
      f.trip.destination_code === trip.destination_code &&
      f.trip.aller.departureTime === trip.aller.departureTime &&
      f.trip.retour.departureTime === trip.retour.departureTime
    )
    
    if (isFav) {
      // Retirer des favoris
      const favoriteToDelete = favorites.find(f => 
        f.trip.destination_code === trip.destination_code &&
        f.trip.aller.departureTime === trip.aller.departureTime &&
        f.trip.retour.departureTime === trip.retour.departureTime
      )
      
      if (favoriteToDelete) {
        try {
          await deleteFavorite(favoriteToDelete.id)
          // Recharger les favoris pour mettre à jour l'état
          const updatedFavorites = await getFavorites()
          setFavorites(updatedFavorites)
          setToastMessage('Voyage retiré des favoris')
          setToastType('success')
        } catch (error) {
          setToastMessage('Erreur lors de la suppression')
          setToastType('error')
          console.error(error)
        }
      }
    } else {
      // Ajouter aux favoris
      try {
        await saveFavorite(trip, currentRequest)
        // Recharger les favoris pour mettre à jour l'état
        const updatedFavorites = await getFavorites()
        setFavorites(updatedFavorites)
        setToastMessage('Voyage ajouté aux favoris !')
        setToastType('success')
      } catch (error) {
        setToastMessage('Erreur lors de la sauvegarde')
        setToastType('error')
        console.error(error)
      }
    }
  }

  const handleCheckFavorite = async (favorite: SavedFavorite) => {
    setLoading(true)
    try {
      const result = await getApiClient().scan(favorite.searchRequest)
      
      // Vérifier si le voyage est toujours présent
      const isStillValid = result.resultats.some(r => 
        r.aller.flightNumber === favorite.trip.aller.flightNumber &&
        r.aller.departureTime === favorite.trip.aller.departureTime &&
        r.retour.flightNumber === favorite.trip.retour.flightNumber &&
        r.retour.departureTime === favorite.trip.retour.departureTime
      )
      
      updateFavoriteStatus(favorite.id, isStillValid)
      setToastMessage(isStillValid ? 'Le voyage est toujours disponible !' : 'Le voyage n\'est plus disponible')
      setToastType(isStillValid ? 'success' : 'error')
    } catch (err) {
      setToastMessage(err instanceof Error ? err.message : 'Erreur lors de la vérification')
      setToastType('error')
    } finally {
      setLoading(false)
    }
  }

  const addDate = (
    dates: DateAvecHoraire[], 
    setDates: (d: DateAvecHoraire[]) => void, 
    dateStr: string,
    heureMin: string = '00:00',
    heureMax: string = '23:59'
  ) => {
    if (dateStr && !dates.some(d => d.date === dateStr)) {
      setDates([...dates, { date: dateStr, heure_min: heureMin, heure_max: heureMax }].sort((a, b) => a.date.localeCompare(b.date)))
    }
  }

  const removeDate = (dates: DateAvecHoraire[], setDates: (d: DateAvecHoraire[]) => void, dateStr: string) => {
    setDates(dates.filter(d => d.date !== dateStr))
  }

  const updateHoraire = (
    dates: DateAvecHoraire[],
    setDates: (d: DateAvecHoraire[]) => void,
    dateStr: string,
    field: 'heure_min' | 'heure_max',
    value: string
  ) => {
    setDates(dates.map(d => d.date === dateStr ? { ...d, [field]: value } : d))
  }

  // Helper pour convertir getDay() en numérotation basée sur lundi (1=lundi, 7=dimanche)
  const getDayOfWeekMondayBased = (date: Date): number => {
    // getDay() retourne 0=dimanche, 1=lundi, ..., 6=samedi
    // On veut 1=lundi, 2=mardi, ..., 7=dimanche
    const jsDay = date.getDay(); // 0=dimanche, 1=lundi, ..., 6=samedi
    // Conversion: dimanche(0) -> 7, lundi(1) -> 1, mardi(2) -> 2, ..., samedi(6) -> 6
    return jsDay === 0 ? 7 : jsDay;
  };

  const formatDateFr = (dateStr: string | undefined | null) => {
    if (!dateStr) return 'Date non disponible';
    
    // Parser la date manuellement pour éviter les problèmes de fuseau horaire
    // dateStr peut être au format "YYYY-MM-DD" ou ISO datetime string
    let date: Date;
    if (dateStr.includes('T')) {
      // Format ISO datetime, utiliser directement
      date = new Date(dateStr);
    } else {
      // Format "YYYY-MM-DD", parser manuellement
      const [year, month, day] = dateStr.split('-').map(Number);
      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        return 'Date invalide';
      }
      date = new Date(year, month - 1, day); // month - 1 car les mois commencent à 0
    }
    
    // Vérifier que la date est valide
    if (isNaN(date.getTime())) {
      return 'Date invalide';
    }
    
    // Tableau avec lundi en premier (index 0 = lundi, index 6 = dimanche)
    const jours = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
    const mois = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 
                  'jul', 'aoû', 'sep', 'oct', 'nov', 'déc']
    // Convertir getDay() (0=dimanche, 1=lundi...) en index pour le tableau (0=lundi, 6=dimanche)
    const dayIndex = getDayOfWeekMondayBased(date) - 1; // -1 car le tableau commence à 0
    return `${jours[dayIndex]} ${date.getDate()} ${mois[date.getMonth()]}`
  }

  const loadDestinations = async (airport?: string) => {
    const airportCode = airport || aeroportDepart
    if (!airportCode) {
      setError('Veuillez sélectionner un aéroport de départ avant de charger les destinations')
      return
    }
    await loadDestinationsForAirport(airportCode)
    // Mirror destination errors into main error banner when empty/fail
    // (hook keeps its own error; surface critical ones)
  }

  // Clé ville (pas la liste d'IATA) — un toggle CDG/ORY/BVA ne doit pas
  // relancer le chargement destinations ni remonter le formulaire.
  const departureCityKey = useMemo(() => {
    const codes = parseAirportCodes(aeroportDepart)
    if (!codes.length) return ''
    const group = findCityGroupByCodes(groupAirportsByCity(airports), codes)
    return group?.key || [...codes].sort().join(',')
  }, [aeroportDepart, airports])

  const prevDepartureCityKey = useRef('')

  // Charger les destinations quand la ville de départ change (pas à chaque sous-aéroport)
  useEffect(() => {
    if (!aeroportDepart || !departureCityKey) return
    const cityChanged = departureCityKey !== prevDepartureCityKey.current
    prevDepartureCityKey.current = departureCityKey

    void loadDestinations(aeroportDepart)
    // Ne vider les exclusions que lors d'un vrai changement de ville
    if (cityChanged && !loadingSavedSearchRef.current) {
      isLoadingFromStorage.current = true
      setDestinationsExclues([])
      setTimeout(() => {
        isLoadingFromStorage.current = false
      }, 100)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departureCityKey])

  // Sauvegarder automatiquement les destinations exclues quand elles changent
  // (sauf lors du chargement initial depuis localStorage)
  useEffect(() => {
    if (aeroportDepart && !isLoadingFromStorage.current) {
      saveExcludedDestinations(aeroportDepart, destinationsExclues)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinationsExclues, aeroportDepart])

  const toggleDestination = (code: string) => {
    setDestinationsExclues(prev => 
      prev.includes(code) 
        ? prev.filter(c => c !== code)
        : [...prev, code]
    )
  }

  const togglePays = (pays: string) => {
    const codesPays = destinations[pays]?.map(d => d.code) || []
    const tousExclus = codesPays.every(code => destinationsExclues.includes(code))
    
    if (tousExclus) {
      setDestinationsExclues(prev => prev.filter(c => !codesPays.includes(c)))
    } else {
      setDestinationsExclues(prev => [...new Set([...prev, ...codesPays])])
    }
  }

  // Charger les favoris au montage
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const favs = await getFavorites()
        setFavorites(favs)
      } catch (err) {
        console.error('Erreur chargement favoris:', err)
      }
    }
    loadFavorites()
  }, [])

  // Fonction helper pour vérifier si un trip est favori
  const checkIsFavorite = (trip: EnrichedTripResponse | TripResponse): boolean => {
    return favorites.some(f => 
      f.trip.destination_code === trip.destination_code &&
      f.trip.aller.departureTime === trip.aller.departureTime &&
      f.trip.retour.departureTime === trip.retour.departureTime
    )
  }

  const availableOrigins = useMemo(() => {
    const set = new Set<string>()
    for (const t of simpleResults) {
      const o = (t.aller?.origin || '').trim().toUpperCase()
      if (o.length === 3) set.add(o)
    }
    return [...set].sort()
  }, [simpleResults])

  const visibleSimpleResults = useMemo(() => {
    if (!originFilter || originFilter.size === 0) return simpleResults
    return simpleResults.filter((t) =>
      originFilter.has((t.aller?.origin || '').toUpperCase()),
    )
  }, [simpleResults, originFilter])

  const toggleOriginFilter = (code: string) => {
    setOriginFilter((prev) => {
      const base = prev ?? new Set(availableOrigins)
      const next = new Set(base)
      if (next.has(code)) {
        if (next.size <= 1) return next
        next.delete(code)
      } else {
        next.add(code)
      }
      if (next.size === availableOrigins.length) return null
      return next
    })
  }

  const handleSimpleResults = (results: EnrichedTripResponse[], searchInfo?: {
    datePreset: string | null
    airport: string
    budget: number
    passengers: number
    datesDepart: DateAvecHoraire[]
    datesRetour: DateAvecHoraire[]
    excludedDestinations: string[]
    direct?: boolean
  }) => {
    setSearchSeed(null)
    setSimpleResults(results)
    setOriginFilter(null)
    setError(null)
    shouldScrollToResults.current = true
    if (searchInfo) {
      setLastSearchInfo(searchInfo)
      // Construire et sauvegarder currentRequest pour permettre la sauvegarde
      const request: ScanRequest = {
        aeroport_depart: searchInfo.airport,
        dates_depart: searchInfo.datesDepart,
        dates_retour: searchInfo.datesRetour,
        budget_max: searchInfo.budget,
        passengers: searchInfo.passengers || 1,
        limite_allers: limiteAllers,
        destinations_exclues: searchInfo.excludedDestinations.length > 0 ? searchInfo.excludedDestinations : undefined,
        direct: !!searchInfo.direct,
      }
      setCurrentRequest(request)
    }
    // Scroll after results + collapsed form paint (see effect below)
    if (results.length > 0) {
      shouldScrollToResults.current = true
      // Hôtels en fond après paint vols — lookup cache only, jamais sur /inspire
      prefetchHotelCacheForTrips(results, searchInfo?.passengers || 1)
    }
  }

  const handleSimpleSaveFavorite = async (trip: EnrichedTripResponse) => {
    const user = await getCurrentUser()
    if (!user) {
      setToastMessage('Veuillez vous connecter pour sauvegarder un favori')
      setToastType('error')
      return
    }
    
    // Convertir EnrichedTripResponse en TripResponse pour la sauvegarde
    const tripResponse: TripResponse = {
      aller: trip.aller,
      retour: trip.retour,
      prix_total: trip.prix_total,
      destination_code: trip.destination_code
    }
    
    // Vérifier si c'est déjà un favori
    const isFav = checkIsFavorite(trip)
    
    if (isFav) {
      // Retirer des favoris
      const favoriteToDelete = favorites.find(f => 
        f.trip.destination_code === trip.destination_code &&
        f.trip.aller.departureTime === trip.aller.departureTime &&
        f.trip.retour.departureTime === trip.retour.departureTime
      )
      
      if (favoriteToDelete) {
        try {
          await deleteFavorite(favoriteToDelete.id)
          // Recharger les favoris pour mettre à jour l'état
          const updatedFavorites = await getFavorites()
          setFavorites(updatedFavorites)
          setToastMessage('Voyage retiré des favoris')
          setToastType('success')
        } catch (error) {
          setToastMessage('Erreur lors de la suppression')
          setToastType('error')
          console.error(error)
        }
      }
    } else {
      // Ajouter aux favoris
      // Créer un ScanRequest minimal pour la sauvegarde
      const searchRequest: ScanRequest = {
        aeroport_depart: aeroportDepart,
        dates_depart: [],
        dates_retour: [],
        budget_max: trip.prix_total
      }
      
      try {
        await saveFavorite(tripResponse, searchRequest)
        // Recharger les favoris pour mettre à jour l'état
        const updatedFavorites = await getFavorites()
        setFavorites(updatedFavorites)
        setToastMessage('Voyage ajouté aux favoris !')
        setToastType('success')
      } catch (error) {
        setToastMessage('Erreur lors de la sauvegarde')
        setToastType('error')
        console.error(error)
      }
    }
  }

  return (
    <div className="app-shell">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-8 pb-24 sm:pb-8">
        <div className="w-full mb-5 sm:mb-7 space-y-4">
          {/* Brand + compte : pleine largeur */}
          <header className="flex items-center justify-between gap-3">
            <Link
              to="/recherche"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="min-w-0 text-left rounded-xl -ml-1 px-1 py-0.5 transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
              aria-label="FlightWatcher — retour à la recherche"
            >
              <p className="app-kicker mb-0.5">FlightWatcher</p>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-ink tracking-tight truncate">
                {t('app.title')}
              </h1>
            </Link>
            <div className="shrink-0 flex items-center">
              <UserMenu />
            </div>
          </header>

          {/* Onglets : barre bas mobile, pill centrée desktop */}
          <nav className="app-tabnav flex justify-center" aria-label="Navigation principale">
            <div className="app-tabbar w-full max-w-lg sm:max-w-2xl">
              {(
                [
                  { id: 'search' as const, label: t('nav.search') },
                  ...(dealsUiEnabled
                    ? [{ id: 'deals' as const, label: t('nav.deals') }]
                    : []),
                  { id: 'planner' as const, label: t('nav.planner') },
                  { id: 'alerts' as const, label: t('nav.alerts') },
                  { id: 'saved' as const, label: t('nav.saved') },
                ] as const
              ).map((tab) => (
                <motion.div
                  key={tab.id}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 24 }}
                  className="min-w-0 flex-1"
                >
                  <Link
                    to={
                      tab.id === 'deals' && location.search
                        ? { pathname: TAB_PATH[tab.id], search: location.search }
                        : TAB_PATH[tab.id]
                    }
                    onClick={() => setActiveTabState(tab.id)}
                    className={`app-tab ${activeTab === tab.id ? 'app-tab-active' : ''}`}
                    aria-current={activeTab === tab.id ? 'page' : undefined}
                  >
                    <span className="relative z-[1] truncate">{tab.label}</span>
                  </Link>
                </motion.div>
              ))}
            </div>
          </nav>
        </div>

        {/* Contenu selon l'onglet */}
        {activeTab === 'deals' ? (
          <DealsTab />
        ) : activeTab === 'planner' ? (
          <PlannerTab />
        ) : activeTab === 'search' ? (
          <>
            <div className="app-col">
              <HomeDealsTeaser />
              <SimpleSearch
                key={`search-form-${searchLoadToken}`}
                onResults={handleSimpleResults}
                onLoading={(isLoading) => {
                  setLoading(isLoading)
                  if (isLoading) {
                    setSimpleResults([])
                    setOriginFilter(null)
                    setLastSearchInfo(null)
                    setCurrentSearchEventId(null)
                  }
                }}
                onError={setError}
                airports={airports}
                selectedAirport={aeroportDepart}
                onAirportChange={setAeroportDepart}
                AirportAutocomplete={CityAirportSelect}
                flexibleDates={{ dates_depart: datesDepart, dates_retour: datesRetour }}
                onFlexibleDatesChange={(dates) => {
                  // Dès que l’utilisateur édite, lâcher le seed figé de Modifier
                  setSearchSeed(null)
                  setDatesDepart(dates.dates_depart)
                  setDatesRetour(dates.dates_retour)
                }}
                excludedDestinations={destinationsExclues}
                onExcludedDestinationsChange={setDestinationsExclues}
                destinations={destinations}
                loadingDestinations={loadingDestinations}
                onLoadDestinations={() => loadDestinations()}
                limiteAllers={limiteAllers}
                onLimiteAllersChange={setLimiteAllers}
                formatDateFr={formatDateFr}
                onSearchEventId={setCurrentSearchEventId}
                budget={budgetMax}
                onBudgetChange={setBudgetMax}
                initialPassengers={searchPassengers}
                searchLoadToken={searchLoadToken}
                collapseWhenResults={simpleResults.length > 0}
                forceFlexible={
                  !!(
                    searchSeed &&
                    searchSeed.token === searchLoadToken &&
                    (searchSeed.dates_depart.length > 0 ||
                      searchSeed.dates_retour.length > 0)
                  )
                }
                autoSearchOnHydrate={
                  !!(
                    searchSeed &&
                    searchSeed.token === searchLoadToken &&
                    searchSeed.autoSearch &&
                    searchSeed.dates_depart.length > 0 &&
                    searchSeed.dates_retour.length > 0
                  )
                }
                onHydrated={() => {
                  // Garder les dates ; seed autoSearch nettoyé à la fin de inspire
                  if (!searchSeed?.autoSearch) setSearchSeed(null)
                }}
              />

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full mb-4 sm:mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm sm:text-base"
                >
                  ❌ {error}
                </motion.div>
              )}

              {saveSuccessMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="w-full mb-4 sm:mb-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg text-sm sm:text-base"
                >
                  {saveSuccessMessage}
                </motion.div>
              )}
            </div>

            {simpleResults.length > 0 && (
              <motion.div
                ref={resultsSectionRef}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="w-full mt-8 sm:mt-12"
              >
                {/* Section résumé de la recherche */}
                {lastSearchInfo && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-r from-primary-50 to-primary-100 rounded-2xl p-4 sm:p-6 mb-6 sm:mb-8 border-2 border-primary-200 shadow-lg"
                  >
                    <h3 className="text-lg sm:text-xl font-black text-primary-900 mb-3 sm:mb-4">
                      📋 {t('results.lastSearch')}
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 text-sm sm:text-base">
                      <div className="flex items-start gap-2">
                        <span className="font-bold text-primary-700">{t('results.departure')}</span>
                        <span className="text-slate-700">{lastSearchInfo.airport}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-bold text-primary-700">{t('results.budget')}</span>
                        <span className="text-slate-700">{lastSearchInfo.budget}€ / pers.</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-bold text-primary-700">Voyageurs:</span>
                        <span className="text-slate-700">{lastSearchInfo.passengers || 1}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-bold text-primary-700">{t('results.period')}</span>
                        <span className="text-slate-700">
                          {lastSearchInfo.datePreset === 'weekend' ? t('search.preset.weekend') :
                           lastSearchInfo.datePreset === 'next-weekend' ? t('search.preset.nextWeekend') :
                           lastSearchInfo.datePreset === 'next-week' ? t('search.preset.nextWeek') :
                           lastSearchInfo.datePreset === 'flexible' ? t('search.preset.flexible') : 'N/A'}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-bold text-primary-700">{t('results.departureDates')}</span>
                        <span className="text-slate-700">{lastSearchInfo.datesDepart.length} {t('results.date')}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-bold text-primary-700">{t('results.returnDates')}</span>
                        <span className="text-slate-700">{lastSearchInfo.datesRetour.length} {t('results.date')}</span>
                      </div>
                      {lastSearchInfo.excludedDestinations.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="font-bold text-primary-700">{t('results.exclusions')}</span>
                          <span className="text-slate-700">{lastSearchInfo.excludedDestinations.length} {t('results.destination')}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-4">
                  <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900">
                    🎯 Destinations trouvées
                    {visibleSimpleResults.length !== simpleResults.length ? (
                      <span className="block sm:inline text-base sm:text-xl font-bold text-slate-500 sm:ml-2">
                        ({visibleSimpleResults.length}/{simpleResults.length})
                      </span>
                    ) : null}
                  </h2>
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
                    <motion.button
                      onClick={handleSaveSearch}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="bg-indigo-600 text-white rounded-full px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 font-bold hover:bg-indigo-700 transition-all min-h-[48px] sm:min-h-[44px] text-sm sm:text-base flex-1 sm:flex-none flex items-center justify-center gap-2 active:scale-95"
                    >
                      {t('results.saveSearch')}
                    </motion.button>
                    <motion.button
                      onClick={() => {
                        // Utiliser le budget de la recherche si disponible, sinon le budget max actuel
                        const budgetToUse = lastSearchInfo?.budget || budgetMax || 100
                        setRouletteBudget(budgetToUse)
                        setShowRoulette(true)
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="bg-accent-500 text-white rounded-full px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 font-bold hover:bg-accent-600 transition-all min-h-[48px] sm:min-h-[44px] text-sm sm:text-base flex-1 sm:flex-none active:scale-95"
                    >
                      {t('results.roulette')}
                    </motion.button>
                  </div>
                </div>
                {availableOrigins.length > 1 ? (
                  <div className="mb-4 sm:mb-5">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                      Filtrer par aéroport de départ
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {availableOrigins.map((code) => {
                        const active = !originFilter || originFilter.has(code)
                        return (
                          <button
                            key={code}
                            type="button"
                            onClick={() => toggleOriginFilter(code)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-bold border min-h-[36px] ${
                              active
                                ? 'bg-primary-500 text-white border-primary-500'
                                : 'bg-white text-slate-600 border-slate-200'
                            }`}
                          >
                            {code}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 items-stretch">
                  {visibleSimpleResults.map((trip, index) => (
                    <motion.div
                      key={`${trip.aller.origin}-${trip.destination_code}-${trip.aller.departureTime}-${trip.retour.departureTime}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.05, 0.4) }}
                      className="min-w-0 h-full"
                    >
                      <DestinationCard
                        trip={trip}
                        passengers={lastSearchInfo?.passengers || currentRequest?.passengers || 1}
                        onSaveFavorite={() => handleSimpleSaveFavorite(trip)}
                        onBook={() => {
                          setBookingTrip(trip)
                        }}
                        isFavorite={checkIsFavorite(trip)}
                      />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </>
        ) : activeTab === 'alerts' ? (
          <SavedTab
            variant="alerts"
            loading={loading}
            onLoadSearch={handleLoadSearch}
            onCheckFavorite={handleCheckFavorite}
            onReloadSearch={handleScan}
            formatDateFr={formatDateFr}
            onBook={(trip) => setBookingTrip(trip)}
            setToastMessage={setToastMessage}
            setToastType={setToastType}
          />
        ) : (
          <SavedTab
            variant="favorites"
            loading={loading}
            onLoadSearch={handleLoadSearch}
            onCheckFavorite={handleCheckFavorite}
            onReloadSearch={handleScan}
            formatDateFr={formatDateFr}
            onBook={(trip) => setBookingTrip(trip)}
            setToastMessage={setToastMessage}
            setToastType={setToastType}
          />
        )}
      </div>

      {/* Roulette Mode Modal */}
      {showRoulette && (
        <RouletteMode
          trips={visibleSimpleResults}
          budget={rouletteBudget}
          onClose={() => setShowRoulette(false)}
          onSaveFavorite={handleSimpleSaveFavorite}
          onBook={(trip) => setBookingTrip(trip)}
          checkIsFavorite={checkIsFavorite}
        />
      )}

      {/* Search → combo wizard (vol + hôtel → Mon voyage) */}
      {bookingTrip && (
        <TripComboWizard
          trip={bookingTrip}
          passengers={lastSearchInfo?.passengers || currentRequest?.passengers || 1}
          searchBudget={
            lastSearchInfo?.budget ??
            currentRequest?.budget_max ??
            (typeof rouletteBudget === 'number' ? rouletteBudget : null)
          }
          onClose={() => setBookingTrip(null)}
          onSaveFavorite={() => {
            handleSimpleSaveFavorite(bookingTrip)
            setBookingTrip(null)
          }}
        />
      )}

      {/* Save Search Modal */}
      <SaveSearchModal
        isOpen={showSaveSearchModal}
        onClose={() => setShowSaveSearchModal(false)}
        onSave={handleConfirmSaveSearch}
        defaultName={currentRequest ? `Recherche ${aeroportDepart} - ${new Date().toLocaleDateString('fr-FR')}` : ''}
        isLoading={isSavingSearch}
      />

      {/* Toast Notification */}
      <Toast
        message={toastMessage || ''}
        type={toastType}
        isVisible={!!toastMessage}
        onClose={() => setToastMessage(null)}
        duration={toastType === 'info' ? 5000 : 3000}
      />

      <div className="app-col">
        <SiteFooter />
      </div>
    </div>
  )
}

// Composant d'autocomplétion pour les aéroports
interface AirportAutocompleteProps {
  value: string
  onChange: (code: string) => void
}

function AirportAutocomplete({ value, onChange }: AirportAutocompleteProps) {
  const [query, setQuery] = useState(value ? value.toUpperCase() : '')
  const [airports, setAirports] = useState<Airport[]>([])
  const [filteredAirports, setFilteredAirports] = useState<Airport[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedAirport, setSelectedAirport] = useState<Airport | null>(null)
  const [isTyping, setIsTyping] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const popularAirports = useMemo(() => resolvePopularAirports(airports), [airports])

  // Charger tous les aéroports au montage
  useEffect(() => {
    const loadAirports = async () => {
      try {
        const { normalizeAirports } = await import('./utils/apiClient')
        const raw = await getApiClient().getAirports()
        const list = normalizeAirports(raw as Airport[] | { airports: Airport[] })
        setAirports(list)
        setFilteredAirports(list)
      } catch (err) {
        console.error('Erreur chargement aéroports:', err)
      }
    }
    loadAirports()
  }, [])

  // Hydrater l'affichage depuis la valeur externe (Modifier / Relancer)
  // Important: aussi quand la liste airports arrive après le mount (sinon le champ reste vide).
  useEffect(() => {
    if (isTyping) return

    if (!value) {
      setQuery('')
      setSelectedAirport(null)
      return
    }

    const code = value.toUpperCase()
    const airport = airports.find((a) => a.code === code)
    if (airport) {
      setSelectedAirport(airport)
      setQuery(`${airport.code} - ${airport.name}, ${airport.city}, ${airport.country}`)
    } else {
      setSelectedAirport(null)
      setQuery(code)
    }
  }, [value, airports, isTyping])

  // Filtrer les aéroports selon la recherche (hubs populaires en tête / à vide)
  useEffect(() => {
    if (selectedAirport) {
      setFilteredAirports([])
      return
    }

    const q = query.trim().toLowerCase()
    if (!q) {
      setFilteredAirports(popularAirports.slice(0, 12))
      return
    }

    const popularCodes = new Set(popularAirports.map((a) => a.code))
    const matched = airports.filter(
      (airport) =>
        airport.code.toLowerCase().includes(q) ||
        airport.name.toLowerCase().includes(q) ||
        airport.city.toLowerCase().includes(q) ||
        airport.country.toLowerCase().includes(q),
    )
    matched.sort((a, b) => {
      const ap = popularCodes.has(a.code) ? 0 : 1
      const bp = popularCodes.has(b.code) ? 0 : 1
      if (ap !== bp) return ap - bp
      return a.city.localeCompare(b.city, 'fr')
    })

    setFilteredAirports(matched.slice(0, 20))
    setShowDropdown(matched.length > 0)
  }, [query, airports, selectedAirport, popularAirports])

  // Fermer le dropdown si on clique en dehors
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelectAirport = (airport: Airport) => {
    setIsTyping(false)
    setSelectedAirport(airport)
    setQuery(`${airport.code} - ${airport.name}, ${airport.city}, ${airport.country}`)
    onChange(airport.code)
    setShowDropdown(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setIsTyping(true)
    setSelectedAirport(null)
    setQuery(newValue)
    setShowDropdown(true)
    
    if (!newValue.trim()) {
      setIsTyping(false)
      onChange('')
      return
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setShowDropdown(false)
    } else if (e.key === 'Enter') {
      if (filteredAirports.length > 0) {
        handleSelectAirport(filteredAirports[0])
      } else if (query.length === 3) {
        // Si l'utilisateur appuie sur Enter avec exactement 3 caractères, chercher une correspondance exacte
        const exactMatch = airports.find(a => a.code.toUpperCase() === query.toUpperCase())
        if (exactMatch) {
          handleSelectAirport(exactMatch)
        }
      }
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={() => {
          setIsTyping(true)
          setShowDropdown(true)
        }}
        onBlur={() => {
          // Laisser le clic dropdown se faire avant de re-sync
          window.setTimeout(() => setIsTyping(false), 150)
        }}
        onKeyDown={handleKeyDown}
        placeholder="CDG, Paris, Lyon, Londres…"
        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-slate-200 rounded-xl text-sm sm:text-base focus:border-primary-500 focus:ring-2 focus:ring-primary-200 hover:border-slate-300 min-h-[44px]"
      />
      {popularAirports.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {popularAirports.slice(0, 10).map((airport) => {
            const active = value.toUpperCase() === airport.code
            return (
              <button
                key={airport.code}
                type="button"
                onClick={() => handleSelectAirport(airport)}
                className={`px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold border transition-colors min-h-[36px] ${
                  active
                    ? 'bg-primary-500 text-white border-primary-500'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-primary-300 hover:bg-primary-50'
                }`}
              >
                {airport.code}
              </button>
            )
          })}
        </div>
      )}
      {showDropdown && filteredAirports.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 sm:max-h-80 overflow-y-auto"
        >
          {!query.trim() && !selectedAirport ? (
            <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
              Aéroports populaires
            </div>
          ) : null}
          {filteredAirports.map((airport, index) => (
            <button
              key={`${airport.code}-${index}-${airport.city}`}
              type="button"
              onClick={() => handleSelectAirport(airport)}
              className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-primary-50 transition-colors min-h-[56px] sm:min-h-[60px] active:bg-primary-100 ${
                selectedAirport?.code === airport.code ? 'bg-primary-100' : ''
              }`}
            >
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-primary-500 min-w-[3rem]">{airport.code}</span>
                  <span className="font-semibold text-gray-800">{airport.name}</span>
                </div>
                <div className="flex items-center gap-2 ml-0 sm:ml-14 text-xs sm:text-sm mt-1 sm:mt-0">
                  <span className="text-gray-600">{airport.city}</span>
                  <span className="text-gray-500">({airport.country})</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Composant pour l'onglet Recherche
interface SearchTabProps {
  aeroportDepart: string
  setAeroportDepart: (v: string) => void
  datesDepart: DateAvecHoraire[]
  setDatesDepart: (d: DateAvecHoraire[]) => void
  datesRetour: DateAvecHoraire[]
  setDatesRetour: (d: DateAvecHoraire[]) => void
  budgetMax: number
  setBudgetMax: (v: number) => void
  limiteAllers: number
  setLimiteAllers: (v: number) => void
  loading: boolean
  error: string | null
  data: ScanResponse | null
  onScan: (request?: ScanRequest) => void
  onSaveSearch: () => void
  onSaveFavorite: (trip: TripResponse) => void
  addDate: (dates: DateAvecHoraire[], setDates: (d: DateAvecHoraire[]) => void, dateStr: string, heureMin?: string, heureMax?: string) => void
  removeDate: (dates: DateAvecHoraire[], setDates: (d: DateAvecHoraire[]) => void, dateStr: string) => void
  updateHoraire: (dates: DateAvecHoraire[], setDates: (d: DateAvecHoraire[]) => void, dateStr: string, field: 'heure_min' | 'heure_max', value: string) => void
  formatDateFr: (dateStr: string) => string
  hasRequest: boolean
  destinations: Record<string, Destination[]>
  destinationsExclues: string[]
  setDestinationsExclues: (codes: string[]) => void
  loadingDestinations: boolean
  onLoadDestinations: () => void
  onToggleDestination: (code: string) => void
  onTogglePays: (pays: string) => void
  airports: Airport[]
  isValidAirportCode: (code: string) => boolean
}

function SearchTab({
  aeroportDepart, setAeroportDepart,
  datesDepart, setDatesDepart,
  datesRetour, setDatesRetour,
  budgetMax, setBudgetMax,
  limiteAllers, setLimiteAllers,
  loading, error, data,
  onScan, onSaveSearch, onSaveFavorite,
  addDate, removeDate, updateHoraire, formatDateFr, hasRequest,
  destinations, destinationsExclues, setDestinationsExclues, loadingDestinations,
  onLoadDestinations, onToggleDestination, onTogglePays,
  airports, isValidAirportCode
}: SearchTabProps) {
  const { t } = useI18n()
  const [paysOuverts, setPaysOuverts] = useState<Set<string>>(new Set())
  const [sectionDestinationsOuverte, setSectionDestinationsOuverte] = useState(false)
  const dateDepartInputRef = useRef<HTMLInputElement>(null)
  const dateRetourInputRef = useRef<HTMLInputElement>(null)
  const dateDepartValueOnFocus = useRef<string>('')
  const dateRetourValueOnFocus = useRef<string>('')
  
  const togglePaysOuvert = (pays: string) => {
    setPaysOuverts(prev => {
      const nouveau = new Set(prev)
      if (nouveau.has(pays)) {
        nouveau.delete(pays)
      } else {
        nouveau.add(pays)
      }
      return nouveau
    })
  }
  
  // Ouvrir tous les pays par défaut
  useEffect(() => {
    if (Object.keys(destinations).length > 0 && paysOuverts.size === 0) {
      setPaysOuverts(new Set(Object.keys(destinations)))
    }
  }, [destinations])

  // Calculer l'état de toutes les destinations pour le bouton global
  const allDestinations = Object.values(destinations || {}).flat().map(d => d.code)
  const toutesExclues = allDestinations.length > 0 && allDestinations.every(code => destinationsExclues.includes(code))

  // Fonction pour exclure/inclure toutes les destinations
  const toggleAllDestinations = () => {
    if (allDestinations.length === 0) return
    
    // Toggle chaque destination individuellement
    // On fait cela pour que chaque toggle soit sauvegardé correctement
    allDestinations.forEach(code => {
      const isExcluded = destinationsExclues.includes(code)
      const shouldBeExcluded = !toutesExclues
      
      // Si l'état actuel ne correspond pas à l'état souhaité, on toggle
      if (isExcluded !== shouldBeExcluded) {
        onToggleDestination(code)
      }
    })
  }

  return (
    <>
      {/* Formulaire de recherche */}
      <div className="max-w-5xl mx-auto bg-white rounded-lg shadow-xl p-6 mb-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">🔧 Paramètres de recherche</h2>
        
        {/* Aéroport de départ */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Aéroport de départ
          </label>
          <AirportAutocomplete
            value={aeroportDepart}
            onChange={setAeroportDepart}
          />
          <p className="text-xs text-gray-500 mt-1">
            Recherchez par code (ex: CDG), ville (ex: Paris) ou pays (ex: France)
          </p>
        </div>

        {/* Dates de départ */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            Dates de départ (avec horaires individuels)
          </label>
          <div className="mb-3">
            <Calendar
              value=""
              onChange={(dateStr) => {
                if (!datesDepart.some(d => d.date === dateStr)) {
                  addDate(datesDepart, setDatesDepart, dateStr)
                }
              }}
              minDate={new Date().toISOString().split('T')[0]}
            />
          </div>
          <div className="space-y-2 mt-2">
            {datesDepart.map((dateConfig) => (
              <div key={dateConfig.date} className="flex items-center gap-2 p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                <span className="font-semibold text-indigo-800 min-w-[120px]">
                  {formatDateFr(dateConfig.date)}
                </span>
                <span className="text-gray-600">Horaires:</span>
                <input
                  type="time"
                  value={dateConfig.heure_min || '00:00'}
                  onChange={(e) => updateHoraire(datesDepart, setDatesDepart, dateConfig.date, 'heure_min', e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                />
                <span className="text-gray-600">à</span>
                <input
                  type="time"
                  value={dateConfig.heure_max || '23:59'}
                  onChange={(e) => updateHoraire(datesDepart, setDatesDepart, dateConfig.date, 'heure_max', e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                />
                <button
                  onClick={() => removeDate(datesDepart, setDatesDepart, dateConfig.date)}
                  className="ml-auto px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 text-sm"
                >
                  {t('advanced.remove')}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Dates de retour */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            Dates de retour (avec horaires individuels)
          </label>
          <div className="mb-3">
            <Calendar
              value=""
              onChange={(dateStr) => {
                if (!datesRetour.some(d => d.date === dateStr)) {
                  addDate(datesRetour, setDatesRetour, dateStr)
                }
              }}
              minDate={new Date().toISOString().split('T')[0]}
            />
          </div>
          <div className="space-y-2 mt-2">
            {datesRetour.map((dateConfig) => (
              <div key={dateConfig.date} className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200">
                <span className="font-semibold text-green-800 min-w-[120px]">
                  {formatDateFr(dateConfig.date)}
                </span>
                <span className="text-gray-600">Horaires:</span>
                <input
                  type="time"
                  value={dateConfig.heure_min || '00:00'}
                  onChange={(e) => updateHoraire(datesRetour, setDatesRetour, dateConfig.date, 'heure_min', e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                />
                <span className="text-gray-600">à</span>
                <input
                  type="time"
                  value={dateConfig.heure_max || '23:59'}
                  onChange={(e) => updateHoraire(datesRetour, setDatesRetour, dateConfig.date, 'heure_max', e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                />
                <button
                  onClick={() => removeDate(datesRetour, setDatesRetour, dateConfig.date)}
                  className="ml-auto px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 text-sm"
                >
                  {t('advanced.remove')}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Sélection des destinations */}
        <div className="mb-6 border border-gray-300 rounded-lg p-4 bg-gray-50">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setSectionDestinationsOuverte(!sectionDestinationsOuverte)}
              className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900"
            >
              <span className="text-lg transition-transform">
                {sectionDestinationsOuverte ? '▼' : '▶'}
              </span>
              Destinations à exclure (groupées par pays)
            </button>
            <div className="flex gap-2">
              {allDestinations.length > 0 && (
                <>
                  <button
                    onClick={toggleAllDestinations}
                    className={`px-4 py-2 rounded text-sm text-white ${
                      toutesExclues
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                    title={toutesExclues ? 'Inclure toutes les destinations' : 'Exclure toutes les destinations'}
                  >
                    {toutesExclues ? '✅ Inclure toutes' : '❌ Exclure toutes'}
                  </button>
                  {destinationsExclues.length > 0 && (
                    <button
                      onClick={() => setDestinationsExclues([])}
                      className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 text-sm"
                      title="Effacer toutes les sélections"
                    >
                      🗑️ Effacer
                    </button>
                  )}
                </>
              )}
              <button
                onClick={onLoadDestinations}
                disabled={loadingDestinations}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
                title="Recharger les destinations"
              >
                {loadingDestinations ? '⏳ Chargement...' : '🔄 Actualiser'}
              </button>
            </div>
          </div>
          
          {sectionDestinationsOuverte && (
            <>
          {loadingDestinations && Object.keys(destinations).length === 0 && (
            <div className="text-center py-4 text-gray-500 text-sm">
              ⏳ Chargement des destinations depuis {aeroportDepart}...
            </div>
          )}
          {Object.keys(destinations).length > 0 && (
            <div className="max-h-96 overflow-y-auto border border-gray-300 rounded-lg p-4 bg-gray-50">
              {Object.entries(destinations).map(([pays, dests]) => {
                const codesPays = dests.map(d => d.code)
                const tousExclus = codesPays.every(code => destinationsExclues.includes(code))
                const certainsExclus = codesPays.some(code => destinationsExclues.includes(code))
                const estOuvert = paysOuverts.has(pays)
                
                return (
                  <div key={pays} className="mb-3 last:mb-0 border-b border-gray-200 last:border-b-0 pb-3 last:pb-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center flex-1">
                        <button
                          onClick={() => togglePaysOuvert(pays)}
                          className="mr-2 text-gray-600 hover:text-gray-800 transition-transform"
                          title={estOuvert ? 'Réduire' : 'Déplier'}
                        >
                          {estOuvert ? '▼' : '▶'}
                        </button>
                        <button
                          onClick={() => onTogglePays(pays)}
                          className={`px-3 py-1 rounded text-sm font-semibold mr-2 ${
                            tousExclus 
                              ? 'bg-red-100 text-red-700 border border-red-300' 
                              : certainsExclus
                              ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                              : 'bg-green-100 text-green-700 border border-green-300'
                          }`}
                        >
                          {tousExclus ? '✓ Tout exclu' : certainsExclus ? '⊘ Partiel' : '○ Tout inclus'}
                        </button>
                        <h4 className="font-bold text-gray-800">{pays} ({dests.length})</h4>
                      </div>
                    </div>
                    {estOuvert && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 ml-10">
                        {dests.map((dest) => (
                          <label
                            key={dest.code}
                            className={`flex items-center px-2 py-1 rounded text-xs cursor-pointer border transition-colors ${
                              destinationsExclues.includes(dest.code)
                                ? 'bg-red-100 border-red-300 text-red-700'
                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={destinationsExclues.includes(dest.code)}
                              onChange={() => onToggleDestination(dest.code)}
                              className="mr-2"
                            />
                            <span className="font-semibold">{dest.code}</span>
                            <span className="ml-1 text-gray-600 truncate" title={dest.nom}>
                              {dest.nom}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              </div>
          )}
              {destinationsExclues.length > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  {destinationsExclues.length} destination(s) exclue(s)
                </p>
              )}
            </>
          )}
        </div>

        {/* Budget et limite */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Budget maximum total (aller + retour en €)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="20"
                max="1000"
                step="10"
                value={budgetMax}
                onChange={(e) => setBudgetMax(Number(e.target.value))}
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <input
                type="number"
                min="20"
                max="1000"
                value={budgetMax}
                onChange={(e) => setBudgetMax(Number(e.target.value))}
                className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-gray-600">€</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Prix total du voyage (aller + retour) doit être ≤ {budgetMax}€
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Limite de destinations à traiter
            </label>
            <input
              type="number"
              min="10"
              max="200"
              value={limiteAllers}
              onChange={(e) => setLimiteAllers(Number(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Nombre max d'allers les moins chers à traiter pour les retours
            </p>
          </div>
        </div>

        {/* Boutons */}
        <div className="flex justify-center gap-4">
          <button
            onClick={() => onScan()}
            disabled={loading || !isValidAirportCode(aeroportDepart) || datesDepart.length === 0 || datesRetour.length === 0}
            className="px-8 py-3 bg-indigo-600 text-white rounded-lg font-semibold 
                     hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors shadow-lg"
          >
            {loading ? '⏳ Scan en cours...' : '🔍 Lancer le scan'}
          </button>
          {hasRequest && (
            <button
              onClick={onSaveSearch}
              className="px-6 py-3 bg-gray-600 text-white rounded-lg font-semibold 
                       hover:bg-gray-700 transition-colors shadow-lg"
            >
              💾 Sauvegarder la recherche
            </button>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="max-w-4xl mx-auto mb-6 p-4 bg-red-100 border border-red-400 
                      text-red-700 rounded-lg">
          ❌ {error}
        </div>
      )}

      {/* Results */}
      {data && (
        <div className="max-w-6xl mx-auto">
          <div className="bg-white rounded-lg shadow-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-800">
                📊 Résultats du scan
              </h2>
              <div className="text-sm text-gray-500">
                {data.nombre_requetes} requête(s) API
              </div>
            </div>
            <p className="text-lg text-gray-600 mb-4">{data.message}</p>
            {data.resultats.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Aucun voyage trouvé dans les critères demandés
              </div>
            ) : (
              <div className="grid gap-4">
                {data.resultats
                  .sort((a, b) => a.prix_total - b.prix_total)
                  .map((trip) => (
                    <TripCard 
                      key={`${trip.destination_code}-${trip.aller.departureTime}-${trip.retour.departureTime}`}
                      trip={trip} 
                      onSaveFavorite={() => onSaveFavorite(trip)}
                      isFavorite={false}
                    />
                  ))}
              </div>
            )}
          </div>

          {/* Statistics */}
          {data.resultats.length > 0 && (
            <StatsCard trips={data.resultats} />
          )}
        </div>
      )}
    </>
  )
}

// Composant partagé Favoris / Alertes (variant)
interface SavedTabProps {
  variant: 'alerts' | 'favorites'
  loading: boolean
  onLoadSearch: (search: SavedSearch, options?: { editOnly?: boolean }) => void
  onCheckFavorite: (favorite: SavedFavorite) => void
  onReloadSearch: (request: ScanRequest) => void
  formatDateFr: (dateStr: string) => string
  onBook: (trip: TripResponse) => void
  setToastMessage: (message: string | null) => void
  setToastType: (type: 'success' | 'error' | 'info') => void
}

function SavedTab({ variant, loading, onLoadSearch, onCheckFavorite, onReloadSearch, formatDateFr, onBook, setToastMessage, setToastType }: SavedTabProps) {
  // Utiliser useI18n avec gestion d'erreur pour éviter de casser le chargement
  let t: (key: string, params?: Record<string, string | number>) => string;
  try {
    const i18n = useI18n();
    t = i18n.t;
  } catch (error) {
    console.error('Erreur initialisation i18n dans SavedTab:', error);
    // Fallback: fonction de traduction qui retourne la clé
    t = (key: string) => key;
  }

  const [userId, setUserId] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)
  
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [favorites, setFavorites] = useState<SavedFavorite[]>([])
  const [likedDeals, setLikedDeals] = useState<LikedDeal[]>([])
  const [selectedLikedDeal, setSelectedLikedDeal] = useState<TravelDeal | null>(null)
  const [showAutoCheckConfig, setShowAutoCheckConfig] = useState<Record<string, boolean>>({})
  const [intervalSeconds, setIntervalSeconds] = useState<Record<string, number>>({})
  const [devMode, setDevModeState] = useState(() => getDevMode())
  const [showLightbox, setShowLightbox] = useState(false)
  const [lightboxResults, setLightboxResults] = useState<NewResult | null>(null)
  const [favoritesFilter, setFavoritesFilter] = useState<'all' | 'active' | 'archived'>('all')
  const [favoritesKind, setFavoritesKind] = useState<'flights' | 'deals'>('flights')
  const intervalsRef = useRef<Record<string, NodeJS.Timeout>>({})

  const refreshData = async (force = false, opts?: { resetFilter?: boolean }) => {
    try {
      if (variant === 'alerts') {
        const searches = await getSavedSearches(force)
        setSavedSearches(searches)
        return
      }
      // Favoris: toujours tout charger d’un coup (vols + deals)
      const [favs, deals] = await Promise.all([
        getFavorites(force),
        getApiClient()
          .getLikedDeals()
          .catch(() => [] as LikedDeal[]),
      ])
      setFavorites(favs)
      setLikedDeals(Array.isArray(deals) ? deals : [])
      if (opts?.resetFilter) setFavoritesFilter('all')
    } catch (error) {
      console.error('❌ Erreur refreshData:', error)
      try {
        if (variant === 'alerts') {
          setSavedSearches(await getSavedSearches(true))
        } else {
          const [favs, deals] = await Promise.all([
            getFavorites(true),
            getApiClient()
              .getLikedDeals()
              .catch(() => [] as LikedDeal[]),
          ])
          setFavorites(favs)
          setLikedDeals(Array.isArray(deals) ? deals : [])
          if (opts?.resetFilter) setFavoritesFilter('all')
        }
      } catch (fallbackError) {
        console.error('❌ Erreur fallback refreshData:', fallbackError)
      }
    }
  }

  const unlikeDeal = async (dealId: string) => {
    try {
      await getApiClient().unlikeDeal(dealId)
      setLikedDeals((prev) => prev.filter((d) => d.deal_id !== dealId))
      if (selectedLikedDeal?.id === dealId) setSelectedLikedDeal(null)
    } catch {
      /* ignore */
    }
  }

  // Fonction pour construire l'URL Ryanair à partir d'un favori
  const buildRyanairUrl = (favorite: SavedFavorite): string => {
    return buildBookingUrl(favorite.trip, favorite.searchRequest?.passengers || 1)
  }

  // Fonction pour ouvrir BookingSas avec le favori (comme dans les résultats de recherche)
  const handleBookFavorite = (favorite: SavedFavorite) => {
    // Convertir TripResponse en EnrichedTripResponse pour BookingSas
    const enrichedTrip: EnrichedTripResponse = {
      ...favorite.trip,
      discount_percent: undefined,
      is_good_deal: undefined,
      image_url: undefined,
      avg_price_last_month: undefined
    }
    // Ouvrir la modal BookingSas (comme dans les résultats de recherche)
    onBook(enrichedTrip)
  }

  useEffect(() => {
    void getCurrentUser().then((u) => {
      setUserId(u?.id ?? null)
      setAuthReady(true)
    })
    const unsub = onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null)
      setAuthReady(true)
    })
    return () => {
      unsub?.()
    }
  }, [])

  // Charger les données au montage / à chaque ouverture d’onglet
  useEffect(() => {
    if (!userId) return
    const timer = setTimeout(() => {
      // Favoris: force refresh pour tout avoir tout de suite (pas de cache partiel)
      void refreshData(variant === 'favorites', {
        resetFilter: variant === 'favorites',
      })
    }, 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, variant])

  // Fonction pour afficher une notification Toast dans le frontend
  const showNotification = (_title: string, body: string, _searchName: string, _newResults: TripResponse[]) => {
    // Afficher une notification Toast qui disparaît automatiquement après 5 secondes
    setToastMessage(body)
    setToastType('info')
  }

  // Fonction helper pour arrêter un auto-check
  const stopAutoCheck = (searchId: string) => {
    if (intervalsRef.current[searchId]) {
      clearInterval(intervalsRef.current[searchId])
      delete intervalsRef.current[searchId]
      console.log(`🛑 Auto-check arrêté pour la recherche ${searchId}`)
    }
  }

  // Fonction helper pour démarrer un auto-check (nettoie toujours avant de créer)
  const startAutoCheck = (search: SavedSearch) => {
    // Toujours nettoyer avant de créer un nouvel interval pour éviter les doublons
    stopAutoCheck(search.id)
    
    const interval = Math.max(900, search.autoCheckIntervalSeconds || 900)
    
    // Effectuer une vérification immédiate
    performAutoCheck(search)
    
    // Créer l'interval pour les vérifications périodiques
    intervalsRef.current[search.id] = setInterval(async () => {
      const updatedSearches = await getSavedSearches()
      const updatedSearch = updatedSearches.find(s => s.id === search.id)
      if (updatedSearch && updatedSearch.autoCheckEnabled) {
        performAutoCheck(updatedSearch)
      } else {
        // Si la recherche n'est plus activée, nettoyer l'interval
        stopAutoCheck(search.id)
      }
    }, interval * 1000)
    
    console.log(`✅ Auto-check démarré pour la recherche ${search.id} (intervalle: ${interval}s)`)
  }

  // Fonction pour nettoyer les intervalles orphelins (recherches désactivées ou supprimées)
  const cleanupOrphanedIntervals = async () => {
    const searches = await getSavedSearches()
    const activeSearchIds = new Set(searches.filter(s => s.autoCheckEnabled).map(s => s.id))
    
    // Nettoyer les intervalles pour les recherches qui ne sont plus actives
    Object.keys(intervalsRef.current).forEach(searchId => {
      if (!activeSearchIds.has(searchId)) {
        console.log(`🧹 Nettoyage interval orphelin pour la recherche ${searchId}`)
        stopAutoCheck(searchId)
      }
    })
  }

  // Fonction pour effectuer une vérification automatique
  const performAutoCheck = async (search: SavedSearch) => {
    try {
      const data = await getApiClient().autoCheck({
          search_id: search.id,
          previous_results: search.lastCheckResults || [],
          ...search.request
        }) as {
          current_results: TripResponse[]
          new_results?: TripResponse[]
        }
      
      // Mettre à jour les résultats
      updateSearchLastCheckResults(search.id, data.current_results)

      // Si de nouveaux résultats, afficher une notification et sauvegarder
      if (data.new_results && data.new_results.length > 0) {
        // Sauvegarder les nouveaux résultats (résultats réels, pas de test)
        saveNewResults(search.id, search.name, data.new_results, false)
        
        const message = `🆕 ${data.new_results.length} nouveau(x) voyage(s) trouvé(s) pour "${search.name}"`
        showNotification(
          'Nouveaux vols disponibles',
          message,
          search.name,
          data.new_results
        )
      }

      refreshData()
    } catch (error) {
      console.error('Erreur lors de la vérification automatique:', error)
    }
  }

  // Initialiser les auto-checks au chargement (onglet Alertes uniquement)
  useEffect(() => {
    if (variant !== 'alerts') return

    const initAutoChecks = async () => {
      const activeSearches = await getActiveAutoChecks()
      activeSearches.forEach(search => {
        // S'assurer que l'intervalle respecte le minimum de 15 minutes
        if (search.autoCheckIntervalSeconds && search.autoCheckIntervalSeconds < 900) {
          // Mettre à jour l'intervalle si trop court
          updateSearchAutoCheck(search.id, true, 900)
          search.autoCheckIntervalSeconds = 900
        }
        // Utiliser startAutoCheck qui nettoie toujours avant de créer
        startAutoCheck(search)
      })
    }
    
    initAutoChecks()

    // Cleanup au démontage
    return () => {
      Object.values(intervalsRef.current).forEach(interval => clearInterval(interval))
      intervalsRef.current = {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant])

  // Surveiller les recherches pour nettoyer les intervalles orphelins
  useEffect(() => {
    if (variant !== 'alerts') return
    cleanupOrphanedIntervals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedSearches, variant])

  // Obtenir le nombre de nouveaux résultats pour chaque recherche
  const getNewResultsCount = (searchId: string): number => {
    const newResult = getNewResultsForSearch(searchId)
    if (!newResult) return 0
    
    // En mode développeur, afficher tous les résultats (test + réels)
    // Hors mode développeur, afficher seulement les résultats réels (pas les tests)
    if (!devMode && newResult.isTest) {
      return 0
    }
    
    return newResult.trips.length
  }

  // Ouvrir la lightbox avec les nouveaux résultats
  const openLightbox = (searchId: string) => {
    const newResult = getNewResultsForSearch(searchId)
    if (newResult) {
      // Ne pas ouvrir la lightbox pour les résultats de test si le mode développeur est désactivé
      if (!devMode && newResult.isTest) {
        return
      }
      setLightboxResults(newResult)
      setShowLightbox(true)
    }
  }

  // Tester une notification fictive
  const testNotification = () => {
    const testResults: TripResponse[] = [
      {
        aller: {
          flightNumber: 'FR1234',
          origin: 'BVA',
          originFull: 'Paris Beauvais, France',
          destination: 'BCN',
          destinationFull: 'Barcelona, Spain',
          departureTime: new Date().toISOString(),
          price: 45.99,
          currency: 'EUR'
        },
        retour: {
          flightNumber: 'FR5678',
          origin: 'BCN',
          originFull: 'Barcelona, Spain',
          destination: 'BVA',
          destinationFull: 'Paris Beauvais, France',
          departureTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          price: 52.50,
          currency: 'EUR'
        },
        prix_total: 98.49,
        destination_code: 'BCN'
      }
    ]
    showNotification(
      '🆕 Nouveaux vols disponibles (TEST)',
      '1 nouveau(x) voyage(s) trouvé(s) pour "Test Recherche"',
      'Test Recherche',
      testResults
    )
  }

  // Tester de nouveaux résultats fictifs
  const testNewResults = (searchId: string) => {
    const search = savedSearches.find(s => s.id === searchId)
    if (!search) return

    const testTrips: TripResponse[] = [
      {
        aller: {
          flightNumber: 'FR9999',
          origin: search.request.aeroport_depart || 'BVA',
          originFull: 'Paris Beauvais, France',
          destination: 'MLA',
          destinationFull: 'Malta, Malta',
          departureTime: new Date().toISOString(),
          price: 39.99,
          currency: 'EUR'
        },
        retour: {
          flightNumber: 'FR8888',
          origin: 'MLA',
          originFull: 'Malta, Malta',
          destination: search.request.aeroport_depart || 'BVA',
          destinationFull: 'Paris Beauvais, France',
          departureTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          price: 45.00,
          currency: 'EUR'
        },
        prix_total: 84.99,
        destination_code: 'MLA'
      },
      {
        aller: {
          flightNumber: 'FR7777',
          origin: search.request.aeroport_depart || 'BVA',
          originFull: 'Paris Beauvais, France',
          destination: 'OPO',
          destinationFull: 'Porto, Portugal',
          departureTime: new Date().toISOString(),
          price: 29.99,
          currency: 'EUR'
        },
        retour: {
          flightNumber: 'FR6666',
          origin: 'OPO',
          originFull: 'Porto, Portugal',
          destination: search.request.aeroport_depart || 'BVA',
          destinationFull: 'Paris Beauvais, France',
          departureTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          price: 35.50,
          currency: 'EUR'
        },
        prix_total: 65.49,
        destination_code: 'OPO'
      }
    ]

    saveNewResults(searchId, search.name, testTrips, true) // Marquer comme résultats de test
    refreshData()
    openLightbox(searchId)
  }

  if (!authReady) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin mb-4" />
        <p className="font-medium">{t('app.loading')}</p>
      </div>
    )
  }

  if (!userId) {
    return variant === 'alerts' ? <AlertsGuestLanding /> : <FavoritesGuestLanding />
  }

  return (
    <div className="relative w-full">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -right-10 w-72 h-72 rounded-full bg-[#FF6B35]/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-40 -left-16 w-56 h-56 rounded-full bg-[#FFB088]/20 blur-3xl"
      />

      <div className="relative space-y-6 sm:space-y-8">
      {variant === 'alerts' && (
      <>
      <div className="mb-2">
        <p className="app-kicker mb-1.5">{t('nav.alerts')}</p>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h2 className="app-title">{t('alerts.title')}</h2>
            <p className="app-subtitle mt-1.5">{t('alerts.subtitle')}</p>
          </div>
          {savedSearches.length > 0 ? (
            <span className="inline-flex self-start sm:self-auto text-xs font-bold px-3 py-1.5 rounded-full bg-[#FFF3EC] text-[#E85A28]">
              {t('alerts.count', {
                count: savedSearches.length,
                s: savedSearches.length > 1 ? 's' : '',
              })}
            </span>
          ) : null}
        </div>
      </div>

      {devMode && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[28px] border border-amber-200 bg-amber-50/90 p-5 shadow-sm"
        >
          <h3 className="text-sm font-black uppercase tracking-wider text-amber-900 mb-3">
            Mode développeur
          </h3>
          <div className="flex gap-3 flex-wrap items-center">
            <motion.button
              onClick={testNotification}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="px-4 py-2.5 bg-[#FF6B35] text-white rounded-2xl hover:bg-[#E85A28] text-sm font-bold shadow-sm"
            >
              Tester notification
            </motion.button>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  testNewResults(e.target.value)
                  e.target.value = ''
                }
              }}
              className="px-4 py-2.5 border border-orange-200 rounded-2xl text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-primary-300"
              defaultValue=""
            >
              <option value="">Tester nouveaux résultats…</option>
              {savedSearches.map(search => (
                <option key={search.id} value={search.id}>{search.name}</option>
              ))}
            </select>
          </div>
        </motion.div>
      )}

      {savedSearches.length === 0 ? (
        <div className="relative overflow-hidden bg-white rounded-[28px] border border-orange-100 shadow-lg p-8 sm:p-10 text-center">
          <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-orange-50/80 to-transparent" />
          <div className="relative">
            <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#E85A28] text-white flex items-center justify-center shadow-lg shadow-orange-500/30 text-2xl">
              🔔
            </div>
            <p className="font-black text-2xl text-slate-900 mb-2 tracking-tight">{t('alerts.empty')}</p>
            <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">{t('alerts.emptyHint')}</p>
          </div>
        </div>
      ) : (
            <div className="grid gap-4 sm:gap-5">
              {savedSearches.map((search, index) => {
                const newResultsCount = getNewResultsCount(search.id)
                const destCodes = (search.request.destinations_incluses || []).filter(Boolean)
                
                return (
                  <motion.div
                    key={search.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="group relative bg-white rounded-[28px] border border-orange-100/70 hover:border-orange-200 transition-all duration-300 overflow-hidden shadow-md hover:shadow-xl"
                  >
                    {newResultsCount > 0 && (
                      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10">
                        <motion.button
                          onClick={() => openLightbox(search.id)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="relative bg-[#FF6B35] text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-full font-bold text-xs sm:text-sm shadow-md shadow-orange-500/25 min-h-[36px]"
                        >
                          {newResultsCount} nouveau{newResultsCount > 1 ? 'x' : ''}
                        </motion.button>
                      </div>
                    )}

                    <div className="p-4 sm:p-5 md:p-6 space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                            <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">{search.name}</h3>
                            {search.autoCheckEnabled && (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#FFF3EC] text-[#E85A28] rounded-full text-xs font-bold self-start sm:self-auto">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B35] animate-pulse" />
                                Auto-vérif · {Math.floor((search.autoCheckIntervalSeconds || 900) / 60)} min
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF8F3] border border-orange-100 px-2.5 py-1 font-semibold text-slate-700">
                              {search.request.aeroport_depart || 'BVA'}
                              {destCodes.length > 0 ? ` → ${destCodes.slice(0, 3).join(' · ')}${destCodes.length > 3 ? ` +${destCodes.length - 3}` : ''}` : ' · inspire'}
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF8F3] border border-orange-100 px-2.5 py-1 font-bold text-slate-800">
                              {search.request.budget_max || 100}€/pers
                            </span>
                          </div>

                          <div className="rounded-2xl border border-orange-100 bg-[#FFF8F3] px-3 py-3 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                              <div>
                                <p className="text-[11px] font-bold uppercase tracking-wider text-primary-700 mb-1.5">Départ</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {search.request.dates_depart.slice(0, 4).map((d, i) => (
                                    <span key={i} className="px-2 py-0.5 bg-white text-[#E85A28] border border-orange-100 rounded-full text-xs font-semibold">
                                      {formatDateFr(d.date)}
                                    </span>
                                  ))}
                                  {search.request.dates_depart.length > 4 && (
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs font-semibold">
                                      +{search.request.dates_depart.length - 4}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div>
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Retour</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {search.request.dates_retour.slice(0, 4).map((d, i) => (
                                    <span key={i} className="px-2 py-0.5 bg-white text-slate-700 border border-orange-100 rounded-full text-xs font-semibold">
                                      {formatDateFr(d.date)}
                                    </span>
                                  ))}
                                  {search.request.dates_retour.length > 4 && (
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs font-semibold">
                                      +{search.request.dates_retour.length - 4}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="max-w-xs">
                              <PassengerStepper
                                compact
                                value={
                                  search.request.passengers && search.request.passengers > 0
                                    ? search.request.passengers
                                    : 1
                                }
                                onChange={(n) => {
                                  setSavedSearches((prev) =>
                                    prev.map((s) =>
                                      s.id === search.id
                                        ? { ...s, request: { ...s.request, passengers: n } }
                                        : s,
                                    ),
                                  )
                                  void updateSearchPassengers(search.id, n).catch(() => {
                                    void refreshData()
                                  })
                                }}
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-slate-500">
                            <span>Créé le {new Date(search.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/ \./g, '.')}</span>
                            {search.lastCheckedAt && (
                              <span className="flex items-center gap-1 text-blue-600 font-semibold">
                                <span>•</span>
                                <span>Vérifié {new Date(search.lastCheckedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(/ \./g, '.')}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <motion.button
                          onClick={() => {
                            if (confirm(t('saved.delete') + ' ?')) {
                              stopAutoCheck(search.id)
                              deleteSearch(search.id)
                              refreshData()
                            }
                          }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="shrink-0 px-3 py-2 bg-white border border-red-200 text-red-600 rounded-2xl hover:bg-red-50 text-xs font-bold min-h-[40px] min-w-[40px] flex items-center justify-center"
                          title={t('saved.delete')}
                        >
                          ✕
                        </motion.button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <motion.button
                          onClick={async () => {
                            await onLoadSearch(search)
                            setTimeout(() => {
                              onReloadSearch(search.request)
                            }, 200)
                            await updateSearchLastUsed(search.id)
                            await refreshData()
                          }}
                          disabled={loading}
                          whileHover={{ scale: loading ? 1 : 1.03 }}
                          whileTap={{ scale: loading ? 1 : 0.97 }}
                          className="flex-1 sm:flex-none px-4 py-2.5 bg-[#FF6B35] text-white rounded-2xl hover:bg-[#E85A28] disabled:opacity-50 text-xs sm:text-sm font-bold shadow-sm shadow-orange-500/20 flex items-center justify-center gap-1.5 min-h-[44px]"
                        >
                          <span>{t('saved.reload')}</span>
                        </motion.button>
                        <motion.button
                          onClick={async () => {
                            const isEnabled = search.autoCheckEnabled || false
                            const isConfigOpen = showAutoCheckConfig[search.id] || false
                            
                            if (isEnabled) {
                              stopAutoCheck(search.id)
                              await updateSearchAutoCheck(search.id, false)
                              await refreshData()
                            } else if (isConfigOpen) {
                              setShowAutoCheckConfig(prev => ({ ...prev, [search.id]: false }))
                            } else {
                              setShowAutoCheckConfig(prev => ({ ...prev, [search.id]: true }))
                              if (!intervalSeconds[search.id]) {
                                setIntervalSeconds(prev => ({ 
                                  ...prev, 
                                  [search.id]: search.autoCheckIntervalSeconds && search.autoCheckIntervalSeconds >= 900 
                                    ? search.autoCheckIntervalSeconds 
                                    : 900 
                                }))
                              }
                            }
                          }}
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          className={`flex-1 sm:flex-none px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold shadow-sm flex items-center justify-center gap-1.5 min-h-[44px] ${
                            search.autoCheckEnabled 
                              ? 'bg-slate-900 text-white hover:bg-slate-800' 
                              : 'bg-[#FFF3EC] text-[#E85A28] hover:bg-[#FFE8DC]'
                          }`}
                        >
                          <span>{search.autoCheckEnabled ? 'Pause' : 'Auto-vérif'}</span>
                        </motion.button>
                        <motion.button
                          onClick={() => onLoadSearch(search, { editOnly: true })}
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          className="flex-1 sm:flex-none px-4 py-2.5 bg-white border border-orange-200 text-[#E85A28] rounded-2xl hover:bg-[#FFF8F3] text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 min-h-[44px]"
                        >
                          <span>{t('saved.load')}</span>
                        </motion.button>
                      </div>
                      
                      {showAutoCheckConfig[search.id] && !search.autoCheckEnabled && (
                        <motion.div
                          initial={{ opacity: 0, y: -10, height: 0 }}
                          animate={{ opacity: 1, y: 0, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                          className="w-full overflow-hidden"
                        >
                            <div className="rounded-2xl border border-orange-200 bg-[#FFF8F3] p-5 sm:p-6">
                              <div className="flex items-center gap-3 mb-4 pb-3 border-b border-orange-100">
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#E85A28] flex items-center justify-center shadow-sm text-white font-black">
                                  ⏱
                                </div>
                                <div>
                                  <h4 className="text-base sm:text-lg font-black text-slate-900">Auto-vérification</h4>
                                  <p className="text-xs sm:text-sm text-slate-600">Choisis la fréquence de surveillance</p>
                                </div>
                              </div>

                              <div className="mb-5">
                                <label className="block text-sm font-bold text-slate-700 mb-3">
                                  Options rapides
                                </label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                                  {[
                                    { label: '15 min', seconds: 900, icon: '⏱️' },
                                    { label: '1 heure', seconds: 3600, icon: '🕐' },
                                    { label: '1 jour', seconds: 86400, icon: '📅' },
                                    { label: '7 jours', seconds: 604800, icon: '📆' }
                                  ].map((option) => {
                                    const currentInterval = intervalSeconds[search.id] || search.autoCheckIntervalSeconds || 900
                                    const isSelected = currentInterval === option.seconds
                                    return (
                                      <motion.button
                                        key={option.seconds}
                                        onClick={() => setIntervalSeconds(prev => ({ 
                                          ...prev, 
                                          [search.id]: option.seconds 
                                        }))}
                                        whileHover={{ scale: 1.05, y: -2 }}
                                        whileTap={{ scale: 0.95 }}
                                        className={`px-3 sm:px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold transition-all duration-200 ${
                                          isSelected
                                            ? 'bg-gradient-to-br from-[#FF6B35] to-[#E85A28] text-white shadow-md shadow-orange-500/25'
                                            : 'bg-white text-slate-700 hover:bg-[#FFF8F3] border border-orange-100 hover:border-orange-200 shadow-sm'
                                        }`}
                                      >
                                        <div className="flex flex-col items-center gap-1">
                                          <span className="text-base sm:text-lg">{option.icon}</span>
                                          <span>{option.label}</span>
                                        </div>
                                      </motion.button>
                                    )
                                  })}
                                </div>
                              </div>

                              <div className="mb-5 p-4 bg-white rounded-2xl border border-orange-100">
                                <label className="block text-sm font-bold text-slate-700 mb-3">
                                  Intervalle personnalisé
                                </label>
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                                  <div className="flex items-center gap-3 flex-1">
                                    <input
                                      type="number"
                                      min="900"
                                      step="60"
                                      value={intervalSeconds[search.id] || search.autoCheckIntervalSeconds || 900}
                                      onChange={(e) => {
                                        const value = parseInt(e.target.value) || 900
                                        setIntervalSeconds(prev => ({ 
                                          ...prev, 
                                          [search.id]: Math.max(900, value)
                                        }))
                                      }}
                                      className="w-28 px-4 py-2.5 border border-orange-200 rounded-2xl text-sm font-semibold focus:border-[#FF6B35] focus:ring-2 focus:ring-orange-200 bg-white"
                                    />
                                    <span className="text-sm font-medium text-slate-600">
                                      secondes
                                    </span>
                                  </div>
                                  <div className="px-3 py-1.5 bg-[#FFF3EC] text-[#E85A28] rounded-full text-xs font-bold">
                                    Min. 15 min
                                  </div>
                                </div>
                                {intervalSeconds[search.id] && (
                                  <div className="mt-2 text-xs text-slate-500 font-medium">
                                    = {Math.floor((intervalSeconds[search.id] || 900) / 60)} minute{Math.floor((intervalSeconds[search.id] || 900) / 60) > 1 ? 's' : ''} 
                                    {Math.floor((intervalSeconds[search.id] || 900) / 3600) > 0 && ` (${Math.floor((intervalSeconds[search.id] || 900) / 3600)} heure${Math.floor((intervalSeconds[search.id] || 900) / 3600) > 1 ? 's' : ''})`}
                                  </div>
                                )}
                              </div>

                              <div className="flex gap-3 justify-end pt-3 border-t border-orange-100">
                                <motion.button
                                  onClick={() => {
                                    setShowAutoCheckConfig(prev => ({ ...prev, [search.id]: false }))
                                  }}
                                  whileHover={{ scale: 1.03 }}
                                  whileTap={{ scale: 0.97 }}
                                  className="px-5 py-2.5 rounded-2xl text-sm font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors min-h-[44px]"
                                >
                                  Annuler
                                </motion.button>
                                <motion.button
                                  onClick={async () => {
                                    const newInterval = Math.max(900, intervalSeconds[search.id] || search.autoCheckIntervalSeconds || 900)
                                    
                  await updateSearchAutoCheck(search.id, true, newInterval)
                  startAutoCheck({ ...search, autoCheckEnabled: true, autoCheckIntervalSeconds: newInterval })
                                    
                                    setShowAutoCheckConfig(prev => ({ ...prev, [search.id]: false }))
                                    await refreshData()
                                  }}
                                  whileHover={{ scale: 1.03 }}
                                  whileTap={{ scale: 0.97 }}
                                  className="px-6 py-2.5 rounded-2xl text-sm font-bold min-h-[44px] bg-gradient-to-r from-[#FF6B35] to-[#E85A28] text-white shadow-md shadow-orange-500/25"
                                >
                                  Activer
                                </motion.button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
      )}
      </>
      )}

      {variant === 'favorites' && (
      <>
      <div className="mb-2">
        <p className="app-kicker mb-1.5">{t('nav.favorites')}</p>
        <h2 className="app-title">{t('favorites.title')}</h2>
        <p className="app-subtitle mt-1.5">{t('favorites.subtitle')}</p>
      </div>

      <div className="relative">
        <div className="mb-4">
          <div className="flex p-1.5 rounded-2xl bg-white/80 border border-orange-100/80 shadow-sm gap-1">
            <button
              type="button"
              onClick={() => setFavoritesKind('flights')}
              className={`flex-1 py-2.5 rounded-xl text-[15px] font-semibold tracking-tight transition-all min-h-[44px] ${
                favoritesKind === 'flights'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t('favorites.switch.flights')}
            </button>
            <button
              type="button"
              onClick={() => setFavoritesKind('deals')}
              className={`flex-1 py-2.5 rounded-xl text-[15px] font-semibold tracking-tight transition-all min-h-[44px] ${
                favoritesKind === 'deals'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t('favorites.switch.deals')}
            </button>
          </div>
          {favoritesKind === 'flights' ? (
            <div className="flex gap-2 flex-wrap mt-4">
              <button
                type="button"
                onClick={() => setFavoritesFilter('all')}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold min-h-[40px] transition-colors ${
                  favoritesFilter === 'all'
                    ? 'bg-primary-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t('favorites.all')}
              </button>
              <button
                type="button"
                onClick={() => setFavoritesFilter('active')}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold min-h-[40px] transition-colors ${
                  favoritesFilter === 'active'
                    ? 'bg-primary-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t('favorites.active')}
              </button>
              <button
                type="button"
                onClick={() => setFavoritesFilter('archived')}
                className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold min-h-[40px] transition-colors ${
                  favoritesFilter === 'archived'
                    ? 'bg-primary-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t('favorites.archived')}
              </button>
            </div>
          ) : null}
        </div>
        
        <div className="pt-2">
          {favoritesKind === 'deals' ? (
            likedDeals.length === 0 ? (
              <div className="relative overflow-hidden bg-white rounded-[28px] border border-orange-100 shadow-lg p-8 sm:p-10 text-center">
                <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-orange-50/80 to-transparent" />
                <div className="relative">
                  <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#E85A28] text-white flex items-center justify-center shadow-lg shadow-orange-500/30 text-2xl">
                    ♥
                  </div>
                  <p className="font-black text-2xl text-slate-900 mb-2 tracking-tight">{t('favorites.dealsEmptyTitle')}</p>
                  <p className="text-sm text-slate-500 max-w-md mx-auto">{t('favorites.dealsEmpty')}</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {likedDeals.map((item) => (
                  <DealCard
                    key={item.id}
                    deal={item.deal}
                    liked
                    onToggleLike={() => void unlikeDeal(item.deal_id)}
                    onClick={() => setSelectedLikedDeal(item.deal)}
                  />
                ))}
              </div>
            )
          ) : favorites.length === 0 ? (
            <div className="relative overflow-hidden bg-white rounded-[28px] border border-orange-100 shadow-lg p-8 sm:p-10 text-center">
              <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-orange-50/80 to-transparent" />
              <div className="relative">
                <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FF6B35] to-[#E85A28] text-white flex items-center justify-center shadow-lg shadow-orange-500/30 text-2xl">
                  ♥
                </div>
                <p className="font-black text-2xl text-slate-900 mb-2 tracking-tight">Aucun favori</p>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  Ajoute des voyages depuis les résultats de recherche.
                </p>
              </div>
            </div>
          ) : (() => {
            const filteredFavorites = favoritesFilter === 'all' 
              ? favorites 
              : favoritesFilter === 'active'
              ? favorites.filter(f => !f.archived)
              : favorites.filter(f => f.archived)
            
            if (filteredFavorites.length === 0) {
              return (
                <div className="relative overflow-hidden bg-white rounded-[28px] border border-orange-100 shadow-sm p-8 text-center">
                  <p className="font-bold text-slate-700">
                    {favoritesFilter === 'archived' 
                      ? 'Aucun voyage archivé' 
                      : 'Aucun voyage actif'}
                  </p>
                </div>
              )
            }
            
            return (
              <div className="grid gap-4 sm:gap-5">
                {filteredFavorites.map((favorite, index) => (
                  <motion.div
                    key={favorite.id}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className={`group relative rounded-[28px] border overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 ${
                      favorite.archived 
                        ? 'border-slate-200 bg-slate-50/90 opacity-85' 
                        : 'border-orange-100/70 bg-white hover:border-orange-200'
                    }`}
                  >
                    {favorite.archived && (
                      <div className="absolute top-3 right-3 z-10">
                        <span className="px-2.5 py-1 bg-slate-700 text-white text-[11px] font-bold rounded-full">
                          Archivé
                        </span>
                      </div>
                    )}

                    <div className="p-4 sm:p-5 md:p-6">
                      {/* En-tête avec meilleure hiérarchie */}
                      <div className="flex flex-col sm:flex-row items-start justify-between mb-4 sm:mb-5 gap-4 sm:gap-5">
                        <div className="flex-1 w-full sm:w-auto sm:pr-4">
                          {/* Mobile: Layout avec statut et prix en haut à droite */}
                          <div className="flex sm:block items-start justify-between gap-3 sm:gap-0">
                            <div className="flex-1 sm:flex-none min-w-0">
                              {/* Mobile: Première ligne avec statut et prix à droite */}
                              <div className="flex sm:hidden items-start justify-between gap-2 mb-1.5">
                                <div className="flex-1 min-w-0">
                                  {/* Aéroport */}
                                  <div className="text-base font-black text-slate-400 tracking-wider mb-0.5">
                                    {favorite.trip.destination_code}
                                  </div>
                                  {/* Ville - Mobile: sous l'aéroport */}
                                  <h3 className="text-lg font-black text-slate-900">
                                    {favorite.trip.aller.destinationFull.split(',')[0]}
                                  </h3>
                                </div>
                                {/* Mobile: Statut et Prix en haut à droite en colonne verticale */}
                                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                  {/* Badge statut disponibilité */}
                                  {favorite.isStillValid !== undefined && (
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold ${
                                      favorite.isStillValid 
                                        ? 'bg-green-100 text-green-700 border border-green-300 shadow-sm' 
                                        : 'bg-red-100 text-red-700 border border-red-300 shadow-sm'
                                    }`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${
                                        favorite.isStillValid ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                                      }`}></span>
                                      {favorite.isStillValid ? 'Disponible' : 'Indisponible'}
                                    </span>
                                  )}
                                  {/* Prix Total - Mobile */}
                                  <div className="flex flex-col items-end">
                                    <span className="text-2xl font-black text-[#E85A28] leading-none">
                                      {favorite.trip.prix_total.toFixed(0)}€
                                    </span>
                                    <span className="text-xs text-slate-500 font-medium">total</span>
                                  </div>
                                </div>
                              </div>
                              
                              {/* Desktop: Code aéroport - Ville sur une ligne */}
                              <div className="hidden sm:flex items-baseline gap-2 mb-1.5">
                                <span className="text-lg sm:text-xl font-black text-slate-400 tracking-wider">
                                  {favorite.trip.destination_code}
                                </span>
                                <span className="text-slate-400">-</span>
                                <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900">
                                  {favorite.trip.aller.destinationFull.split(',')[0]}
                                </h3>
                              </div>
                              
                              {/* Pays */}
                              <p className="text-sm sm:text-base text-slate-600 font-medium mb-2 sm:mb-0">
                                {favorite.trip.aller.destinationFull.split(',')[1]?.trim() || ''}
                              </p>
                              
                              {/* Desktop: Prix Total - mis en évidence (caché sur mobile) */}
                              <div className="hidden sm:flex items-baseline gap-2 pt-3 border-t border-slate-200">
                                <span className="text-3xl sm:text-4xl md:text-5xl font-black text-[#E85A28] leading-none">
                                  {favorite.trip.prix_total.toFixed(0)}€
                                </span>
                                <span className="text-sm sm:text-base text-slate-500 font-medium">total</span>
                              </div>

                              {/* Métadonnées */}
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-slate-500 pt-1 sm:pt-2">
                                <span className="flex items-center gap-1">
                                  <span>💾</span>
                                  <span>Sauvegardé le {new Date(favorite.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                </span>
                                {favorite.lastChecked && (
                                  <span className="flex items-center gap-1">
                                    <span>•</span>
                                    <span>Vérifié le {new Date(favorite.lastChecked).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
                                  </span>
                                )}
                              </div>
                            </div>

                          </div>

                          {/* Desktop: Badge statut disponibilité */}
                          {favorite.isStillValid !== undefined && (
                            <div className="hidden sm:block mt-3">
                              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold ${
                                favorite.isStillValid 
                                  ? 'bg-green-100 text-green-700 border-2 border-green-300 shadow-sm' 
                                  : 'bg-red-100 text-red-700 border-2 border-red-300 shadow-sm'
                              }`}>
                                <span className={`w-2.5 h-2.5 rounded-full ${
                                  favorite.isStillValid ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                                }`}></span>
                                {favorite.isStillValid ? 'Disponible' : 'Indisponible'}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-auto">
                          <motion.button
                            onClick={() => handleBookFavorite(favorite)}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            className="flex-1 sm:flex-none px-4 py-2.5 bg-[#FF6B35] text-white rounded-2xl hover:bg-[#E85A28] text-xs sm:text-sm font-bold shadow-sm shadow-orange-500/20 flex items-center justify-center gap-1.5 min-h-[44px]"
                          >
                            {t('card.book')}
                          </motion.button>
                          <motion.button
                            onClick={() => {
                              toggleFavoriteArchived(favorite.id)
                              refreshData()
                            }}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            className={`flex-1 sm:flex-none px-4 py-2.5 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 min-h-[44px] ${
                              favorite.archived
                                ? 'bg-[#FFF3EC] text-[#E85A28] hover:bg-[#FFE8DC]'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                            title={favorite.archived ? 'Désarchiver' : 'Archiver'}
                          >
                            <span className="hidden sm:inline">{favorite.archived ? 'Désarchiver' : 'Archiver'}</span>
                            <span className="sm:hidden">{favorite.archived ? 'Désarch.' : 'Archiver'}</span>
                          </motion.button>
                          <motion.button
                            onClick={() => {
                              if (confirm(t('favorites.remove') + ' ?')) {
                                deleteFavorite(favorite.id)
                                refreshData()
                              }
                            }}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                            className="px-3.5 py-2.5 bg-white border border-red-200 text-red-600 rounded-2xl hover:bg-red-50 text-xs sm:text-sm font-bold min-h-[44px] min-w-[44px] flex items-center justify-center"
                            title={t('saved.delete')}
                          >
                            ✕
                          </motion.button>
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-3 sm:gap-4 mt-4 sm:mt-5 pt-4 sm:pt-5 border-t border-orange-100">
                        <div className="rounded-2xl p-3 sm:p-4 border border-orange-100 bg-[#FFF8F3]">
                          <div className="flex items-center justify-between mb-2 sm:mb-3">
                            <div className="text-xs sm:text-sm font-black text-[#E85A28] tracking-wide">
                              ALLER
                            </div>
                            {favorite.trip.leg_prices_reliable !== false && favorite.trip.aller.price > 0 ? (
                              <div className="text-lg sm:text-xl font-black text-[#E85A28]">
                                {favorite.trip.aller.price.toFixed(0)}€
                              </div>
                            ) : null}
                          </div>
                          <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                            <div className="flex justify-between">
                              <span className="font-semibold text-slate-700">Date</span>
                              <span className="text-slate-600">{formatDateFr(favorite.trip.aller.departureTime)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="font-semibold text-slate-700">Heure</span>
                              <span className="text-slate-600">{new Date(favorite.trip.aller.departureTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="font-semibold text-slate-700">Vol</span>
                              <span className="text-slate-600 font-mono">{favorite.trip.aller.flightNumber}</span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-orange-100">
                              <span className="text-slate-500 text-xs">Trajet</span>
                              <span className="text-slate-700 font-bold">{favorite.trip.aller.origin} → {favorite.trip.aller.destination}</span>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-2xl p-3 sm:p-4 border border-slate-200 bg-slate-50/80">
                          <div className="flex items-center justify-between mb-2 sm:mb-3">
                            <div className="text-xs sm:text-sm font-black text-slate-700 tracking-wide">
                              RETOUR
                            </div>
                            {favorite.trip.leg_prices_reliable !== false && favorite.trip.retour.price > 0 ? (
                              <div className="text-lg sm:text-xl font-black text-slate-800">
                                {favorite.trip.retour.price.toFixed(0)}€
                              </div>
                            ) : null}
                          </div>
                          <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                            <div className="flex justify-between">
                              <span className="font-semibold text-slate-700">Date</span>
                              <span className="text-slate-600">{formatDateFr(favorite.trip.retour.departureTime)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="font-semibold text-slate-700">Heure</span>
                              <span className="text-slate-600">{new Date(favorite.trip.retour.departureTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="font-semibold text-slate-700">Vol</span>
                              <span className="text-slate-600 font-mono">{favorite.trip.retour.flightNumber}</span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-slate-200">
                              <span className="text-slate-500 text-xs">Trajet</span>
                              <span className="text-slate-700 font-bold">{favorite.trip.retour.origin} → {favorite.trip.retour.destination}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )
          })()}
        </div>
        {selectedLikedDeal ? (
          <DealDetailModal
            deal={selectedLikedDeal}
            liked
            onToggleLike={() => void unlikeDeal(selectedLikedDeal.id)}
            onClose={() => setSelectedLikedDeal(null)}
          />
        ) : null}
      </div>
      </>
      )}
      </div>

      {/* Lightbox pour afficher les nouveaux résultats (Alertes) */}
      {variant === 'alerts' && showLightbox && lightboxResults && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-ink/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6"
          onClick={() => {
            setShowLightbox(false)
            setLightboxResults(null)
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-white rounded-3xl border border-line shadow-lift max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-gradient-to-r from-[#FF6B35] to-[#E85A28] p-6 flex items-center justify-between z-10">
              <div>
                <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                  Nouveaux résultats
                </h2>
                <p className="text-white/90 mt-2 font-medium">
                  {lightboxResults.searchName}
                </p>
                <p className="text-sm text-white/80 mt-1">
                  {lightboxResults.trips.length} nouveau{lightboxResults.trips.length > 1 ? 'x' : ''} voyage{lightboxResults.trips.length > 1 ? 's' : ''} trouvé{lightboxResults.trips.length > 1 ? 's' : ''}
                  {lightboxResults.timestamp && (
                    <span className="ml-2">
                      le {new Date(lightboxResults.timestamp).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </p>
              </div>
              <motion.button
                onClick={() => {
                  setShowLightbox(false)
                  setLightboxResults(null)
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="text-white text-2xl font-bold w-10 h-10 flex items-center justify-center rounded-2xl hover:bg-white/20 transition-colors"
              >
                ✕
              </motion.button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid gap-5">
                {lightboxResults.trips
                  .sort((a, b) => a.prix_total - b.prix_total)
                  .map((trip, index) => (
                    <motion.div
                      key={`${trip.destination_code}-${trip.aller.departureTime}-${trip.retour.departureTime}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <TripCard
                        trip={trip}
                        onSaveFavorite={() => {}}
                        isFavorite={false}
                      />
                    </motion.div>
                  ))}
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-orange-100 p-4 flex justify-end gap-3">
              <motion.button
                onClick={() => {
                  clearNewResults(lightboxResults.searchId)
                  setShowLightbox(false)
                  setLightboxResults(null)
                  refreshData()
                }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="px-5 py-3 bg-slate-100 text-slate-700 rounded-2xl hover:bg-slate-200 font-bold"
              >
                Marquer comme lus
              </motion.button>
              <motion.button
                onClick={() => {
                  setShowLightbox(false)
                  setLightboxResults(null)
                }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="px-6 py-3 bg-[#FF6B35] text-white rounded-2xl hover:bg-[#E85A28] font-bold shadow-sm shadow-orange-500/20"
              >
                Fermer
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}

function TripCard({ trip, onSaveFavorite, isFavorite: isFav }: { 
  trip: TripResponse; 
  onSaveFavorite: () => void;
  isFavorite: boolean;
}) {
  // Helper pour convertir getDay() en numérotation basée sur lundi (1=lundi, 7=dimanche)
  const getDayOfWeekMondayBased = (date: Date): number => {
    // getDay() retourne 0=dimanche, 1=lundi, ..., 6=samedi
    // On veut 1=lundi, 2=mardi, ..., 7=dimanche
    const jsDay = date.getDay(); // 0=dimanche, 1=lundi, ..., 6=samedi
    // Conversion: dimanche(0) -> 7, lundi(1) -> 1, mardi(2) -> 2, ..., samedi(6) -> 6
    return jsDay === 0 ? 7 : jsDay;
  };

  const formatDate = (dateStr: string) => {
    // Parser la date manuellement pour éviter les problèmes de fuseau horaire
    // dateStr est au format "YYYY-MM-DD" ou ISO datetime string
    let date: Date;
    if (dateStr.includes('T')) {
      // Format ISO datetime, utiliser directement
      date = new Date(dateStr);
    } else {
      // Format "YYYY-MM-DD", parser manuellement
      const [year, month, day] = dateStr.split('-').map(Number);
      date = new Date(year, month - 1, day); // month - 1 car les mois commencent à 0
    }
    // Tableau avec lundi en premier (index 0 = lundi, index 6 = dimanche)
    const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
    const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 
                   'jul', 'aoû', 'sep', 'oct', 'nov', 'déc']
    // Convertir getDay() (0=dimanche, 1=lundi...) en index pour le tableau (0=lundi, 6=dimanche)
    const dayIndex = getDayOfWeekMondayBased(date) - 1; // -1 car le tableau commence à 0
    return `${days[dayIndex]} ${date.getDate()} ${months[date.getMonth()]}`
  }

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  return (
    <div className="rounded-[28px] border border-orange-100/70 p-5 hover:shadow-xl 
                   transition-shadow bg-white shadow-md">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xl font-black text-slate-900 tracking-tight">
            {trip.destination_code} - {trip.aller.destinationFull}
          </h3>
        </div>
        <div className="text-right flex items-center gap-3">
          <div>
            <div className="text-2xl font-black text-[#E85A28]">
              {trip.prix_total.toFixed(2)}€
            </div>
            <div className="text-xs text-slate-500">total</div>
          </div>
          <button
            onClick={onSaveFavorite}
            className={`text-2xl transition-transform hover:scale-110 ${
              isFav ? 'text-[#E85A28]' : 'text-gray-300 hover:text-[#FF6B35]'
            }`}
            title={isFav ? 'Déjà en favoris' : 'Ajouter aux favoris'}
          >
            {isFav ? '♥' : '♡'}
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-[#FFF8F3] rounded-2xl p-4 border border-orange-100">
          <div className="flex items-center mb-2">
            <span className="text-[#E85A28] font-bold mr-2">ALLER</span>
            {trip.leg_prices_reliable !== false && trip.aller.price > 0 ? (
              <span className="text-sm text-slate-600">{trip.aller.price.toFixed(2)}€</span>
            ) : null}
          </div>
          <div className="text-sm space-y-1">
            <div><span className="font-semibold">Date:</span> {formatDate(trip.aller.departureTime)}</div>
            <div><span className="font-semibold">Heure:</span> {formatTime(trip.aller.departureTime)}</div>
            <div><span className="font-semibold">Vol:</span> {trip.aller.flightNumber}</div>
            <div className="text-xs text-gray-600">{trip.aller.origin} → {trip.aller.destination}</div>
          </div>
        </div>

        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
          <div className="flex items-center mb-2">
            <span className="text-slate-700 font-bold mr-2">RETOUR</span>
            {trip.leg_prices_reliable !== false && trip.retour.price > 0 ? (
              <span className="text-sm text-slate-600">{trip.retour.price.toFixed(2)}€</span>
            ) : null}
          </div>
          <div className="text-sm space-y-1">
            <div><span className="font-semibold">Date:</span> {formatDate(trip.retour.departureTime)}</div>
            <div><span className="font-semibold">Heure:</span> {formatTime(trip.retour.departureTime)}</div>
            <div><span className="font-semibold">Vol:</span> {trip.retour.flightNumber}</div>
            <div className="text-xs text-slate-600">{trip.retour.origin} → {trip.retour.destination}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatsCard({ trips }: { trips: TripResponse[] }) {
  const prices = trips.map(t => t.prix_total)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length
  const destinations = new Set(trips.map(t => t.destination_code))

  return (
    <div className="bg-white rounded-lg shadow-xl p-6">
      <h3 className="text-xl font-bold text-gray-800 mb-4">📈 Statistiques</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-indigo-600">{trips.length}</div>
          <div className="text-sm text-gray-600">Voyages</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{minPrice.toFixed(2)}€</div>
          <div className="text-sm text-gray-600">Prix min</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-600">{maxPrice.toFixed(2)}€</div>
          <div className="text-sm text-gray-600">Prix max</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">{avgPrice.toFixed(2)}€</div>
          <div className="text-sm text-gray-600">Prix moyen</div>
        </div>
      </div>
      <div className="mt-4 text-center text-sm text-gray-600">
        {destinations.size} destination(s) différente(s)
      </div>
    </div>
  )
}

export default Dashboard
