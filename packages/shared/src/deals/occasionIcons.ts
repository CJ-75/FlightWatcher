/** Map occasion icon key / slug → stable icon id for UI. */
export type OccasionIconId =
  | 'briefcase'
  | 'calendar'
  | 'clock'
  | 'heart'
  | 'gift'
  | 'euro'
  | 'compass'
  | 'sun'
  | 'thermometer'
  | 'luggage'
  | 'tree'
  | 'bridge'
  | 'champagne'
  | 'moon'
  | 'sparkles'

const BY_KEY: Record<string, OccasionIconId> = {
  'briefcase-off': 'briefcase',
  calendar: 'calendar',
  clock: 'clock',
  heart: 'heart',
  gift: 'gift',
  euro: 'euro',
  gem: 'compass',
  compass: 'compass',
  thermometer: 'thermometer',
  luggage: 'luggage',
  tree: 'tree',
  bridge: 'bridge',
  champagne: 'champagne',
  sun: 'sun',
  moon: 'moon',
}

export function resolveOccasionIconId(
  icon?: string | null,
  slug?: string | null,
): OccasionIconId {
  if (icon && BY_KEY[icon]) return BY_KEY[icon]
  const s = (slug || '').toLowerCase()
  if (s.includes('noel') || s.includes('arbre')) return 'tree'
  if (s.includes('soleil') || s.includes('beau')) return 'sun'
  if (s.includes('200') || s.includes('euro') || s.includes('moins')) return 'euro'
  if (s.includes('nouvel') || s.includes('an')) return 'champagne'
  if (s.includes('conge')) return 'briefcase'
  if (s.includes('polaire') || s.includes('nuit')) return 'moon'
  if (s.includes('pont')) return 'bridge'
  if (s.includes('vacance') || s.includes('hors')) return 'luggage'
  if (s.includes('hotel') || s.includes('plebisc')) return 'heart'
  if (s.includes('extra')) return 'gift'
  if (s.includes('pepites') || s.includes('max')) return 'compass'
  return 'sparkles'
}
