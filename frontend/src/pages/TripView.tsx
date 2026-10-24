/**
 * Page de visualisation d'un voyage par token
 * Accessible sans authentification via /trip/:token
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { TripDraft, HotelResult } from '../types';
import { getDraft, toggleChecklistItem, updateDraft, inviteParticipant } from '../utils/drafts';
import { searchHotels, formatPrice, renderStars, formatReviewCount, calculateNights } from '../utils/hotels';
import { getCurrentUser } from '../lib/supabase';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { motion } from 'framer-motion';

export function TripView() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  
  const [draft, setDraft] = useState<TripDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Hotel search state
  const [hotels, setHotels] = useState<HotelResult[]>([]);
  const [hotelsLoading, setHotelsLoading] = useState(false);
  const [showHotelSearch, setShowHotelSearch] = useState(false);
  
  // Invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');

  useEffect(() => {
    async function loadDraft() {
      if (!token) {
        setError('Token manquant');
        setLoading(false);
        return;
      }
      
      try {
        const draftData = await getDraft(token);
        setDraft(draftData);
        
        const user = await getCurrentUser();
        setIsAuthenticated(!!user);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur chargement voyage');
      } finally {
        setLoading(false);
      }
    }
    
    loadDraft();
  }, [token]);

  async function handleToggleChecklist(item: keyof TripDraft['checklist']) {
    if (!draft || !token) return;
    
    const newValue = !draft.checklist[item];
    try {
      const result = await toggleChecklistItem(token, item, newValue);
      setDraft(prev => prev ? { 
        ...prev, 
        checklist: result.checklist, 
        status: result.status as TripDraft['status'] 
      } : null);
    } catch (err) {
      console.error('Erreur toggle checklist:', err);
    }
  }

  async function handleSelectHotel(hotel: HotelResult) {
    if (!draft || !token) return;
    
    try {
      const updatedDraft = await updateDraft(token, {
        hotel_data: hotel,
        hotel_price_per_night: hotel.price_per_night,
        hotel_total_price: hotel.total_price
      });
      setDraft(updatedDraft);
      setShowHotelSearch(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur sélection hôtel');
    }
  }

  async function handleInvite() {
    if (!draft || !token || !inviteEmail) return;
    
    try {
      const updatedDraft = await inviteParticipant(token, inviteEmail, inviteName);
      setDraft(updatedDraft);
      setInviteEmail('');
      setInviteName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur invitation');
    }
  }

  async function loadHotels() {
    if (!draft) return;
    
    setHotelsLoading(true);
    try {
      const response = await searchHotels({
        city_code: draft.destination_code,
        check_in: draft.outbound_date,
        check_out: draft.return_date,
        tier: 'confort',
        sort_by: 'value'
      });
      setHotels(response.hotels);
      setShowHotelSearch(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur chargement hôtels');
    } finally {
      setHotelsLoading(false);
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  }

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <LoadingSpinner size="lg" color="primary" />
      </div>
    );
  }

  if (error || !draft) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-4">
            {error || 'Voyage non trouvé'}
          </h1>
          <button
            onClick={() => navigate('/')}
            className="text-primary-600 font-medium hover:underline"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  const nights = calculateNights(draft.outbound_date, draft.return_date);
  const totalPrice = draft.flight_total_price + (draft.hotel_total_price || 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-primary-500 to-primary-600 text-white py-6 px-4">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate('/')}
            className="text-white/80 hover:text-white mb-4"
          >
            ← Retour
          </button>
          <h1 className="text-3xl font-black mb-2">
            ✈️ {draft.destination_name || draft.destination_code}
          </h1>
          <p className="text-white/90">
            {formatDate(draft.outbound_date)} → {formatDate(draft.return_date)} ({nights} nuits)
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto py-8 px-4 space-y-6">
        {error && (
          <div className="p-4 bg-red-100 border border-red-300 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {/* Résumé du voyage */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">📋 Détails du voyage</h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            {/* Vol aller */}
            <div className="bg-green-50 rounded-xl p-4 border border-green-200">
              <div className="text-sm font-semibold text-green-600 mb-2">✈️ VOL ALLER</div>
              <div className="text-lg font-bold">{formatDate(draft.flight_data.aller.departureTime)}</div>
              <div className="text-slate-600">{formatTime(draft.flight_data.aller.departureTime)}</div>
              <div className="text-sm text-slate-500 mt-2">
                {draft.flight_data.aller.origin} → {draft.flight_data.aller.destination}
              </div>
              <div className="text-lg font-bold text-green-600 mt-2">
                {formatPrice(draft.flight_data.aller.price)}
              </div>
            </div>

            {/* Vol retour */}
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
              <div className="text-sm font-semibold text-blue-600 mb-2">🔙 VOL RETOUR</div>
              <div className="text-lg font-bold">{formatDate(draft.flight_data.retour.departureTime)}</div>
              <div className="text-slate-600">{formatTime(draft.flight_data.retour.departureTime)}</div>
              <div className="text-sm text-slate-500 mt-2">
                {draft.flight_data.retour.origin} → {draft.flight_data.retour.destination}
              </div>
              <div className="text-lg font-bold text-blue-600 mt-2">
                {formatPrice(draft.flight_data.retour.price)}
              </div>
            </div>
          </div>

          {/* Hôtel */}
          {draft.hotel_data ? (
            <div className="mt-6 bg-amber-50 rounded-xl p-4 border border-amber-200">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-semibold text-amber-600 mb-2">🏨 HÔTEL</div>
                  <div className="text-lg font-bold">{draft.hotel_data.name}</div>
                  <div className="text-yellow-500">{renderStars(draft.hotel_data.stars)}</div>
                  <div className="text-sm text-slate-500 mt-1">
                    {formatReviewCount(draft.hotel_data.review_count)} • Note: {draft.hotel_data.rating}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-amber-600">
                    {formatPrice(draft.hotel_total_price || 0)}
                  </div>
                  <div className="text-sm text-slate-500">
                    {formatPrice(draft.hotel_price_per_night || 0)}/nuit
                  </div>
                </div>
              </div>
              <button
                onClick={() => loadHotels()}
                className="mt-3 text-sm text-amber-600 hover:underline"
              >
                Changer d'hôtel
              </button>
            </div>
          ) : (
            <div className="mt-6">
              <button
                onClick={() => loadHotels()}
                disabled={hotelsLoading}
                className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl disabled:opacity-50"
              >
                {hotelsLoading ? 'Chargement...' : '🏨 Chercher un hôtel'}
              </button>
            </div>
          )}

          {/* Total */}
          <div className="mt-6 pt-6 border-t border-slate-200 flex items-center justify-between">
            <span className="text-xl font-medium text-slate-600">Total estimé</span>
            <span className="text-3xl font-black text-primary-600">
              {formatPrice(totalPrice)}
            </span>
          </div>
        </div>

        {/* Recherche hôtels */}
        {showHotelSearch && hotels.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-800">🏨 Choisir un hôtel</h2>
              <button
                onClick={() => setShowHotelSearch(false)}
                className="text-slate-500 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {hotels.map(hotel => (
                <motion.div
                  key={hotel.id}
                  whileHover={{ scale: 1.01 }}
                  onClick={() => handleSelectHotel(hotel)}
                  className="p-4 border border-slate-200 rounded-xl cursor-pointer hover:border-primary-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold">{hotel.name}</h4>
                      <div className="text-yellow-500 text-sm">{renderStars(hotel.stars)}</div>
                      <div className="text-sm text-slate-500">
                        Note: {hotel.weighted_rating.toFixed(1)} • {formatReviewCount(hotel.review_count)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-primary-600">{formatPrice(hotel.total_price)}</div>
                      <div className="text-sm text-slate-500">{formatPrice(hotel.price_per_night)}/nuit</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Checklist */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">✅ Checklist</h2>
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
                  checked={draft.checklist[item.key] || false}
                  onChange={() => handleToggleChecklist(item.key)}
                  className="w-5 h-5 rounded border-slate-300 text-primary-500"
                />
                <span className="text-xl">{item.icon}</span>
                <span className={draft.checklist[item.key] ? 'line-through text-slate-400' : ''}>
                  {item.label}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Participants */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">👥 Participants</h2>
          
          {draft.participants.length > 0 && (
            <div className="space-y-2 mb-4">
              {draft.participants.map((p, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <span className="w-10 h-10 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center font-bold">
                    {(p.name || p.email)[0].toUpperCase()}
                  </span>
                  <div>
                    <div className="font-medium">{p.name || p.email}</div>
                    {p.name && <div className="text-sm text-slate-500">{p.email}</div>}
                  </div>
                  <span className={`ml-auto text-sm px-2 py-1 rounded ${
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
                className="px-6 py-2 bg-primary-500 text-white rounded-lg font-medium disabled:opacity-50"
              >
                Inviter
              </button>
            </div>
          ) : (
            <div className="text-center py-4 bg-slate-50 rounded-lg">
              <p className="text-slate-600">
                Connectez-vous pour inviter des participants
              </p>
            </div>
          )}
        </div>

        {/* Boutons d'action */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => {
              window.open('https://www.ryanair.com', '_blank');
              handleToggleChecklist('flight_booked');
            }}
            className="flex-1 py-4 bg-yellow-400 hover:bg-yellow-500 text-slate-900 font-bold rounded-xl"
          >
            🔗 Réserver le vol sur Ryanair
          </button>
          <button
            onClick={() => navigator.clipboard.writeText(window.location.href)}
            className="px-6 py-4 bg-slate-200 hover:bg-slate-300 font-medium rounded-xl"
          >
            📋 Copier le lien
          </button>
        </div>
      </main>
    </div>
  );
}
