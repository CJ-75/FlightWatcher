import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EnrichedTripResponse } from '../types';
import { DestinationCard } from './DestinationCard';

interface RouletteModeProps {
  trips: EnrichedTripResponse[];
  budget: number;
  onClose: () => void;
  onSaveFavorite: (trip: EnrichedTripResponse) => void;
}

const springConfig = {
  type: "spring" as const,
  stiffness: 300,
  damping: 20,
  mass: 0.5
};

export function RouletteMode({ trips, budget, onClose, onSaveFavorite }: RouletteModeProps) {
  const [selectedTrip, setSelectedTrip] = useState<EnrichedTripResponse | null>(null);
  const [relances, setRelances] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const maxRelances = 3;

  // Filtrer les trips sous le budget
  const affordableTrips = trips.filter(t => t.prix_total <= budget);

  const spin = () => {
    if (relances >= maxRelances || isSpinning || affordableTrips.length === 0) return;

    setIsSpinning(true);
    setRelances(prev => prev + 1);
    setSelectedTrip(null);

    // Animation de roulette avec plusieurs destinations qui défilent
    const spinDuration = 2000;
    const spinSteps = 10;
    let currentStep = 0;

    const spinInterval = setInterval(() => {
      currentStep++;
      const randomIndex = Math.floor(Math.random() * affordableTrips.length);
      setSelectedTrip(affordableTrips[randomIndex]);
      
      if (currentStep >= spinSteps) {
        clearInterval(spinInterval);
        // Sélection finale
        const finalIndex = Math.floor(Math.random() * affordableTrips.length);
        setSelectedTrip(affordableTrips[finalIndex]);
        setIsSpinning(false);
      }
    }, spinDuration / spinSteps);
  };

  useEffect(() => {
    // Premier spin automatique
    if (affordableTrips.length > 0 && !selectedTrip) {
      spin();
    }
  }, []);

  const handleShare = async (platform: 'twitter' | 'copy') => {
    if (!selectedTrip) return;

    const cityName = selectedTrip.aller.destinationFull.split(',')[0].trim();
    const text = `J'ai tiré ${cityName} à ${selectedTrip.prix_total.toFixed(0)}€ ! 🎲✈️`;

    if (platform === 'copy') {
      await navigator.clipboard.writeText(text);
      alert('Lien copié !');
    } else if (platform === 'twitter') {
      const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-primary-500"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={springConfig}
        className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-2xl w-full p-4 sm:p-6 md:p-8 relative max-h-[90vh] overflow-y-auto"
      >
        {/* Compteur de relances */}
        <div className={`absolute top-4 right-4 bg-white text-primary-500 rounded-full px-4 py-2 text-sm font-bold shadow-lg ${
          relances >= maxRelances ? 'animate-pulse bg-red-500 text-white' : ''
        }`}>
          Relances: {relances}/{maxRelances}
        </div>

        {/* Bouton fermer */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors"
        >
          ✕
        </button>

        <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 mb-4 sm:mb-6 text-center">
          🎰 Tire ta destination !
        </h2>

        {/* Zone de roulette */}
        <div className="relative h-64 sm:h-80 md:h-96 overflow-hidden mb-4 sm:mb-6">
          <AnimatePresence mode="wait">
            {isSpinning ? (
              <motion.div
                key="spinning"
                initial={{ y: 100, opacity: 0, rotateY: 180 }}
                animate={{ 
                  y: 0, 
                  opacity: 1, 
                  rotateY: 0,
                  scale: [1, 1.1, 1]
                }}
                exit={{ y: -100, opacity: 0, rotateY: -180 }}
                transition={{ 
                  duration: 0.2,
                  repeat: Infinity,
                  repeatType: "reverse"
                }}
                className="flex items-center justify-center h-full"
              >
                <motion.div 
                  className="text-6xl"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.5, repeat: Infinity, ease: "linear" }}
                >
                  🎲
                </motion.div>
              </motion.div>
            ) : selectedTrip ? (
              <motion.div
                key="selected"
                initial={{ scale: 0.8, opacity: 0, rotateY: 180 }}
                animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                exit={{ scale: 0.8, opacity: 0, rotateY: -180 }}
                transition={springConfig}
                className="h-full flex items-center justify-center"
              >
                <div className="w-full max-w-sm">
                  <DestinationCard
                    trip={selectedTrip}
                    onSaveFavorite={() => onSaveFavorite(selectedTrip)}
                    onBook={() => {
                      // Ouvrir Ryanair dans un nouvel onglet
                      window.open(`https://www.ryanair.com`, '_blank');
                    }}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-center h-full text-slate-400"
              >
                Aucune destination disponible
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bouton Relancer */}
        <motion.button
          onClick={spin}
          disabled={relances >= maxRelances || isSpinning || affordableTrips.length === 0}
          whileHover={relances < maxRelances && !isSpinning ? { scale: 1.05 } : {}}
          whileTap={relances < maxRelances && !isSpinning ? { scale: 0.95 } : {}}
          transition={springConfig}
          className={`w-full bg-white text-primary-500 rounded-full px-6 sm:px-8 py-4 sm:py-5 text-lg sm:text-xl font-black shadow-xl border-4 border-primary-500 min-h-[56px] flex items-center justify-center
            ${
              relances >= maxRelances || isSpinning || affordableTrips.length === 0
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-primary-50'
            }`}
        >
          {relances >= maxRelances
            ? 'Limite atteinte !'
            : isSpinning
            ? 'En cours...'
            : 'Relancer 🎲'
          }
        </motion.button>

        {/* Partage social */}
        {selectedTrip && (
          <div className="flex gap-4 mt-6 justify-center">
            <motion.button
              onClick={() => handleShare('copy')}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={springConfig}
              className="w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-slate-50"
              title="Copier"
            >
              📋
            </motion.button>
            <motion.button
              onClick={() => handleShare('twitter')}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={springConfig}
              className="w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-blue-50"
              title="Partager sur Twitter"
            >
              🐦
            </motion.button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

