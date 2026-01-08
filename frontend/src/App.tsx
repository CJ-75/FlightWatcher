import { useState, useEffect, useRef } from 'react'
import { ScanResponse, TripResponse, ScanRequest, DateAvecHoraire, Destination, Airport, EnrichedTripResponse } from './types'
import { 
  saveSearch, getSavedSearches, deleteSearch, updateSearchLastUsed,
  saveFavorite, getFavorites, deleteFavorite, updateFavoriteStatus,
  saveExcludedDestinations,
  updateSearchAutoCheck, updateSearchLastCheckResults, getActiveAutoChecks,
  setDevMode, getDevMode, saveNewResults, getNewResultsForSearch, clearNewResults,
  toggleFavoriteArchived, getArchivedFavorites, getActiveFavorites, exportAllData,
  setAutoExportEnabled, getAutoExportEnabled
} from './utils/storage'
import type { NewResult } from './utils/storage'
import type { SavedSearch, SavedFavorite } from './utils/storage'
import Auth from './components/Auth'
import { getCurrentUser } from './lib/supabase'
import { SimpleSearch } from './components/SimpleSearch'
import { DestinationCard } from './components/DestinationCard'
import { RouletteMode } from './components/RouletteMode'
import { BookingSas } from './components/BookingSas'
import { LoadingSpinner } from './components/LoadingSpinner'
import { Calendar } from './components/Calendar'
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
  
  // États pour les paramètres de recherche
  const [aeroportDepart, setAeroportDepart] = useState('BVA')
  const [datesDepart, setDatesDepart] = useState<DateAvecHoraire[]>([])
  const [datesRetour, setDatesRetour] = useState<DateAvecHoraire[]>([])
  const [budgetMax, setBudgetMax] = useState(200)
  const [limiteAllers, setLimiteAllers] = useState(50)
  const [currentRequest, setCurrentRequest] = useState<ScanRequest | null>(null)
  const [destinationsExclues, setDestinationsExclues] = useState<string[]>([])
  const [destinations, setDestinations] = useState<Record<string, Destination[]>>({})
  const [loadingDestinations, setLoadingDestinations] = useState(false)
  const isLoadingFromStorage = useRef(false)

  const handleScan = async (request?: ScanRequest) => {
    const req = request || {
      aeroport_depart: aeroportDepart,
      dates_depart: datesDepart,
      dates_retour: datesRetour,
      budget_max: budgetMax,
      limite_allers: limiteAllers,
      destinations_exclues: destinationsExclues.length > 0 ? destinationsExclues : undefined
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSearch = async () => {
    if (!currentRequest) {
      setError('Aucune recherche à sauvegarder')
      return
    }

    const user = await getCurrentUser()
    if (!user) {
      alert('Veuillez vous connecter pour sauvegarder une recherche')
      return
    }

    const name = prompt('Nom de la recherche:') || `Recherche ${new Date().toLocaleDateString()}`
    try {
      await saveSearch({ name, request: currentRequest })
      alert('Recherche sauvegardée !')
    } catch (error) {
      setError('Erreur lors de la sauvegarde')
      console.error(error)
    }
  }

  const handleLoadSearch = async (savedSearch: SavedSearch) => {
    const req = savedSearch.request
    setAeroportDepart(req.aeroport_depart || 'BVA')
    setDatesDepart(req.dates_depart)
    setDatesRetour(req.dates_retour)
    setBudgetMax(req.budget_max || 200)
    setLimiteAllers(req.limite_allers || 50)
    await updateSearchLastUsed(savedSearch.id)
    setActiveTab('search')
  }

  const handleSaveFavorite = async (trip: TripResponse) => {
    if (!currentRequest) {
      setError('Impossible de sauvegarder le favori')
      return
    }
    
    const user = await getCurrentUser()
    if (!user) {
      alert('Veuillez vous connecter pour sauvegarder un favori')
      return
    }
    
    try {
      await saveFavorite(trip, currentRequest)
      alert('Voyage ajouté aux favoris !')
    } catch (error) {
      setError('Erreur lors de la sauvegarde')
      console.error(error)
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
      alert(isStillValid ? '✅ Le voyage est toujours disponible !' : '❌ Le voyage n\'est plus disponible')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la vérification')
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

  const formatDateFr = (dateStr: string) => {
    const date = new Date(dateStr)
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
    if (!airportCode) return
    
    setLoadingDestinations(true)
    try {
      const response = await fetch(`/api/destinations?airport=${airportCode}`)
      if (!response.ok) throw new Error('Erreur lors du chargement')
      const data = await response.json()
      setDestinations(data.destinations || {})
    } catch (err) {
      console.error('Erreur chargement destinations:', err)
      // Ne pas afficher d'erreur bloquante, juste logger
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
      // Scroller vers la section des résultats après un court délai
      setTimeout(() => {
        resultsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }

  const handleSimpleSaveFavorite = async (trip: EnrichedTripResponse) => {
    const user = await getCurrentUser()
    if (!user) {
      alert('Veuillez vous connecter pour sauvegarder un favori')
      return
    }
    
    // Convertir EnrichedTripResponse en TripResponse pour la sauvegarde
    const tripResponse: TripResponse = {
      aller: trip.aller,
      retour: trip.retour,
      prix_total: trip.prix_total,
      destination_code: trip.destination_code
    }
    
    // Créer un ScanRequest minimal pour la sauvegarde
    const searchRequest: ScanRequest = {
      aeroport_depart: aeroportDepart,
      dates_depart: [],
      dates_retour: [],
      budget_max: trip.prix_total
    }
    
    try {
      await saveFavorite(tripResponse, searchRequest)
      alert('Voyage ajouté aux favoris !')
    } catch (error) {
      setError('Erreur lors de la sauvegarde')
      console.error(error)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
        {/* Header */}
        <header className="text-center mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1"></div>
            <div className="flex-1 text-center">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 mb-2">
                ✈️ FlightWatcher
              </h1>
              <p className="text-base sm:text-lg text-slate-600 font-medium">
                Trouve ton weekend pas cher
              </p>
            </div>
            <div className="flex-1 flex justify-end">
              <Auth />
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
              className={`px-4 sm:px-6 py-2 sm:py-3 font-semibold transition-colors text-sm sm:text-base min-h-[44px] flex items-center ${
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
              className={`px-4 sm:px-6 py-2 sm:py-3 font-semibold transition-colors text-sm sm:text-base min-h-[44px] flex items-center ${
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
              onLoadDestinations={() => loadDestinations(aeroportDepart)}
              limiteAllers={limiteAllers}
              onLimiteAllersChange={setLimiteAllers}
              formatDateFr={formatDateFr}
              onSearchEventId={setCurrentSearchEventId}
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

            {loading && simpleResults.length === 0 && (
              <div className="max-w-2xl mx-auto mb-6 flex items-center justify-center py-12">
                <LoadingSpinner size="lg" color="primary" />
              </div>
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
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 sm:mb-6 gap-4 px-4 sm:px-0">
                  <h2 className="text-3xl sm:text-4xl font-black text-slate-900">
                    🎯 Destinations trouvées
                  </h2>
                  <motion.button
                    onClick={() => {
                      // Utiliser le budget de la recherche si disponible, sinon le budget max actuel
                      const budgetToUse = lastSearchInfo?.budget || budgetMax || 200
                      setRouletteBudget(budgetToUse)
                      setShowRoulette(true)
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="bg-accent-500 text-white rounded-full px-5 sm:px-6 py-3 font-bold hover:bg-accent-600 transition-all min-h-[44px] text-sm sm:text-base w-full sm:w-auto"
                  >
                    🎰 Mode Roulette
                  </motion.button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 px-4 sm:px-0">
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
        className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-base focus:border-primary-500 focus:ring-2 focus:ring-primary-200 hover:border-slate-300"
      />
      {showDropdown && filteredAirports.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
        >
          {filteredAirports.map((airport) => (
            <button
              key={airport.code}
              type="button"
              onClick={() => handleSelectAirport(airport)}
              className={`w-full text-left px-4 py-2 hover:bg-primary-50 transition-colors ${
                selectedAirport?.code === airport.code ? 'bg-primary-100' : ''
              }`}
            >
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-primary-500 min-w-[3rem]">{airport.code}</span>
                  <span className="font-semibold text-gray-800">{airport.name}</span>
                </div>
                <div className="flex items-center gap-2 ml-14 text-sm">
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
  onLoadDestinations, onToggleDestination, onTogglePays
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
            disabled={loading || datesDepart.length === 0 || datesRetour.length === 0}
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
  const [autoExportEnabled, setAutoExportEnabledState] = useState(() => getAutoExportEnabled())
  const intervalsRef = useRef<Record<string, NodeJS.Timeout>>({})

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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
             {/* Mode développeur et Export - Toggle en haut à droite */}
             <div className="flex justify-end gap-2 mb-4 flex-wrap">
               <button
                 onClick={exportAllData}
                 className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                 title="Exporter toutes les données (recherches, favoris, etc.)"
               >
                 💾 Exporter
               </button>
               <button
                 onClick={() => {
                   const newMode = !autoExportEnabled
                   setAutoExportEnabledState(newMode)
                   setAutoExportEnabled(newMode)
                 }}
                 className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                   autoExportEnabled
                     ? 'bg-green-600 text-white hover:bg-green-700'
                     : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
                 }`}
                 title={autoExportEnabled ? 'Export automatique activé - Les données sont exportées automatiquement' : 'Export automatique désactivé - Cliquez pour activer'}
               >
                 {autoExportEnabled ? '🔄 Auto-export ON' : '🔄 Auto-export OFF'}
               </button>
               <button
                 onClick={() => {
                   const newMode = !devMode
                   setDevModeState(newMode)
                   setDevMode(newMode)
                 }}
                 className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                   devMode
                     ? 'bg-purple-600 text-white hover:bg-purple-700'
                     : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
                 }`}
               >
                 {devMode ? '👨‍💻 Mode Dev ON' : '👨‍💻 Mode Dev OFF'}
               </button>
             </div>

      {/* Outils de test en mode développeur */}
      {devMode && (
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4 mb-6">
          <h3 className="text-lg font-bold text-yellow-800 mb-3">🛠️ Outils de test (Mode développeur)</h3>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={testNotification}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            >
              🔔 Tester notification
            </button>
            <span className="text-sm text-gray-600 self-center">ou</span>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  testNewResults(e.target.value)
                  e.target.value = ''
                }
              }}
              className="px-3 py-2 border border-gray-300 rounded text-sm"
              defaultValue=""
            >
              <option value="">Tester nouveaux résultats pour...</option>
              {savedSearches.map(search => (
                <option key={search.id} value={search.id}>{search.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Recherches sauvegardées */}
      <div className="bg-white rounded-lg shadow-xl p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          💾 Recherches sauvegardées ({savedSearches.length})
        </h2>
        {savedSearches.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Aucune recherche sauvegardée</p>
        ) : (
          <div className="space-y-3">
            {savedSearches.map((search) => (
              <div key={search.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800">{search.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Aéroport: {search.request.aeroport_depart || 'BVA'} | 
                      {search.request.dates_depart.length} date(s) départ | 
                      {search.request.dates_retour.length} date(s) retour | 
                      Budget: {search.request.budget_max || 100}€
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Créé: {new Date(search.createdAt).toLocaleDateString()}
                      {search.lastUsed && ` | Dernière utilisation: ${new Date(search.lastUsed).toLocaleDateString()}`}
                      {search.autoCheckEnabled && (
                        <span className="ml-2 text-green-600 font-semibold">
                          🔔 Auto-vérification activée (toutes les {Math.floor((search.autoCheckIntervalSeconds || 300) / 60)} min)
                        </span>
                      )}
                      {search.lastCheckedAt && (
                        <span className="ml-2 text-blue-600">
                          ✓ Vérifié: {new Date(search.lastCheckedAt).toLocaleString()}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => onLoadSearch(search)}
                      className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm"
                    >
                      📂 Charger
                    </button>
                    <button
                      onClick={async () => {
                        onReloadSearch(search.request)
                        await updateSearchLastUsed(search.id)
                        await refreshData()
                      }}
                      disabled={loading}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
                    >
                      🔄 Relancer
                    </button>
                    <button
                      onClick={async () => {
                        const isEnabled = search.autoCheckEnabled || false
                        if (isEnabled) {
                          // Arrêter
                          if (intervalsRef.current[search.id]) {
                            clearInterval(intervalsRef.current[search.id])
                            delete intervalsRef.current[search.id]
                          }
                          await updateSearchAutoCheck(search.id, false)
                        } else {
                          // Démarrer
                          requestNotificationPermission()
                          const interval = search.autoCheckIntervalSeconds || 300
                          await updateSearchAutoCheck(search.id, true, interval)
                          
                          // Effectuer une vérification immédiate
                          performAutoCheck({ ...search, autoCheckEnabled: true, autoCheckIntervalSeconds: interval })
                          
                          // Puis programmer les vérifications périodiques
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
                      className={`px-4 py-2 rounded text-sm ${
                        search.autoCheckEnabled 
                          ? 'bg-orange-600 text-white hover:bg-orange-700' 
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {search.autoCheckEnabled ? '⏸️ Auto-vérif' : '🔔 Auto-vérif'}
                    </button>
                    {/* Bouton "new" avec badge rouge pour les nouveaux résultats */}
                    {getNewResultsCount(search.id) > 0 && (
                      <button
                        onClick={() => openLightbox(search.id)}
                        className="relative px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
                      >
                        🆕 New
                        <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                          {getNewResultsCount(search.id)}
                        </span>
                      </button>
                    )}
                    <button
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
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                {/* Configuration auto-check */}
                {showAutoCheckConfig[search.id] && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-300">
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-semibold text-gray-700">
                        Intervalle de vérification (secondes)
                      </label>
                      <button
                        onClick={() => setShowAutoCheckConfig(prev => ({ ...prev, [search.id]: false }))}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        ✕
                      </button>
                    </div>
                    <div className="flex items-center gap-4">
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
                        className="w-32 px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <span className="text-sm text-gray-600">
                        ({Math.floor((intervalSeconds[search.id] || search.autoCheckIntervalSeconds || 300) / 60)} minutes)
                      </span>
                      <button
                        onClick={async () => {
                          const newInterval = intervalSeconds[search.id] || search.autoCheckIntervalSeconds || 300
                          await updateSearchAutoCheck(search.id, !search.autoCheckEnabled, newInterval)
                          
                          if (search.autoCheckEnabled) {
                            // Arrêter
                            if (intervalsRef.current[search.id]) {
                              clearInterval(intervalsRef.current[search.id])
                              delete intervalsRef.current[search.id]
                            }
                          } else {
                            // Démarrer
                            requestNotificationPermission()
                            const interval = newInterval
                            
                            // Effectuer une vérification immédiate
                            performAutoCheck({ ...search, autoCheckEnabled: true, autoCheckIntervalSeconds: interval })
                            
                            // Puis programmer les vérifications périodiques
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
                        className={`px-4 py-2 rounded text-sm ${
                          search.autoCheckEnabled 
                            ? 'bg-red-600 text-white hover:bg-red-700' 
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        {search.autoCheckEnabled ? '⏸️ Désactiver' : '▶️ Activer'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Favoris */}
      <div className="bg-white rounded-lg shadow-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-800">
            ❤️ Voyages favoris ({favorites.length})
          </h2>
          {/* Filtres pour les favoris */}
          <div className="flex gap-2">
            <button
              onClick={() => setFavoritesFilter('all')}
              className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${
                favoritesFilter === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Tous ({favorites.length})
            </button>
            <button
              onClick={async () => {
                setFavoritesFilter('active')
                const active = await getActiveFavorites()
                setFavorites(active)
              }}
              className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${
                favoritesFilter === 'active'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Actifs ({favorites.filter(f => !f.archived).length})
            </button>
            <button
              onClick={async () => {
                setFavoritesFilter('archived')
                const archived = await getArchivedFavorites()
                setFavorites(archived)
              }}
              className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${
                favoritesFilter === 'archived'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Archivés ({favorites.filter(f => f.archived).length})
            </button>
          </div>
        </div>
        {favorites.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Aucun voyage en favori</p>
        ) : (() => {
          // Filtrer les favoris selon le filtre sélectionné
          const filteredFavorites = favoritesFilter === 'all' 
            ? favorites 
            : favoritesFilter === 'active'
            ? favorites.filter(f => !f.archived)
            : favorites.filter(f => f.archived)
          
          if (filteredFavorites.length === 0) {
            return (
              <p className="text-gray-500 text-center py-8">
                {favoritesFilter === 'archived' 
                  ? 'Aucun voyage archivé' 
                  : 'Aucun voyage actif'}
              </p>
            )
          }
          
          return (
            <div className="grid gap-4">
              {filteredFavorites.map((favorite) => (
                <div key={favorite.id} className={`border-2 rounded-lg p-4 ${
                favorite.archived 
                  ? 'border-gray-300 bg-gray-100 opacity-75' 
                  : 'border-pink-200 bg-pink-50'
              }`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold text-gray-800">
                        {favorite.trip.destination_code} - {favorite.trip.aller.destinationFull}
                      </h3>
                      {favorite.archived && (
                        <span className="px-2 py-1 bg-gray-500 text-white text-xs font-semibold rounded">
                          📦 Archivé
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1 font-semibold">
                      Prix total: {favorite.trip.prix_total.toFixed(2)}€
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Sauvegardé: {new Date(favorite.createdAt).toLocaleDateString()}
                      {favorite.lastChecked && ` | Vérifié: ${new Date(favorite.lastChecked).toLocaleDateString()}`}
                    </p>
                    {favorite.isStillValid !== undefined && (
                      <p className={`text-sm mt-1 font-semibold ${favorite.isStillValid ? 'text-green-600' : 'text-red-600'}`}>
                        {favorite.isStillValid ? '✅ Toujours disponible' : '❌ Plus disponible'}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        await onCheckFavorite(favorite)
                        refreshData()
                      }}
                      disabled={loading}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
                    >
                      🔍 Vérifier
                    </button>
                    <button
                      onClick={() => {
                        toggleFavoriteArchived(favorite.id)
                        refreshData()
                      }}
                      className={`px-4 py-2 rounded text-sm ${
                        favorite.archived
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'bg-gray-600 text-white hover:bg-gray-700'
                      }`}
                      title={favorite.archived ? 'Désarchiver' : 'Archiver'}
                    >
                      {favorite.archived ? '📤 Désarchiver' : '📦 Archiver'}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Supprimer ce favori ?')) {
                          deleteFavorite(favorite.id)
                          refreshData()
                        }
                      }}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-3 mt-3">
                  <div className="bg-white rounded p-3 border border-gray-200">
                    <div className="text-sm font-semibold text-green-600 mb-2">✈️ ALLER</div>
                    <div className="text-xs space-y-1">
                      <div>
                        <span className="font-semibold">Date:</span> {formatDateFr(favorite.trip.aller.departureTime)}
                      </div>
                      <div>
                        <span className="font-semibold">Heure:</span> {new Date(favorite.trip.aller.departureTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div>
                        <span className="font-semibold">Vol:</span> {favorite.trip.aller.flightNumber}
                      </div>
                      <div className="text-gray-600">
                        {favorite.trip.aller.origin} → {favorite.trip.aller.destination}
                      </div>
                      <div className="font-bold text-green-600 mt-1">
                        {favorite.trip.aller.price.toFixed(2)}€
                      </div>
                    </div>
                  </div>
                  <div className="bg-white rounded p-3 border border-gray-200">
                    <div className="text-sm font-semibold text-blue-600 mb-2">🔙 RETOUR</div>
                    <div className="text-xs space-y-1">
                      <div>
                        <span className="font-semibold">Date:</span> {formatDateFr(favorite.trip.retour.departureTime)}
                      </div>
                      <div>
                        <span className="font-semibold">Heure:</span> {new Date(favorite.trip.retour.departureTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div>
                        <span className="font-semibold">Vol:</span> {favorite.trip.retour.flightNumber}
                      </div>
                      <div className="text-gray-600">
                        {favorite.trip.retour.origin} → {favorite.trip.retour.destination}
                      </div>
                      <div className="font-bold text-blue-600 mt-1">
                        {favorite.trip.retour.price.toFixed(2)}€
                      </div>
                    </div>
                  </div>
                </div>
              </div>
                ))}
            </div>
          )
        })()}
      </div>

      {/* Lightbox pour afficher les nouveaux résultats */}
      {showLightbox && lightboxResults && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowLightbox(false)
            setLightboxResults(null)
          }}
        >
          <div 
            className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-300 p-4 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">
                  🆕 Nouveaux résultats - {lightboxResults.searchName}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {lightboxResults.trips.length} nouveau(x) voyage(s) trouvé(s)
                  {lightboxResults.timestamp && (
                    <span className="ml-2">
                      le {new Date(lightboxResults.timestamp).toLocaleString()}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowLightbox(false)
                  setLightboxResults(null)
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              <div className="grid gap-4">
                {lightboxResults.trips
                  .sort((a, b) => a.prix_total - b.prix_total)
                  .map((trip) => (
                    <TripCard
                      key={`${trip.destination_code}-${trip.aller.departureTime}-${trip.retour.departureTime}`}
                      trip={trip}
                      onSaveFavorite={() => {}}
                      isFavorite={false}
                    />
                  ))}
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => {
                    clearNewResults(lightboxResults.searchId)
                    setShowLightbox(false)
                    setLightboxResults(null)
                    refreshData()
                  }}
                  className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Marquer comme lus
                </button>
                <button
                  onClick={() => {
                    setShowLightbox(false)
                    setLightboxResults(null)
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
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
    const date = new Date(dateStr)
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
