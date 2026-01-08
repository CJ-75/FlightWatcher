'use client'

import { useState, useEffect, useRef } from 'react'
import { ScanResponse, TripResponse, ScanRequest, DateAvecHoraire, Destination, Airport, EnrichedTripResponse } from '@/types'
import { 
  saveSearch, getSavedSearches, deleteSearch, updateSearchLastUsed,
  saveFavorite, getFavorites, deleteFavorite, updateFavoriteStatus,
  saveExcludedDestinations,
  updateSearchAutoCheck, updateSearchLastCheckResults, getActiveAutoChecks,
  setDevMode, getDevMode, saveNewResults, getNewResultsForSearch, clearNewResults,
  toggleFavoriteArchived, getArchivedFavorites, getActiveFavorites, exportAllData,
  setAutoExportEnabled, getAutoExportEnabled
} from '@/utils/storage'
import type { NewResult } from '@/utils/storage'
import type { SavedSearch, SavedFavorite } from '@/utils/storage'
import Auth from '@/components/Auth'
import { getCurrentUser } from '@/lib/supabase'
import { SimpleSearch } from '@/components/SimpleSearch'
import { DestinationCard } from '@/components/DestinationCard'
import { RouletteMode } from '@/components/RouletteMode'
import { LoadingSpinner } from '@/components/LoadingSpinner'
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
      setActiveTab('search')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  // Charger les données depuis le localStorage/Supabase au montage
  useEffect(() => {
    if (isLoadingFromStorage.current) return
    isLoadingFromStorage.current = true

    const loadFromStorage = async () => {
      try {
        // Charger depuis localStorage/Supabase via getSavedSearches
        const savedSearches = await getSavedSearches()
        console.log('📥 Recherches chargées:', savedSearches.length)
        
        if (savedSearches.length > 0) {
          // Charger la dernière recherche utilisée
          const lastUsed = savedSearches.sort((a, b) => {
            const aTime = a.lastUsed ? new Date(a.lastUsed).getTime() : 0
            const bTime = b.lastUsed ? new Date(b.lastUsed).getTime() : 0
            return bTime - aTime
          })[0]
          
          console.log('📋 Dernière recherche:', lastUsed)
          
          if (lastUsed && lastUsed.request) {
            console.log('✅ Chargement des données:', {
              aeroport: lastUsed.request.aeroport_depart,
              dates_depart: lastUsed.request.dates_depart?.length || 0,
              dates_retour: lastUsed.request.dates_retour?.length || 0,
              budget: lastUsed.request.budget_max
            })
            
            setAeroportDepart(lastUsed.request.aeroport_depart || 'BVA')
            setDatesDepart(lastUsed.request.dates_depart || [])
            setDatesRetour(lastUsed.request.dates_retour || [])
            setBudgetMax(lastUsed.request.budget_max || 200)
            setLimiteAllers(lastUsed.request.limite_allers || 50)
            setDestinationsExclues(lastUsed.request.destinations_exclues || [])
            setCurrentRequest(lastUsed.request)
          }
        } else {
          console.log('ℹ️ Aucune recherche sauvegardée trouvée')
        }
      } catch (err) {
        console.error('❌ Erreur chargement depuis storage:', err)
      } finally {
        isLoadingFromStorage.current = false
      }
    }

    loadFromStorage()
  }, [])

  // Charger les aéroports
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50">
      <div className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            ✈️ FlightWatcher
          </h1>
          <p className="text-gray-600">Trouvez les meilleurs prix pour vos vols Ryanair</p>
        </motion.div>

        <Auth />

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <SimpleSearch
          onResults={setSimpleResults}
          onLoading={setLoading}
          onError={setError}
          airports={airports}
          selectedAirport={aeroportDepart}
          onAirportChange={setAeroportDepart}
          flexibleDates={{
            dates_depart: datesDepart,
            dates_retour: datesRetour,
          }}
          onFlexibleDatesChange={(dates) => {
            setDatesDepart(dates.dates_depart)
            setDatesRetour(dates.dates_retour)
          }}
          excludedDestinations={destinationsExclues}
          onExcludedDestinationsChange={setDestinationsExclues}
          destinations={destinations}
          loadingDestinations={loadingDestinations}
          onLoadDestinations={async () => {
            if (!aeroportDepart || aeroportDepart.trim() === '') {
              setError('Veuillez sélectionner un aéroport de départ')
              return
            }
            
            setLoadingDestinations(true)
            setError(null)
            try {
              console.log(`🔄 Chargement des destinations depuis ${aeroportDepart}...`)
              const response = await fetch(`/api/destinations?airport=${aeroportDepart}`)
              
              if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Erreur inconnue' }))
                throw new Error(errorData.error || `Erreur ${response.status}: ${response.statusText}`)
              }
              
              const data = await response.json()
              console.log('📦 Données reçues:', data)
              
              // Vérifier si il y a un message d'erreur dans la réponse
              if (data.message) {
                console.warn('⚠️ Message du serveur:', data.message)
                if (data.message.includes('Python non disponible')) {
                  setError('Python n\'est pas installé ou non disponible. Veuillez installer Python pour utiliser cette fonctionnalité.')
                } else if (data.message.includes('Aucune destination trouvée')) {
                  setError('Aucune destination trouvée pour cet aéroport. Vérifiez que l\'aéroport est correct.')
                } else {
                  setError(data.message)
                }
                return
              }
              
              // Toujours définir destinations, même si vide (pour réinitialiser)
              setDestinations(data.destinations || {})
              
              if (data.destinations && Object.keys(data.destinations).length > 0) {
                const totalDestinations = Object.values(data.destinations).reduce((sum: number, dests: any) => {
                  return sum + (Array.isArray(dests) ? dests.length : 0)
                }, 0)
                console.log(`✅ ${Object.keys(data.destinations).length} pays chargés (${totalDestinations} destinations)`)
              } else {
                console.warn('⚠️ Aucune destination trouvée dans la réponse')
                console.warn('⚠️ Données complètes reçues:', data)
                
                // Si c'est un objet vide mais valide, c'est peut-être normal (pas de vols disponibles)
                if (data.destinations && typeof data.destinations === 'object') {
                  setError('Aucune destination disponible pour cet aéroport dans les 60 prochains jours. Essayez un autre aéroport.')
                } else {
                  setError('Aucune destination trouvée. Le script Python a peut-être rencontré une erreur. Vérifiez les logs du serveur.')
                }
              }
            } catch (err) {
              const errorMessage = err instanceof Error ? err.message : 'Erreur lors du chargement des destinations'
              console.error('❌ Erreur chargement destinations:', err)
              setError(errorMessage)
            } finally {
              setLoadingDestinations(false)
            }
          }}
          limiteAllers={limiteAllers}
          onLimiteAllersChange={setLimiteAllers}
          formatDateFr={(date: string) => {
            const d = new Date(date)
            return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
          }}
        />

        {loading && <LoadingSpinner />}

        {simpleResults.length > 0 && (
          <div className="mt-8">
            <h2 className="text-2xl font-bold mb-4">Résultats</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {simpleResults.map((trip, index) => (
                <DestinationCard key={index} trip={trip} />
              ))}
            </div>
          </div>
        )}

        {data && data.resultats.length > 0 && (
          <div className="mt-8">
            <h2 className="text-2xl font-bold mb-4">Résultats du scan</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.resultats.map((trip, index) => (
                <div key={index} className="bg-white rounded-lg shadow p-4">
                  <h3 className="font-bold">{trip.destination_code}</h3>
                  <p className="text-sm text-gray-600">{trip.aller.destinationFull}</p>
                  <p className="text-lg font-bold text-primary-500">{trip.prix_total.toFixed(2)}€</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard

