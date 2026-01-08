import { motion } from 'framer-motion';

export type DatePreset = 'weekend' | 'next-weekend' | 'next-week' | 'flexible';

interface DatePresetsProps {
  selected: DatePreset[];
  onChange: (presets: DatePreset[]) => void;
}

const presets: { key: DatePreset; label: string; icon: string }[] = [
  { key: 'weekend', label: 'Ce weekend', icon: '📅' },
  { key: 'next-weekend', label: 'Weekend prochain', icon: '📆' },
  { key: 'next-week', label: '3 jours la semaine prochaine', icon: '🗓️' },
  { key: 'flexible', label: 'Dates flexibles', icon: '📋' },
];

const springConfig = {
  type: "spring" as const,
  stiffness: 300,
  damping: 20,
  mass: 0.5
};

export function DatePresets({ selected, onChange }: DatePresetsProps) {
  const handleClick = (preset: DatePreset) => {
    if (preset === 'flexible') {
      // Flexible est exclusif : si on le sélectionne, on désélectionne les autres
      if (selected.includes('flexible')) {
        onChange([]);
      } else {
        onChange(['flexible']);
      }
    } else {
      // Si flexible est sélectionné, on le désélectionne d'abord
      let newSelected = selected.filter(p => p !== 'flexible');
      
      // Toggle le preset
      if (newSelected.includes(preset)) {
        newSelected = newSelected.filter(p => p !== preset);
      } else {
        newSelected = [...newSelected, preset];
      }
      
      onChange(newSelected);
    }
  };

  return (
    <div className="mb-6 sm:mb-8">
      <label className="text-base sm:text-lg font-bold text-slate-900 mb-3 sm:mb-4 block">
        📅 Je pars
      </label>
      <div className="flex flex-wrap gap-2 sm:gap-3">
        {presets.map((preset) => {
          const isActive = selected.includes(preset.key);
          return (
            <motion.button
              key={preset.key}
              onClick={() => handleClick(preset.key)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={springConfig}
              className={`rounded-full px-4 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-semibold cursor-pointer transition-all min-h-[44px] flex items-center justify-center relative
                ${
                  isActive
                    ? preset.key === 'flexible'
                      ? 'bg-emerald-500 text-white shadow-lg scale-105'
                      : 'bg-primary-500 text-white shadow-lg scale-105'
                    : 'bg-slate-100 text-slate-700 hover:bg-primary-100 hover:scale-105'
                }`}
            >
              {isActive && preset.key !== 'flexible' && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-accent-500 rounded-full flex items-center justify-center text-white text-xs font-bold"
                >
                  ✓
                </motion.span>
              )}
              <span className="mr-2">{preset.icon}</span>
              {preset.label}
            </motion.button>
          );
        })}
      </div>
      {selected.filter(p => p !== 'flexible').length > 1 && (
        <motion.p
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs text-slate-500 mt-2 flex items-center gap-1"
        >
          <span className="text-emerald-500">✓</span>
          <span>{selected.filter(p => p !== 'flexible').length} presets sélectionnés - dates combinées</span>
        </motion.p>
      )}
    </div>
  );
}

