import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { BudgetSlider } from './BudgetSlider';
import { DatePresets, DatePreset } from './DatePresets';
import { AdvancedOptions } from './AdvancedOptions';
import { DateWithTimes } from './DateWithTimes';
import { FlexibleDatesSelector } from './FlexibleDatesSelector';
import { InspireRequest, InspireResponse, EnrichedTripResponse, DateAvecHoraire, Destination } from '../types';
import { Airport } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';
import { LoadingSpinner } from './LoadingSpinner';
import { AirportAutocomplete } from './AirportAutocomplete';

interface SimpleSearchProps {
  onResults: (results: EnrichedTripResponse[]) => void;
  onLoading: (loading: boolean) => void;
  onError: (error: string | null) => void;
  airports: Airport[];
  selectedAirport: string;
  onAirportChange: (code: string) => void;
  // Advanced options
  flexibleDates: { dates_depart: DateAvecHoraire[]; dates_retour: DateAvecHoraire[] };
  onFlexibleDatesChange: (dates: { dates_depart: DateAvecHoraire[]; dates_retour: DateAvecHoraire[] }) => void;
  excludedDestinations: string[];
  onExcludedDestinationsChange: (codes: string[]) => void;
  destinations: Record<string, Destination[]>;
  loadingDestinations: boolean;
  onLoadDestinations: () => void;
  limiteAllers: number;
  onLimiteAllersChange: (value: number) => void;
  formatDateFr: (dateStr: string) => string;
}

const springConfig = {
  type: "spring" as const,
  stiffness: 300,
  damping: 20,
  mass: 0.5
};

