/** Common IATA airline codes → display name (FR market). */
const AIRLINE_NAMES: Record<string, string> = {
  FR: 'Ryanair',
  RK: 'Ryanair',
  RYANAIR: 'Ryanair',
  TO: 'Transavia',
  HV: 'Transavia',
  TRANSAVIA: 'Transavia',
  VY: 'Vueling',
  VUELING: 'Vueling',
  U2: 'easyJet',
  EC: 'easyJet',
  DS: 'easyJet',
  EZY: 'easyJet',
  EASYJET: 'easyJet',
  W4: 'Wizz Air',
  W6: 'Wizz Air',
  W9: 'Wizz Air',
  WIZZ: 'Wizz Air',
  WIZZAIR: 'Wizz Air',
  AF: 'Air France',
  AIRFRANCE: 'Air France',
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
  VOLOTEA: 'Volotea',
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

/** Extract IATA-ish carrier code from a flight number ("FR4821", "FR 4821", "U2 1234"). */
export function airlineCodeFromFlightNumber(
  flightNumber?: string | null,
): string | null {
  const raw = String(flightNumber || '').trim().toUpperCase()
  if (!raw) return null
  const spaced = raw.match(/^([A-Z]{2,3})\s+\d{1,5}\b/)
  if (spaced) return spaced[1]
  const compact = raw.replace(/[^A-Z0-9]/g, '')
  const m = compact.match(/^([A-Z]{2,3})\d{1,5}$/)
  return m ? m[1] : null
}

function nameFromCodeOrRaw(raw?: string | null): string | null {
  const text = String(raw || '').trim()
  if (!text) return null
  const key = text.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (key && AIRLINE_NAMES[key]) return AIRLINE_NAMES[key]
  // Already a human name (not a 2–3 letter code)
  if (text.length > 3 || /[a-z]/.test(text)) {
    if (/^compagnie(\s|$)/i.test(text)) return null
    return text
  }
  if (key && key.length >= 2 && key.length <= 3) return `Compagnie ${key}`
  return null
}

function nameFromBookingUrl(url?: string | null): string | null {
  const u = String(url || '').toLowerCase()
  if (!u) return null
  if (u.includes('ryanair')) return 'Ryanair'
  if (u.includes('easyjet')) return 'easyJet'
  if (u.includes('transavia')) return 'Transavia'
  if (u.includes('vueling')) return 'Vueling'
  if (u.includes('wizzair') || u.includes('wizz')) return 'Wizz Air'
  if (u.includes('airfrance') || u.includes('air-france')) return 'Air France'
  if (u.includes('volotea')) return 'Volotea'
  if (u.includes('jet2')) return 'Jet2'
  return null
}

export type AirlineLabelTrip = {
  airline?: string | null
  provider?: string | null
  booking_url?: string | null
  aller?: { flightNumber?: string | null } | null
  retour?: { flightNumber?: string | null } | null
}

/**
 * Human-readable airline for trip cards / favoris / boarding pass.
 * Prefers mapped IATA, flight-number prefix, booking URL, then provider.
 */
export function formatAirlineLabel(trip: AirlineLabelTrip): string {
  const fromAirline = nameFromCodeOrRaw(trip.airline)
  if (fromAirline && !/^Compagnie\s/i.test(fromAirline)) return fromAirline

  const fromOut = nameFromCodeOrRaw(
    airlineCodeFromFlightNumber(trip.aller?.flightNumber),
  )
  if (fromOut && !/^Compagnie\s/i.test(fromOut)) return fromOut

  const fromRet = nameFromCodeOrRaw(
    airlineCodeFromFlightNumber(trip.retour?.flightNumber),
  )
  if (fromRet && !/^Compagnie\s/i.test(fromRet)) return fromRet

  const fromUrl = nameFromBookingUrl(trip.booking_url)
  if (fromUrl) return fromUrl

  const provider = String(trip.provider || '').toLowerCase()
  if (provider === 'ryanair') return 'Ryanair'
  if (provider === 'travelpayouts' || provider === 'aviasales') {
    return fromAirline || fromOut || fromRet || 'Multi-compagnies'
  }

  return fromAirline || fromOut || fromRet || 'Compagnie'
}
