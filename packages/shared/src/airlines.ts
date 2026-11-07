/** Common IATA airline codes → display name (FR market + long-haul / golfe). */
const AIRLINE_NAMES: Record<string, string> = {
  // Low-cost EU
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
  V7: 'Volotea',
  VOLOTEA: 'Volotea',
  LS: 'Jet2',
  JET2: 'Jet2',
  X3: 'TUI fly',
  TB: 'TUI fly',
  OR: 'TUI fly',
  BY: 'TUI Airways',
  GQ: 'Sky Express',
  G9: 'Air Arabia',
  E5: 'Air Arabia Egypt',
  '3O': 'Air Arabia Maroc',
  NP: 'Nile Air',
  SM: 'Air Cairo',
  // Majors EU
  AF: 'Air France',
  AIRFRANCE: 'Air France',
  A5: 'Air France HOP',
  BA: 'British Airways',
  LH: 'Lufthansa',
  KL: 'KLM',
  IB: 'Iberia',
  I2: 'Iberia Express',
  EI: 'Aer Lingus',
  TP: 'TAP Air Portugal',
  SN: 'Brussels Airlines',
  LX: 'Swiss',
  OS: 'Austrian Airlines',
  AZ: 'ITA Airways',
  EW: 'Eurowings',
  PC: 'Pegasus Airlines',
  DY: 'Norwegian',
  D8: 'Norwegian',
  DI: 'Norwegian',
  SK: 'SAS',
  A3: 'Aegean Airlines',
  OA: 'Olympic Air',
  UX: 'Air Europa',
  BT: 'airBaltic',
  LO: 'LOT Polish Airlines',
  OK: 'Czech Airlines',
  QS: 'Smartwings',
  RO: 'TAROM',
  JU: 'Air Serbia',
  XK: 'Air Corsica',
  SS: 'Corsair',
  BF: 'French bee',
  TX: 'Air Caraïbes',
  DE: 'Condor',
  WK: 'Edelweiss Air',
  EN: 'Air Dolomiti',
  VY2: 'Vueling',
  U2E: 'easyJet',
  // UK / IE regionals
  LM: 'Loganair',
  BE: 'Flybe',
  // CIS / Europe Est
  SU: 'Aeroflot',
  FV: 'Rossiya',
  U6: 'Ural Airlines',
  S7: 'S7 Airlines',
  DP: 'Pobeda',
  N4: 'Nordwind Airlines',
  UT: 'UTair',
  B2: 'Belavia',
  PS: 'Ukraine International',
  TK: 'Turkish Airlines',
  XQ: 'SunExpress',
  VF: 'AJet',
  // Golfe / Moyen-Orient
  EK: 'Emirates',
  EMIRATES: 'Emirates',
  FZ: 'flydubai',
  FLYDUBAI: 'flydubai',
  EY: 'Etihad Airways',
  ETIHAD: 'Etihad Airways',
  QR: 'Qatar Airways',
  QATAR: 'Qatar Airways',
  SV: 'Saudia',
  SAUDIA: 'Saudia',
  XY: 'flynas',
  J9: 'Jazeera Airways',
  GF: 'Gulf Air',
  WY: 'Oman Air',
  OMANAIR: 'Oman Air',
  KU: 'Kuwait Airways',
  MS: 'EgyptAir',
  EGYPTAIR: 'EgyptAir',
  RJ: 'Royal Jordanian',
  ME: 'Middle East Airlines',
  LY: 'El Al',
  IZ: 'Arkia',
  '6H': 'Israir',
  // Afrique
  AT: 'Royal Air Maroc',
  RAM: 'Royal Air Maroc',
  TU: 'Tunisair',
  BJ: 'Nouvelair',
  AH: 'Air Algérie',
  ET: 'Ethiopian Airlines',
  KQ: 'Kenya Airways',
  SA: 'South African Airways',
  // Asie
  SQ: 'Singapore Airlines',
  MH: 'Malaysia Airlines',
  TG: 'Thai Airways',
  FD: 'Thai AirAsia',
  AK: 'AirAsia',
  D7: 'AirAsia X',
  QZ: 'Indonesia AirAsia',
  GA: 'Garuda Indonesia',
  QG: 'Citilink',
  PR: 'Philippine Airlines',
  '5J': 'Cebu Pacific',
  CX: 'Cathay Pacific',
  KA: 'Cathay Dragon',
  BR: 'EVA Air',
  CI: 'China Airlines',
  CA: 'Air China',
  MU: 'China Eastern',
  CZ: 'China Southern',
  HU: 'Hainan Airlines',
  HO: 'Juneyao Air',
  MF: 'XiamenAir',
  NH: 'ANA',
  JL: 'Japan Airlines',
  JJ: 'LATAM',
  KE: 'Korean Air',
  OZ: 'Asiana Airlines',
  LJ: 'Jin Air',
  '7C': 'Jeju Air',
  AI: 'Air India',
  '6E': 'IndiGo',
  UK: 'Vistara',
  SG: 'SpiceJet',
  IX: 'Air India Express',
  // Amériques
  AA: 'American Airlines',
  UA: 'United Airlines',
  DL: 'Delta Air Lines',
  AC: 'Air Canada',
  TS: 'Air Transat',
  WS: 'WestJet',
  B6: 'jetBlue',
  AS: 'Alaska Airlines',
  F9: 'Frontier Airlines',
  NK: 'Spirit Airlines',
  WN: 'Southwest Airlines',
  HA: 'Hawaiian Airlines',
  XP: 'Avelo Airlines',
  MW: 'Mokulele Airlines',
  AV: 'Avianca',
  LA: 'LATAM',
  CM: 'Copa Airlines',
  AM: 'Aeroméxico',
  AR: 'Aerolíneas Argentinas',
  G3: 'GOL',
  AD: 'Azul',
  // Océanie
  QF: 'Qantas',
  JQ: 'Jetstar',
  NZ: 'Air New Zealand',
  VA: 'Virgin Australia',
  // Autres fréquents Travelpayouts
  A9: 'Georgian Airways',
  ZB: 'Air Albania',
  WZ: 'Red Wings',
  Y7: 'NordStar',
  '5N': 'Smartavia',
  R3: 'Yakutia',
  HY: 'Uzbekistan Airways',
  KC: 'Air Astana',
  IQ: 'Qazaq Air',
  J2: 'Azerbaijan Airlines',
  '6E2': 'IndiGo',
}

