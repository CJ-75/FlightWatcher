import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DateAvecHoraire } from '../types';
import { TimeRangeSelector } from './TimeRangeSelector';
import { DatePreset } from './DatePresets';

interface DateWithTimesProps {
  presets: DatePreset[];
  onDatesChange: (dates: { dates_depart: DateAvecHoraire[]; dates_retour: DateAvecHoraire[] }) => void;
  formatDateFr: (dateStr: string) => string;
}

const springConfig = {
  type: "spring" as const,
  stiffness: 300,
  damping: 20,
  mass: 0.5
};

// Format date en YYYY-MM-DD sans dépendre du timezone
function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generateDatesFromPresets(presets: DatePreset[]): { dates_depart: DateAvecHoraire[]; dates_retour: DateAvecHoraire[] } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Debug temporaire
  console.log('[DateWithTimes] Date actuelle:', formatDateLocal(today), 'Jour:', today.getDay());
  
  const dates_depart: DateAvecHoraire[] = [];
  const dates_retour: DateAvecHoraire[] = [];
  const addedDatesDepart = new Set<string>(); // Pour éviter les doublons dans les départs
  const addedDatesRetour = new Set<string>(); // Pour éviter les doublons dans les retours
  
  const addDateIfNotExists = (date: DateAvecHoraire, isDepart: boolean) => {
    if (isDepart) {
      if (!addedDatesDepart.has(date.date)) {
        addedDatesDepart.add(date.date);
        dates_depart.push(date);
      }
    } else {
      if (!addedDatesRetour.has(date.date)) {
        addedDatesRetour.add(date.date);
        dates_retour.push(date);
      }
    }
  };
  
  // Filtrer 'flexible' car il n'est pas géré ici
  const validPresets = presets.filter(p => p !== 'flexible');
  
  validPresets.forEach(preset => {
    if (preset === 'weekend') {
    // Ce weekend : vendredi-dimanche prochain
    // getDay() : 0=dimanche, 1=lundi, 2=mardi, 3=mercredi, 4=jeudi, 5=vendredi, 6=samedi
    const dayOfWeek = today.getDay(); // 0 = dimanche, 5 = vendredi
    let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    if (daysUntilFriday === 0) {
      daysUntilFriday = 7; // Si on est déjà vendredi, prendre le suivant
    }
    
    const friday = new Date(today);
    friday.setDate(today.getDate() + daysUntilFriday);
    friday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(friday);
    sunday.setDate(friday.getDate() + 2);
    sunday.setHours(0, 0, 0, 0);
    
    // Debug temporaire
    console.log(`[DateWithTimes] Preset weekend: dayOfWeek=${dayOfWeek}, daysUntilFriday=${daysUntilFriday}, friday=${formatDateLocal(friday)}, friday.getDay()=${friday.getDay()}, sunday=${formatDateLocal(sunday)}, sunday.getDay()=${sunday.getDay()}`);
    
      addDateIfNotExists({
        date: formatDateLocal(friday),
        heure_min: '06:00',
        heure_max: '23:59'
      }, true);
      addDateIfNotExists({
        date: formatDateLocal(sunday),
        heure_min: '06:00',
        heure_max: '23:59'
      }, false);
    } else if (preset === 'next-weekend') {
    // Weekend prochain : vendredi-dimanche suivant
    const dayOfWeek = today.getDay();
    let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    if (daysUntilFriday === 0) {
      daysUntilFriday = 7; // Si on est vendredi, prendre le suivant
    }
    daysUntilFriday += 7; // Toujours ajouter 7 pour le weekend prochain
    
    const friday = new Date(today);
    friday.setDate(today.getDate() + daysUntilFriday);
    friday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(friday);
    sunday.setDate(friday.getDate() + 2);
    sunday.setHours(0, 0, 0, 0);
    
      addDateIfNotExists({
        date: formatDateLocal(friday),
        heure_min: '06:00',
        heure_max: '23:59'
      }, true);
      addDateIfNotExists({
        date: formatDateLocal(sunday),
        heure_min: '06:00',
        heure_max: '23:59'
      }, false);
    } else if (preset === 'next-week') {
    // 3 jours la semaine prochaine : vendredi-dimanche
    // Horaires : 23h00 à 6h00 (plage qui traverse minuit)
    const dayOfWeek = today.getDay(); // 0 = dimanche, 5 = vendredi
    let daysUntilFriday = (5 - dayOfWeek + 7) % 7;
    if (daysUntilFriday === 0) {
      daysUntilFriday = 7; // Si on est vendredi, prendre le suivant
    }
    daysUntilFriday += 7; // Toujours ajouter 7 pour la semaine prochaine
    
    const friday = new Date(today);
    friday.setDate(today.getDate() + daysUntilFriday);
    friday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(friday);
    sunday.setDate(friday.getDate() + 2);
    sunday.setHours(0, 0, 0, 0);
    
      addDateIfNotExists({
        date: formatDateLocal(friday),
        heure_min: '23:00',
        heure_max: '06:00'
      }, true);
      addDateIfNotExists({
        date: formatDateLocal(sunday),
        heure_min: '23:00',
        heure_max: '06:00'
      }, false);
    }
  });
  
  // Trier les dates
  dates_depart.sort((a, b) => a.date.localeCompare(b.date));
  dates_retour.sort((a, b) => a.date.localeCompare(b.date));
  
  return { dates_depart, dates_retour };
}

export function DateWithTimes({ presets, onDatesChange, formatDateFr }: DateWithTimesProps) {
  const [dates, setDates] = useState<{ dates_depart: DateAvecHoraire[]; dates_retour: DateAvecHoraire[] }>(() => 
    generateDatesFromPresets(presets)
  );

  useEffect(() => {
    const newDates = generateDatesFromPresets(presets);
    setDates(newDates);
    onDatesChange(newDates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presets.join(',')]);

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

