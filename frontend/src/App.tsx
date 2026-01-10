import { useState, useEffect, useRef } from 'react'
import { ScanResponse, TripResponse, ScanRequest, DateAvecHoraire, Destination, Airport, EnrichedTripResponse } from './types'
import { 
  saveSearch, getSavedSearches, deleteSearch, updateSearchLastUsed,
  saveFavorite, getFavorites, deleteFavorite, updateFavoriteStatus,
  saveExcludedDestinations,
  updateSearchAutoCheck, updateSearchLastCheckResults, getActiveAutoChecks,
  setDevMode, getDevMode, saveNewResults, getNewResultsForSearch, clearNewResults,
  toggleFavoriteArchived, getArchivedFavorites, getActiveFavorites,
  isFavorite
} from './utils/storage'
import type { NewResult } from './utils/storage'
import type { SavedSearch, SavedFavorite } from './utils/storage'
import { UserMenu } from './components/UserMenu'
import { getCurrentUser } from './lib/supabase'
import { SimpleSearch } from './components/SimpleSearch'
import { DestinationCard } from './components/DestinationCard'
import { RouletteMode } from './components/RouletteMode'
import { BookingSas } from './components/BookingSas'
import { LoadingSpinner } from './components/LoadingSpinner'
import { Calendar } from './components/Calendar'
import { SaveSearchModal } from './components/SaveSearchModal'
import { Toast } from './components/Toast'
import { motion } from 'framer-motion'

type Tab = 'search' | 'saved'

