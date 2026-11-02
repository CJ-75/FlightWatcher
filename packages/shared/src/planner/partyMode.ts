/** Composition du voyage : Solo (1) · Duo (2) · Groupe (3+). */

export type PartyMode = 'solo' | 'duo' | 'groupe'

export function partyModeFromCount(n: number): PartyMode {
  const pax = Math.max(1, Math.floor(n) || 1)
  if (pax <= 1) return 'solo'
  if (pax === 2) return 'duo'
  return 'groupe'
}

export function partyModeDefaultPassengers(mode: PartyMode): number {
  if (mode === 'solo') return 1
  if (mode === 'duo') return 2
  return 3
}

export function partyModeMinPassengers(mode: PartyMode): number {
  if (mode === 'solo') return 1
  if (mode === 'duo') return 2
  return 3
}

export function partyModeMaxPassengers(mode: PartyMode): number {
  if (mode === 'solo') return 1
  if (mode === 'duo') return 2
  return 6
}

export function partyModeKickerFr(mode: PartyMode): string {
  if (mode === 'solo') return 'Solo'
  if (mode === 'duo') return 'Duo'
  return 'Groupe'
}

/** Titre section voyageurs (remplace « Ta bande de voyage »). */
export function partyModeTitleFr(mode: PartyMode): string {
  if (mode === 'solo') return 'Ton voyage solo'
  if (mode === 'duo') return 'Votre duo'
  return 'Votre groupe'
}

export function partyModeSubtitleFr(mode: PartyMode): string {
  if (mode === 'solo') return 'Tu voyages solo — tu peux inviter plus tard.'
  if (mode === 'duo') return 'À deux sur ce voyage.'
  return 'Organisez le séjour à plusieurs.'
}

export function partyModeCreateHintFr(mode: PartyMode): string {
  if (mode === 'solo') return '1 place — pour toi'
  if (mode === 'duo') return '2 places — toi + 1'
  return '3 à 6 places — amis ou famille'
}

export function partyModeCreateLeadFr(mode: PartyMode): string {
  if (mode === 'solo') return 'Libre, flexible, à ton rythme.'
  if (mode === 'duo') return 'Un séjour pensé pour deux.'
  return 'Organisez le voyage ensemble.'
}

export const PARTY_MODE_OPTIONS: {
  mode: PartyMode
  label: string
  emoji: string
  hint: string
}[] = [
  { mode: 'solo', label: 'Solo', emoji: '🧍', hint: 'Je voyage solo' },
  { mode: 'duo', label: 'Duo', emoji: '👫', hint: 'On part à deux' },
  { mode: 'groupe', label: 'Groupe', emoji: '👥', hint: 'À plusieurs' },
]
