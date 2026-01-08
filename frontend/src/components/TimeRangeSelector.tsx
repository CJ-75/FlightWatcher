import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DateAvecHoraire } from '../types';

interface TimeRangeSelectorProps {
  date: DateAvecHoraire;
  onUpdate: (date: DateAvecHoraire) => void;
  type: 'depart' | 'retour';
}

const springConfig = {
  type: "spring" as const,
  stiffness: 300,
  damping: 20,
  mass: 0.5
};

const timePresets = [
  { label: '🌙 Nuit/Tôt le matin', min: '00:00', max: '06:00', color: 'from-indigo-400 to-blue-400' },
  { label: '🌅 Matin', min: '06:00', max: '12:00', color: 'from-yellow-400 to-orange-400' },
  { label: '☀️ Après-midi', min: '12:00', max: '18:00', color: 'from-orange-400 to-pink-400' },
  { label: '🌆 Soir', min: '18:00', max: '23:59', color: 'from-pink-400 to-purple-400' },
];

export function TimeRangeSelector({ date, onUpdate, type }: TimeRangeSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const handlePresetSelect = (preset: typeof timePresets[0]) => {
    const updated = {
      ...date,
      heure_min: preset.min,
      heure_max: preset.max
    };
    onUpdate(updated);
    setSelectedPreset(preset.label);
    setIsExpanded(false);
  };

  const handleCustomTime = (field: 'heure_min' | 'heure_max', value: string) => {
    const updated = {
      ...date,
      [field]: value
    };
    onUpdate(updated);
    setSelectedPreset(null);
  };

  const currentPreset = timePresets.find(
    p => p.min === date.heure_min && p.max === date.heure_max
  );

  return (
    <div className="relative">
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        className={`w-full px-4 py-3 rounded-xl text-sm font-bold transition-all shadow-sm
          ${type === 'depart' 
            ? 'bg-gradient-to-r from-primary-100 to-primary-200 text-primary-900 hover:from-primary-200 hover:to-primary-300 border-2 border-primary-300' 
            : 'bg-gradient-to-r from-emerald-100 to-emerald-200 text-emerald-900 hover:from-emerald-200 hover:to-emerald-300 border-2 border-emerald-300'
          }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {currentPreset ? (
              <>
                <span className="text-xl">{currentPreset.label.split(' ')[0]}</span>
                <div className="flex flex-col items-start">
                  <span className="text-xs opacity-75">Horaires</span>
                  <span className="font-mono text-sm">
                    {date.heure_min || '00:00'} → {date.heure_max || '23:59'}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-start">
                <span className="text-xs opacity-75">Horaires personnalisés</span>
                <span className="font-mono text-sm">
                  {date.heure_min || '00:00'} → {date.heure_max || '23:59'}
                </span>
              </div>
            )}
          </div>
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={springConfig}
            className="text-xl font-bold"
          >
            ▼
          </motion.span>
        </div>
      </motion.button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={springConfig}
            className="absolute z-50 mt-2 w-full bg-white rounded-xl shadow-2xl border-2 border-slate-300 p-4 space-y-4"
            style={{ minWidth: '320px' }}
          >
            <div className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2">
              <span>⚡</span>
              <span>Presets rapides</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {timePresets.map((preset) => (
                <motion.button
                  key={preset.label}
                  onClick={() => handlePresetSelect(preset)}
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  className={`px-3 py-3 rounded-xl text-xs font-bold text-white bg-gradient-to-br ${preset.color} shadow-lg hover:shadow-xl transition-all`}
                >
                  <div className="text-base mb-1">{preset.label.split(' ')[0]}</div>
                  <div className="text-xs opacity-90 font-mono">
                    {preset.min} - {preset.max}
                  </div>
                </motion.button>
              ))}
            </div>

            <div className="border-t-2 border-slate-200 pt-4 mt-4">
              <div className="text-sm font-black text-slate-900 mb-3 flex items-center gap-2">
                <span>🎯</span>
                <span>Horaires personnalisés</span>
              </div>
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-slate-600 mb-2 block">Départ</label>
                  <input
                    type="time"
                    value={date.heure_min || '00:00'}
                    onChange={(e) => handleCustomTime('heure_min', e.target.value)}
                    className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-primary-500 focus:ring-4 focus:ring-primary-200 text-base font-mono font-bold transition-all"
                  />
                </div>
                <div className="pb-2 text-2xl text-slate-400 font-black">→</div>
                <div className="flex-1">
                  <label className="text-xs font-semibold text-slate-600 mb-2 block">Arrivée</label>
                  <input
                    type="time"
                    value={date.heure_max || '23:59'}
                    onChange={(e) => handleCustomTime('heure_max', e.target.value)}
                    className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-primary-500 focus:ring-4 focus:ring-primary-200 text-base font-mono font-bold transition-all"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

