import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { generateDatesFromPreset } from '@flightwatcher/shared';
import { BudgetSlider } from './BudgetSlider';
import { PassengerStepper } from './PassengerStepper';
import { DatePresets, DatePreset } from './DatePresets';
import { AdvancedOptions } from './AdvancedOptions';
import { DateWithTimes } from './DateWithTimes';
import { InspireRequest, EnrichedTripResponse, DateAvecHoraire, Destination } from '../types';
import { Airport } from '../types';
import { LoadingSkeleton } from './LoadingSkeleton';
import { getApiClient } from '../utils/apiClient';
import { getSessionId } from '../utils/session';
import { useI18n } from '../contexts/I18nContext';

function withFullDayHours(dates: {
  dates_depart: DateAvecHoraire[];
  dates_retour: DateAvecHoraire[];
}) {
  return {
    dates_depart: dates.dates_depart.map((d) => ({
      ...d,
      heure_min: d.heure_min || '06:00',
      heure_max: d.heure_max || '23:59',
    })),
    dates_retour: dates.dates_retour.map((d) => ({
      ...d,
      heure_min: d.heure_min || '06:00',
      heure_max: d.heure_max || '23:59',
    })),
  };
}

interface SimpleSearchProps {
  onResults: (results: EnrichedTripResponse[], searchInfo?: {
    datePreset: DatePreset | null
    airport: string
    budget: number
    passengers: number
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
  budget?: number; // Budget initial depuis l'extérieur (pour charger une recherche sauvegardée)
  onBudgetChange?: (budget: number) => void; // Callback pour mettre à jour le budget dans le parent
  onSearchEventId?: (id: string) => void; // Callback pour stocker l'ID de l'événement de recherche
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
  formatDateFr,
  onSearchEventId,
  budget: externalBudget,
  onBudgetChange
}: SimpleSearchProps) {
  const { t } = useI18n();
  const [budget, setBudget] = useState(externalBudget || 100);
  const [passengers, setPassengers] = useState(1);
  const [datePreset, setDatePreset] = useState<DatePreset | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [presetDates, setPresetDates] = useState<{ dates_depart: DateAvecHoraire[]; dates_retour: DateAvecHoraire[] }>({
    dates_depart: [],
    dates_retour: []
  });
  const [hasInteractedWithAirport, setHasInteractedWithAirport] = useState(false);
  const [showAirportError, setShowAirportError] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const airportSectionRef = useRef<HTMLDivElement>(null);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousDatesRef = useRef<string>('');
  const hasInitializedRef = useRef(false);

  // Synchroniser le budget externe avec l'état interne
  useEffect(() => {
    if (externalBudget !== undefined && externalBudget !== budget) {
      console.log('💰 Mise à jour du budget:', externalBudget);
      setBudget(externalBudget);
    }
  }, [externalBudget, budget]);

  // Détecter automatiquement quand des dates flexibles sont chargées depuis une recherche sauvegardée
  useEffect(() => {
    const datesKey = JSON.stringify({ 
      depart: flexibleDates.dates_depart, 
      retour: flexibleDates.dates_retour 
    });
    
    // Éviter les déclenchements inutiles
    if (datesKey === previousDatesRef.current && hasInitializedRef.current) {
      return;
    }
    
    previousDatesRef.current = datesKey;
    hasInitializedRef.current = true;
    
    const hasLoadedDates = flexibleDates.dates_depart.length > 0 || flexibleDates.dates_retour.length > 0;
    console.log('🔍 Vérification chargement dates:', {
      hasLoadedDates,
      datesDepartLength: flexibleDates.dates_depart.length,
      datesRetourLength: flexibleDates.dates_retour.length,
      currentPreset: datePreset,
      datesDepart: flexibleDates.dates_depart,
      datesRetour: flexibleDates.dates_retour,
      selectedAirport
    });
    
    // Si des dates sont chargées et qu'on n'est pas déjà en mode flexible, activer le mode flexible
    if (hasLoadedDates && datePreset !== 'flexible') {
      console.log('📅 Dates flexibles chargées détectées, activation automatique du mode flexible');
      console.log('Dates départ:', flexibleDates.dates_depart);
      console.log('Dates retour:', flexibleDates.dates_retour);
      setDatePreset('flexible');
      setShowAdvancedOptions(true);
    }
  }, [flexibleDates.dates_depart, flexibleDates.dates_retour, datePreset, selectedAirport]);

  // Mettre à jour le budget dans le parent quand il change
  const handleBudgetChange = (newBudget: number) => {
    setBudget(newBudget);
    onBudgetChange?.(newBudget);
  };

  const handleFlexibleClick = () => {
    setDatePreset('flexible');
    setShowAdvancedOptions(true);
  };

  // Fonction pour valider qu'un code d'aéroport est valide
  const isValidAirportCode = (code: string): boolean => {
    if (!code || code.trim() === '') return false;
    const codeUpper = code.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(codeUpper)) return false;
    // Liste pas encore chargée : accepter le code IATA (évite bouton bloqué)
    if (!airports || airports.length === 0) return true;
    return airports.some((a) => a.code === codeUpper);
  };

