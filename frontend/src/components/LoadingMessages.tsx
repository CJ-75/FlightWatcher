import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const loadingMessages = [
  '🔍 Recherche des meilleures destinations...',
  '✈️ Analyse des vols disponibles...',
  '💰 Comparaison des prix...',
  '🌍 Exploration des destinations...',
  '📅 Vérification des dates...',
  '🎯 Trouve les meilleures offres...',
  '⏳ Encore quelques instants...',
  '🚀 Presque terminé...'
];

interface LoadingMessagesProps {
  isVisible: boolean;
  interval?: number; // Intervalle en millisecondes entre chaque message
}

export function LoadingMessages({ isVisible, interval = 3000 }: LoadingMessagesProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setCurrentIndex(0);
      return;
    }

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % loadingMessages.length);
    }, interval);

    return () => clearInterval(timer);
  }, [isVisible, interval]);

  if (!isVisible) return null;

  return (
    <div className="w-full flex justify-center items-center min-h-[60px]">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
          className="text-center"
        >
          <p className="text-sm sm:text-base md:text-lg font-semibold text-slate-600 px-2">
            {loadingMessages[currentIndex]}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

