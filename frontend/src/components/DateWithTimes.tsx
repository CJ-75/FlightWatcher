import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DateAvecHoraire } from '../types';
import { TimeRangeSelector } from './TimeRangeSelector';
import { DatePreset } from './DatePresets';

interface DateWithTimesProps {
  preset: DatePreset;
  onDatesChange: (dates: { dates_depart: DateAvecHoraire[]; dates_retour: DateAvecHoraire[] }) => void;
  formatDateFr: (dateStr: string) => string;
}

const springConfig = {
  type: "spring" as const,
  stiffness: 300,
  damping: 20,
  mass: 0.5
};

function generateDatesFromPreset(preset: DatePreset): { dates_depart: DateAvecHoraire[]; dates_retour: DateAvecHoraire[] } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const dates_depart: DateAvecHoraire[] = [];
  const dates_retour: DateAvecHoraire[] = [];
  
  if (preset === 'weekend') {
    // Ce weekend : vendredi-dimanche prochain
    const dayOfWeek = today.getDay(); // 0 = dimanche, 5 = vendredi
    let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    if (daysUntilFriday === 0 && dayOfWeek >= 5) {
      daysUntilFriday = 7; // Si on est déjà vendredi ou après, prendre le suivant
    }
    
    const friday = new Date(today);
    friday.setDate(today.getDate() + daysUntilFriday);
    const sunday = new Date(friday);
    sunday.setDate(friday.getDate() + 2);
    
    dates_depart.push({
      date: friday.toISOString().split('T')[0],
      heure_min: '06:00',
      heure_max: '23:59'
    });
    dates_retour.push({
      date: sunday.toISOString().split('T')[0],
      heure_min: '06:00',
      heure_max: '23:59'
    });
  } else if (preset === 'next-weekend') {
    // Weekend prochain : vendredi-dimanche suivant
    const dayOfWeek = today.getDay();
    let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    if (daysUntilFriday === 0) {
      daysUntilFriday = 7;
    } else {
      daysUntilFriday += 7;
    }
    
    const friday = new Date(today);
    friday.setDate(today.getDate() + daysUntilFriday);
    const sunday = new Date(friday);
    sunday.setDate(friday.getDate() + 2);
    
    dates_depart.push({
      date: friday.toISOString().split('T')[0],
      heure_min: '06:00',
      heure_max: '23:59'
    });
    dates_retour.push({
      date: sunday.toISOString().split('T')[0],
      heure_min: '06:00',
      heure_max: '23:59'
    });
  } else if (preset === 'next-week') {
    // 3 jours la semaine prochaine (lundi-mercredi départ, jeudi-samedi retour)
    const dayOfWeek = today.getDay();
    let daysUntilMonday = (1 - dayOfWeek + 7) % 7;
    if (daysUntilMonday === 0) {
      daysUntilMonday = 7;
    }
    
    const monday = new Date(today);
    monday.setDate(today.getDate() + daysUntilMonday);
    
    dates_depart.push(
      { date: monday.toISOString().split('T')[0], heure_min: '06:00', heure_max: '23:59' },
      { date: new Date(monday.getTime() + 24*60*60*1000).toISOString().split('T')[0], heure_min: '06:00', heure_max: '23:59' },
      { date: new Date(monday.getTime() + 2*24*60*60*1000).toISOString().split('T')[0], heure_min: '06:00', heure_max: '23:59' }
    );
    dates_retour.push(
      { date: new Date(monday.getTime() + 3*24*60*60*1000).toISOString().split('T')[0], heure_min: '06:00', heure_max: '23:59' },
      { date: new Date(monday.getTime() + 4*24*60*60*1000).toISOString().split('T')[0], heure_min: '06:00', heure_max: '23:59' },
      { date: new Date(monday.getTime() + 5*24*60*60*1000).toISOString().split('T')[0], heure_min: '06:00', heure_max: '23:59' }
    );
  }
  
  return { dates_depart, dates_retour };
}

export function DateWithTimes({ preset, onDatesChange, formatDateFr }: DateWithTimesProps) {
  const [dates, setDates] = useState<{ dates_depart: DateAvecHoraire[]; dates_retour: DateAvecHoraire[] }>(() => 
    generateDatesFromPreset(preset)
  );

  useEffect(() => {
    const newDates = generateDatesFromPreset(preset);
    setDates(newDates);
    onDatesChange(newDates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  const updateDate = (type: 'depart' | 'retour', index: number, updated: DateAvecHoraire) => {
    const newDates = { ...dates };
    if (type === 'depart') {
      newDates.dates_depart[index] = updated;
    } else {
      newDates.dates_retour[index] = updated;
    }
    setDates(newDates);
    onDatesChange(newDates);
  };

  return (
    <div className="space-y-4">
      {/* Dates de départ */}
      <div>
        <label className="text-sm sm:text-base font-bold text-slate-900 mb-3 block">
          ✈️ Départs
        </label>
        <div className="space-y-3">
          {dates.dates_depart.map((date, index) => (
            <motion.div
              key={`depart-${date.date}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={springConfig}
              className="p-4 bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl border-2 border-primary-200 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1">
                  <div className="text-base sm:text-lg font-black text-primary-900 mb-1">
                    📅 {formatDateFr(date.date)}
                  </div>
                  <div className="text-xs text-primary-600">Horaires de départ</div>
                </div>
              </div>
              <TimeRangeSelector
                date={date}
                onUpdate={(updated) => updateDate('depart', index, updated)}
                type="depart"
              />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Dates de retour */}
      <div>
        <label className="text-sm sm:text-base font-bold text-slate-900 mb-3 block">
          🔙 Retours
        </label>
        <div className="space-y-3">
          {dates.dates_retour.map((date, index) => (
            <motion.div
              key={`retour-${date.date}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={springConfig}
              className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl border-2 border-emerald-200 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1">
                  <div className="text-base sm:text-lg font-black text-emerald-900 mb-1">
                    📅 {formatDateFr(date.date)}
                  </div>
                  <div className="text-xs text-emerald-600">Horaires de retour</div>
                </div>
              </div>
              <TimeRangeSelector
                date={date}
                onUpdate={(updated) => updateDate('retour', index, updated)}
                type="retour"
              />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

