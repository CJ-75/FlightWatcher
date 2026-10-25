/** Common IATA airline codes → display name (FR market). */
const AIRLINE_NAMES: Record<string, string> = {
  FR: 'Ryanair',
  RK: 'Ryanair',
  TO: 'Transavia',
  HV: 'Transavia',
  VY: 'Vueling',
  U2: 'easyJet',
  EC: 'easyJet',
  DS: 'easyJet',
  W4: 'Wizz Air',
  W6: 'Wizz Air',
  W9: 'Wizz Air',
  AF: 'Air France',
  BA: 'British Airways',
  LH: 'Lufthansa',
  KL: 'KLM',
  IB: 'Iberia',
  I2: 'Iberia Express',
  EI: 'Aer Lingus',
  TP: 'TAP Air Portugal',
  SN: 'Brussels Airlines',
  LX: 'Swiss',
  OS: 'Austrian',
  AZ: 'ITA Airways',
  EW: 'Eurowings',
  PC: 'Pegasus',
  DY: 'Norwegian',
  D8: 'Norwegian',
  SK: 'SAS',
  A3: 'Aegean',
  UX: 'Air Europa',
  LS: 'Jet2',
  V7: 'Volotea',
  X3: 'TUI fly',
  TB: 'TUI fly',
  BT: 'airBaltic',
  LO: 'LOT',
  OK: 'Czech Airlines',
  RO: 'TAROM',
  JU: 'Air Serbia',
  A5: 'HOP!',
  XK: 'Air Corsica',
  SS: 'Corsair',
  BF: 'French Bee',
  TX: 'Air Caraïbes',
  QS: 'Smartwings',
  GQ: 'Sky Express',
  DE: 'Condor',
  EZY: 'easyJet',
  MW: 'Mokulele',
  XP: 'Avelo',
  F9: 'Frontier',
  NK: 'Spirit',
  B6: 'jetBlue',
  AA: 'American Airlines',
  UA: 'United',
  DL: 'Delta',
  AC: 'Air Canada',
  WK: 'Edelweiss',
  EN: 'Air Dolomiti',
  LJ: 'Jin Air',
}

/**
 * Human-readable airline for trip cards.
 * Prefers mapped IATA name, then raw airline, then provider fallback.
 */
export function formatAirlineLabel(trip: {
  airline?: string | null
  provider?: string | null
}): string {
  const raw = (trip.airline || '').trim()
  const code = raw.toUpperCase()
  if (code && AIRLINE_NAMES[code]) return AIRLINE_NAMES[code]
  // Already a name (not a 2–3 letter code)
  if (raw && (raw.length > 3 || /[a-z]/.test(raw))) return raw
  if (code && code.length >= 2 && code.length <= 3) return `Compagnie ${code}`

  const provider = String(trip.provider || '').toLowerCase()
  if (provider === 'ryanair') return 'Ryanair'
  if (provider === 'travelpayouts') return 'Multi-compagnies'
  return 'Compagnie'
}
