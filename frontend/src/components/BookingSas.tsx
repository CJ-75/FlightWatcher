import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EnrichedTripResponse } from '../types';
import { getSessionId } from '../utils/session';

interface BookingSasProps {
  trip: EnrichedTripResponse;
  onClose: () => void;
  onSaveFavorite: () => void;
  searchEventId?: string | null; // ID de l'événement de recherche associé
}

const springConfig = {
  type: "spring" as const,
  stiffness: 300,
  damping: 20,
  mass: 0.5
};

// Configuration modulaire des partenaires
interface Partner {
  id: string;
  name: string;
  logo: string;
  description: string;
  redirectUrl: (trip: EnrichedTripResponse) => string;
  priority: number; // Plus bas = affiché en premier
  enabled: boolean;
}

const partners: Partner[] = [
  {
    id: 'ryanair',
    name: 'Ryanair',
    logo: '✈️',
    description: 'Réservez directement sur le site officiel',
    redirectUrl: (trip) => {
      // Construire l'URL Ryanair avec les paramètres du vol
      const baseUrl = 'https://www.ryanair.com';
      const origin = trip.aller.origin;
      const destination = trip.aller.destination;
      const departureDate = trip.aller.departureTime.split('T')[0]; // Format YYYY-MM-DD
      const returnDate = trip.retour.departureTime.split('T')[0];
      
      // URL de recherche Ryanair (format approximatif, peut nécessiter ajustement selon l'API réelle)
      // Format: /fr/fr/trip/flights/select?adults=1&teens=0&children=0&infants=0&dateOut=YYYY-MM-DD&dateIn=YYYY-MM-DD&isConnectedFlight=false&isReturn=true&discount=0&promoCode=&originIata=XXX&destinationIata=YYY
      return `${baseUrl}/fr/fr/trip/flights/select?adults=1&teens=0&children=0&infants=0&dateOut=${departureDate}&dateIn=${returnDate}&isConnectedFlight=false&isReturn=true&discount=0&promoCode=&originIata=${origin}&destinationIata=${destination}`;
    },
    priority: 1,
    enabled: true
  },
  // Ajouter d'autres partenaires ici à l'avenir
  // {
  //   id: 'skyscanner',
  //   name: 'Skyscanner',
  //   logo: '🔍',
  //   description: 'Comparez les prix sur Skyscanner',
  //   redirectUrl: (trip) => `https://www.skyscanner.fr/transport/vols/${trip.aller.departureCode}/${trip.aller.destinationCode}/...`,
  //   priority: 2,
  //   enabled: false
  // },
];

// Temps d'affichage avant redirection automatique (en millisecondes)
const AUTO_REDIRECT_DELAY = 3000; // 3 secondes

export function BookingSas({ trip, onClose, onSaveFavorite, searchEventId }: BookingSasProps) {
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [countdown, setCountdown] = useState(AUTO_REDIRECT_DELAY / 1000);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [hasTrackedEvent, setHasTrackedEvent] = useState(false); // Protection contre les doublons

  // Filtrer et trier les partenaires activés
  const availablePartners = partners
    .filter(p => p.enabled)
    .sort((a, b) => a.priority - b.priority);

  // Sélectionner le premier partenaire par défaut
  useEffect(() => {
    if (availablePartners.length > 0 && !selectedPartner) {
      setSelectedPartner(availablePartners[0]);
    }
  }, [availablePartners.length]);

  // Compte à rebours pour redirection automatique
  useEffect(() => {
    if (!selectedPartner || isRedirecting || hasTrackedEvent) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          handleRedirect(selectedPartner);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [selectedPartner, isRedirecting, hasTrackedEvent]);

  const handleRedirect = (partner: Partner) => {
    // Protection contre les appels multiples
    if (isRedirecting || hasTrackedEvent) {
      return;
    }
    
    setIsRedirecting(true);
    setHasTrackedEvent(true);
    const url = partner.redirectUrl(trip);
    
    // Enregistrer l'événement SAS pour analytics (non-bloquant)
    fetch('/api/analytics/booking-sas-event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trip,
        partner_id: partner.id,
        partner_name: partner.name,
        redirect_url: url,
        action_type: countdown <= 1 ? 'auto_redirect' : 'manual_click',
        countdown_seconds: countdown,
        source: 'web',
        user_agent: navigator.userAgent,
        session_id: getSessionId(),
        search_event_id: searchEventId || null
      })
    })
    .then(async (response) => {
      if (!response.ok) {
        // Essayer de parser comme JSON, sinon utiliser le texte
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          console.warn('Erreur enregistrement événement SAS:', errorData);
        } else {
          const errorText = await response.text();
          console.warn('Erreur enregistrement événement SAS (non-JSON):', errorText.substring(0, 100));
        }
      }
    })
    .catch(err => {
      console.warn('Erreur réseau enregistrement événement SAS:', err);
    });
    
    window.open(url, '_blank');
    // Fermer la modal après un court délai
    setTimeout(() => {
      onClose();
    }, 500);
  };

  const cityName = trip.aller.destinationFull.split(',')[0].trim();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.85, opacity: 0, y: 20 }}
        transition={springConfig}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-2xl w-full p-6 sm:p-8 relative max-h-[90vh] overflow-y-auto"
      >
        {/* Bouton fermer */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors z-10"
        >
          ✕
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-2">
            ✈️ Réserver votre vol
          </h2>
          <p className="text-slate-600 font-medium">
            {cityName} - {trip.prix_total.toFixed(0)}€
          </p>
        </div>

        {/* Compte à rebours */}
        {!isRedirecting && selectedPartner && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-primary-50 border-2 border-primary-200 rounded-xl p-4 mb-6 text-center"
          >
            <p className="text-sm text-primary-700 font-semibold">
              Redirection automatique vers {selectedPartner.name} dans{' '}
              <span className="text-2xl font-black text-primary-500">{countdown}</span> seconde{countdown > 1 ? 's' : ''}
            </p>
          </motion.div>
        )}

        {/* Liste des partenaires */}
        <div className="space-y-3 mb-6">
          {availablePartners.map((partner) => (
            <motion.button
              key={partner.id}
              onClick={() => handleRedirect(partner)}
              disabled={isRedirecting}
              whileHover={!isRedirecting ? { scale: 1.02, x: 5 } : {}}
              whileTap={!isRedirecting ? { scale: 0.98 } : {}}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all ${
                selectedPartner?.id === partner.id
                  ? 'border-primary-500 bg-primary-50 shadow-lg'
                  : 'border-slate-200 bg-white hover:border-primary-300 hover:bg-primary-50/50'
              } ${isRedirecting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="text-4xl">{partner.logo}</div>
              <div className="flex-1 text-left">
                <div className="font-bold text-slate-900 text-lg">{partner.name}</div>
                <div className="text-sm text-slate-600">{partner.description}</div>
              </div>
              {selectedPartner?.id === partner.id && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center"
                >
                  <span className="text-white text-xs">✓</span>
                </motion.div>
              )}
            </motion.button>
          ))}
        </div>

        {/* Bouton sauvegarder */}
        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            onSaveFavorite();
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full bg-slate-100 text-slate-700 rounded-full px-6 py-3 font-semibold hover:bg-slate-200 transition-colors mb-4"
        >
          ❤️ Sauvegarder ce voyage
        </motion.button>

        {/* Message de redirection */}
        {isRedirecting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-slate-500 text-sm"
          >
            Redirection en cours...
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}

