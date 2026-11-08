import type { ItineraryDurationKind, ItineraryOccasion } from './types'

export const ITINERARY_OCCASION_LABELS: Record<ItineraryOccasion, string> = {
  romantique: 'En amoureux',
  ferie: 'Férié',
  soleil: 'Au soleil',
  pluie: 'Jour de pluie',
  amis: 'Entre amis',
  petit_budget: 'Petit budget',
  famille: 'En famille',
  nuit: 'Le soir',
  saison: 'De saison',
}

/** Emojis chips Envies — alignés look Séjours. */
export const ITINERARY_OCCASION_EMOJIS: Record<ItineraryOccasion, string> = {
  romantique: '💕',
  ferie: '📅',
  soleil: '☀️',
  pluie: '🌧️',
  amis: '🍻',
  petit_budget: '💶',
  famille: '👨‍👩‍👧',
  nuit: '🌙',
  saison: '✨',
}

export function itineraryOccasionEmoji(
  occasion: ItineraryOccasion | string | null | undefined,
): string {
  if (!occasion) return '✨'
  return (
    ITINERARY_OCCASION_EMOJIS[occasion as ItineraryOccasion] || '✨'
  )
}

export const ITINERARY_DURATION_LABELS: Record<ItineraryDurationKind, string> = {
  '2h': '2 h',
  half_day: 'Demi-journée',
  day: 'Une journée',
  weekend: 'Week-end',
}

export const ITINERARY_OCCASIONS = Object.keys(
  ITINERARY_OCCASION_LABELS,
) as ItineraryOccasion[]

export const ITINERARY_DURATIONS = Object.keys(
  ITINERARY_DURATION_LABELS,
) as ItineraryDurationKind[]

export function formatDurationMinutes(mins?: number | null): string | null {
  if (mins == null || !Number.isFinite(mins) || mins <= 0) return null
  if (mins < 60) return `${Math.round(mins)} min`
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return m ? `${h} h ${m}` : `${h} h`
}

export function itineraryMetaLine(opts: {
  cityLabel?: string | null
  durationKind?: ItineraryDurationKind | string | null
  occasion?: string | null
}): string {
  const parts: string[] = []
  if (opts.cityLabel) parts.push(opts.cityLabel)
  if (opts.durationKind) {
    const d = ITINERARY_DURATION_LABELS[opts.durationKind as ItineraryDurationKind]
    parts.push(d || String(opts.durationKind))
  }
  if (opts.occasion) {
    const o = ITINERARY_OCCASION_LABELS[opts.occasion as ItineraryOccasion]
    parts.push(o || opts.occasion)
  }
  return parts.join(' · ')
}
