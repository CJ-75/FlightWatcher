import { motion } from 'framer-motion';
import { useI18n } from '../contexts/I18nContext';

interface BudgetSliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Override Search wording (e.g. Deals max / pers.). */
  label?: string;
  hint?: string;
  /** Custom value display, e.g. "Sans limite". */
  displayValue?: string;
}

export function BudgetSlider({
  value,
  onChange,
  min = 20,
  max = 1000,
  label,
  hint,
  displayValue,
}: BudgetSliderProps) {
  const { t } = useI18n();
  const springConfig = {
    type: "spring" as const,
    stiffness: 300,
    damping: 20,
    mass: 0.5
  };

  return (
    <div className="mb-8">
      <label className="text-base sm:text-lg font-bold text-slate-900 mb-1 block">
        {label || t('search.budget')}
      </label>
      <p className="text-sm text-slate-500 mb-3 sm:mb-4">{hint || t('search.budget.total')}</p>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springConfig}
        className="text-2xl sm:text-3xl md:text-4xl font-black text-primary-500 mb-2"
      >
        {displayValue ?? `${value}€`}
      </motion.div>
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={10}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-3 sm:h-4 bg-slate-200 rounded-full appearance-none cursor-pointer touch-none
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-7 [&::-webkit-slider-thumb]:h-7
                     sm:[&::-webkit-slider-thumb]:w-8 sm:[&::-webkit-slider-thumb]:h-8
                     [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-primary-500
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-xl
                     [&::-webkit-slider-thumb]:hover:scale-110 [&::-webkit-slider-thumb]:active:scale-125 [&::-webkit-slider-thumb]:transition-transform
                     [&::-moz-range-thumb]:w-7 [&::-moz-range-thumb]:h-7 sm:[&::-moz-range-thumb]:w-8 sm:[&::-moz-range-thumb]:h-8 
                     [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-primary-500 
                     [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:shadow-xl [&::-moz-range-thumb]:cursor-pointer"
          style={{
            background: `linear-gradient(to right, #FF6B35 0%, #FF3366 ${(value - min) / (max - min) * 100}%, #E2E8F0 ${(value - min) / (max - min) * 100}%, #E2E8F0 100%)`
          }}
        />
      </div>
    </div>
  );
}