function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('search')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ScanResponse | null>(null)
  const [simpleResults, setSimpleResults] = useState<EnrichedTripResponse[]>([])
  const [showRoulette, setShowRoulette] = useState(false)
  const [rouletteBudget, setRouletteBudget] = useState(100)
  const [error, setError] = useState<string | null>(null)
  const [bookingTrip, setBookingTrip] = useState<EnrichedTripResponse | null>(null)
  const [currentSearchEventId, setCurrentSearchEventId] = useState<string | null>(null) // ID de l'événement de recherche actuel
  const [lastSearchInfo, setLastSearchInfo] = useState<{
    datePreset: string | null
    airport: string
    budget: number
    datesDepart: DateAvecHoraire[]
    datesRetour: DateAvecHoraire[]
    excludedDestinations: string[]
  } | null>(null)
  const resultsSectionRef = useRef<HTMLDivElement>(null)
  const [airports, setAirports] = useState<Airport[]>([])
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
  const [budgetMax, setBudgetMax] = useState(200)
  const [limiteAllers, setLimiteAllers] = useState(50)
  const [currentRequest, setCurrentRequest] = useState<ScanRequest | null>(null)
  const [destinationsExclues, setDestinationsExclues] = useState<string[]>([])
  const [destinations, setDestinations] = useState<Record<string, Destination[]>>({})
  const [loadingDestinations, setLoadingDestinations] = useState(false)
  const isLoadingFromStorage = useRef(false)
  const shouldScrollToResults = useRef(false)

  // Fonction pour valider qu'un code d'aéroport est valide
  const isValidAirportCode = (code: string): boolean => {
    // Si la liste d'aéroports n'est pas encore chargée, considérer comme invalide
    if (!airports || airports.length === 0) return false;
    if (!code || code.trim() === '') return false;
    const codeUpper = code.trim().toUpperCase();
    // Vérifier que c'est un code d'aéroport valide (3 lettres) et qu'il existe dans la liste
    return /^[A-Z]{3}$/.test(codeUpper) && airports.some(a => a.code === codeUpper);
  };

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
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req)
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || `Erreur: ${response.statusText}`)
      }
      const result: ScanResponse = await response.json()
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
      setError('Aucune recherche à sauvegarder. Veuillez d\'abord effectuer une recherche.')
      return
    }

    const user = await getCurrentUser()
    if (!user) {
      alert('Veuillez vous connecter pour sauvegarder une recherche')
      return
    }

    // Sauvegarder temporairement la requête pour la modal
    setCurrentRequest(requestToSave)
    setShowSaveSearchModal(true)
  }

  const handleConfirmSaveSearch = async (name: string) => {
    if (!currentRequest) {
      setError('Aucune recherche à sauvegarder')
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
      setSaveSuccessMessage(`✅ Recherche "${name}" sauvegardée avec succès !`)
      setError(null)
      // Masquer le message après 3 secondes
      setTimeout(() => setSaveSuccessMessage(null), 3000)
      // La modal se fermera automatiquement via onClose dans SaveSearchModal
    } catch (error) {
      setError('Erreur lors de la sauvegarde')
      console.error(error)
      throw error // Pour que la modal puisse afficher l'erreur
    } finally {
      setIsSavingSearch(false)
    }
  }

  const handleLoadSearch = async (savedSearch: SavedSearch) => {
    console.log('🔄 Chargement de la recherche sauvegardée:', savedSearch);
    const req = savedSearch.request
    console.log('📋 Données de la requête:', {
      aeroport_depart: req.aeroport_depart,
      dates_depart: req.dates_depart,
      dates_retour: req.dates_retour,
      budget_max: req.budget_max,
      limite_allers: req.limite_allers,
      destinations_exclues: req.destinations_exclues
    });
    
    setAeroportDepart(req.aeroport_depart || 'BVA')
    setDatesDepart(req.dates_depart || [])
    setDatesRetour(req.dates_retour || [])
    setBudgetMax(req.budget_max || 200)
    setLimiteAllers(req.limite_allers || 50)
    setDestinationsExclues(req.destinations_exclues || [])
    setCurrentRequest(req)
    
    // Charger les résultats sauvegardés s'ils existent
    console.log('🔍 Vérification des résultats sauvegardés:', {
      hasLastCheckResults: !!savedSearch.lastCheckResults,
      lastCheckResultsLength: savedSearch.lastCheckResults?.length || 0,
      lastCheckResults: savedSearch.lastCheckResults,
      lastCheckedAt: savedSearch.lastCheckedAt
    });
    
    if (savedSearch.lastCheckResults && savedSearch.lastCheckResults.length > 0) {
      console.log('📊 Chargement des résultats sauvegardés:', savedSearch.lastCheckResults.length, 'résultats');
      console.log('📋 Premier résultat exemple:', savedSearch.lastCheckResults[0]);
      
      // Convertir TripResponse[] en EnrichedTripResponse[]
      // S'assurer que les résultats sont bien formatés
      const enrichedResults: EnrichedTripResponse[] = savedSearch.lastCheckResults.map((trip: any) => {
        // Vérifier que le trip a la structure attendue
        if (!trip.aller || !trip.retour) {
          console.warn('⚠️ Résultat mal formaté:', trip);
          return null;
        }
        return {
          ...trip,
          // Les résultats sauvegardés peuvent déjà être enrichis, sinon on les laisse tels quels
        } as EnrichedTripResponse;
      }).filter((trip): trip is EnrichedTripResponse => trip !== null);
      
      console.log('✅ Résultats enrichis:', enrichedResults.length, 'résultats valides');
      console.log('📋 Premier résultat enrichi:', enrichedResults[0]);
      
      if (enrichedResults.length > 0) {
        setSimpleResults(enrichedResults);
        
        // Mettre à jour lastSearchInfo pour afficher les informations de recherche
        setLastSearchInfo({
          datePreset: null, // On ne sait pas quel preset était utilisé
          airport: req.aeroport_depart || 'BVA',
          budget: req.budget_max || 200,
          datesDepart: req.dates_depart || [],
          datesRetour: req.dates_retour || [],
          excludedDestinations: req.destinations_exclues || []
        });
      } else {
        console.warn('⚠️ Aucun résultat valide après filtrage');
        setSimpleResults([]);
        setLastSearchInfo(null);
      }
    } else {
      console.log('ℹ️ Aucun résultat sauvegardé pour cette recherche');
      setSimpleResults([]);
      setLastSearchInfo(null);
    }
    
    await updateSearchLastUsed(savedSearch.id)
    setActiveTab('search')
    
    console.log('✅ Recherche chargée, passage à l\'onglet recherche');
    
    // Marquer qu'on doit scroller vers les résultats après le rendu
    if (savedSearch.lastCheckResults && savedSearch.lastCheckResults.length > 0) {
      shouldScrollToResults.current = true;
    }
  }

  // Effet pour scroller vers les résultats quand ils sont affichés
  useEffect(() => {
    if (shouldScrollToResults.current && activeTab === 'search' && simpleResults.length > 0) {
      // Attendre que le DOM soit complètement rendu et que les animations soient terminées
      const scrollTimeout = setTimeout(() => {
        if (resultsSectionRef.current) {
          console.log('📍 Scroll vers les résultats');
          // Utiliser requestAnimationFrame pour s'assurer que le scroll se fait après le rendu
          requestAnimationFrame(() => {
            resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            shouldScrollToResults.current = false; // Réinitialiser le flag
          });
        }
      }, 600); // Délai plus long pour laisser le temps aux animations de se terminer
      
      return () => clearTimeout(scrollTimeout);
    }
  }, [activeTab, simpleResults.length]);

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
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(favorite.searchRequest)
      })
      if (!response.ok) {
        throw new Error('Erreur lors de la vérification')
      }
      const result: ScanResponse = await response.json()
      
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
    
    setLoadingDestinations(true)
    setError(null)
    try {
      const response = await fetch(`/api/destinations?airport=${airportCode}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erreur lors du chargement' }))
        throw new Error(errorData.error || `Erreur ${response.status}: ${response.statusText}`)
      }
      const data = await response.json()
      setDestinations(data.destinations || {})
      if (!data.destinations || Object.keys(data.destinations).length === 0) {
        setError('Aucune destination trouvée pour cet aéroport')
      }
    } catch (err) {
      console.error('Erreur chargement destinations:', err)
      setError(err instanceof Error ? err.message : 'Erreur lors du chargement des destinations')
    } finally {
      setLoadingDestinations(false)
    }
  }

  // Charger automatiquement les destinations quand l'aéroport change ou au chargement initial
  useEffect(() => {
    if (aeroportDepart) {
      loadDestinations(aeroportDepart)
      // Par défaut, toutes les destinations sont incluses (aucune exclue)
      // Ne pas charger les destinations exclues sauvegardées - réinitialiser à vide
      isLoadingFromStorage.current = true
      setDestinationsExclues([])
      // Réinitialiser le flag après un court délai pour permettre la mise à jour de l'état
      setTimeout(() => {
        isLoadingFromStorage.current = false
      }, 100)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aeroportDepart])

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
      // Désélectionner tous
      setDestinationsExclues(prev => prev.filter(c => !codesPays.includes(c)))
    } else {
      // Sélectionner tous
      setDestinationsExclues(prev => [...new Set([...prev, ...codesPays])])
    }
  }

  // Charger les aéroports au montage
  useEffect(() => {
    const loadAirports = async () => {
      try {
        const response = await fetch('/api/airports')
        if (!response.ok) throw new Error('Erreur lors du chargement')
        const data = await response.json()
        setAirports(data.airports || [])
      } catch (err) {
        console.error('Erreur chargement aéroports:', err)
      }
    }
    loadAirports()
  }, [])

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

  const handleSimpleResults = (results: EnrichedTripResponse[], searchInfo?: {
    datePreset: string | null
    airport: string
    budget: number
    datesDepart: DateAvecHoraire[]
    datesRetour: DateAvecHoraire[]
    excludedDestinations: string[]
  }) => {
    setSimpleResults(results)
    setError(null)
    if (searchInfo) {
      setLastSearchInfo(searchInfo)
      // Construire et sauvegarder currentRequest pour permettre la sauvegarde
      const request: ScanRequest = {
        aeroport_depart: searchInfo.airport,
        dates_depart: searchInfo.datesDepart,
        dates_retour: searchInfo.datesRetour,
        budget_max: searchInfo.budget,
        limite_allers: limiteAllers,
        destinations_exclues: searchInfo.excludedDestinations.length > 0 ? searchInfo.excludedDestinations : undefined
      }
      setCurrentRequest(request)
    }
    
    // Scroller vers la section des résultats après un court délai pour laisser le temps au DOM de se mettre à jour
    if (results.length > 0) {
      setTimeout(() => {
        resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 300)
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
    <div className="min-h-screen bg-white">
      {/* Menu utilisateur moderne - Aligné avec la fin de la carte max-w-7xl sur desktop */}
      <div className="fixed top-4 right-4 sm:right-6 lg:right-[max(2rem,calc((100vw-1280px)/2+2rem))] z-50">
        <UserMenu />
      </div>
      
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
        {/* Header */}
        <header className="text-center mb-4 sm:mb-6 md:mb-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 mb-4">
            <div className="flex-1 order-2 sm:order-1 hidden sm:block"></div>
            <div className="flex-1 text-center order-1 sm:order-2">
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-slate-900 mb-1 sm:mb-2">
                ✈️ FlightWatcher
              </h1>
              <p className="text-sm sm:text-base md:text-lg text-slate-600 font-medium">
                Trouve ton weekend pas cher
              </p>
            </div>
            {/* Espace pour le menu utilisateur - Desktop */}
            <div className="hidden sm:flex flex-1 justify-end order-3 w-auto">
              <div className="w-12 h-12"></div>
            </div>
          </div>
        </header>

        {/* Onglets */}
        <div className="max-w-5xl mx-auto mb-4 sm:mb-6">
          <div className="flex border-b border-gray-200">
            <motion.button
              onClick={() => setActiveTab('search')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 sm:py-3 font-semibold transition-colors text-sm sm:text-base min-h-[48px] sm:min-h-[44px] flex items-center justify-center ${
                activeTab === 'search'
                  ? 'text-primary-500 border-b-2 border-primary-500'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              🔍 Recherche
            </motion.button>
            <motion.button
              onClick={() => setActiveTab('saved')}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 sm:py-3 font-semibold transition-colors text-sm sm:text-base min-h-[48px] sm:min-h-[44px] flex items-center justify-center ${
                activeTab === 'saved'
                  ? 'text-primary-500 border-b-2 border-primary-500'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              ❤️ Sauvegardés
            </motion.button>
          </div>
        </div>

        {/* Contenu selon l'onglet */}
        {activeTab === 'search' ? (
          <>
            <SimpleSearch
              onResults={handleSimpleResults}
              onLoading={setLoading}
              onError={setError}
              airports={airports}
              selectedAirport={aeroportDepart}
              onAirportChange={setAeroportDepart}
              AirportAutocomplete={AirportAutocomplete}
              flexibleDates={{ dates_depart: datesDepart, dates_retour: datesRetour }}
              onFlexibleDatesChange={(dates) => {
                setDatesDepart(dates.dates_depart);
                setDatesRetour(dates.dates_retour);
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
            />
            
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-2xl mx-auto mb-4 sm:mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm sm:text-base"
              >
                ❌ {error}
              </motion.div>
            )}
            
            {saveSuccessMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-2xl mx-auto mb-4 sm:mb-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg text-sm sm:text-base"
              >
                {saveSuccessMessage}
              </motion.div>
            )}


            {simpleResults.length > 0 && (
              <motion.div
                ref={resultsSectionRef}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="max-w-7xl mx-auto mt-8 sm:mt-12"
              >
                {/* Section résumé de la recherche */}
                {lastSearchInfo && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-r from-primary-50 to-primary-100 rounded-2xl p-4 sm:p-6 mb-6 sm:mb-8 border-2 border-primary-200 shadow-lg px-4 sm:px-6"
                  >
                    <h3 className="text-lg sm:text-xl font-black text-primary-900 mb-3 sm:mb-4">
                      📋 Recherche effectuée
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 text-sm sm:text-base">
                      <div className="flex items-start gap-2">
                        <span className="font-bold text-primary-700">✈️ Départ:</span>
                        <span className="text-slate-700">{lastSearchInfo.airport}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-bold text-primary-700">💰 Budget:</span>
                        <span className="text-slate-700">{lastSearchInfo.budget}€</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-bold text-primary-700">📅 Période:</span>
                        <span className="text-slate-700">
                          {lastSearchInfo.datePreset === 'weekend' ? 'Ce weekend' :
                           lastSearchInfo.datePreset === 'next-weekend' ? 'Weekend prochain' :
                           lastSearchInfo.datePreset === 'next-week' ? '3 jours la semaine prochaine' :
                           lastSearchInfo.datePreset === 'flexible' ? 'Dates flexibles' : 'N/A'}
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-bold text-primary-700">📆 Dates départ:</span>
                        <span className="text-slate-700">{lastSearchInfo.datesDepart.length} date(s)</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="font-bold text-primary-700">🔙 Dates retour:</span>
                        <span className="text-slate-700">{lastSearchInfo.datesRetour.length} date(s)</span>
                      </div>
                      {lastSearchInfo.excludedDestinations.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="font-bold text-primary-700">🚫 Exclusions:</span>
                          <span className="text-slate-700">{lastSearchInfo.excludedDestinations.length} destination(s)</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-4 px-2 sm:px-0">
                  <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900">
                    🎯 Destinations trouvées
                  </h2>
                  <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
                    <motion.button
                      onClick={handleSaveSearch}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="bg-indigo-600 text-white rounded-full px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 font-bold hover:bg-indigo-700 transition-all min-h-[48px] sm:min-h-[44px] text-sm sm:text-base flex-1 sm:flex-none flex items-center justify-center gap-2 active:scale-95"
                    >
                      💾 Sauvegarder
                    </motion.button>
                    <motion.button
                      onClick={() => {
                        // Utiliser le budget de la recherche si disponible, sinon le budget max actuel
                        const budgetToUse = lastSearchInfo?.budget || budgetMax || 200
                        setRouletteBudget(budgetToUse)
                        setShowRoulette(true)
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="bg-accent-500 text-white rounded-full px-4 sm:px-5 md:px-6 py-2.5 sm:py-3 font-bold hover:bg-accent-600 transition-all min-h-[48px] sm:min-h-[44px] text-sm sm:text-base flex-1 sm:flex-none active:scale-95"
                    >
                      🎰 Mode Roulette
                    </motion.button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6 px-2 sm:px-0">
                  {simpleResults.map((trip, index) => (
                    <motion.div
                      key={`${trip.destination_code}-${trip.aller.departureTime}-${trip.retour.departureTime}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <DestinationCard
                        trip={trip}
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
        ) : (
          <SavedTab
            loading={loading}
            onLoadSearch={handleLoadSearch}
            onCheckFavorite={handleCheckFavorite}
            onReloadSearch={handleScan}
            formatDateFr={formatDateFr}
          />
        )}
      </div>

      {/* Roulette Mode Modal */}
      {showRoulette && (
        <RouletteMode
          trips={simpleResults}
          budget={rouletteBudget}
          onClose={() => setShowRoulette(false)}
          onSaveFavorite={handleSimpleSaveFavorite}
          onBook={(trip) => setBookingTrip(trip)}
          checkIsFavorite={checkIsFavorite}
        />
      )}

      {/* Booking SAS Modal */}
      {bookingTrip && (
        <BookingSas
          trip={bookingTrip}
          onClose={() => setBookingTrip(null)}
          onSaveFavorite={() => {
            handleSimpleSaveFavorite(bookingTrip)
            setBookingTrip(null)
          }}
          searchEventId={currentSearchEventId}
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
        duration={3000}
      />
    </div>
  )
}