export function SimpleSearch({
  onResults,
  onLoading,
  onError,
  airports,
  selectedAirport,
  onAirportChange,
  flexibleDates,
  onFlexibleDatesChange,
  excludedDestinations,
  onExcludedDestinationsChange,
  destinations,
  loadingDestinations,
  onLoadDestinations,
  limiteAllers,
  onLimiteAllersChange,
  formatDateFr
}: SimpleSearchProps) {
  const [budget, setBudget] = useState(100);
  
  // Si des dates flexibles sont déjà chargées, sélectionner automatiquement le preset flexible
  const hasLoadedDates = flexibleDates.dates_depart.length > 0 || flexibleDates.dates_retour.length > 0;
  const [selectedPresets, setSelectedPresets] = useState<DatePreset[]>(hasLoadedDates ? ['flexible'] : []);
  const [isSearching, setIsSearching] = useState(false);
  const [presetDates, setPresetDates] = useState<{ dates_depart: DateAvecHoraire[]; dates_retour: DateAvecHoraire[] }>({
    dates_depart: [],
    dates_retour: []
  });
  const [hasInteractedWithAirport, setHasInteractedWithAirport] = useState(false);
  const [showAirportError, setShowAirportError] = useState(false);
  const airportSectionRef = useRef<HTMLDivElement>(null);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Mettre à jour automatiquement le preset flexible si des dates sont chargées
  useEffect(() => {
    const hasDates = flexibleDates.dates_depart.length > 0 || flexibleDates.dates_retour.length > 0;
    if (hasDates && !selectedPresets.includes('flexible')) {
      console.log('📅 Dates chargées détectées, sélection automatique du preset flexible');
      console.log('Dates départ:', flexibleDates.dates_depart);
      console.log('Dates retour:', flexibleDates.dates_retour);
      setSelectedPresets(['flexible']);
    }
  }, [flexibleDates.dates_depart.length, flexibleDates.dates_retour.length, selectedPresets, flexibleDates]);

  // Fonction pour valider qu'un code d'aéroport est valide
  const isValidAirportCode = (code: string): boolean => {
    // Si la liste d'aéroports n'est pas encore chargée, considérer comme invalide
    if (!airports || airports.length === 0) return false;
    if (!code || code.trim() === '') return false;
    const codeUpper = code.trim().toUpperCase();
    // Vérifier que c'est un code d'aéroport valide (3 lettres) et qu'il existe dans la liste
    return /^[A-Z]{3}$/.test(codeUpper) && airports.some(a => a.code === codeUpper);
  };

  // Vérifier si le bouton doit être désactivé
  const isButtonDisabled = isSearching || selectedPresets.length === 0 || !isValidAirportCode(selectedAirport);

  // Gérer l'affichage du message d'erreur avec timeout
  useEffect(() => {
    if (showAirportError) {
      // Nettoyer le timeout précédent s'il existe
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      // Masquer le message après 5 secondes
      errorTimeoutRef.current = setTimeout(() => {
        setShowAirportError(false);
      }, 5000);
    }
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, [showAirportError]);

  // Gérer le clic sur le bouton désactivé
  const handleButtonClick = () => {
    if (isButtonDisabled) {
      // Si l'aéroport n'est pas valide, afficher le message et scroller
      if (!isValidAirportCode(selectedAirport)) {
        setShowAirportError(true);
        setHasInteractedWithAirport(true);
        // Scroller vers la section aéroport après un court délai pour laisser le message apparaître
        setTimeout(() => {
          airportSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
      // Si aucune période n'est sélectionnée, le message d'erreur sera géré par handleSearch
      if (selectedPresets.length === 0) {
        // Le message d'erreur pour la période sera géré par handleSearch
      }
    } else {
      handleSearch();
    }
  };

  const handleSearch = async () => {
    if (selectedPresets.length === 0) {
      onError('Veuillez sélectionner au moins une période');
      return;
    }

    if (!selectedAirport || selectedAirport.trim() === '') {
      onError('⚠️ Veuillez sélectionner un aéroport de départ avant de lancer la recherche');
      return;
    }

    // Vérifier que le code d'aéroport est valide
    if (!isValidAirportCode(selectedAirport)) {
      onError('⚠️ Veuillez sélectionner un aéroport valide depuis la liste avant de lancer la recherche');
      return;
    }

    // Validation pour dates
    const isFlexible = selectedPresets.includes('flexible');
    if (isFlexible) {
      if (flexibleDates.dates_depart.length === 0 || flexibleDates.dates_retour.length === 0) {
        onError('Veuillez ajouter au moins une date de départ et une date de retour');
        return;
      }
    } else {
      if (presetDates.dates_depart.length === 0 || presetDates.dates_retour.length === 0) {
        onError('Veuillez attendre que les dates soient générées');
        return;
      }
    }

    setIsSearching(true);
    onLoading(true);
    onError(null);

    try {
      // Pour le backend, on utilise 'flexible' si c'est sélectionné, sinon on combine les presets
      const datePresetForBackend: 'weekend' | 'next-weekend' | 'next-week' | 'flexible' = isFlexible ? 'flexible' : 'weekend';
      
      const request: InspireRequest = {
        budget,
        date_preset: datePresetForBackend,
        departure: selectedAirport,
        ...(isFlexible ? {
          flexible_dates: {
            dates_depart: flexibleDates.dates_depart,
            dates_retour: flexibleDates.dates_retour,
          }
        } : {
          flexible_dates: {
            dates_depart: presetDates.dates_depart,
            dates_retour: presetDates.dates_retour,
          }
        }),
        ...(excludedDestinations.length > 0 && {
          destinations_exclues: excludedDestinations
        }),
        ...(limiteAllers !== 50 && {
          limite_allers: limiteAllers
        })
      };

      const response = await fetch('/api/inspire', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Erreur: ${response.statusText}`);
      }

      const result: InspireResponse = await response.json();
      onResults(result.resultats);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setIsSearching(false);
      onLoading(false);
    }
  };

  if (isSearching) {
    return <LoadingSkeleton />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springConfig}
      className="max-w-2xl mx-auto bg-white shadow-xl rounded-2xl p-4 sm:p-6 md:p-8 lg:p-10"
    >
      <BudgetSlider value={budget} onChange={setBudget} />

      <div ref={airportSectionRef} className="mb-6 sm:mb-8">
        <label className="text-base sm:text-lg font-bold text-slate-900 mb-3 sm:mb-4 block">
          ✈️ Depuis
        </label>
        <AirportAutocomplete
          value={selectedAirport}
          onChange={(code) => {
            setHasInteractedWithAirport(true);
            onAirportChange(code);
            // Si l'aéroport devient valide, masquer le message d'erreur
            if (isValidAirportCode(code)) {
              setShowAirportError(false);
            }
          }}
          airports={airports}
        />
        {!isValidAirportCode(selectedAirport) && (hasInteractedWithAirport || showAirportError) && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-sm text-red-500 mt-2"
          >
            ⚠️ Veuillez sélectionner un aéroport valide depuis la liste
          </motion.p>
        )}
      </div>

      <DatePresets
        selected={selectedPresets}
        onChange={setSelectedPresets}
      />

      {/* Section Horaires par jour - visible pour les presets rapides (pas flexible) */}
      {selectedPresets.length > 0 && !selectedPresets.includes('flexible') && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={springConfig}
          className="mb-6 sm:mb-8"
        >
          <label className="text-base sm:text-lg font-bold text-slate-900 mb-3 sm:mb-4 block">
            ⏰ Horaires pour chaque jour
          </label>
          <DateWithTimes
            presets={selectedPresets.filter(p => p !== 'flexible')}
            onDatesChange={setPresetDates}
            formatDateFr={formatDateFr}
          />
        </motion.div>
      )}

      {/* Section Dates flexibles - visible uniquement pour preset flexible */}
      {selectedPresets.includes('flexible') && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={springConfig}
          className="mb-6 sm:mb-8"
        >
          <label className="text-base sm:text-lg font-bold text-slate-900 mb-3 sm:mb-4 block">
            📅 Choisissez vos dates
          </label>
          <FlexibleDatesSelector
            flexibleDates={flexibleDates}
            onFlexibleDatesChange={onFlexibleDatesChange}
            formatDateFr={formatDateFr}
          />
        </motion.div>
      )}

      <AdvancedOptions
        datePreset={selectedPresets.includes('flexible') ? 'flexible' : selectedPresets.length > 0 ? selectedPresets[0] : null}
        excludedDestinations={excludedDestinations}
        onExcludedDestinationsChange={onExcludedDestinationsChange}
        destinations={destinations}
        loadingDestinations={loadingDestinations}
        onLoadDestinations={onLoadDestinations}
        limiteAllers={limiteAllers}
        onLimiteAllersChange={onLimiteAllersChange}
      />

      <motion.button
        onClick={handleButtonClick}
        disabled={false}
        whileHover={!isButtonDisabled ? { scale: 1.05 } : {}}
        whileTap={!isButtonDisabled ? { scale: 0.95 } : {}}
        transition={springConfig}
        className={`w-full bg-primary-500 text-white rounded-full px-6 sm:px-8 py-4 sm:py-5 text-lg sm:text-xl font-black shadow-xl min-h-[56px] flex items-center justify-center
          ${isButtonDisabled
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:bg-primary-600 hover:shadow-2xl'
          }`}
      >
        {isSearching ? (
          <>
            <LoadingSpinner size="sm" color="white" />
            <span className="ml-2">Recherche en cours...</span>
          </>
        ) : (
          <>
            <span className="mr-2">🎲</span>
            Surprise-moi !
          </>
        )}
      </motion.button>
    </motion.div>
  );
}

