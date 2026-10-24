/**
 * Gestion des brouillons de voyage (trip drafts)
 * Accessible SANS authentification via token unique
 */
import { 
  TripDraft, 
  CreateDraftRequest, 
  UpdateDraftRequest, 
  TripResponse,
  DraftChecklist 
} from '../types';
import { getAccessToken } from '../lib/supabase';

const DRAFT_TOKEN_KEY = 'flightwatcher_draft_tokens';

// ==================== TOKEN STORAGE ====================

interface StoredDraftToken {
  token: string;
  destination_code: string;
  destination_name?: string;
  created_at: string;
}

export function getStoredDraftTokens(): StoredDraftToken[] {
  const data = localStorage.getItem(DRAFT_TOKEN_KEY);
  return data ? JSON.parse(data) : [];
}

export function storeDraftToken(draft: TripDraft): void {
  const tokens = getStoredDraftTokens();
  
  // Éviter les doublons
  if (!tokens.some(t => t.token === draft.token)) {
    tokens.push({
      token: draft.token,
      destination_code: draft.destination_code,
      destination_name: draft.destination_name,
      created_at: draft.created_at
    });
    localStorage.setItem(DRAFT_TOKEN_KEY, JSON.stringify(tokens));
  }
}

export function removeDraftToken(token: string): void {
  const tokens = getStoredDraftTokens();
  const filtered = tokens.filter(t => t.token !== token);
  localStorage.setItem(DRAFT_TOKEN_KEY, JSON.stringify(filtered));
}

export function getCurrentDraftToken(): string | null {
  const tokens = getStoredDraftTokens();
  return tokens.length > 0 ? tokens[tokens.length - 1].token : null;
}

// ==================== API CALLS ====================

async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json'
  };
  
  const accessToken = await getAccessToken();
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  
  return headers;
}

/**
 * Créer un nouveau brouillon de voyage
 * Accessible SANS authentification
 */
export async function createDraft(trip: TripResponse, departureAirport: string): Promise<TripDraft> {
  const request: CreateDraftRequest = {
    flight_data: trip,
    departure_airport: departureAirport,
    destination_code: trip.destination_code,
    destination_name: trip.aller.destinationFull,
    outbound_date: trip.aller.departureTime.split('T')[0],
    return_date: trip.retour.departureTime.split('T')[0]
  };
  
  const response = await fetch('/api/drafts', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify(request)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Erreur création brouillon');
  }
  
  const draft = await response.json();
  storeDraftToken(draft);
  return draft;
}

/**
 * Récupérer un brouillon par son token
 * Accessible SANS authentification
 */
export async function getDraft(token: string): Promise<TripDraft> {
  const response = await fetch(`/api/drafts/${token}`);
  
  if (!response.ok) {
    if (response.status === 404) {
      removeDraftToken(token);
      throw new Error('Brouillon non trouvé ou expiré');
    }
    const error = await response.json();
    throw new Error(error.detail || 'Erreur récupération brouillon');
  }
  
  return response.json();
}

/**
 * Mettre à jour un brouillon
 * Accessible SANS authentification
 */
export async function updateDraft(token: string, data: UpdateDraftRequest): Promise<TripDraft> {
  const response = await fetch(`/api/drafts/${token}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Erreur mise à jour brouillon');
  }
  
  return response.json();
}

/**
 * Cocher/décocher un élément de la checklist
 * Accessible SANS authentification
 */
export async function toggleChecklistItem(
  token: string, 
  item: keyof DraftChecklist, 
  checked: boolean
): Promise<{ checklist: DraftChecklist; status: string }> {
  const response = await fetch(`/api/drafts/${token}/checklist/${item}?checked=${checked}`, {
    method: 'POST'
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Erreur mise à jour checklist');
  }
  
  return response.json();
}

/**
 * Inviter un participant au voyage
 * REQUIERT une authentification
 */
export async function inviteParticipant(
  token: string, 
  email: string, 
  name?: string
): Promise<TripDraft> {
  const response = await fetch(`/api/drafts/${token}/invite`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ email, name })
  });
  
  if (!response.ok) {
    const error = await response.json();
    if (response.status === 401) {
      throw new Error('Connectez-vous pour inviter des participants');
    }
    throw new Error(error.detail || 'Erreur invitation');
  }
  
  return response.json();
}

/**
 * Associer un brouillon anonyme à son compte
 * REQUIERT une authentification
 */
export async function claimDraft(token: string): Promise<TripDraft> {
  const response = await fetch(`/api/drafts/${token}/claim`, {
    method: 'POST',
    headers: await getAuthHeaders()
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Erreur association brouillon');
  }
  
  return response.json();
}

/**
 * Lister tous les brouillons de l'utilisateur connecté
 * REQUIERT une authentification
 */
export async function listUserDrafts(): Promise<{ drafts: TripDraft[]; count: number }> {
  const response = await fetch('/api/drafts/user/list', {
    headers: await getAuthHeaders()
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Connectez-vous pour voir vos brouillons');
    }
    const error = await response.json();
    throw new Error(error.detail || 'Erreur récupération brouillons');
  }
  
  return response.json();
}

/**
 * Récupérer tous les brouillons stockés localement
 * Utile pour afficher les brouillons même sans connexion
 */
export async function getLocalDrafts(): Promise<TripDraft[]> {
  const tokens = getStoredDraftTokens();
  const drafts: TripDraft[] = [];
  
  for (const { token } of tokens) {
    try {
      const draft = await getDraft(token);
      drafts.push(draft);
    } catch {
      // Supprimer les tokens invalides
      removeDraftToken(token);
    }
  }
  
  return drafts;
}
