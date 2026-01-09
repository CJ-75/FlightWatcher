'use client'

import { useState, useEffect, useRef } from 'react'
import { Airport } from '../types'

interface AirportAutocompleteProps {
  value: string
  onChange: (code: string) => void
  airports?: Airport[] // Optionnel : si fourni, ne pas charger depuis l'API
}

export function AirportAutocomplete({ value, onChange, airports: providedAirports }: AirportAutocompleteProps) {
  const [query, setQuery] = useState('')
  const [airports, setAirports] = useState<Airport[]>(providedAirports || [])
  const [filteredAirports, setFilteredAirports] = useState<Airport[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedAirport, setSelectedAirport] = useState<Airport | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Charger tous les aéroports au montage si non fournis
  useEffect(() => {
    if (providedAirports && providedAirports.length > 0) {
      setAirports(providedAirports)
      return
    }

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
  }, [providedAirports])

  // Synchroniser avec la valeur externe seulement si elle change depuis l'extérieur
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

    // Si l'utilisateur saisit du texte qui n'est pas un code d'aéroport valide sélectionné,
    // réinitialiser la valeur sélectionnée pour forcer la sélection depuis la liste
    const trimmedValue = newValue.trim().toUpperCase()
    const isValidCode = /^[A-Z]{3}$/.test(trimmedValue)
    const airportExists = airports.length > 0 && airports.some(a => a.code === trimmedValue)
    
    // Si un aéroport était sélectionné et que le texte ne correspond plus, réinitialiser
    if (selectedAirport) {
      // Si le texte ne correspond plus à l'aéroport sélectionné, réinitialiser
      if (selectedAirport.code !== trimmedValue) {
        onChange('')
        setSelectedAirport(null)
        previousValueRef.current = ''
      }
    } else if (previousValueRef.current && previousValueRef.current !== '') {
      // Si une valeur était définie précédemment (depuis l'extérieur) et que l'utilisateur tape autre chose,
      // réinitialiser pour forcer une nouvelle sélection
      if (trimmedValue !== previousValueRef.current.toUpperCase()) {
        onChange('')
        previousValueRef.current = ''
      }
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
          if (query.trim() && filteredAirports.length > 0) {
            setShowDropdown(true)
          } else if (query.trim()) {
            // Re-filtrer si on a déjà une query
            const queryLower = query.toLowerCase()
            const filtered = airports.filter(airport =>
              airport.code.toLowerCase().includes(queryLower) ||
              airport.name.toLowerCase().includes(queryLower) ||
              airport.city.toLowerCase().includes(queryLower) ||
              airport.country.toLowerCase().includes(queryLower)
            ).slice(0, 20)
            setFilteredAirports(filtered)
            setShowDropdown(filtered.length > 0)
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

