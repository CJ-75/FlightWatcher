import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EnrichedTripResponse } from '../types';
import { DestinationCard } from './DestinationCard';

interface RouletteModeProps {
  trips: EnrichedTripResponse[];
  budget: number;
  onClose: () => void;
  onSaveFavorite: (trip: EnrichedTripResponse) => void;
  onBook?: (trip: EnrichedTripResponse) => void;
  onAddHotel?: (trip: EnrichedTripResponse) => void;
  checkIsFavorite?: (trip: EnrichedTripResponse) => boolean;
}

const springConfig = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 20,
  mass: 0.5,
};

const SPIN_STEPS = 12;
const SPIN_TICK_MS = 150;

function tripKey(trip: EnrichedTripResponse): string {
  return `${trip.destination_code}|${trip.aller.departureTime}|${trip.retour.departureTime}|${trip.prix_total}`;
}

export function RouletteMode({
  trips,
  budget,
  onClose,
  onSaveFavorite,
  onBook,
  onAddHotel,
  checkIsFavorite,
}: RouletteModeProps) {
  const [selectedTrip, setSelectedTrip] = useState<EnrichedTripResponse | null>(null);
  const [relances, setRelances] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const maxRelances = 3;
  const started = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // All-in: include every trip (long-haul packs too). Budget is a soft preference
  // for spin weighting, not a hard exclude.
  const affordableTrips =
    trips.length === 0
      ? []
      : trips.some((t) => t.prix_total <= budget)
        ? trips.filter((t) => t.prix_total <= Math.max(budget, 1))
        : trips;

  const spin = () => {
    if (relances >= maxRelances || isSpinning || affordableTrips.length === 0) return;
    if (intervalRef.current) clearInterval(intervalRef.current);

    setIsSpinning(true);
    setRelances((prev) => prev + 1);

    let currentStep = 0;
    intervalRef.current = setInterval(() => {
      currentStep++;
      const randomIndex = Math.floor(Math.random() * affordableTrips.length);
      setSelectedTrip(affordableTrips[randomIndex]);

      if (currentStep >= SPIN_STEPS) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        const finalIndex = Math.floor(Math.random() * affordableTrips.length);
        setSelectedTrip(affordableTrips[finalIndex]);
        setIsSpinning(false);
      }
    }, SPIN_TICK_MS);
  };

  useEffect(() => {
    if (!started.current && affordableTrips.length > 0) {
      started.current = true;
      spin();
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-ink/50 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.85, opacity: 0, y: 20 }}
        transition={springConfig}
        className="bg-white rounded-3xl border border-line shadow-lift max-w-2xl w-full p-6 sm:p-8 relative max-h-[95vh] overflow-y-auto"
      >
        <div
          className={`absolute top-4 right-4 bg-white text-primary-500 rounded-full px-4 py-2 text-sm font-bold shadow-lg ${
            relances >= maxRelances ? 'animate-pulse bg-red-500 text-white' : ''
          }`}
        >
          Relances: {relances}/{maxRelances}
        </div>

        <button
          onClick={onClose}
          className="absolute top-4 left-4 w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors"
        >
          ✕
        </button>

        <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 mb-4 sm:mb-6 text-center">
          🎰 Tire ta destination !
        </h2>

        <div className="relative overflow-visible mb-4 sm:mb-6 flex items-center justify-center py-6 min-h-[280px]">
          <AnimatePresence mode="popLayout">
            {selectedTrip ? (
              <motion.div
                key={tripKey(selectedTrip)}
                initial={{
                  scale: 0.82,
                  opacity: 0,
                  rotate: isSpinning ? -8 : -3,
                  x: isSpinning ? -56 : -24,
                  y: isSpinning ? 10 : 0,
                }}
                animate={
                  isSpinning
                    ? {
                        scale: [0.96, 1.05, 0.98, 1.03, 1],
                        opacity: 1,
                        rotate: [-4, 4, -3, 3, 0],
                        x: [-22, 22, -14, 14, 0],
                        y: [-8, 8, -6, 6, 0],
                      }
                    : {
                        scale: 1,
                        opacity: 1,
                        rotate: 0,
                        x: 0,
                        y: 0,
                      }
                }
                exit={{
                  scale: 0.88,
                  opacity: 0,
                  rotate: isSpinning ? 8 : 3,
                  x: isSpinning ? 56 : 24,
                  y: isSpinning ? -8 : 0,
                }}
                transition={
                  isSpinning
                    ? {
                        scale: {
                          duration: 0.16,
                          repeat: Infinity,
                          repeatType: 'reverse',
                          ease: 'easeInOut',
                        },
                        rotate: {
                          duration: 0.13,
                          repeat: Infinity,
                          repeatType: 'reverse',
                          ease: 'easeInOut',
                        },
                        x: {
                          duration: 0.11,
                          repeat: Infinity,
                          repeatType: 'reverse',
                          ease: 'easeInOut',
                        },
                        y: {
                          duration: 0.14,
                          repeat: Infinity,
                          repeatType: 'reverse',
                          ease: 'easeInOut',
                        },
                        opacity: { duration: 0.08 },
                      }
                    : springConfig
                }
                className="w-full flex items-center justify-center"
              >
                <div className="w-full max-w-md mx-auto">
                  <DestinationCard
                    trip={selectedTrip}
                    onSaveFavorite={() => onSaveFavorite(selectedTrip)}
                    onBook={() => {
                      if (onBook) {
                        onBook(selectedTrip);
                      } else {
                        window.open(`https://www.ryanair.com`, '_blank');
                      }
                    }}
                    onAddHotel={
                      onAddHotel ? () => onAddHotel(selectedTrip) : undefined
                    }
                    isFavorite={
                      checkIsFavorite ? checkIsFavorite(selectedTrip) : false
                    }
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-center h-full text-slate-400"
              >
                {affordableTrips.length === 0
                  ? 'Aucune destination disponible dans votre budget'
                  : 'Prêt à tirer au sort !'}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.button
          onClick={spin}
          disabled={
            relances >= maxRelances ||
            isSpinning ||
            affordableTrips.length === 0
          }
          whileHover={
            relances < maxRelances && !isSpinning ? { scale: 1.05 } : {}
          }
          whileTap={
            relances < maxRelances && !isSpinning ? { scale: 0.95 } : {}
          }
          transition={springConfig}
          className={`w-full bg-white text-primary-500 rounded-full px-6 sm:px-8 py-4 sm:py-5 text-lg sm:text-xl font-black shadow-xl border-4 border-primary-500 min-h-[56px] flex items-center justify-center
            ${
              relances >= maxRelances ||
              isSpinning ||
              affordableTrips.length === 0
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-primary-50'
            }`}
        >
          {relances >= maxRelances
            ? 'Limite atteinte !'
            : isSpinning
              ? 'En cours...'
              : 'Relancer 🎲'}
        </motion.button>

        {selectedTrip && !isSpinning ? (
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
        ) : null}
      </motion.div>
    </motion.div>
  );
}