// Composant d'autocomplétion pour les aéroports
interface AirportAutocompleteProps {
  value: string
  onChange: (code: string) => void
}

function AirportAutocomplete({ value, onChange }: AirportAutocompleteProps) {
  const [query, setQuery] = useState('')
  const [airports, setAirports] = useState<Airport[]>([])
  const [filteredAirports, setFilteredAirports] = useState<Airport[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedAirport, setSelectedAirport] = useState<Airport | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Charger tous les aéroports au montage
  useEffect(() => {
    const loadAirports = async () => {
      try {
        const response = await fetch('/api/airports')
        if (!response.ok) throw new Error('Erreur lors du chargement')
        const data = await response.json()
        setAirports(data.airports || [])
        setFilteredAirports(data.airports || [])
      } catch (err) {
        console.error('Erreur chargement aéroports:', err)
      }
    }
    loadAirports()
  }, [])

  // Synchroniser avec la valeur externe seulement si elle change depuis l'extérieur
  // (pas pendant que l'utilisateur tape)
  const previousValueRef = useRef(value)
  useEffect(() => {
    // Seulement mettre à jour si la valeur change depuis l'extérieur (pas pendant la saisie)
    if (value !== previousValueRef.current) {
      previousValueRef.current = value
      if (value) {
        const airport = airports.find(a => a.code === value.toUpperCase())
        if (airport && selectedAirport?.code !== airport.code) {
          setSelectedAirport(airport)
          setQuery(`${airport.code} - ${airport.name}, ${airport.city}, ${airport.country}`)
        } else if (!airport) {
          setQuery(value)
          setSelectedAirport(null)
        }
      } else {
        setQuery('')
        setSelectedAirport(null)
      }
    }
  }, [value, airports, selectedAirport])

  // Filtrer les aéroports selon la recherche
  useEffect(() => {
    if (!query.trim()) {
      setFilteredAirports([])
      return
    }

    const queryLower = query.toLowerCase()
    const filtered = airports.filter(airport =>
      airport.code.toLowerCase().includes(queryLower) ||
      airport.name.toLowerCase().includes(queryLower) ||
      airport.city.toLowerCase().includes(queryLower) ||
      airport.country.toLowerCase().includes(queryLower)
    ).slice(0, 20) // Limiter à 20 résultats pour la performance

    setFilteredAirports(filtered)
    setShowDropdown(filtered.length > 0)
  }, [query, airports])

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
    setSelectedAirport(airport)
    setQuery(`${airport.code} - ${airport.name}, ${airport.city}, ${airport.country}`)
    previousValueRef.current = airport.code
    onChange(airport.code)
    setShowDropdown(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setQuery(newValue)
    setShowDropdown(true)
    
    // Si l'utilisateur efface tout, réinitialiser
    if (!newValue.trim()) {
      onChange('')
      setSelectedAirport(null)
      previousValueRef.current = ''
      return
    }
    
    // Ne pas forcer la sélection automatique - laisser l'utilisateur continuer à taper
    // La sélection se fera uniquement via clic ou Enter
    // Ne pas mettre à jour onChange pendant que l'utilisateur tape, seulement quand il sélectionne
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
          if (filteredAirports.length > 0) {
            setShowDropdown(true)
          }
        }}
        onKeyDown={handleKeyDown}
        placeholder="Rechercher un aéroport (code, nom, ville ou pays)..."
        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-slate-200 rounded-xl text-sm sm:text-base focus:border-primary-500 focus:ring-2 focus:ring-primary-200 hover:border-slate-300 min-h-[44px]"
      />
      {showDropdown && filteredAirports.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 sm:max-h-80 overflow-y-auto"
        >
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
            Recherchez par code aéroport (ex: BVA), ville (ex: Beauvais) ou pays (ex: France)
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
                  Supprimer
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
                  Supprimer
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

// Composant pour l'onglet Sauvegardés
interface SavedTabProps {
  loading: boolean
  onLoadSearch: (search: SavedSearch) => void
  onCheckFavorite: (favorite: SavedFavorite) => void
  onReloadSearch: (request: ScanRequest) => void
  formatDateFr: (dateStr: string) => string
}

function SavedTab({ loading, onLoadSearch, onCheckFavorite, onReloadSearch, formatDateFr }: SavedTabProps) {
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [favorites, setFavorites] = useState<SavedFavorite[]>([])
  const [showAutoCheckConfig, setShowAutoCheckConfig] = useState<Record<string, boolean>>({})
  const [intervalSeconds, setIntervalSeconds] = useState<Record<string, number>>({})
  const [devMode, setDevModeState] = useState(() => getDevMode())
  const [showLightbox, setShowLightbox] = useState(false)
  const [lightboxResults, setLightboxResults] = useState<NewResult | null>(null)
  const [favoritesFilter, setFavoritesFilter] = useState<'all' | 'active' | 'archived'>('all')
  const intervalsRef = useRef<Record<string, NodeJS.Timeout>>({})
  const [expandedSearches, setExpandedSearches] = useState<Set<string>>(new Set())

  const refreshData = async () => {
    try {
      const searches = await getSavedSearches()
      const favs = await getFavorites()
      setSavedSearches(searches)
      setFavorites(favs)
    } catch (error) {
      console.error('Erreur refreshData:', error)
    }
  }

  // Charger les données au montage
  useEffect(() => {
    refreshData()
  }, [])

  // Fonction pour demander la permission de notification
  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
  }

  // Fonction pour afficher une notification
  const showNotification = (title: string, body: string, searchName: string, _newResults: TripResponse[]) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification(title, {
        body: body,
        icon: '/favicon.ico',
        tag: searchName,
        requireInteraction: true
      })
      
      notification.onclick = () => {
        window.focus()
        notification.close()
      }
    }
    // Toujours afficher une alerte même si les notifications ne sont pas autorisées
    alert(`🔔 ${title}\n\n${body}`)
  }

  // Fonction pour effectuer une vérification automatique
  const performAutoCheck = async (search: SavedSearch) => {
    try {
      const response = await fetch('/api/auto-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search_id: search.id,
          previous_results: search.lastCheckResults || [],
          ...search.request
        })
      })

      if (!response.ok) throw new Error('Erreur lors de la vérification')

      const data = await response.json()
      
      // Mettre à jour les résultats
      updateSearchLastCheckResults(search.id, data.current_results)

      // Si de nouveaux résultats, afficher une notification et sauvegarder
      if (data.new_results && data.new_results.length > 0) {
        // Sauvegarder les nouveaux résultats (résultats réels, pas de test)
        saveNewResults(search.id, search.name, data.new_results, false)
        
        const message = `${data.new_results.length} nouveau(x) voyage(s) trouvé(s) pour "${search.name}"`
        showNotification(
          '🆕 Nouveaux vols disponibles',
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

  // Initialiser les auto-checks au chargement
  useEffect(() => {
    const initAutoChecks = async () => {
      const activeSearches = await getActiveAutoChecks()
      activeSearches.forEach(search => {
        if (!intervalsRef.current[search.id]) {
          const interval = search.autoCheckIntervalSeconds || 300
          // Effectuer une vérification immédiate
          performAutoCheck(search)
          
          // Puis programmer les vérifications périodiques
          intervalsRef.current[search.id] = setInterval(async () => {
            const updatedSearches = await getSavedSearches()
            const updatedSearch = updatedSearches.find(s => s.id === search.id)
            if (updatedSearch && updatedSearch.autoCheckEnabled) {
              performAutoCheck(updatedSearch)
            }
          }, interval * 1000)
        }
      })
    }
    
    initAutoChecks()

    // Cleanup au démontage
    return () => {
      Object.values(intervalsRef.current).forEach(interval => clearInterval(interval))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const toggleSearchExpanded = (searchId: string) => {
    setExpandedSearches(prev => {
      const next = new Set(prev)
      if (next.has(searchId)) {
        next.delete(searchId)
      } else {
        next.add(searchId)
      }
      return next
    })
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 px-4 sm:px-6">

      {/* Outils de test en mode développeur */}
      {devMode && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-400 rounded-2xl p-5 shadow-lg"
        >
          <h3 className="text-lg font-black text-yellow-900 mb-4 flex items-center gap-2">
            <span>🛠️</span>
            <span>Outils de test (Mode développeur)</span>
          </h3>
          <div className="flex gap-3 flex-wrap items-center">
            <motion.button
              onClick={testNotification}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-semibold shadow-md"
            >
              🔔 Tester notification
            </motion.button>
            <span className="text-sm text-gray-700 font-medium">ou</span>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  testNewResults(e.target.value)
                  e.target.value = ''
                }
              }}
              className="px-4 py-2.5 border-2 border-gray-300 rounded-xl text-sm font-medium bg-white hover:border-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              defaultValue=""
            >
              <option value="">Tester nouveaux résultats pour...</option>
              {savedSearches.map(search => (
                <option key={search.id} value={search.id}>{search.name}</option>
              ))}
            </select>
          </div>
        </motion.div>
      )}

      {/* Recherches sauvegardées */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-xl overflow-hidden"
      >
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6">
          <h2 className="text-3xl font-black text-white flex items-center gap-3">
            <span>💾</span>
            <span>Recherches sauvegardées</span>
            <span className="text-xl bg-white/20 px-3 py-1 rounded-full">
              {savedSearches.length}
            </span>
          </h2>
        </div>
        
        <div className="p-6">
          {savedSearches.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">🔍</div>
              <p className="text-xl text-gray-500 font-medium">Aucune recherche sauvegardée</p>
              <p className="text-sm text-gray-400 mt-2">Sauvegardez vos recherches pour y accéder rapidement</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {savedSearches.map((search, index) => {
                const isExpanded = expandedSearches.has(search.id)
                const newResultsCount = getNewResultsCount(search.id)
                
                return (
                  <motion.div
                    key={search.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group relative bg-gradient-to-br from-white to-slate-50 rounded-xl border-2 border-slate-200 hover:border-primary-400 transition-all duration-300 overflow-hidden shadow-md hover:shadow-xl"
                  >
                    {/* Badge nouveau résultats */}
                    {newResultsCount > 0 && (
                      <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-10">
                        <motion.button
                          onClick={() => openLightbox(search.id)}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className="relative bg-gradient-to-r from-red-500 to-pink-500 text-white px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 rounded-full font-bold text-xs sm:text-sm shadow-lg hover:shadow-xl min-h-[36px] sm:min-h-[40px] active:scale-95"
                        >
                          🆕 {newResultsCount} nouveau{newResultsCount > 1 ? 'x' : ''}
                        </motion.button>
                      </div>
                    )}

                    <div className="p-3 sm:p-4 md:p-5">
                      {/* En-tête */}
                      <div className="flex flex-col sm:flex-row items-start justify-between mb-3 sm:mb-4 gap-3 sm:gap-4">
                        <div className="flex-1 w-full sm:w-auto sm:pr-4">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
                            <h3 className="text-lg sm:text-xl font-black text-slate-900">{search.name}</h3>
                            {search.autoCheckEnabled && (
                              <motion.span
                                animate={{ scale: [1, 1.05, 1] }}
                                transition={{ duration: 2, repeat: Infinity }}
                                className="inline-flex items-center gap-1 px-2 sm:px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold self-start sm:self-auto"
                              >
                                <span>🔔</span>
                                <span>Auto-vérif</span>
                              </motion.span>
                            )}
                          </div>
                          
                          {/* Infos principales */}
                          <div className="flex flex-wrap gap-2 sm:gap-3 md:gap-4 text-xs sm:text-sm mb-2 sm:mb-3">
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <span className="text-primary-500 font-bold">✈️</span>
                              <span className="text-slate-700 font-semibold">{search.request.aeroport_depart || 'BVA'}</span>
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <span className="text-indigo-500 font-bold">📅</span>
                              <span className="text-slate-700">{search.request.dates_depart.length} départ</span>
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <span className="text-blue-500 font-bold">🔙</span>
                              <span className="text-slate-700">{search.request.dates_retour.length} retour</span>
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-2">
                              <span className="text-emerald-500 font-bold">💰</span>
                              <span className="text-slate-700 font-bold">{search.request.budget_max || 100}€</span>
                            </div>
                          </div>

                          {/* Métadonnées */}
                          <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-slate-500">
                            <span>Créé le {new Date(search.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/ \./g, '.')}</span>
                            {search.lastUsed && (
                              <span className="flex items-center gap-1">
                                <span>•</span>
                                <span>Utilisé le {new Date(search.lastUsed).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).replace(/ \./g, '.')}</span>
                              </span>
                            )}
                            {search.lastCheckedAt && (
                              <span className="flex items-center gap-1 text-blue-600 font-semibold">
                                <span>•</span>
                                <span>✓ Vérifié: {new Date(search.lastCheckedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(/ \./g, '.')}</span>
                              </span>
                            )}
                            {search.autoCheckEnabled && (
                              <span className="flex items-center gap-1 text-green-600 font-semibold">
                                <span>•</span>
                                <span>Toutes les {Math.floor((search.autoCheckIntervalSeconds || 300) / 60)} min</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions principales */}
                      <div className="flex flex-wrap gap-2 sm:gap-2 mb-3">
                        <motion.button
                          onClick={() => onLoadSearch(search)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-lg hover:from-indigo-700 hover:to-indigo-800 text-xs sm:text-sm font-semibold shadow-md flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] sm:min-h-[40px] active:scale-95"
                        >
                          <span>📂</span>
                          <span>Charger</span>
                        </motion.button>
                        <motion.button
                          onClick={async () => {
                            onReloadSearch(search.request)
                            await updateSearchLastUsed(search.id)
                            await refreshData()
                          }}
                          disabled={loading}
                          whileHover={{ scale: loading ? 1 : 1.05 }}
                          whileTap={{ scale: loading ? 1 : 0.95 }}
                          className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 text-xs sm:text-sm font-semibold shadow-md flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] sm:min-h-[40px] active:scale-95"
                        >
                          <span>🔄</span>
                          <span>Relancer</span>
                        </motion.button>
                        <motion.button
                          onClick={async () => {
                            const isEnabled = search.autoCheckEnabled || false
                            if (isEnabled) {
                              if (intervalsRef.current[search.id]) {
                                clearInterval(intervalsRef.current[search.id])
                                delete intervalsRef.current[search.id]
                              }
                              await updateSearchAutoCheck(search.id, false)
                            } else {
                              requestNotificationPermission()
                              const interval = search.autoCheckIntervalSeconds || 300
                              await updateSearchAutoCheck(search.id, true, interval)
                              performAutoCheck({ ...search, autoCheckEnabled: true, autoCheckIntervalSeconds: interval })
                              intervalsRef.current[search.id] = setInterval(async () => {
                                const updatedSearches = await getSavedSearches()
                                const updatedSearch = updatedSearches.find(s => s.id === search.id)
                                if (updatedSearch && updatedSearch.autoCheckEnabled) {
                                  performAutoCheck(updatedSearch)
                                }
                              }, interval * 1000)
                            }
                            await refreshData()
                          }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className={`flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold shadow-md flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] sm:min-h-[40px] active:scale-95 ${
                            search.autoCheckEnabled 
                              ? 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white' 
                              : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white'
                          }`}
                        >
                          <span>{search.autoCheckEnabled ? '⏸️' : '🔔'}</span>
                          <span className="hidden sm:inline">Auto-vérif</span>
                          <span className="sm:hidden">Auto</span>
                        </motion.button>
                        <motion.button
                          onClick={() => toggleSearchExpanded(search.id)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] sm:min-h-[40px] active:scale-95"
                        >
                          <span>{isExpanded ? '▼' : '▶'}</span>
                          <span>Détails</span>
                        </motion.button>
                        <motion.button
                          onClick={() => {
                            if (confirm('Supprimer cette recherche ?')) {
                              if (intervalsRef.current[search.id]) {
                                clearInterval(intervalsRef.current[search.id])
                                delete intervalsRef.current[search.id]
                              }
                              deleteSearch(search.id)
                              refreshData()
                            }
                          }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="px-3 sm:px-4 py-2.5 sm:py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 text-xs sm:text-sm font-semibold shadow-md min-h-[44px] sm:min-h-[40px] min-w-[44px] sm:min-w-auto active:scale-95 flex items-center justify-center"
                          title="Supprimer"
                        >
                          🗑️
                        </motion.button>
                      </div>

                      {/* Section détails expandable */}
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-4 pt-4 border-t border-slate-200"
                        >
                          <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="font-bold text-slate-700">Dates de départ:</span>
                                <div className="mt-1 flex flex-wrap gap-2">
                                  {search.request.dates_depart.slice(0, 3).map((d, i) => (
                                    <span key={i} className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                                      {formatDateFr(d.date)}
                                    </span>
                                  ))}
                                  {search.request.dates_depart.length > 3 && (
                                    <span className="px-2 py-1 bg-slate-200 text-slate-600 rounded text-xs">
                                      +{search.request.dates_depart.length - 3}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div>
                                <span className="font-bold text-slate-700">Dates de retour:</span>
                                <div className="mt-1 flex flex-wrap gap-2">
                                  {search.request.dates_retour.slice(0, 3).map((d, i) => (
                                    <span key={i} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                                      {formatDateFr(d.date)}
                                    </span>
                                  ))}
                                  {search.request.dates_retour.length > 3 && (
                                    <span className="px-2 py-1 bg-slate-200 text-slate-600 rounded text-xs">
                                      +{search.request.dates_retour.length - 3}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            {/* Configuration auto-check */}
                            <div className="pt-3 border-t border-slate-300">
                              <div className="flex items-center justify-between mb-3">
                                <label className="block text-sm font-bold text-slate-700">
                                  ⚙️ Configuration auto-vérification
                                </label>
                                <button
                                  onClick={() => setShowAutoCheckConfig(prev => ({ ...prev, [search.id]: !prev[search.id] }))}
                                  className="text-sm text-primary-600 hover:text-primary-700 font-semibold"
                                >
                                  {showAutoCheckConfig[search.id] ? 'Masquer' : 'Configurer'}
                                </button>
                              </div>
                              {showAutoCheckConfig[search.id] && (
                                <motion.div
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  className="bg-white rounded-lg p-4 border-2 border-slate-300"
                                >
                                  <div className="flex items-center gap-4 flex-wrap">
                                    <div className="flex items-center gap-2">
                                      <label className="text-sm font-semibold text-slate-700">Intervalle:</label>
                                      <input
                                        type="number"
                                        min="60"
                                        max="3600"
                                        step="60"
                                        value={intervalSeconds[search.id] || search.autoCheckIntervalSeconds || 300}
                                        onChange={(e) => setIntervalSeconds(prev => ({ 
                                          ...prev, 
                                          [search.id]: parseInt(e.target.value) || 300 
                                        }))}
                                        className="w-24 px-3 py-2 border-2 border-slate-300 rounded-lg focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                                      />
                                      <span className="text-sm text-slate-600">
                                        secondes ({Math.floor((intervalSeconds[search.id] || search.autoCheckIntervalSeconds || 300) / 60)} min)
                                      </span>
                                    </div>
                                    <motion.button
                                      onClick={async () => {
                                        const newInterval = intervalSeconds[search.id] || search.autoCheckIntervalSeconds || 300
                                        await updateSearchAutoCheck(search.id, !search.autoCheckEnabled, newInterval)
                                        
                                        if (search.autoCheckEnabled) {
                                          if (intervalsRef.current[search.id]) {
                                            clearInterval(intervalsRef.current[search.id])
                                            delete intervalsRef.current[search.id]
                                          }
                                        } else {
                                          requestNotificationPermission()
                                          const interval = newInterval
                                          performAutoCheck({ ...search, autoCheckEnabled: true, autoCheckIntervalSeconds: interval })
                                          intervalsRef.current[search.id] = setInterval(async () => {
                                            const updatedSearches = await getSavedSearches()
                                            const updatedSearch = updatedSearches.find(s => s.id === search.id)
                                            if (updatedSearch && updatedSearch.autoCheckEnabled) {
                                              performAutoCheck(updatedSearch)
                                            }
                                          }, interval * 1000)
                                        }
                                        setShowAutoCheckConfig(prev => ({ ...prev, [search.id]: false }))
                                        await refreshData()
                                      }}
                                      whileHover={{ scale: 1.05 }}
                                      whileTap={{ scale: 0.95 }}
                                      className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold min-h-[44px] sm:min-h-[40px] active:scale-95 ${
                                        search.autoCheckEnabled 
                                          ? 'bg-red-500 hover:bg-red-600 text-white' 
                                          : 'bg-green-500 hover:bg-green-600 text-white'
                                      }`}
                                    >
                                      {search.autoCheckEnabled ? '⏸️ Désactiver' : '▶️ Activer'}
                                    </motion.button>
                                  </div>
                                </motion.div>
                              )}
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
        </div>
      </motion.div>

      {/* Favoris */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-xl overflow-hidden"
      >
        <div className="bg-gradient-to-r from-pink-500 to-rose-600 p-4 sm:p-5 md:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <h2 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2 sm:gap-3">
              <span>❤️</span>
              <span>Voyages favoris</span>
              <span className="text-lg sm:text-xl bg-white/20 px-2 sm:px-3 py-1 rounded-full">
                {favorites.length}
              </span>
            </h2>
            {/* Filtres pour les favoris */}
            <div className="flex gap-2 flex-wrap w-full sm:w-auto">
              <motion.button
                onClick={async () => {
                  setFavoritesFilter('all')
                  const all = await getFavorites()
                  setFavorites(all)
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md min-h-[44px] sm:min-h-[40px] active:scale-95 ${
                  favoritesFilter === 'all'
                    ? 'bg-white text-pink-600'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                Tous ({favorites.length})
              </motion.button>
              <motion.button
                onClick={async () => {
                  setFavoritesFilter('active')
                  const active = await getActiveFavorites()
                  setFavorites(active)
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md min-h-[44px] sm:min-h-[40px] active:scale-95 ${
                  favoritesFilter === 'active'
                    ? 'bg-white text-pink-600'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                Actifs ({favorites.filter(f => !f.archived).length})
              </motion.button>
              <motion.button
                onClick={async () => {
                  setFavoritesFilter('archived')
                  const archived = await getArchivedFavorites()
                  setFavorites(archived)
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md min-h-[44px] sm:min-h-[40px] active:scale-95 ${
                  favoritesFilter === 'archived'
                    ? 'bg-white text-pink-600'
                    : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                Archivés ({favorites.filter(f => f.archived).length})
              </motion.button>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          {favorites.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">❤️</div>
              <p className="text-xl text-gray-500 font-medium">Aucun voyage en favori</p>
              <p className="text-sm text-gray-400 mt-2">Ajoutez des voyages à vos favoris depuis les résultats de recherche</p>
            </div>
          ) : (() => {
            // Filtrer les favoris selon le filtre sélectionné
            const filteredFavorites = favoritesFilter === 'all' 
              ? favorites 
              : favoritesFilter === 'active'
              ? favorites.filter(f => !f.archived)
              : favorites.filter(f => f.archived)
            
            if (filteredFavorites.length === 0) {
              return (
                <div className="text-center py-16">
                  <div className="text-6xl mb-4">{favoritesFilter === 'archived' ? '📦' : '✨'}</div>
                  <p className="text-xl text-gray-500 font-medium">
                    {favoritesFilter === 'archived' 
                      ? 'Aucun voyage archivé' 
                      : 'Aucun voyage actif'}
                  </p>
                </div>
              )
            }
            
            return (
              <div className="grid gap-5">
                {filteredFavorites.map((favorite, index) => (
                  <motion.div
                    key={favorite.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`group relative rounded-xl border-2 overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 ${
                      favorite.archived 
                        ? 'border-slate-300 bg-gradient-to-br from-slate-50 to-slate-100 opacity-80' 
                        : 'border-pink-200 bg-gradient-to-br from-pink-50 via-rose-50 to-white'
                    }`}
                  >
                    {/* Badge archivé */}
                    {favorite.archived && (
                      <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-10">
                        <span className="px-2 sm:px-3 py-1 bg-slate-500 text-white text-xs font-bold rounded-full shadow-md">
                          📦 Archivé
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
                                    <span className="text-2xl font-black text-pink-600 leading-none">
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
                                <span className="text-3xl sm:text-4xl md:text-5xl font-black text-pink-600 leading-none">
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
                            onClick={async () => {
                              await onCheckFavorite(favorite)
                              refreshData()
                            }}
                            disabled={loading}
                            whileHover={{ scale: loading ? 1 : 1.05 }}
                            whileTap={{ scale: loading ? 1 : 0.95 }}
                            className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 text-xs sm:text-sm font-semibold shadow-md flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] sm:min-h-[40px] active:scale-95"
                          >
                            <span>🔍</span>
                            <span>Vérifier</span>
                          </motion.button>
                          <motion.button
                            onClick={() => {
                              toggleFavoriteArchived(favorite.id)
                              refreshData()
                            }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className={`flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold shadow-md flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] sm:min-h-[40px] active:scale-95 ${
                              favorite.archived
                                ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white'
                                : 'bg-gradient-to-r from-slate-500 to-slate-600 hover:from-slate-600 hover:to-slate-700 text-white'
                            }`}
                            title={favorite.archived ? 'Désarchiver' : 'Archiver'}
                          >
                            <span>{favorite.archived ? '📤' : '📦'}</span>
                            <span className="hidden sm:inline">{favorite.archived ? 'Désarchiver' : 'Archiver'}</span>
                            <span className="sm:hidden">{favorite.archived ? 'Désarch.' : 'Archiver'}</span>
                          </motion.button>
                          <motion.button
                            onClick={() => {
                              if (confirm('Supprimer ce favori ?')) {
                                deleteFavorite(favorite.id)
                                refreshData()
                              }
                            }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="px-3 sm:px-4 py-2.5 sm:py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 text-xs sm:text-sm font-semibold shadow-md min-h-[44px] sm:min-h-[40px] min-w-[44px] sm:min-w-auto active:scale-95 flex items-center justify-center"
                            title="Supprimer"
                          >
                            🗑️
                          </motion.button>
                        </div>
                      </div>

                      {/* Détails des vols */}
                      <div className="grid sm:grid-cols-2 gap-3 sm:gap-4 mt-4 sm:mt-5 pt-4 sm:pt-5 border-t-2 border-slate-200">
                        <motion.div
                          whileHover={{ scale: 1.02 }}
                          className="bg-white rounded-xl p-3 sm:p-4 border-2 border-green-200 shadow-md"
                        >
                          <div className="flex items-center justify-between mb-2 sm:mb-3">
                            <div className="text-xs sm:text-sm font-black text-green-600 flex items-center gap-1.5 sm:gap-2">
                              <span>✈️</span>
                              <span>ALLER</span>
                            </div>
                            <div className="text-lg sm:text-xl font-black text-green-600">
                              {favorite.trip.aller.price.toFixed(0)}€
                            </div>
                          </div>
                          <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                            <div className="flex justify-between">
                              <span className="font-semibold text-slate-700">Date:</span>
                              <span className="text-slate-600">{formatDateFr(favorite.trip.aller.departureTime)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="font-semibold text-slate-700">Heure:</span>
                              <span className="text-slate-600">{new Date(favorite.trip.aller.departureTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="font-semibold text-slate-700">Vol:</span>
                              <span className="text-slate-600 font-mono">{favorite.trip.aller.flightNumber}</span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-green-100">
                              <span className="text-slate-500 text-xs">Trajet:</span>
                              <span className="text-slate-700 font-bold">{favorite.trip.aller.origin} → {favorite.trip.aller.destination}</span>
                            </div>
                          </div>
                        </motion.div>
                        <motion.div
                          whileHover={{ scale: 1.02 }}
                          className="bg-white rounded-xl p-3 sm:p-4 border-2 border-blue-200 shadow-md"
                        >
                          <div className="flex items-center justify-between mb-2 sm:mb-3">
                            <div className="text-xs sm:text-sm font-black text-blue-600 flex items-center gap-1.5 sm:gap-2">
                              <span>🔙</span>
                              <span>RETOUR</span>
                            </div>
                            <div className="text-lg sm:text-xl font-black text-blue-600">
                              {favorite.trip.retour.price.toFixed(0)}€
                            </div>
                          </div>
                          <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                            <div className="flex justify-between">
                              <span className="font-semibold text-slate-700">Date:</span>
                              <span className="text-slate-600">{formatDateFr(favorite.trip.retour.departureTime)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="font-semibold text-slate-700">Heure:</span>
                              <span className="text-slate-600">{new Date(favorite.trip.retour.departureTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="font-semibold text-slate-700">Vol:</span>
                              <span className="text-slate-600 font-mono">{favorite.trip.retour.flightNumber}</span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-blue-100">
                              <span className="text-slate-500 text-xs">Trajet:</span>
                              <span className="text-slate-700 font-bold">{favorite.trip.retour.origin} → {favorite.trip.retour.destination}</span>
                            </div>
                          </div>
                        </motion.div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )
          })()}
        </div>
      </motion.div>

      {/* Lightbox pour afficher les nouveaux résultats */}
      {showLightbox && lightboxResults && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowLightbox(false)
            setLightboxResults(null)
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-gradient-to-r from-emerald-500 to-teal-600 p-6 flex items-center justify-between z-10">
              <div>
                <h2 className="text-3xl font-black text-white flex items-center gap-3">
                  <span>🆕</span>
                  <span>Nouveaux résultats</span>
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
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                className="text-white hover:text-white/80 text-3xl font-bold w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
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
            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 p-4 flex justify-end gap-3">
              <motion.button
                onClick={() => {
                  clearNewResults(lightboxResults.searchId)
                  setShowLightbox(false)
                  setLightboxResults(null)
                  refreshData()
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-6 py-3 bg-gradient-to-r from-slate-600 to-slate-700 text-white rounded-xl hover:from-slate-700 hover:to-slate-800 font-semibold shadow-md"
              >
                Marquer comme lus
              </motion.button>
              <motion.button
                onClick={() => {
                  setShowLightbox(false)
                  setLightboxResults(null)
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-xl hover:from-indigo-700 hover:to-indigo-800 font-semibold shadow-md"
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
    <div className="border-2 border-indigo-200 rounded-lg p-5 hover:shadow-md 
                   transition-shadow bg-gradient-to-r from-white to-indigo-50">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-gray-800">
            {trip.destination_code} - {trip.aller.destinationFull}
          </h3>
        </div>
        <div className="text-right flex items-center gap-3">
          <div>
            <div className="text-2xl font-bold text-indigo-600">
              {trip.prix_total.toFixed(2)}€
            </div>
            <div className="text-xs text-gray-500">total</div>
          </div>
          <button
            onClick={onSaveFavorite}
            className={`text-2xl transition-transform hover:scale-110 ${
              isFav ? 'text-red-500' : 'text-gray-300 hover:text-red-400'
            }`}
            title={isFav ? 'Déjà en favoris' : 'Ajouter aux favoris'}
          >
            {isFav ? '❤️' : '🤍'}
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-green-50 rounded-lg p-4 border border-green-200">
          <div className="flex items-center mb-2">
            <span className="text-green-600 font-semibold mr-2">✈️ ALLER</span>
            <span className="text-sm text-gray-600">{trip.aller.price.toFixed(2)}€</span>
          </div>
          <div className="text-sm space-y-1">
            <div><span className="font-semibold">Date:</span> {formatDate(trip.aller.departureTime)}</div>
            <div><span className="font-semibold">Heure:</span> {formatTime(trip.aller.departureTime)}</div>
            <div><span className="font-semibold">Vol:</span> {trip.aller.flightNumber}</div>
            <div className="text-xs text-gray-600">{trip.aller.origin} → {trip.aller.destination}</div>
          </div>
        </div>

        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center mb-2">
            <span className="text-blue-600 font-semibold mr-2">🔙 RETOUR</span>
            <span className="text-sm text-gray-600">{trip.retour.price.toFixed(2)}€</span>
          </div>
          <div className="text-sm space-y-1">
            <div><span className="font-semibold">Date:</span> {formatDate(trip.retour.departureTime)}</div>
            <div><span className="font-semibold">Heure:</span> {formatTime(trip.retour.departureTime)}</div>
            <div><span className="font-semibold">Vol:</span> {trip.retour.flightNumber}</div>
            <div className="text-xs text-gray-600">{trip.retour.origin} → {trip.retour.destination}</div>
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
