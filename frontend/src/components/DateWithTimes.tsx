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

/**
 * Convertit getDay() (0=dimanche, 1=lundi...) en numérotation basée sur lundi
 * Retourne 1=lundi, 2=mardi, ..., 7=dimanche
 */
function getDayOfWeekMondayBased(date: Date): number {
  // getDay() retourne 0=dimanche, 1=lundi, ..., 6=samedi
  // On veut 1=lundi, 2=mardi, ..., 7=dimanche
  const jsDay = date.getDay(); // 0=dimanche, 1=lundi, ..., 6=samedi
  // Conversion: dimanche(0) -> 7, lundi(1) -> 1, mardi(2) -> 2, ..., samedi(6) -> 6
  return jsDay === 0 ? 7 : jsDay;
}

function generateDatesFromPreset(preset: DatePreset): { dates_depart: DateAvecHoraire[]; dates_retour: DateAvecHoraire[] } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const dates_depart: DateAvecHoraire[] = [];
  const dates_retour: DateAvecHoraire[] = [];
  
  // Obtenir le jour actuel (1=lundi, 2=mardi, ..., 7=dimanche)
  const currentDay = getDayOfWeekMondayBased(today);
  
  if (preset === 'weekend') {
    // Ce weekend : samedi et dimanche de cette semaine
    // Samedi = jour 6, Dimanche = jour 7
    const saturdayOffset = 6 - currentDay;
    const sundayOffset = 7 - currentDay;
    
    // Si on est déjà après samedi, prendre le weekend suivant
    const saturday = new Date(today);
    saturday.setDate(today.getDate() + (saturdayOffset < 0 ? saturdayOffset + 7 : saturdayOffset));
    
    const sunday = new Date(today);
    sunday.setDate(today.getDate() + (sundayOffset < 0 ? sundayOffset + 7 : sundayOffset));
    
    dates_depart.push({
      date: saturday.toISOString().split('T')[0],
      heure_min: '06:00',
      heure_max: '23:59'
    });
    dates_retour.push({
      date: sunday.toISOString().split('T')[0],
      heure_min: '06:00',
      heure_max: '23:59'
    });
  } else if (preset === 'next-weekend') {
    // Weekend prochain : samedi et dimanche de la semaine suivante
    // Toujours ajouter 7 jours pour la semaine suivante
    const daysUntilNextSaturday = 13 - currentDay; // 6 (samedi) + 7 jours
    const daysUntilNextSunday = 14 - currentDay;   // 7 (dimanche) + 7 jours
    
    const nextSaturday = new Date(today);
    nextSaturday.setDate(today.getDate() + daysUntilNextSaturday);
    
    const nextSunday = new Date(today);
    nextSunday.setDate(today.getDate() + daysUntilNextSunday);
    
    dates_depart.push({
      date: nextSaturday.toISOString().split('T')[0],
      heure_min: '06:00',
      heure_max: '23:59'
    });
    dates_retour.push({
      date: nextSunday.toISOString().split('T')[0],
      heure_min: '06:00',
      heure_max: '23:59'
    });
  } else if (preset === 'next-week') {
    // 3 jours la semaine prochaine (lundi-mercredi départ, jeudi-samedi retour)
    // Lundi = jour 1, donc pour la semaine prochaine : 1 + 7 = 8
    const daysUntilNextMonday = 8 - currentDay;
    
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilNextMonday);
    
    const nextTuesday = new Date(nextMonday);
    nextTuesday.setDate(nextMonday.getDate() + 1);
    
    const nextWednesday = new Date(nextMonday);
    nextWednesday.setDate(nextMonday.getDate() + 2);
    
    const nextThursday = new Date(nextMonday);
    nextThursday.setDate(nextMonday.getDate() + 3);
    
    const nextFriday = new Date(nextMonday);
    nextFriday.setDate(nextMonday.getDate() + 4);
    
    const nextSaturday = new Date(nextMonday);
    nextSaturday.setDate(nextMonday.getDate() + 5);
    
    dates_depart.push(
      { date: nextMonday.toISOString().split('T')[0], heure_min: '06:00', heure_max: '23:59' },
      { date: nextTuesday.toISOString().split('T')[0], heure_min: '06:00', heure_max: '23:59' },
      { date: nextWednesday.toISOString().split('T')[0], heure_min: '06:00', heure_max: '23:59' }
    );
    dates_retour.push(
      { date: nextThursday.toISOString().split('T')[0], heure_min: '06:00', heure_max: '23:59' },
      { date: nextFriday.toISOString().split('T')[0], heure_min: '06:00', heure_max: '23:59' },
      { date: nextSaturday.toISOString().split('T')[0], heure_min: '06:00', heure_max: '23:59' }
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