  const resolvePresetDates = (preset: DatePreset) => {
    if (preset === 'flexible') {
      return flexibleDates;
    }
    if (presetDates.dates_depart.length > 0 && presetDates.dates_retour.length > 0) {
      return withFullDayHours(presetDates);
    }
    return withFullDayHours(generateDatesFromPreset(preset));
  };

  // Vérifier si le bouton doit être désactivé
  // Le bouton est désactivé si : recherche en cours OU pas de période sélectionnée OU aéroport invalide
  const isButtonDisabled = isSearching || !datePreset || !isValidAirportCode(selectedAirport);

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
      if (!datePreset) {
        const msg = t('search.error.noPeriod');
        setLocalError(msg);
        onError(msg);
        return;
      }
      if (!isValidAirportCode(selectedAirport)) {
        setShowAirportError(true);
        setHasInteractedWithAirport(true);
        const msg = t('search.error.invalidAirport');
        setLocalError(msg);
        onError(msg);
        setTimeout(() => {
          airportSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 100);
      }
      return;
    }
    void handleSearch();
  };

  const handleSearch = async () => {
    if (!datePreset) {
      const msg = t('search.error.noPeriod');
      setLocalError(msg);
      onError(msg);
      return;
    }

    if (!selectedAirport || selectedAirport.trim() === '') {
      const msg = t('search.error.noAirport');
      setLocalError(msg);
      onError(msg);
      return;
    }

    if (!isValidAirportCode(selectedAirport)) {
      const msg = t('search.error.invalidAirport');
      setLocalError(msg);
      onError(msg);
      return;
    }

    const resolvedDates = resolvePresetDates(datePreset);
    if (resolvedDates.dates_depart.length === 0 || resolvedDates.dates_retour.length === 0) {
      const msg = datePreset === 'flexible' ? t('search.error.noDates') : t('search.error.waitDates');
      setLocalError(msg);
      onError(msg);
      return;
    }

    if (datePreset !== 'flexible') {
      setPresetDates(resolvedDates);
    }

    setIsSearching(true);
    onLoading(true);
    onError(null);
    setLocalError(null);
    setShowEmpty(false);

    try {
      const request: InspireRequest = {
        budget,
        date_preset: datePreset,
        departure: selectedAirport.trim().toUpperCase(),
        passengers,
        flexible_dates: {
          dates_depart: resolvedDates.dates_depart,
          dates_retour: resolvedDates.dates_retour,
        },
        ...(excludedDestinations.length > 0 && {
          destinations_exclues: excludedDestinations
        }),
        ...(limiteAllers !== 50 && {
          limite_allers: limiteAllers
        })
      };

      const result = await getApiClient().inspire(request);
      const trips = Array.isArray(result?.resultats) ? result.resultats : [];

      void getApiClient().trackSearchEvent({
          departure_airport: selectedAirport.trim().toUpperCase(),
          date_preset: datePreset,
          budget,
          dates_depart: resolvedDates.dates_depart,
          dates_retour: resolvedDates.dates_retour,
          destinations_exclues: excludedDestinations,
          limite_allers: limiteAllers,
          results_count: trips.length,
          results: trips.slice(0, 10),
          search_duration_ms: 0,
          api_requests_count: result.nombre_requetes,
          source: 'web',
          user_agent: navigator.userAgent,
          session_id: getSessionId()
        })
        .then((data: unknown) => {
          const payload = data as { status?: string; id?: string }
          if (payload.status === 'success' && payload.id) {
            onSearchEventId?.(payload.id);
          }
        })
        .catch(err => {
          console.warn('Erreur enregistrement événement de recherche:', err);
        });

      onResults(trips, {
        datePreset,
        airport: selectedAirport.trim().toUpperCase(),
        budget,
        passengers,
        datesDepart: resolvedDates.dates_depart,
        datesRetour: resolvedDates.dates_retour,
        excludedDestinations
      });

      setShowEmpty(trips.length === 0);
      } catch (err) {
      const msg = err instanceof Error ? err.message : t('app.error');
      setLocalError(msg);
      onError(msg);
      setShowEmpty(false);
    } finally {
      setIsSearching(false);
      onLoading(false);
    }
  };

  if (isSearching) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
        className="min-h-[60vh] flex items-center justify-center"
      >
        <LoadingSkeleton />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springConfig}
      className="w-full app-card p-4 sm:p-6 md:p-8"
    >
      <BudgetSlider value={budget} onChange={handleBudgetChange} />

      <PassengerStepper value={passengers} onChange={setPassengers} />

      <div ref={airportSectionRef} className="mb-6 sm:mb-8">
        <label className="text-base sm:text-lg font-bold text-slate-900 mb-3 sm:mb-4 block">
          {t('search.departure')}
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
        />
        {!isValidAirportCode(selectedAirport) && (hasInteractedWithAirport || showAirportError) && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-sm text-red-500 mt-2"
          >
            {t('search.departureError')}
          </motion.p>
        )}
      </div>

      <DatePresets
        selected={datePreset}
        onChange={(preset) => {
          setDatePreset(preset);
          setLocalError(null);
          setShowEmpty(false);
          if (preset !== 'flexible') {
            setPresetDates(withFullDayHours(generateDatesFromPreset(preset)));
          }
        }}
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
            {t('search.times')}
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

      {localError && (
        <div className="mt-4 mb-2 p-3 sm:p-4 rounded-2xl border bg-red-50 border-red-200 text-red-700 text-sm sm:text-base">
          {localError}
        </div>
      )}

      {showEmpty && !localError && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 mb-2 p-5 sm:p-6 rounded-2xl border border-line bg-primary-50 text-center"
        >
          <p className="text-base sm:text-lg font-extrabold text-ink">{t('results.noResults')}</p>
          <p className="mt-1.5 text-sm text-muted">{t('results.noResultsHint')}</p>
        </motion.div>
      )}

      <motion.button
        type="button"
        onClick={handleButtonClick}
        disabled={isSearching}
        whileHover={!isButtonDisabled ? { scale: 1.05 } : {}}
        whileTap={!isButtonDisabled ? { scale: 0.95 } : {}}
        transition={springConfig}
        className={`w-full app-btn-primary rounded-full px-4 sm:px-6 md:px-8 py-4 sm:py-5 text-base sm:text-lg md:text-xl font-extrabold min-h-[56px] sm:min-h-[60px] mt-4 sm:mt-6
          ${isButtonDisabled
            ? 'opacity-50 cursor-not-allowed hover:scale-100'
            : ''
          }`}
      >
        {isSearching ? (
          <span>{t('search.inProgress')}</span>
        ) : (
          t('search.launch')
        )}
      </motion.button>
    </motion.div>
  );
}

