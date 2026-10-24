/**
 * Recherche d'hôtels avec cache et prefetch
 */
import { 
  HotelResult, 
  HotelSearchRequest, 
  HotelSearchResponse, 
  PriceTiers 
} from '../types';
import { getCurrentDraftToken } from './drafts';

// ==================== CACHE KEY HELPERS ====================

export function generateCacheKey(cityCode: string, checkIn: string, checkOut: string): string {
  return `${cityCode}:${checkIn}:${checkOut}`;
}

// ==================== API CALLS ====================

/**
 * Récupère les tiers de prix pour une ville
 * Utile pour afficher les onglets Économique/Confort/Charme
 */
export async function getPriceTiers(
  cityCode: string,
  checkIn: string,
  checkOut: string
): Promise<PriceTiers> {
  const draftToken = getCurrentDraftToken();
  const params = new URLSearchParams({
    check_in: checkIn,
    check_out: checkOut,
    ...(draftToken && { draft_token: draftToken })
  });
  
  const response = await fetch(`/api/hotels/tiers/${cityCode}?${params}`);
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Erreur récupération tiers de prix');
  }
  
  return response.json();
}

/**
 * Recherche des hôtels avec cache et rate limiting
 */
export async function searchHotels(
  request: HotelSearchRequest
): Promise<HotelSearchResponse> {
  const draftToken = getCurrentDraftToken();
  
  const response = await fetch('/api/hotels/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...request,
      draft_token: draftToken
    })
  });
  
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Limite de recherches atteinte. Réessayez dans quelques minutes.');
    }
    const error = await response.json();
    throw new Error(error.detail || 'Erreur recherche hôtels');
  }
  
  return response.json();
}

/**
 * Précharge les hôtels en arrière-plan
 * À appeler dès le clic sur un vol (étape 1 du wizard)
 */
export async function prefetchHotels(
  cityCode: string,
  checkIn: string,
  checkOut: string
): Promise<{ status: string; cache_key: string }> {
  const draftToken = getCurrentDraftToken();
  const params = new URLSearchParams({
    city_code: cityCode,
    check_in: checkIn,
    check_out: checkOut,
    ...(draftToken && { draft_token: draftToken })
  });
  
  const response = await fetch(`/api/hotels/prefetch?${params}`, {
    method: 'POST'
  });
  
  if (!response.ok) {
    console.warn('Prefetch hôtels échoué');
    return { status: 'error', cache_key: generateCacheKey(cityCode, checkIn, checkOut) };
  }
  
  return response.json();
}

/**
 * Vérifie si les résultats sont en cache
 * Utile pour savoir quand le prefetch est terminé
 */
export async function checkCacheStatus(
  cacheKey: string
): Promise<{ cached: boolean; hotel_count?: number; median_price?: number }> {
  const response = await fetch(`/api/hotels/cache-status/${encodeURIComponent(cacheKey)}`);
  
  if (!response.ok) {
    return { cached: false };
  }
  
  return response.json();
}

/**
 * Attend que le cache soit prêt (polling)
 * Timeout après maxWait ms
 */
export async function waitForCache(
  cacheKey: string,
  maxWait: number = 10000,
  interval: number = 500
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    const status = await checkCacheStatus(cacheKey);
    if (status.cached) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  return false;
}

// ==================== HOOKS-LIKE HELPERS ====================

interface HotelSearchState {
  loading: boolean;
  hotels: HotelResult[];
  error: string | null;
  fromCache: boolean;
  tiers: PriceTiers | null;
  selectedTier: 'economique' | 'confort' | 'charme';
  sortBy: 'value' | 'rating' | 'price';
}

/**
 * Helper pour gérer l'état de recherche d'hôtels
 */
export function createHotelSearchState(): HotelSearchState {
  return {
    loading: false,
    hotels: [],
    error: null,
    fromCache: false,
    tiers: null,
    selectedTier: 'confort',
    sortBy: 'value'
  };
}

/**
 * Formate le prix avec devise
 */
export function formatPrice(price: number, currency: string = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency
  }).format(price);
}

/**
 * Formate le nombre d'avis
 */
export function formatReviewCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k avis`;
  }
  return `${count} avis`;
}

/**
 * Génère les étoiles pour l'affichage
 */
export function renderStars(stars: number | undefined): string {
  if (!stars) return '';
  return '★'.repeat(stars) + '☆'.repeat(5 - stars);
}

/**
 * Calcule le nombre de nuits
 */
export function calculateNights(checkIn: string, checkOut: string): number {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays);
}
