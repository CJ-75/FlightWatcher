import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { generateDatesFromPreset } from '@flightwatcher/shared';
import { BudgetSlider } from './BudgetSlider';
import { PassengerStepper } from './PassengerStepper';
import { DatePresets, DatePreset } from './DatePresets';
import { AdvancedOptions } from './AdvancedOptions';
import { DateWithTimes } from './DateWithTimes';
import { FlexibleDatesSelector } from './FlexibleDatesSelector';
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
  budget?: number;
  onBudgetChange?: (budget: number) => void;
  onSearchEventId?: (id: string) => void;
  initialPassengers?: number;
  /** Incrémenté à chaque Modifier / Relancer pour forcer l’hydratation dates */
  searchLoadToken?: number;
  /** Forcer le preset Flexible (Modifier une alerte avec dates explicites) */
  forceFlexible?: boolean;
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
  onBudgetChange,
  initialPassengers = 1,
  searchLoadToken = 0,
  forceFlexible = false,
}: SimpleSearchProps) {
  const { t } = useI18n();
  const hasParentDates =
    flexibleDates.dates_depart.length > 0 || flexibleDates.dates_retour.length > 0;
  const startFlexible = forceFlexible || hasParentDates;

  const [budget, setBudget] = useState(externalBudget || 100);
  const [passengers, setPassengers] = useState(
    initialPassengers > 0 ? initialPassengers : 1,
  );
  const [datePreset, setDatePreset] = useState<DatePreset | null>(
    startFlexible ? 'flexible' : null,
  );
  const [isSearching, setIsSearching] = useState(false);
  const [presetDates, setPresetDates] = useState<{ dates_depart: DateAvecHoraire[]; dates_retour: DateAvecHoraire[] }>({
    dates_depart: flexibleDates.dates_depart,
    dates_retour: flexibleDates.dates_retour,
  });
  const [hasInteractedWithAirport, setHasInteractedWithAirport] = useState(false);
  const [showAirportError, setShowAirportError] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const airportSectionRef = useRef<HTMLDivElement>(null);
  const datesSectionRef = useRef<HTMLDivElement>(null);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const syncedSeedRef = useRef(false);

  // Au mount après Modifier: resynchroniser les dates vers le parent + scroll
  useEffect(() => {
    if (syncedSeedRef.current) return
    if (!startFlexible || !hasParentDates) return
    syncedSeedRef.current = true
    setDatePreset('flexible')
    setPresetDates({
      dates_depart: flexibleDates.dates_depart,
      dates_retour: flexibleDates.dates_retour,
    })
    onFlexibleDatesChange({
      dates_depart: flexibleDates.dates_depart,
      dates_retour: flexibleDates.dates_retour,
    })
    const tId = window.setTimeout(() => {
      datesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 120)
    return () => clearTimeout(tId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchLoadToken])

  const effectivePreset: DatePreset | null =
    datePreset ?? (startFlexible ? 'flexible' : null);
  const showFlexibleDates =
    effectivePreset === 'flexible' || startFlexible || hasParentDates;
  const showPresetTimes =
    !!effectivePreset && effectivePreset !== 'flexible' && !hasParentDates && !forceFlexible;

  useEffect(() => {
    if (externalBudget !== undefined && externalBudget !== budget) {
      setBudget(externalBudget);
    }
  }, [externalBudget, budget]);

  useEffect(() => {
    if (initialPassengers > 0 && initialPassengers !== passengers) {
      setPassengers(initialPassengers);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPassengers]);

  const handleBudgetChange = (newBudget: number) => {
    setBudget(newBudget);
    onBudgetChange?.(newBudget);
  };

  const handleFlexibleClick = () => {
    setDatePreset('flexible');
  };

  const isValidAirportCode = (code: string): boolean => {
    if (!code || code.trim() === '') return false;
    const codeUpper = code.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(codeUpper)) return false;
    if (!airports || airports.length === 0) return true;
    return airports.some((a) => a.code === codeUpper);
  };

  const resolvePresetDates = (preset: DatePreset) => {
    if (preset === 'flexible' || hasParentDates) {
      return flexibleDates;
    }
    if (presetDates.dates_depart.length > 0 && presetDates.dates_retour.length > 0) {
      return withFullDayHours(presetDates);
    }
    return withFullDayHours(generateDatesFromPreset(preset));
  };

  const activePreset = (effectivePreset || datePreset) as DatePreset | null;
  const isButtonDisabled = isSearching || !activePreset || !isValidAirportCode(selectedAirport);

  useEffect(() => {
    if (showAirportError) {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
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

  const handleButtonClick = () => {
    if (isButtonDisabled) {
      if (!activePreset) {
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
    const presetForSearch: DatePreset = activePreset || 'flexible';

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

    const resolvedDates = resolvePresetDates(presetForSearch);
    if (resolvedDates.dates_depart.length === 0 || resolvedDates.dates_retour.length === 0) {
      const msg =
        presetForSearch === 'flexible' || hasParentDates
          ? t('search.error.noDates')
          : t('search.error.waitDates');
      setLocalError(msg);
      onError(msg);
      return;
    }

    if (presetForSearch !== 'flexible' && !hasParentDates) {
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
        date_preset: hasParentDates || presetForSearch === 'flexible' ? 'flexible' : presetForSearch,
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
          date_preset: request.date_preset,
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
        datePreset: request.date_preset,
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
          key={`airport-${selectedAirport}-${searchLoadToken}`}
          value={selectedAirport}
          onChange={(code) => {
            setHasInteractedWithAirport(true);
            onAirportChange(code);
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
        selected={
          effectivePreset === 'flexible' || startFlexible || hasParentDates
            ? 'flexible'
            : effectivePreset
        }
        onChange={(preset) => {
          setDatePreset(preset);
          setLocalError(null);
          setShowEmpty(false);
          if (preset !== 'flexible') {
            const generated = withFullDayHours(generateDatesFromPreset(preset));
            setPresetDates(generated);
            onFlexibleDatesChange({ dates_depart: [], dates_retour: [] });
          }
        }}
        onFlexibleClick={() => {
          handleFlexibleClick();
        }}
      />

      {showPresetTimes && effectivePreset && (
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
            preset={effectivePreset}
            onDatesChange={(dates) => {
              setPresetDates(dates)
              onFlexibleDatesChange(dates)
            }}
            formatDateFr={formatDateFr}
          />
        </motion.div>
      )}

      {showFlexibleDates && (
        <motion.div
          ref={datesSectionRef}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springConfig}
          className="mb-6 sm:mb-8"
        >
          <label className="text-base sm:text-lg font-bold text-slate-900 mb-3 sm:mb-4 block">
            {t('search.times')}
          </label>
          {hasParentDates ? (
            <p className="text-xs sm:text-sm text-slate-500 mb-3">
              {flexibleDates.dates_depart.length} départ
              {flexibleDates.dates_depart.length > 1 ? 's' : ''} ·{' '}
              {flexibleDates.dates_retour.length} retour
              {flexibleDates.dates_retour.length > 1 ? 's' : ''} chargés depuis l’alerte
            </p>
          ) : null}
          <FlexibleDatesSelector
            flexibleDates={flexibleDates}
            onFlexibleDatesChange={onFlexibleDatesChange}
            formatDateFr={formatDateFr}
          />
        </motion.div>
      )}

      <AdvancedOptions
        datePreset={hasParentDates || effectivePreset === 'flexible' ? 'flexible' : effectivePreset}
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
        hideFlexibleDates
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
