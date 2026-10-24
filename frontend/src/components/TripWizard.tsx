/**
 * Wizard de création de voyage
 * Étape 1: Récap vol + lien réservation
 * Étape 2: Sélection hôtel
 * Étape 3: Planner (checklist, participants, notes)
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TripResponse, 
  TripDraft, 
  HotelResult,
  PriceTiers 
} from '../types';
import { createDraft, getDraft, updateDraft, toggleChecklistItem, inviteParticipant } from '../utils/drafts';
import { prefetchHotels, searchHotels, getPriceTiers, formatPrice, renderStars, formatReviewCount, calculateNights } from '../utils/hotels';
import { getCurrentUser } from '../lib/supabase';
import { LoadingSpinner } from './LoadingSpinner';

interface TripWizardProps {
  trip: TripResponse;
  departureAirport: string;
  onClose: () => void;
  onComplete?: (draft: TripDraft) => void;
}

type WizardStep = 'flight' | 'hotel' | 'planner';

const springConfig = {
  type: "spring" as const,
  stiffness: 300,
  damping: 25
};

export function TripWizard({ trip, departureAirport, onClose, onComplete }: TripWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('flight');
  const [draft, setDraft] = useState<TripDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Hotel state
  const [hotels, setHotels] = useState<HotelResult[]>([]);
  const [hotelsLoading, setHotelsLoading] = useState(false);
  const [tiers, setTiers] = useState<PriceTiers | null>(null);
  const [selectedTier, setSelectedTier] = useState<'economique' | 'confort' | 'charme'>('confort');
  const [sortBy, setSortBy] = useState<'value' | 'rating' | 'price'>('value');
  const [selectedHotel, setSelectedHotel] = useState<HotelResult | null>(null);
  
  // Planner state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const checkIn = trip.aller.departureTime.split('T')[0];
  const checkOut = trip.retour.departureTime.split('T')[0];
  const nights = calculateNights(checkIn, checkOut);

  // Initialisation: créer le brouillon et prefetch les hôtels
  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        
        // Créer le brouillon
        const newDraft = await createDraft(trip, departureAirport);
        setDraft(newDraft);
        
        // Prefetch les hôtels en arrière-plan
        prefetchHotels(trip.destination_code, checkIn, checkOut);
        
        // Vérifier l'auth
        const user = await getCurrentUser();
        setIsAuthenticated(!!user);
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur initialisation');
      } finally {
        setLoading(false);
      }
    }
    
    init();
  }, [trip, departureAirport, checkIn, checkOut]);

  // Charger les hôtels quand on arrive à l'étape hotel
  useEffect(() => {
    if (currentStep === 'hotel' && hotels.length === 0) {
      loadHotels();
    }
  }, [currentStep]);

  async function loadHotels() {
    setHotelsLoading(true);
    setError(null);
    
    try {
      // Charger les tiers d'abord
      const tiersData = await getPriceTiers(trip.destination_code, checkIn, checkOut);
      setTiers(tiersData);
      
      // Puis les hôtels
      const response = await searchHotels({
        city_code: trip.destination_code,
        check_in: checkIn,
        check_out: checkOut,
        tier: selectedTier,
        sort_by: sortBy
      });
      
      setHotels(response.hotels);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur chargement hôtels');
    } finally {
      setHotelsLoading(false);
    }
  }

  // Recharger les hôtels quand le tier ou le tri change
  useEffect(() => {
    if (currentStep === 'hotel' && tiers) {
      loadHotels();
    }
  }, [selectedTier, sortBy]);

  async function handleFlightBooked() {
    if (!draft) return;
    
    try {
      await toggleChecklistItem(draft.token, 'flight_booked', true);
      const updatedDraft = await getDraft(draft.token);
      setDraft(updatedDraft);
    } catch (err) {
      console.error('Erreur mise à jour checklist:', err);
    }
  }

  async function handleSelectHotel(hotel: HotelResult) {
    if (!draft) return;
    
    setSelectedHotel(hotel);
    
    try {
      const updatedDraft = await updateDraft(draft.token, {
        hotel_data: hotel,
        hotel_price_per_night: hotel.price_per_night,
        hotel_total_price: hotel.total_price
      });
      setDraft(updatedDraft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur sélection hôtel');
    }
  }

  async function handleInvite() {
    if (!draft || !inviteEmail) return;
    
    try {
      const updatedDraft = await inviteParticipant(draft.token, inviteEmail, inviteName);
      setDraft(updatedDraft);
      setInviteEmail('');
      setInviteName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur invitation');
    }
  }

  async function handleToggleChecklist(item: keyof TripDraft['checklist']) {
    if (!draft) return;
    
    const newValue = !draft.checklist[item];
    try {
      const result = await toggleChecklistItem(draft.token, item, newValue);
      setDraft(prev => prev ? { ...prev, checklist: result.checklist, status: result.status as TripDraft['status'] } : null);
    } catch (err) {
      console.error('Erreur toggle checklist:', err);
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
  }

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function openRyanairLink() {
    handleFlightBooked();
    window.open('https://www.ryanair.com', '_blank');
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 flex flex-col items-center">
          <LoadingSpinner size="lg" color="primary" />
          <p className="mt-4 text-slate-600">Préparation du voyage...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header avec progression */}
        <div className="bg-gradient-to-r from-primary-500 to-primary-600 text-white p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl sm:text-2xl font-bold">
              ✈️ {trip.aller.destinationFull}
            </h2>
            <button 
              onClick={onClose}
              className="text-white/80 hover:text-white text-2xl"
            >
              ✕
            </button>
          </div>
          
          {/* Étapes */}
          <div className="flex items-center gap-2 sm:gap-4">
            {(['flight', 'hotel', 'planner'] as WizardStep[]).map((step, index) => (
              <button
                key={step}
                onClick={() => setCurrentStep(step)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  currentStep === step 
                    ? 'bg-white text-primary-600' 
                    : 'bg-white/20 text-white/80 hover:bg-white/30'
                }`}
              >
                <span className="w-6 h-6 rounded-full bg-current/20 flex items-center justify-center text-xs">
                  {index + 1}
                </span>
                <span className="hidden sm:inline">
                  {step === 'flight' && 'Vol'}
                  {step === 'hotel' && 'Hôtel'}
                  {step === 'planner' && 'Planner'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          <AnimatePresence mode="wait">
            {/* ÉTAPE 1: VOL */}
            {currentStep === 'flight' && (
              <motion.div
                key="flight"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={springConfig}
              >
                <div className="space-y-6">
                  {/* Récap vol */}
                  <div className="bg-slate-50 rounded-xl p-4 sm:p-6">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">📋 Récapitulatif du vol</h3>
                    
                    <div className="grid sm:grid-cols-2 gap-4">
                      {/* Aller */}
                      <div className="bg-white rounded-lg p-4 border border-green-200">
                        <div className="text-sm font-semibold text-green-600 mb-2">✈️ ALLER</div>
                        <div className="text-lg font-bold">{formatDate(trip.aller.departureTime)}</div>
                        <div className="text-slate-600">{formatTime(trip.aller.departureTime)}</div>
                        <div className="text-sm text-slate-500 mt-1">
                          {trip.aller.origin} → {trip.aller.destination}
                        </div>
                        <div className="text-sm text-slate-500">Vol {trip.aller.flightNumber}</div>
                        <div className="text-lg font-bold text-green-600 mt-2">
                          {formatPrice(trip.aller.price)}
                        </div>
                      </div>
                      
                      {/* Retour */}
                      <div className="bg-white rounded-lg p-4 border border-blue-200">
                        <div className="text-sm font-semibold text-blue-600 mb-2">🔙 RETOUR</div>
                        <div className="text-lg font-bold">{formatDate(trip.retour.departureTime)}</div>
                        <div className="text-slate-600">{formatTime(trip.retour.departureTime)}</div>
                        <div className="text-sm text-slate-500 mt-1">
                          {trip.retour.origin} → {trip.retour.destination}
                        </div>
                        <div className="text-sm text-slate-500">Vol {trip.retour.flightNumber}</div>
                        <div className="text-lg font-bold text-blue-600 mt-2">
                          {formatPrice(trip.retour.price)}
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-slate-200 flex items-center justify-between">
                      <span className="text-slate-600">Total vols</span>
                      <span className="text-2xl font-black text-primary-600">
                        {formatPrice(trip.prix_total)}
                      </span>
                    </div>
                  </div>

                  {/* Bouton réservation - SANS LOGIN REQUIS */}
                  <div className="flex flex-col gap-3">
                    <motion.button
                      onClick={openRyanairLink}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full bg-yellow-400 hover:bg-yellow-500 text-slate-900 font-bold py-4 px-6 rounded-xl text-lg shadow-lg"
                    >
                      🔗 Réserver sur Ryanair
                    </motion.button>
                    
                    {draft?.checklist.flight_booked && (
                      <div className="flex items-center gap-2 text-green-600 font-medium justify-center">
                        ✅ Vol marqué comme réservé
                      </div>
                    )}
                    
                    <button
                      onClick={() => handleToggleChecklist('flight_booked')}
                      className={`text-sm underline ${
                        draft?.checklist.flight_booked ? 'text-slate-500' : 'text-primary-600'
                      }`}
                    >
                      {draft?.checklist.flight_booked 
                        ? 'Annuler le marquage' 
                        : "J'ai déjà réservé mon vol ✓"}
                    </button>
                  </div>

                  {/* Navigation */}
                  <div className="flex justify-end">
                    <motion.button
                      onClick={() => setCurrentStep('hotel')}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="bg-primary-500 hover:bg-primary-600 text-white font-bold py-3 px-6 rounded-xl"
                    >
                      Suivant: Choisir un hôtel →
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ÉTAPE 2: HÔTEL */}
            {currentStep === 'hotel' && (
              <motion.div
                key="hotel"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={springConfig}
              >
                <div className="space-y-4">
                  {/* Tiers de prix */}
                  {tiers && (
                    <div className="flex flex-wrap gap-2">
                      {(['economique', 'confort', 'charme'] as const).map(tier => (
                        <button
                          key={tier}
                          onClick={() => setSelectedTier(tier)}
                          className={`px-4 py-2 rounded-full font-medium transition-all ${
                            selectedTier === tier
                              ? 'bg-primary-500 text-white'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {tier === 'economique' && '💰 Économique'}
                          {tier === 'confort' && '🛋️ Confort'}
                          {tier === 'charme' && '✨ Charme'}
                          <span className="ml-1 text-xs opacity-75">
                            (≤{formatPrice(tiers[tier])}/nuit)
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Tri */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600">Trier par:</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
                    >
                      <option value="value">Meilleur rapport</option>
                      <option value="rating">Mieux notés</option>
                      <option value="price">Prix croissant</option>
                    </select>
                  </div>

                  {/* Liste des hôtels */}
                  {hotelsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <LoadingSpinner size="lg" color="primary" />
                    </div>
                  ) : hotels.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                      Aucun hôtel trouvé dans ce budget
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {hotels.slice(0, 6).map(hotel => (
                        <motion.div
                          key={hotel.id}
                          whileHover={{ scale: 1.01 }}
                          className={`bg-white border-2 rounded-xl p-4 cursor-pointer transition-all ${
                            selectedHotel?.id === hotel.id
                              ? 'border-primary-500 shadow-lg'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                          onClick={() => handleSelectHotel(hotel)}
                        >
                          <div className="flex gap-4">
                            {hotel.image_url && (
                              <img 
                                src={hotel.image_url} 
                                alt={hotel.name}
                                className="w-24 h-24 object-cover rounded-lg"
                              />
                            )}
                            <div className="flex-1">
                              <div className="flex items-start justify-between">
                                <div>
                                  <h4 className="font-bold text-slate-800">{hotel.name}</h4>
                                  <div className="text-yellow-500 text-sm">
                                    {renderStars(hotel.stars)}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-lg font-bold text-primary-600">
                                    {formatPrice(hotel.price_per_night)}/nuit
                                  </div>
                                  <div className="text-sm text-slate-500">
                                    {formatPrice(hotel.total_price)} total ({nights} nuits)
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-sm font-medium">
                                  {hotel.weighted_rating.toFixed(1)}
                                </span>
                                <span className="text-sm text-slate-500">
                                  {formatReviewCount(hotel.review_count)}
                                </span>
                                {hotel.value_score > 1.2 && (
                                  <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-xs font-medium">
                                    🔥 Bon rapport
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {/* Navigation */}
                  <div className="flex justify-between pt-4">
                    <button
                      onClick={() => setCurrentStep('flight')}
                      className="text-slate-600 hover:text-slate-800 font-medium"
                    >
                      ← Retour
                    </button>
                    <motion.button
                      onClick={() => setCurrentStep('planner')}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="bg-primary-500 hover:bg-primary-600 text-white font-bold py-3 px-6 rounded-xl"
                    >
                      {selectedHotel ? 'Suivant: Planner →' : 'Passer au Planner →'}
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ÉTAPE 3: PLANNER */}
            {currentStep === 'planner' && (
              <motion.div
                key="planner"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={springConfig}
              >
                <div className="space-y-6">
                  {/* Résumé */}
                  <div className="bg-gradient-to-r from-primary-50 to-accent-50 rounded-xl p-4 sm:p-6">
                    <h3 className="text-lg font-bold text-slate-800 mb-3">📍 Votre voyage</h3>
                    <div className="grid sm:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-slate-500">Destination:</span>
                        <span className="ml-2 font-medium">{trip.aller.destinationFull}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">Dates:</span>
                        <span className="ml-2 font-medium">
                          {formatDate(trip.aller.departureTime)} → {formatDate(trip.retour.departureTime)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Vols:</span>
                        <span className="ml-2 font-medium">{formatPrice(trip.prix_total)}</span>
                      </div>
                      {selectedHotel && (
                        <div>
                          <span className="text-slate-500">Hôtel:</span>
                          <span className="ml-2 font-medium">
                            {selectedHotel.name} ({formatPrice(selectedHotel.total_price)})
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <span className="text-slate-600">Total estimé:</span>
                      <span className="ml-2 text-2xl font-black text-primary-600">
                        {formatPrice(trip.prix_total + (selectedHotel?.total_price || 0))}
                      </span>
                    </div>
                  </div>

                  {/* Checklist */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">✅ Checklist</h3>
                    <div className="space-y-3">
                      {[
                        { key: 'flight_booked' as const, label: 'Vol réservé', icon: '✈️' },
                        { key: 'hotel_booked' as const, label: 'Hôtel réservé', icon: '🏨' },
                        { key: 'activities_planned' as const, label: 'Activités planifiées', icon: '🎯' },
                        { key: 'transport_arranged' as const, label: 'Transport organisé', icon: '🚗' }
                      ].map(item => (
                        <label
                          key={item.key}
                          className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100"
                        >
                          <input
                            type="checkbox"
                            checked={draft?.checklist[item.key] || false}
                            onChange={() => handleToggleChecklist(item.key)}
                            className="w-5 h-5 rounded border-slate-300 text-primary-500 focus:ring-primary-500"
                          />
                          <span className="text-xl">{item.icon}</span>
                          <span className={draft?.checklist[item.key] ? 'line-through text-slate-400' : ''}>
                            {item.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Participants - REQUIERT LOGIN */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">👥 Participants</h3>
                    
                    {draft?.participants && draft.participants.length > 0 && (
                      <div className="space-y-2 mb-4">
                        {draft.participants.map((p, i) => (
                          <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                            <span className="w-8 h-8 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-sm font-medium">
                              {(p.name || p.email)[0].toUpperCase()}
                            </span>
                            <div>
                              <div className="font-medium">{p.name || p.email}</div>
                              {p.name && <div className="text-xs text-slate-500">{p.email}</div>}
                            </div>
                            <span className={`ml-auto text-xs px-2 py-0.5 rounded ${
                              p.status === 'accepted' ? 'bg-green-100 text-green-700' :
                              p.status === 'declined' ? 'bg-red-100 text-red-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {p.status === 'accepted' ? 'Accepté' :
                               p.status === 'declined' ? 'Refusé' : 'Invité'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {isAuthenticated ? (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="Email du participant"
                          className="flex-1 px-4 py-2 border border-slate-200 rounded-lg"
                        />
                        <input
                          type="text"
                          value={inviteName}
                          onChange={(e) => setInviteName(e.target.value)}
                          placeholder="Nom (optionnel)"
                          className="px-4 py-2 border border-slate-200 rounded-lg"
                        />
                        <button
                          onClick={handleInvite}
                          disabled={!inviteEmail}
                          className="px-4 py-2 bg-primary-500 text-white rounded-lg font-medium disabled:opacity-50"
                        >
                          Inviter
                        </button>
                      </div>
                    ) : (
                      <div className="text-center py-4 bg-slate-50 rounded-lg">
                        <p className="text-slate-600 mb-2">
                          Connectez-vous pour inviter des participants
                        </p>
                        <button className="text-primary-600 font-medium underline">
                          Se connecter
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Lien de partage */}
                  {draft && (
                    <div className="bg-slate-50 rounded-xl p-4">
                      <h4 className="font-medium text-slate-700 mb-2">🔗 Lien de partage</h4>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={`${window.location.origin}/trip/${draft.token}`}
                          className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                        />
                        <button
                          onClick={() => navigator.clipboard.writeText(`${window.location.origin}/trip/${draft.token}`)}
                          className="px-4 py-2 bg-slate-200 hover:bg-slate-300 rounded-lg text-sm font-medium"
                        >
                          Copier
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        Ce lien permet de voir et modifier le voyage sans compte
                      </p>
                    </div>
                  )}

                  {/* Navigation */}
                  <div className="flex justify-between pt-4">
                    <button
                      onClick={() => setCurrentStep('hotel')}
                      className="text-slate-600 hover:text-slate-800 font-medium"
                    >
                      ← Retour
                    </button>
                    <motion.button
                      onClick={() => {
                        if (onComplete && draft) onComplete(draft);
                        onClose();
                      }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-xl"
                    >
                      ✅ Terminer
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
