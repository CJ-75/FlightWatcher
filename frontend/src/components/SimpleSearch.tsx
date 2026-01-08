import { useState } from 'react';
import { motion } from 'framer-motion';
import { BudgetSlider } from './BudgetSlider';
import { DatePresets, DatePreset } from './DatePresets';
import { AdvancedOptions } from './AdvancedOptions';
import { DateWithTimes } from './DateWithTimes';
import { InspireRequest, InspireResponse, EnrichedTripResponse, DateAvecHoraire, Destination } from '../types';
import { Airport } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';
import { LoadingSpinner } from './LoadingSpinner';

interface SimpleSearchProps {
  onResults: (results: EnrichedTripResponse[], searchInfo?: {
    datePreset: DatePreset | null
    airport: string
    budget: number
    datesDepart: DateAvecHoraire[]
    datesRetour: DateAvecHoraire[]
    excludedDestinations: string[]
  }) => void;
  onLoading: (loading: boolean) => void;
  onError: (error: string | null) => void;
  airports: Airport[];
  selectedAirport: string;
  onAirportChange: (code: string) => void;
  AirportAutocomplete: React.ComponentType<{ value: string; onChange: (code: string) => void }>;
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
  AirportAutocomplete,
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
  const [datePreset, setDatePreset] = useState<DatePreset | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [presetDates, setPresetDates] = useState<{ dates_depart: DateAvecHoraire[]; dates_retour: DateAvecHoraire[] }>({
    dates_depart: [],
    dates_retour: []
  });

  const handleFlexibleClick = () => {
    setDatePreset('flexible');
    setShowAdvancedOptions(true);
  };

  const handleSearch = async () => {
    if (!datePreset) {
      onError('Veuillez sélectionner une période');
      return;
    }

    if (!selectedAirport) {
      onError('Veuillez sélectionner un aéroport de départ');
      return;
    }

    // Validation pour dates
    if (datePreset === 'flexible') {
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
      const request: InspireRequest = {
        budget,
        date_preset: datePreset,
        departure: selectedAirport,
        ...(datePreset === 'flexible' ? {
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
      onResults(result.resultats, {
        datePreset,
        airport: selectedAirport,
        budget,
        datesDepart: datePreset === 'flexible' ? flexibleDates.dates_depart : presetDates.dates_depart,
        datesRetour: datePreset === 'flexible' ? flexibleDates.dates_retour : presetDates.dates_retour,
        excludedDestinations
      });
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

      <div className="mb-6 sm:mb-8">
        <label className="text-base sm:text-lg font-bold text-slate-900 mb-3 sm:mb-4 block">
          ✈️ Depuis
        </label>
        <AirportAutocomplete
          value={selectedAirport}
          onChange={onAirportChange}
        />
      </div>

      <DatePresets
        selected={datePreset}
        onChange={setDatePreset}
        onFlexibleClick={handleFlexibleClick}
      />

      {/* Section Horaires par jour - visible pour tous les presets sauf flexible */}
      {datePreset && datePreset !== 'flexible' && (
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
            preset={datePreset}
            onDatesChange={setPresetDates}
            formatDateFr={formatDateFr}
          />
        </motion.div>
      )}

      <AdvancedOptions
        datePreset={datePreset}
        flexibleDates={flexibleDates}
        onFlexibleDatesChange={onFlexibleDatesChange}
        excludedDestinations={excludedDestinations}
        onExcludedDestinationsChange={onExcludedDestinationsChange}
        destinations={destinations}
        loadingDestinations={loadingDestinations}
        onLoadDestinations={onLoadDestinations}
        limiteAllers={limiteAllers}
        onLimiteAllersChange={onLimiteAllersChange}
        formatDateFr={formatDateFr}
      />

      <motion.button
        onClick={handleSearch}
        disabled={isSearching || !datePreset || !selectedAirport}
        whileHover={!isSearching && datePreset && selectedAirport ? { scale: 1.05 } : {}}
        whileTap={!isSearching && datePreset && selectedAirport ? { scale: 0.95 } : {}}
        transition={springConfig}
        className={`w-full bg-primary-500 text-white rounded-full px-6 sm:px-8 py-4 sm:py-5 text-lg sm:text-xl font-black shadow-xl min-h-[56px] flex items-center justify-center mt-8 sm:mt-10
          ${isSearching || !datePreset || !selectedAirport
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
            <span className="mr-2">✈️</span>
            Lancer la recherche
          </>
        )}
      </motion.button>
    </motion.div>
  );
}

