import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DateAvecHoraire, Destination } from '../types';
import { TimeRangeSelector } from './TimeRangeSelector';
import { FlexibleDatesSelector } from './FlexibleDatesSelector';

interface AdvancedOptionsProps {
  datePreset: string | null;
  flexibleDates: {
    dates_depart: DateAvecHoraire[];
    dates_retour: DateAvecHoraire[];
  };
  onFlexibleDatesChange: (dates: { dates_depart: DateAvecHoraire[]; dates_retour: DateAvecHoraire[] }) => void;
  excludedDestinations: string[];
  onExcludedDestinationsChange: (codes: string[]) => void;
  destinations: Record<string, Destination[]>;
  loadingDestinations: boolean;
  onLoadDestinations: () => void;
  limiteAllers: number;
  onLimiteAllersChange: (value: number) => void;
  formatDateFr: (dateStr: string) => string;
  /** Dates flexibles déjà affichées dans le formulaire principal */
  hideFlexibleDates?: boolean;
}

const springConfig = {
  type: "spring" as const,
  stiffness: 300,
  damping: 20,
  mass: 0.5
};

export function AdvancedOptions({
  datePreset,
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
  hideFlexibleDates = false,
}: AdvancedOptionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showDestinations, setShowDestinations] = useState(false);
  const dateDepartInputRef = useState<HTMLInputElement | null>(null)[0];
  const dateRetourInputRef = useState<HTMLInputElement | null>(null)[0];

  // Ouvrir auto seulement si les dates flexibles sont encore dans ce panneau
  useEffect(() => {
    if (datePreset === 'flexible' && !hideFlexibleDates) {
      setIsOpen(true);
    }
  }, [datePreset, hideFlexibleDates]);

  const addDate = (type: 'depart' | 'retour', dateStr: string) => {
    const dateObj: DateAvecHoraire = { 
      date: dateStr,
      heure_min: '06:00',
      heure_max: '23:59'
    };
    if (type === 'depart') {
      const newDates = [...flexibleDates.dates_depart, dateObj];
      onFlexibleDatesChange({ ...flexibleDates, dates_depart: newDates });
    } else {
      const newDates = [...flexibleDates.dates_retour, dateObj];
      onFlexibleDatesChange({ ...flexibleDates, dates_retour: newDates });
    }
  };

  const updateDate = (type: 'depart' | 'retour', updatedDate: DateAvecHoraire) => {
    if (type === 'depart') {
      const newDates = flexibleDates.dates_depart.map(d => 
        d.date === updatedDate.date ? updatedDate : d
      );
      onFlexibleDatesChange({ ...flexibleDates, dates_depart: newDates });
    } else {
      const newDates = flexibleDates.dates_retour.map(d => 
        d.date === updatedDate.date ? updatedDate : d
      );
      onFlexibleDatesChange({ ...flexibleDates, dates_retour: newDates });
    }
  };

  const removeDate = (type: 'depart' | 'retour', dateStr: string) => {
    if (type === 'depart') {
      onFlexibleDatesChange({
        ...flexibleDates,
        dates_depart: flexibleDates.dates_depart.filter(d => d.date !== dateStr)
      });
    } else {
      onFlexibleDatesChange({
        ...flexibleDates,
        dates_retour: flexibleDates.dates_retour.filter(d => d.date !== dateStr)
      });
    }
  };

  const toggleDestination = (code: string) => {
    if (excludedDestinations.includes(code)) {
      onExcludedDestinationsChange(excludedDestinations.filter(c => c !== code));
    } else {
      onExcludedDestinationsChange([...excludedDestinations, code]);
    }
  };

  const allDestinations = Object.values(destinations || {}).flat();
  const allCodes = allDestinations.map(d => d.code);

  return (
    <div className="mt-6 sm:mt-8 border-t-2 border-slate-200 pt-6 sm:pt-8">
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className="w-full flex items-center justify-between text-left p-3 sm:p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors min-h-[48px] active:scale-95"
      >
        <span className="text-base sm:text-lg font-bold text-slate-900">
          ⚙️ Options avancées
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={springConfig}
          className="text-2xl"
        >
          ▼
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={springConfig}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-6">
              {datePreset === 'flexible' && !hideFlexibleDates && (
                <div className="space-y-4">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">📅 Dates flexibles</h3>
                  <FlexibleDatesSelector
                    flexibleDates={flexibleDates}
                    onFlexibleDatesChange={onFlexibleDatesChange}
                    formatDateFr={formatDateFr}
                  />
                </div>
              )}

              {/* Destinations exclues — masquées dans Search (API/state conservés) */}

              {/* Limite allers - caché de l'utilisateur mais toujours fonctionnel */}
              <div className="hidden">
                <input
                  type="range"
                  min={50}
                  max={500}
                  step={50}
                  value={limiteAllers}
                  onChange={(e) => onLimiteAllersChange(Number(e.target.value))}
                  className="w-full h-3 bg-slate-200 rounded-full appearance-none cursor-pointer
                             [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6
                             [&::-webkit-slider-thumb]:bg-primary-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg
                             [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:bg-primary-500 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:shadow-lg"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

