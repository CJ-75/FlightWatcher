/**
 * Boarding-pass / flight ticket copy for planner detail (Lot 0 Path).
 */

/** Kicker above the ticket — not « carte d'embarquement » until booked. */
export function flightTicketKickerFr(flightBooked: boolean): string {
  return flightBooked ? 'Carte d’embarquement' : 'Ton vol · à réserver'
}

/** Phase chip on the ticket. */
export function flightTicketBadgeFr(flightBooked: boolean): string {
  return flightBooked ? 'Vol réservé' : 'Vol choisi'
}

/**
 * Avoid showing the same flight number on aller and retour when the API
 * duplicated the outbound number (common Ryanair/meta bug).
 */
export function displayLegFlightNumber(
  leg: 'aller' | 'retour',
  allerNumber?: string | null,
  retourNumber?: string | null,
): string {
  const a = String(allerNumber || '')
    .trim()
    .toUpperCase()
  const r = String(retourNumber || '')
    .trim()
    .toUpperCase()
  if (leg === 'aller') return a || '—'
  if (!r) return '—'
  if (a && r === a) return '—'
  return r
}
