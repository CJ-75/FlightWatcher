import { useState } from 'react';
import { motion } from 'framer-motion';
import { DateAvecHoraire } from '../types';
import { TimeRangeSelector } from './TimeRangeSelector';
import { Calendar } from './Calendar';

interface FlexibleDatesSelectorProps {
  flexibleDates: {
    dates_depart: DateAvecHoraire[];
    dates_retour: DateAvecHoraire[];
  };
  onFlexibleDatesChange: (dates: { dates_depart: DateAvecHoraire[]; dates_retour: DateAvecHoraire[] }) => void;
  formatDateFr: (dateStr: string) => string;
}

const springConfig = {
  type: "spring" as const,
  stiffness: 300,
  damping: 20,
  mass: 0.5
};

export function FlexibleDatesSelector({
  flexibleDates,
  onFlexibleDatesChange,
  formatDateFr
}: FlexibleDatesSelectorProps) {
  const [selectedDateType, setSelectedDateType] = useState<'depart' | 'retour'>('depart');
  const [tempDate, setTempDate] = useState('');

  const addDate = (type: 'depart' | 'retour', dateStr: string) => {
    if (!dateStr) return;
    
    const dateObj: DateAvecHoraire = { 
      date: dateStr,
      heure_min: '06:00',
      heure_max: '23:59'
    };
    
    if (type === 'depart') {
      if (flexibleDates.dates_depart.some(d => d.date === dateStr)) return;
      const newDates = [...flexibleDates.dates_depart, dateObj];
      onFlexibleDatesChange({ ...flexibleDates, dates_depart: newDates });
    } else {
      if (flexibleDates.dates_retour.some(d => d.date === dateStr)) return;
      const newDates = [...flexibleDates.dates_retour, dateObj];
      onFlexibleDatesChange({ ...flexibleDates, dates_retour: newDates });
    }
    setTempDate('');
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

  const handleAddDate = () => {
    if (tempDate) {
      addDate(selectedDateType, tempDate);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sélecteur de type de date */}
      <div className="flex gap-3 mb-4">
        <motion.button
          onClick={() => setSelectedDateType('depart')}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={`flex-1 px-4 py-3 rounded-xl font-bold text-sm sm:text-base transition-all ${
            selectedDateType === 'depart'
              ? 'bg-primary-500 text-white shadow-lg'
              : 'bg-slate-100 text-slate-700 hover:bg-primary-100'
          }`}
        >
          ✈️ Départ
        </motion.button>
        <motion.button
          onClick={() => setSelectedDateType('retour')}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={`flex-1 px-4 py-3 rounded-xl font-bold text-sm sm:text-base transition-all ${
            selectedDateType === 'retour'
              ? 'bg-emerald-500 text-white shadow-lg'
              : 'bg-slate-100 text-slate-700 hover:bg-emerald-100'
          }`}
        >
          🔙 Retour
        </motion.button>
      </div>

      {/* Calendrier unique */}
      <div className="mb-6">
        <label className="block text-sm sm:text-base font-bold text-slate-900 mb-3">
          {selectedDateType === 'depart' ? '📅 Date de départ' : '📅 Date de retour'}
        </label>
        
        <div className={`relative rounded-2xl shadow-lg transition-all ${
          selectedDateType === 'depart'
            ? 'bg-gradient-to-br from-primary-50 via-primary-100 to-primary-50'
            : 'bg-gradient-to-br from-emerald-50 via-emerald-100 to-emerald-50'
        }`}>
          <div className={`absolute inset-0 bg-gradient-to-r ${
            selectedDateType === 'depart'
              ? 'from-primary-500/10 to-transparent'
              : 'from-emerald-500/10 to-transparent'
          }`} />
          
          <div className="relative p-1 z-10">
            <Calendar
              value={tempDate}
              onChange={(date) => setTempDate(date)}
              minDate={new Date().toISOString().split('T')[0]}
              className="w-full"
            />
          </div>
        </div>

        <motion.button
          onClick={handleAddDate}
          disabled={!tempDate}
          whileHover={tempDate ? { scale: 1.02, y: -2 } : {}}
          whileTap={tempDate ? { scale: 0.98 } : {}}
          className={`w-full mt-4 px-6 py-4 rounded-2xl font-black text-base sm:text-lg transition-all shadow-lg ${
            tempDate
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:from-emerald-600 hover:to-emerald-700 hover:shadow-xl'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
          }`}
        >
          {tempDate ? (
            <span className="flex items-center justify-center gap-2">
              <span className="text-xl">➕</span>
              <span>Ajouter cette date</span>
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <span>Sélectionnez une date</span>
            </span>
          )}
        </motion.button>
      </div>

      {/* Dates de départ */}
      {flexibleDates.dates_depart.length > 0 && (
        <div>
          <label className="text-base sm:text-lg font-bold text-slate-900 mb-3 block">
            ✈️ Dates de départ
          </label>
          <div className="space-y-3">
            {flexibleDates.dates_depart.map((date) => (
              <motion.div
                key={date.date}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl border-2 border-primary-200 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1">
                    <div className="text-base sm:text-lg font-black text-primary-900 mb-1">
                      📅 {formatDateFr(date.date)}
                    </div>
                    <div className="text-xs text-primary-600">Horaires de départ</div>
                  </div>
                  <motion.button
                    onClick={() => removeDate('depart', date.date)}
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    className="w-8 h-8 flex items-center justify-center bg-red-500 text-white rounded-full text-lg font-bold hover:bg-red-600 shadow-md"
                  >
                    ×
                  </motion.button>
                </div>
                <TimeRangeSelector
                  date={date}
                  onUpdate={(updated) => updateDate('depart', updated)}
                  type="depart"
                />
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Dates de retour */}
      {flexibleDates.dates_retour.length > 0 && (
        <div>
          <label className="text-base sm:text-lg font-bold text-slate-900 mb-3 block">
            🔙 Dates de retour
          </label>
          <div className="space-y-3">
            {flexibleDates.dates_retour.map((date) => (
              <motion.div
                key={date.date}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl border-2 border-emerald-200 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1">
                    <div className="text-base sm:text-lg font-black text-emerald-900 mb-1">
                      📅 {formatDateFr(date.date)}
                    </div>
                    <div className="text-xs text-emerald-600">Horaires de retour</div>
                  </div>
                  <motion.button
                    onClick={() => removeDate('retour', date.date)}
                    whileHover={{ scale: 1.1, rotate: 90 }}
                    whileTap={{ scale: 0.9 }}
                    className="w-8 h-8 flex items-center justify-center bg-red-500 text-white rounded-full text-lg font-bold hover:bg-red-600 shadow-md"
                  >
                    ×
                  </motion.button>
                </div>
                <TimeRangeSelector
                  date={date}
                  onUpdate={(updated) => updateDate('retour', updated)}
                  type="retour"
                />
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Message si aucune date */}
      {flexibleDates.dates_depart.length === 0 && flexibleDates.dates_retour.length === 0 && (
        <div className="text-center py-12 text-slate-400 text-sm">
          Aucune date ajoutée. Sélectionnez une date ci-dessus et cliquez sur "Ajouter une date"
        </div>
      )}
    </div>
  );
}

