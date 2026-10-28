import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { EnrichedTripResponse } from '../types';
import { getSessionId } from '../utils/session';
import { bookingPartnerMeta, buildBookingUrl } from '@flightwatcher/shared';
import { useI18n } from '../contexts/I18nContext';
import { HotelUpsellLine } from './HotelUpsellLine';

interface BookingSasProps {
  trip: EnrichedTripResponse;
  passengers?: number;
  onClose: () => void;
  onSaveFavorite: () => void;
  searchEventId?: string | null;
}

const springConfig = {
  type: "spring" as const,
  stiffness: 300,
  damping: 20,
  mass: 0.5
};

interface Partner {
  id: string;
  name: string;
  logo: string;
  description: string;
  redirectUrl: (trip: EnrichedTripResponse, passengers?: number) => string;
  priority: number;
  enabled: boolean;
}

function buildPartners(
  trip: EnrichedTripResponse,
  passengers: number,
  language: string,
): Partner[] {
  const adults = Math.min(6, Math.max(1, passengers || 1));
  const meta = bookingPartnerMeta(trip);
  const isTp =
    String(trip.provider || '').toLowerCase() === 'travelpayouts' ||
    !!(trip.booking_url && trip.booking_url.includes('aviasales'));

  // UI copy is provider-agnostic; partner id/name kept for analytics only.
  return [
    {
      id: meta.partner_id || (isTp ? 'aviasales' : 'ryanair'),
      name: meta.partner_name || (isTp ? 'aviasales' : 'ryanair'),
      logo: '✈️',
      description: 'Redirection vers le site de réservation',
      redirectUrl: (t) => buildBookingUrl(t, adults, language),
      priority: 1,
      enabled: true,
    },
  ];
}

const AUTO_REDIRECT_DELAY = 3000;

export function BookingSas({
  trip,
  passengers = 1,
  onClose,
  onSaveFavorite,
  searchEventId,
}: BookingSasProps) {
  const { language } = useI18n();
  const partners = buildPartners(trip, passengers, language);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [countdown, setCountdown] = useState(AUTO_REDIRECT_DELAY / 1000);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [hasTrackedEvent, setHasTrackedEvent] = useState(false);

  const availablePartners = partners
    .filter(p => p.enabled)
    .sort((a, b) => a.priority - b.priority);

  useEffect(() => {
    setSelectedPartner(availablePartners[0] || null);
    setCountdown(AUTO_REDIRECT_DELAY / 1000);
    setIsRedirecting(false);
    setHasTrackedEvent(false);
  }, [trip.destination_code, trip.aller.departureTime, trip.provider]);

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
    if (isRedirecting || hasTrackedEvent) {
      return;
    }
    
    setIsRedirecting(true);
    setHasTrackedEvent(true);
    const url = partner.redirectUrl(trip);
    
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-ink/45 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.85, opacity: 0, y: 20 }}
        transition={springConfig}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl border border-line shadow-lift max-w-2xl w-full p-6 sm:p-8 relative max-h-[90vh] overflow-y-auto"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors z-10"
        >
          ✕
        </button>

        <div className="text-center mb-6">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-2">
            Réserver votre vol
          </h2>
          <p className="text-slate-600 font-medium">
            {cityName} - {trip.prix_total.toFixed(0)}€ / pers.
            {passengers > 1 ? ` (${Math.round(trip.prix_total * passengers)}€ pour ${passengers})` : ''}
          </p>
          <div className="mt-3 flex justify-center">
            <HotelUpsellLine
              iata={trip.destination_code}
              outboundIso={trip.aller?.departureTime}
              returnIso={trip.retour?.departureTime}
              participants={passengers}
            />
          </div>
        </div>

        {!isRedirecting && selectedPartner && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-primary-50 border-2 border-primary-200 rounded-xl p-4 mb-6 text-center"
          >
            <p className="text-sm text-primary-700 font-semibold">
              Redirection automatique dans{' '}
              <span className="text-2xl font-black text-primary-500">{countdown}</span> seconde{countdown > 1 ? 's' : ''}
            </p>
          </motion.div>
        )}

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
                <div className="font-bold text-slate-900 text-lg">Continuer la réservation</div>
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

        <motion.button
          onClick={(e) => {
            e.stopPropagation();
            onSaveFavorite();
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full bg-slate-100 text-slate-700 rounded-full px-6 py-3 font-semibold hover:bg-slate-200 transition-colors mb-4"
        >
          Sauvegarder ce voyage
        </motion.button>

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
