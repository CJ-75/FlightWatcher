import { motion } from 'framer-motion';
import { useI18n } from '../contexts/I18nContext';

export type DatePreset = 'weekend' | 'next-weekend' | 'next-week' | 'flexible';

interface DatePresetsProps {
  selected: DatePreset | null;
  onChange: (preset: DatePreset) => void;
  onFlexibleClick?: () => void;
}

export function DatePresets({ selected, onChange, onFlexibleClick }: DatePresetsProps) {
  const { t } = useI18n();
  
  const presets: { key: DatePreset; label: string; icon: string }[] = [
    { key: 'next-weekend', label: t('search.preset.nextWeekend'), icon: '📆' },
    { key: 'flexible', label: t('search.preset.flexible'), icon: '📋' },
  ];

const springConfig = {
  type: "spring" as const,
  stiffness: 300,
  damping: 20,
  mass: 0.5
};

  const handleClick = (preset: DatePreset) => {
    if (preset === 'flexible' && onFlexibleClick) {
      onFlexibleClick();
    } else {
      onChange(preset);
    }
  };

  return (
    <div className="mb-6 sm:mb-8">
      <label className="text-base sm:text-lg font-bold text-slate-900 mb-3 sm:mb-4 block">
        {t('search.when')}
      </label>
      <div className="flex flex-wrap gap-2 sm:gap-3">
        {presets.map((preset) => {
          const isActive = selected === preset.key;
          return (
            <motion.button
              key={preset.key}
              onClick={() => handleClick(preset.key)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={springConfig}
              className={`rounded-full px-3 sm:px-5 py-2.5 text-xs sm:text-sm font-semibold cursor-pointer transition-all min-h-[40px] sm:min-h-[44px] flex items-center justify-center relative whitespace-nowrap
                ${
                  isActive
                    ? preset.key === 'flexible'
                      ? 'bg-emerald-500 text-white shadow-soft'
                      : 'bg-primary-500 text-white shadow-soft'
                    : 'bg-canvas text-ink-soft hover:bg-primary-50 hover:text-primary-700 border border-line'
                }`}
            >
              {isActive && preset.key !== 'flexible' && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-accent-500 rounded-full flex items-center justify-center text-white text-[8px] sm:text-xs font-bold"
                >
                  ✓
                </motion.span>
              )}
              <span className="mr-1 sm:mr-2 text-xs sm:text-sm">{preset.icon}</span>
              <span className="truncate">{preset.label}</span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

