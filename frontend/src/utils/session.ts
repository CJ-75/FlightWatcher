/**
 * Gestion du session_id pour le tracking anonyme
 * Génère et stocke un identifiant de session unique dans un cookie
 */

const SESSION_COOKIE_NAME = 'flightwatcher_session_id';
const SESSION_DURATION_DAYS = 365; // Durée du cookie en jours

/**
 * Génère un UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Récupère ou crée un session_id depuis le cookie
 * @returns Le session_id (UUID)
 */
export function getSessionId(): string {
  // Vérifier si le cookie existe
  const cookies = document.cookie.split(';');
  const sessionCookie = cookies.find(cookie => 
    cookie.trim().startsWith(`${SESSION_COOKIE_NAME}=`)
  );

  if (sessionCookie) {
    const sessionId = sessionCookie.split('=')[1].trim();
    if (sessionId) {
      return sessionId;
    }
  }

  // Créer un nouveau session_id
  const newSessionId = generateUUID();
  setSessionId(newSessionId);
  return newSessionId;
}

/**
 * Définit le session_id dans un cookie
 * @param sessionId L'identifiant de session à stocker
 */
function setSessionId(sessionId: string): void {
  const expirationDate = new Date();
  expirationDate.setTime(expirationDate.getTime() + (SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000));
  const expires = `expires=${expirationDate.toUTCString()}`;
  
  document.cookie = `${SESSION_COOKIE_NAME}=${sessionId};${expires};path=/;SameSite=Lax`;
}

