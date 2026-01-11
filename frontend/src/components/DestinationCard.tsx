import { useState } from 'react';
import { motion } from 'framer-motion';
import { EnrichedTripResponse } from '../types';
import { useI18n } from '../contexts/I18nContext';

interface DestinationCardProps {
  trip: EnrichedTripResponse;
  onSaveFavorite: () => void;
  onBook?: () => void;
  isFavorite?: boolean;
}

const springConfig = {
  type: "spring" as const,
  stiffness: 300,
  damping: 20,
  mass: 0.5
};

const cardHover = {
  y: -8,
  rotate: 1,
  transition: springConfig
};

export function DestinationCard({ trip, onSaveFavorite, onBook, isFavorite = false }: DestinationCardProps) {
  const { t } = useI18n();
  
  // Helper pour convertir getDay() en numérotation basée sur lundi (1=lundi, 7=dimanche)
  const getDayOfWeekMondayBased = (date: Date): number => {
    // getDay() retourne 0=dimanche, 1=lundi, ..., 6=samedi
    // On veut 1=lundi, 2=mardi, ..., 7=dimanche
    const jsDay = date.getDay(); // 0=dimanche, 1=lundi, ..., 6=samedi
    // Conversion: dimanche(0) -> 7, lundi(1) -> 1, mardi(2) -> 2, ..., samedi(6) -> 6
    return jsDay === 0 ? 7 : jsDay;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    // Tableau avec lundi en premier (index 0 = lundi, index 6 = dimanche)
    const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 
                   'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];
    // Convertir getDay() (0=dimanche, 1=lundi...) en index pour le tableau (0=lundi, 6=dimanche)
    const dayIndex = getDayOfWeekMondayBased(date) - 1; // -1 car le tableau commence à 0
    return `${days[dayIndex]} ${date.getDate()} ${months[date.getMonth()]}`;
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Extraire le nom de la ville depuis destinationFull
  const cityName = trip.aller.destinationFull.split(',')[0].trim();
  const imageUrl = trip.image_url || `https://source.unsplash.com/800x600/?${cityName}`;

  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <motion.div
      whileHover={cardHover}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springConfig}
      className="rounded-xl sm:rounded-2xl overflow-hidden bg-white shadow-lg sm:shadow-xl max-w-sm w-full mx-auto"
    >
      {/* Image Hero */}
      <div className="relative w-full h-40 sm:h-48 md:h-56 lg:h-64">
        {!imageLoaded && (
          <div className="absolute inset-0 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 bg-[length:200%_100%] animate-[shimmer_2s_infinite]" />
        )}
        <motion.img
          src={imageUrl}
          alt={cityName}
          className="w-full h-full object-cover"
          loading="lazy"
          initial={{ opacity: 0 }}
          animate={{ opacity: imageLoaded ? 1 : 0 }}
          transition={{ duration: 0.3 }}
          onLoad={() => setImageLoaded(true)}
          onError={(e) => {
            // Fallback si l'image ne charge pas
            (e.target as HTMLImageElement).src = `https://via.placeholder.com/800x600/FF6B35/FFFFFF?text=${cityName}`;
            setImageLoaded(true);
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        
        {/* Badge cœur pour sauvegarder */}
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            onSaveFavorite();
          }}
          whileHover={{ scale: 1.2 }}
          whileTap={{ scale: 0.9 }}
          className={`absolute top-3 right-3 sm:top-4 sm:right-4 text-3xl sm:text-4xl cursor-pointer hover:drop-shadow-lg transition-all min-w-[44px] min-h-[44px] flex items-center justify-center ${
            isFavorite ? 'text-red-500' : 'text-white/80 hover:text-red-400'
          }`}
          aria-label={isFavorite ? t('card.removeFavorite') : t('card.addFavorite')}
        >
          {isFavorite ? '❤️' : '🤍'}
        </motion.button>

        {/* Contenu overlay sur image */}
        <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 md:p-5 lg:p-6">
          <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-white mb-1 sm:mb-2">
            {cityName}
          </h3>
          <p className="text-sm sm:text-base md:text-lg text-white/90 font-medium">
            {trip.aller.destinationFull.split(',')[1]?.trim() || ''}
          </p>
        </div>
      </div>

      {/* Section prix */}
      <div className="p-4 sm:p-5 md:p-6 bg-white">
        <div className="flex items-baseline gap-2 mb-1 flex-wrap">
          <span className="text-3xl sm:text-4xl md:text-5xl font-black text-primary-500">
            {trip.prix_total.toFixed(0)}€
          </span>
          {trip.discount_percent && trip.discount_percent > 20 && (
            <motion.span
              animate={{ scale: [1, 1.1, 1] }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              className="inline-block bg-emerald-500 text-white rounded-full px-3 py-1 text-sm font-bold ml-3"
            >
              -{trip.discount_percent.toFixed(0)}%
            </motion.span>
          )}
        </div>
        <p className="text-sm text-slate-500 font-medium mb-4">{t('card.total')}</p>

        {/* Détails vols */}
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center">
              <span className="text-primary-500 mr-2">✈️</span>
              <span className="text-slate-600 font-medium">{t('card.departure')}</span>
            </div>
            <div className="text-right">
              <div className="text-slate-900 font-bold">{formatTime(trip.aller.departureTime)}</div>
              <div className="text-xs text-slate-500">{formatDate(trip.aller.departureTime)}</div>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center">
              <span className="text-primary-500 mr-2">🔙</span>
              <span className="text-slate-600 font-medium">{t('card.return')}</span>
            </div>
            <div className="text-right">
              <div className="text-slate-900 font-bold">{formatTime(trip.retour.departureTime)}</div>
              <div className="text-xs text-slate-500">{formatDate(trip.retour.departureTime)}</div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 sm:mt-6">
          <motion.button
            onClick={onBook}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={springConfig}
            className="w-full bg-primary-500 text-white rounded-full px-4 sm:px-6 py-3 sm:py-4 font-bold shadow-lg hover:bg-primary-600 hover:shadow-xl active:scale-95 min-h-[48px] sm:min-h-[52px] text-sm sm:text-base"
          >
            {t('card.book')}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

