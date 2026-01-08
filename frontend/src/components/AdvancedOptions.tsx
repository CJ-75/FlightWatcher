import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Destination } from '../types';

interface AdvancedOptionsProps {
  datePreset: string | null;
  excludedDestinations: string[];
  onExcludedDestinationsChange: (codes: string[]) => void;
  destinations: Record<string, Destination[]>;
  loadingDestinations: boolean;
  onLoadDestinations: () => void;
  limiteAllers: number;
  onLimiteAllersChange: (value: number) => void;
}

const springConfig = {
  type: "spring" as const,
  stiffness: 300,
  damping: 20,
  mass: 0.5
};

export function AdvancedOptions({
  datePreset,
  excludedDestinations,
  onExcludedDestinationsChange,
  destinations,
  loadingDestinations,
  onLoadDestinations,
  limiteAllers,
  onLimiteAllersChange
}: AdvancedOptionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showDestinations, setShowDestinations] = useState(false);

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
        className="w-full flex items-center justify-between text-left p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
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
              {/* Destinations exclues */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900">🚫 Exclure des destinations</h3>
                  <div className="flex items-center gap-2">
                    {excludedDestinations.length > 0 && (
                      <motion.button
                        onClick={() => onExcludedDestinationsChange([])}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="px-3 py-1 bg-red-500 text-white rounded-full text-xs sm:text-sm font-semibold hover:bg-red-600 flex items-center gap-1"
                        title="Effacer toutes les exclusions"
                      >
                        <span>🗑️</span>
                        <span>Effacer</span>
                      </motion.button>
                    )}
                    {allDestinations.length === 0 && (
                      <motion.button
                        onClick={onLoadDestinations}
                        disabled={loadingDestinations}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="px-3 py-1 bg-primary-500 text-white rounded-full text-xs sm:text-sm font-semibold disabled:opacity-50"
                      >
                        {loadingDestinations ? 'Chargement...' : 'Charger destinations'}
                      </motion.button>
                    )}
                  </div>
                </div>
                
                {excludedDestinations.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {excludedDestinations.map((code) => {
                      const dest = allDestinations.find(d => d.code === code);
                      return (
                        <motion.button
                          key={code}
                          onClick={() => toggleDestination(code)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs sm:text-sm font-semibold hover:bg-red-200"
                        >
                          {dest?.nom || code} ×
                        </motion.button>
                      );
                    })}
                  </div>
                )}

                {allDestinations.length > 0 && (
                  <motion.button
                    onClick={() => setShowDestinations(!showDestinations)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold hover:bg-slate-200"
                  >
                    {showDestinations ? '▼ Masquer' : '▶ Afficher toutes les destinations'}
                  </motion.button>
                )}

                <AnimatePresence>
                  {showDestinations && allDestinations.length > 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-3 max-h-60 overflow-y-auto space-y-2"
                    >
                      {Object.entries(destinations).map(([pays, dests]) => (
                        <div key={pays} className="space-y-1">
                          <div className="text-xs sm:text-sm font-bold text-slate-600">{pays}</div>
                          <div className="flex flex-wrap gap-2">
                            {dests.map((dest) => (
                              <motion.button
                                key={dest.code}
                                onClick={() => toggleDestination(dest.code)}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className={`px-2 py-1 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                                  excludedDestinations.includes(dest.code)
                                    ? 'bg-red-500 text-white'
                                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                }`}
                              >
                                {dest.nom}
                              </motion.button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Limite allers */}
              <div>
                <label className="block text-xs sm:text-sm font-bold text-slate-900 mb-2">
                  🔢 Nombre de dates à scanner: {limiteAllers}
                </label>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={10}
                  value={limiteAllers}
                  onChange={(e) => onLimiteAllersChange(Number(e.target.value))}
                  className="w-full h-3 bg-slate-200 rounded-full appearance-none cursor-pointer
                             [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6
                             [&::-webkit-slider-thumb]:bg-primary-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg
                             [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:bg-primary-500 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:shadow-lg"
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>10</span>
                  <span>100</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