/** Extract IATA-ish carrier code from a flight number ("FR4821", "FR 4821", "U2 1234"). */
export function airlineCodeFromFlightNumber(
  flightNumber?: string | null,
): string | null {
  const raw = String(flightNumber || '').trim().toUpperCase()
  if (!raw) return null
  const spaced = raw.match(/^([A-Z0-9]{2,3})\s+\d{1,5}\b/)
  if (spaced) return spaced[1]
  const compact = raw.replace(/[^A-Z0-9]/g, '')
  const m = compact.match(/^([A-Z0-9]{2,3})\d{1,5}$/)
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
    // "Emirates Airlines" / "Qatar Airways" already fine
    return text
  }
  // Unknown IATA — still show a readable label, never a bare code alone
  if (key && key.length >= 2 && key.length <= 3) {
    return AIRLINE_NAMES[key] || `Compagnie ${key}`
  }
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
  if (u.includes('emirates')) return 'Emirates'
  if (u.includes('flydubai')) return 'flydubai'
  if (u.includes('etihad')) return 'Etihad Airways'
  if (u.includes('qatarairways') || u.includes('qatar')) return 'Qatar Airways'
  if (u.includes('saudia') || u.includes('saudi')) return 'Saudia'
  if (u.includes('turkish') || u.includes('thy.com')) return 'Turkish Airlines'
  if (u.includes('lufthansa')) return 'Lufthansa'
  if (u.includes('britishairways') || u.includes('ba.com')) return 'British Airways'
  if (u.includes('klm')) return 'KLM'
  if (u.includes('iberia')) return 'Iberia'
  if (u.includes('tap.pt') || u.includes('flytap')) return 'TAP Air Portugal'
  if (u.includes('airarabia')) return 'Air Arabia'
  if (u.includes('omanair')) return 'Oman Air'
  if (u.includes('egyptair')) return 'EgyptAir'
  if (u.includes('royalairmaroc') || u.includes('airmaroc')) return 'Royal Air Maroc'
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
 * Resolve a raw airline / IATA / flight-number token to a display name.
 */
export function airlineDisplayName(raw?: string | null): string | null {
  return nameFromCodeOrRaw(raw)
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
    // Prefer "Compagnie XX" over vague multi if we at least have a code
    return fromAirline || fromOut || fromRet || 'Multi-compagnies'
  }

  return fromAirline || fromOut || fromRet || 'Compagnie'
}
