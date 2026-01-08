import { motion } from 'framer-motion';

interface ModeToggleProps {
  mode: 'simple' | 'advanced';
  onChange: (mode: 'simple' | 'advanced') => void;
}

const springConfig = {
  type: "spring" as const,
  stiffness: 300,
  damping: 20,
  mass: 0.5
};

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="sticky top-0 z-40 bg-white shadow-md mb-4 sm:mb-6 md:mb-8 px-4 py-3 sm:py-4">
      <div className="flex items-center justify-center gap-2 max-w-7xl mx-auto">
        <div className="relative inline-flex bg-slate-200 rounded-full p-1">
          {/* Bouton slide */}
          <motion.div
            layout
            initial={false}
            animate={{
              x: mode === 'advanced' ? '100%' : '0%',
            }}
            transition={springConfig}
            className="absolute top-1 left-1 w-1/2 h-10 bg-primary-500 rounded-full shadow-lg"
          />
          
          {/* Labels */}
          <button
            onClick={() => onChange('simple')}
            className={`relative z-10 px-4 sm:px-6 py-2 rounded-full font-semibold transition-colors min-h-[44px] flex items-center justify-center text-sm sm:text-base ${
              mode === 'simple' ? 'text-white font-bold' : 'text-slate-600 hover:text-primary-500'
            }`}
          >
            <span className="mr-1 sm:mr-2">🎯</span>
            Simple
          </button>
          <button
            onClick={() => onChange('advanced')}
            className={`relative z-10 px-4 sm:px-6 py-2 rounded-full font-semibold transition-colors min-h-[44px] flex items-center justify-center text-sm sm:text-base ${
              mode === 'advanced' ? 'text-white font-bold' : 'text-slate-600 hover:text-primary-500'
            }`}
          >
            <span className="mr-1 sm:mr-2">⚙️</span>
            Avancé
          </button>
        </div>
      </div>
    </div>
  );
}

