/** Composition du voyage : Solo (1) · Duo (2) · À plusieurs (3+). */

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
  return 'À plusieurs'
}

/** Titre section « Qui part ». */
export function partyModeTitleFr(mode: PartyMode): string {
  if (mode === 'solo') return 'Tu pars solo'
  if (mode === 'duo') return 'Vous partez à deux'
  return 'Vous partez à plusieurs'
}

export function partyModeSubtitleFr(mode: PartyMode): string {
  if (mode === 'solo') return 'Tu peux inviter quelqu’un plus tard.'
  if (mode === 'duo') return 'Deux places sur ce séjour.'
  return 'Jusqu’à 6 personnes sur le même séjour.'
}

export function partyModeCreateHintFr(mode: PartyMode): string {
  if (mode === 'solo') return '1 place, pour toi'
  if (mode === 'duo') return '2 places, toi + 1'
  return '3 à 6 places, amis ou famille'
}

export function partyModeCreateLeadFr(mode: PartyMode): string {
  if (mode === 'solo') return 'Libre, flexible, à ton rythme.'
  if (mode === 'duo') return 'Un séjour pensé pour deux.'
  return 'Chacun suit le séjour au même endroit.'
}

/** Libellé court pour un effectif (évite « voyageurs »). */
export function partyPeopleCountFr(n: number): string {
  const pax = Math.max(1, Math.floor(n) || 1)
  return pax === 1 ? '1 personne' : `${pax} personnes`
}

export const PARTY_MODE_OPTIONS: {
  mode: PartyMode
  label: string
  emoji: string
  hint: string
}[] = [
  { mode: 'solo', label: 'Solo', emoji: '🧍', hint: 'Je pars seul·e' },
  { mode: 'duo', label: 'Duo', emoji: '👫', hint: 'On part à deux' },
  { mode: 'groupe', label: 'À plusieurs', emoji: '👥', hint: 'Amis ou famille' },
]
