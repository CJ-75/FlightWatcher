import type { Airport } from './types'
import {
  CITY_IMAGES,
  FALLBACK_CITY_IMAGE,
  FALLBACK_CITY_IMAGES,
} from './cityImages'

export interface CityAirportGroup {
  key: string
  city: string
  country: string
  airports: Airport[]
}

/**
 * Quick-pick hubs for home search forms (FR majors + nearby EU).
 * Only codes present in the loaded catalog are shown as chips.
 */
export const POPULAR_AIRPORT_CODES = [
  'CDG',
  'ORY',
  'BVA',
  'LYS',
  'MRS',
  'NCE',
  'TLS',
  'BOD',
  'NTE',
  'LIL',
  'LHR',
  'LGW',
  'AMS',
  'BRU',
  'CRL',
  'BCN',
  'MAD',
  'FCO',
  'MXP',
  'DUB',
] as const

export type PopularAirportCode = (typeof POPULAR_AIRPORT_CODES)[number]

/** Static seed so pickers open before /api/airports returns (no CITY_FR dep). */
const SEED_AIRPORTS: Airport[] = [
  { code: 'CDG', name: 'Charles de Gaulle', city: 'Paris', country: 'France' },
  { code: 'ORY', name: 'Orly', city: 'Paris', country: 'France' },
  { code: 'BVA', name: 'Beauvais', city: 'Paris', country: 'France' },
  { code: 'LYS', name: 'Lyon', city: 'Lyon', country: 'France' },
  { code: 'MRS', name: 'Marseille', city: 'Marseille', country: 'France' },
  { code: 'NCE', name: 'Nice', city: 'Nice', country: 'France' },
  { code: 'TLS', name: 'Toulouse', city: 'Toulouse', country: 'France' },
  { code: 'BOD', name: 'Bordeaux', city: 'Bordeaux', country: 'France' },
  { code: 'NTE', name: 'Nantes', city: 'Nantes', country: 'France' },
  { code: 'LIL', name: 'Lille', city: 'Lille', country: 'France' },
  { code: 'LHR', name: 'Heathrow', city: 'Londres', country: 'Royaume-Uni' },
  { code: 'LGW', name: 'Gatwick', city: 'Londres', country: 'Royaume-Uni' },
  { code: 'AMS', name: 'Schiphol', city: 'Amsterdam', country: 'Pays-Bas' },
  { code: 'BRU', name: 'Bruxelles', city: 'Bruxelles', country: 'Belgique' },
  { code: 'CRL', name: 'Charleroi', city: 'Bruxelles', country: 'Belgique' },
  { code: 'BCN', name: 'Barcelone', city: 'Barcelone', country: 'Espagne' },
  { code: 'MAD', name: 'Madrid', city: 'Madrid', country: 'Espagne' },
  { code: 'FCO', name: 'Fiumicino', city: 'Rome', country: 'Italie' },
  { code: 'MXP', name: 'Malpensa', city: 'Milan', country: 'Italie' },
  { code: 'DUB', name: 'Dublin', city: 'Dublin', country: 'Irlande' },
]

export function seedPopularAirports(): Airport[] {
  return SEED_AIRPORTS.map((a) => ({ ...a }))
}

/** Resolve popular codes against a loaded airport list (order preserved). */
export function resolvePopularAirports(airports: Airport[]): Airport[] {
  const safe = Array.isArray(airports) ? airports : []
  const byCode = new Map(safe.map((a) => [a.code.toUpperCase(), a]))
  return POPULAR_AIRPORT_CODES.map((code) => byCode.get(code)).filter(
    (a): a is Airport => Boolean(a),
  )
}

/**
 * Popular city groups for instant picker open (deduped, order of POPULAR_AIRPORT_CODES).
 * Full catalog only when the user types.
 */
export function resolvePopularCityGroups(
  groups: CityAirportGroup[],
  airports: Airport[],
): CityAirportGroup[] {
  if (!groups.length) return []
  const byCode = new Map<string, CityAirportGroup>()
  for (const g of groups) {
    for (const a of g.airports) {
      byCode.set(a.code.toUpperCase(), g)
    }
  }
  const seen = new Set<string>()
  const out: CityAirportGroup[] = []
  for (const code of POPULAR_AIRPORT_CODES) {
    const g = byCode.get(code)
    if (!g || seen.has(g.key)) continue
    seen.add(g.key)
    out.push(g)
  }
  // Fallback if catalog misses popular codes
  if (!out.length) return groups.slice(0, 12)
  return out
}

function normalizeCityKey(city: string): string {
  return city
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/** IATA → French city (metro / common Ryanair destinations). */
const CITY_FR_BY_IATA: Record<string, string> = {
  "ACE": "Lanzarote",
  "AGA": "Agadir",
  "AGP": "Malaga",
  "AHO": "Alghero",
  "AJA": "Ajaccio",
  "ALC": "Alicante",
  "AMM": "Amman",
  "AMS": "Amsterdam",
  "AOI": "Ancône",
  "AQJ": "Aqaba",
  "ARN": "Stockholm",
  "ATH": "Athènes",
  "BBU": "Bucarest",
  "BCN": "Barcelone",
  "BDS": "Brindisi",
  "BEG": "Belgrade",
  "BER": "Berlin",
  "BFS": "Belfast",
  "BGO": "Bergen",
  "BGY": "Bergame",
  "BHX": "Birmingham",
  "BIA": "Bastia",
  "BIO": "Bilbao",
  "BIQ": "Biarritz",
  "BLQ": "Bologne",
  "BNX": "Banja Luka",
  "BOD": "Bordeaux",
  "BOJ": "Burgas",
  "BRE": "Brême",
  "BRI": "Bari",
  "BRQ": "Brno",
  "BRS": "Bristol",
  "BRU": "Bruxelles",
  "BSL": "Bâle",
  "BTS": "Bratislava",
  "BUD": "Budapest",
  "BVA": "Paris",
  "BVE": "Brive",
  "BZR": "Béziers",
  "CAG": "Cagliari",
  "CCF": "Carcassonne",
  "CDG": "Paris",
  "CFE": "Clermont-Ferrand",
  "CFU": "Corfou",
  "CGN": "Cologne",
  "CHQ": "La Canée",
  "CIA": "Rome",
  "CLJ": "Cluj-Napoca",
  "CLY": "Calvi",
  "CMF": "Chambéry",
  "CMN": "Casablanca",
  "CPH": "Copenhague",
  "CRL": "Charleroi",
  "CTA": "Catane",
  "DBV": "Dubrovnik",
  "DLE": "Dole",
  "DRS": "Dresde",
  "DTM": "Dortmund",
  "DUB": "Dublin",
  "DUS": "Düsseldorf",
  "ECN": "Ercan",
  "EDI": "Édimbourg",
  "EFL": "Céphalonie",
  "EGC": "Bergerac",
  "EIN": "Eindhoven",
  "ESU": "Essaouira",
  "ETZ": "Metz",
  "FAO": "Faro",
  "FCO": "Rome",
  "FEZ": "Fès",
  "FLR": "Florence",
  "FMM": "Memmingen",
  "FRA": "Francfort",
  "FSC": "Figari",
  "FUE": "Fuerteventura",
  "GDN": "Gdansk",
  "GLA": "Glasgow",
  "GNB": "Grenoble",
  "GOA": "Gênes",
  "GOT": "Göteborg",
  "GRO": "Gérone",
  "GRX": "Grenade",
  "GRZ": "Graz",
  "GVA": "Genève",
  "HAJ": "Hanovre",
  "HAM": "Hambourg",
  "HEL": "Helsinki",
  "HER": "Héraklion",
  "HHN": "Hahn",
  "IAS": "Iasi",
  "IBZ": "Ibiza",
  "INI": "Nis",
  "INN": "Innsbruck",
  "JMK": "Mykonos",
  "JTR": "Santorin",
  "KEF": "Reykjavik",
  "KGS": "Kos",
  "KLX": "Kalamata",
  "KRK": "Cracovie",
  "KTW": "Katowice",
  "KVA": "Kavala",
  "LBA": "Leeds",
  "LCA": "Larnaca",
  "LCJ": "Lodz",
  "LEI": "Almería",
  "LEJ": "Leipzig",
  "LGW": "Londres",
  "LHR": "Londres",
  "LIL": "Lille",
  "LIN": "Milan",
  "LIS": "Lisbonne",
  "LJU": "Ljubljana",
  "LNZ": "Linz",
  "LPA": "Grande Canarie",
  "LPL": "Liverpool",
  "LRH": "La Rochelle",
  "LTN": "Londres",
  "LUX": "Luxembourg",
  "LYS": "Lyon",
  "MAD": "Madrid",
  "MAH": "Minorque",
  "MAN": "Manchester",
  "MLA": "Malte",
  "MLH": "Mulhouse",
  "MMX": "Malmö",
  "MPL": "Montpellier",
  "MRS": "Marseille",
  "MUC": "Munich",
  "MXP": "Milan",
  "NAP": "Naples",
  "NCE": "Nice",
  "NCL": "Newcastle",
  "NDR": "Nador",
  "NRN": "Weeze",
  "NTE": "Nantes",
  "NUE": "Nuremberg",
  "NYO": "Stockholm",
  "OHD": "Ohrid",
  "OPO": "Porto",
  "ORK": "Cork",
  "ORY": "Paris",
  "OSL": "Oslo",
  "OTP": "Bucarest",
  "OUD": "Oujda",
  "OUL": "Oulu",
  "OVD": "Asturies",
  "PFO": "Paphos",
  "PGF": "Perpignan",
  "PIS": "Poitiers",
  "PMI": "Palma",
  "PMO": "Palerme",
  "POZ": "Poznan",
  "PRG": "Prague",
  "PRN": "Pristina",
  "PSA": "Pise",
  "PSR": "Pescara",
  "PUY": "Pula",
  "PVK": "Préveza",
  "RAK": "Marrakech",
  "RBA": "Rabat",
  "RDZ": "Rodez",
  "REU": "Reus",
  "RHO": "Rhodes",
  "RKV": "Reykjavik",
  "RTM": "Rotterdam",
  "RVN": "Rovaniemi",
  "SBZ": "Sibiu",
  "SCN": "Sarrebruck",
  "SCQ": "Saint-Jacques-de-Compostelle",
  "SDR": "Santander",
  "SEN": "Londres",
  "SJJ": "Sarajevo",
  "SKG": "Thessalonique",
  "SKP": "Skopje",
  "SNN": "Shannon",
  "SOF": "Sofia",
  "SPU": "Split",
  "STN": "Londres",
  "STR": "Stuttgart",
  "SUF": "Lamezia",
  "SVG": "Stavanger",
  "SVQ": "Séville",
  "SXB": "Strasbourg",
  "SZG": "Salzbourg",
  "TFN": "Tenerife",
  "TFS": "Tenerife",
  "TGD": "Podgorica",
  "TIA": "Tirana",
  "TIV": "Tivat",
  "TKU": "Turku",
  "TLS": "Toulouse",
  "TMP": "Tampere",
  "TNG": "Tanger",
  "TOS": "Tromsø",
  "TRN": "Turin",
  "TRS": "Trieste",
  "TSF": "Venise",
  "TSR": "Timisoara",
  "TUF": "Tours",
  "VAR": "Varna",
  "VCE": "Venise",
  "VIE": "Vienne",
  "VKO": "Moscou",
  "VLC": "Valence",
  "WAW": "Varsovie",
  "WRO": "Wroclaw",
  "XCR": "Paris",
  "XRY": "Jerez",
  "ZAD": "Zadar",
  "ZAG": "Zagreb",
  // World hubs often missing from the Ryanair-centric map
  "EVN": "Erevan",
  "SVO": "Moscou",
  "DME": "Moscou",
  "LED": "Saint-Pétersbourg",
  "TBS": "Tbilissi",
  "BUS": "Batoumi",
  "GYD": "Bakou",
  "IST": "Istanbul",
  "SAW": "Istanbul",
  "AYT": "Antalya",
  "ESB": "Ankara",
  "ADB": "Izmir",
  "BJV": "Bodrum",
  "DXB": "Dubaï",
  "AUH": "Abou Dabi",
  "DOH": "Doha",
  "BAH": "Manama",
  "RUH": "Riyad",
  "JED": "Djeddah",
  "CAI": "Le Caire",
  "SSH": "Charm el-Cheikh",
  "HRG": "Hurghada",
  "TLV": "Tel Aviv",
  "BEY": "Beyrouth",
  "JFK": "New York",
  "EWR": "New York",
  "LGA": "New York",
  "LAX": "Los Angeles",
  "SFO": "San Francisco",
  "MIA": "Miami",
  "ORD": "Chicago",
  "BOS": "Boston",
  "IAD": "Washington",
  "YUL": "Montréal",
  "YYZ": "Toronto",
  "YVR": "Vancouver",
  "MEX": "Mexico",
  "CUN": "Cancún",
  "HAV": "La Havane",
  "BOG": "Bogota",
  "LIM": "Lima",
  "SCL": "Santiago",
  "EZE": "Buenos Aires",
  "GRU": "São Paulo",
  "GIG": "Rio de Janeiro",
  "BKK": "Bangkok",
  "SIN": "Singapour",
  "HKG": "Hong Kong",
  "NRT": "Tokyo",
  "HND": "Tokyo",
  "ICN": "Séoul",
  "PEK": "Pékin",
  "PVG": "Shanghai",
  "DEL": "Delhi",
  "BOM": "Mumbai",
  "KUL": "Kuala Lumpur",
  "MNL": "Manille",
  "CGK": "Jakarta",
  "SYD": "Sydney",
  "MEL": "Melbourne",
  "AKL": "Auckland",
  "CPT": "Le Cap",
  "JNB": "Johannesbourg",
  "ADD": "Addis-Abeba",
  "NBO": "Nairobi",
  "KBP": "Kiev",
  "IEV": "Kiev",
  "ODS": "Odessa",
  "MSQ": "Minsk",
  "KIV": "Chișinău",
  "ALA": "Almaty",
  "NQZ": "Astana",
  "TAS": "Tachkent",
  "FRU": "Bichkek",
  "ZAZ": "Saragosse",
  "ZRH": "Zurich",
  "ZTH": "Zante",
}

const CITY_EN_TO_FR: Record<string, string> = {
  athens: 'Athènes',
  lisbon: 'Lisbonne',
  london: 'Londres',
  vienna: 'Vienne',
  copenhagen: 'Copenhague',
  warsaw: 'Varsovie',
  krakow: 'Cracovie',
  cracow: 'Cracovie',
  seville: 'Séville',
  sevilla: 'Séville',
  valencia: 'Valence',
  venice: 'Venise',
  florence: 'Florence',
  milan: 'Milan',
  rome: 'Rome',
  munich: 'Munich',
  cologne: 'Cologne',
  hamburg: 'Hambourg',
  brussels: 'Bruxelles',
  geneva: 'Genève',
  zurich: 'Zurich',
  basel: 'Bâle',
  edinburgh: 'Édimbourg',
  barcelona: 'Barcelone',
  malaga: 'Malaga',
  palermo: 'Palerme',
  catania: 'Catane',
  genoa: 'Gênes',
  bologna: 'Bologne',
  pisa: 'Pise',
  bergamo: 'Bergame',
  bucharest: 'Bucarest',
  thessaloniki: 'Thessalonique',
  heraklion: 'Héraklion',
  chania: 'La Canée',
  corfu: 'Corfou',
  kefalonia: 'Céphalonie',
  zakynthos: 'Zante',
  santorini: 'Santorin',
  malta: 'Malte',
  tangier: 'Tanger',
  fez: 'Fès',
  gothenburg: 'Göteborg',
  ancona: 'Ancône',
  bremen: 'Brême',
  dusseldorf: 'Düsseldorf',
  frankfurt: 'Francfort',
  hanover: 'Hanovre',
  hannover: 'Hanovre',
  dresden: 'Dresde',
  menorca: 'Minorque',
  'gran canaria': 'Grande Canarie',
  'las palmas': 'Grande Canarie',
  treviso: 'Venise',
  stansted: 'Londres',
  luton: 'Londres',
  gatwick: 'Londres',
  prague: 'Prague',
  naples: 'Naples',
  moscow: 'Moscou',
  moskva: 'Moscou',
  vnukovo: 'Moscou',
  sheremetyevo: 'Moscou',
  domodedovo: 'Moscou',
  yerevan: 'Erevan',
  erevan: 'Erevan',
  tbilisi: 'Tbilissi',
  baku: 'Bakou',
  istanbul: 'Istanbul',
  dubai: 'Dubaï',
  'new york': 'New York',
  tokyo: 'Tokyo',
  beijing: 'Pékin',
  shanghai: 'Shanghai',
  seoul: 'Séoul',
  bangkok: 'Bangkok',
  singapore: 'Singapour',
  cairo: 'Le Caire',
  marrakech: 'Marrakech',
  casablanca: 'Casablanca',
}

function stripAirportNoise(label: string): string {
  return label
    .replace(
      /\b(international|intl|airport|aéroport|aeroport|airfield|terminal)\b/gi,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikeIataTrigram(value: string): boolean {
  return /^[A-Za-z]{3}$/.test((value || '').trim())
}

/** French display name for a city, preferring IATA then EN→FR / label. */
export function cityDisplayNameFr(
  code?: string | null,
  label?: string | null,
): string {
  const iata = (code || '').trim().toUpperCase()
  if (iata && CITY_FR_BY_IATA[iata]) return CITY_FR_BY_IATA[iata]

  const raw = (label || '').trim()
  if (!raw) {
    // Last resort: never invent a fake city — keep IATA only if nothing else
    return iata || ''
  }

  // destinationFull is often "Airport, Country"
  const beforeComma = stripAirportNoise(raw.split(',')[0]?.trim() || raw)
  const candidates = [
    beforeComma,
    ...beforeComma.split(/[\s\-–—/]+/).filter(Boolean),
  ]
  for (const part of candidates) {
    const key = normalizeCityKey(part)
    if (CITY_EN_TO_FR[key]) return CITY_EN_TO_FR[key]
  }

  // Prefer a human label over a bare IATA trigram
  if (
    beforeComma &&
    !looksLikeIataTrigram(beforeComma) &&
    normalizeCityKey(beforeComma) !== normalizeCityKey(iata)
  ) {
    return beforeComma
  }
  if (iata && CITY_FR_BY_IATA[iata]) return CITY_FR_BY_IATA[iata]
  // Avoid flashing "VKO" / "EVN" as the title when the label was also a trigram
  if (beforeComma && !looksLikeIataTrigram(beforeComma)) return beforeComma
  return beforeComma || iata || ''
}

/** "Paris → Moscou" — never "BVA → VKO". */
export function routeCitiesLabelFr(opts: {
  originCode?: string | null
  originFull?: string | null
  destCode?: string | null
  destFull?: string | null
}): string {
  const from = cityDisplayNameFr(opts.originCode, opts.originFull)
  const to = cityDisplayNameFr(opts.destCode, opts.destFull)
  if (from && to && from !== to) return `${from} → ${to}`
  if (to) return to
  if (from) return from
  return ''
}

/** French airport label by IATA (when distinct from city). */
const AIRPORT_FR_BY_IATA: Record<string, string> = {
  STN: 'Londres-Stansted',
  LTN: 'Londres-Luton',
  LGW: 'Londres-Gatwick',
  LHR: 'Londres-Heathrow',
  SEN: 'Londres-Southend',
  BVA: 'Paris Beauvais',
  CDG: 'Paris Charles de Gaulle',
  ORY: 'Paris Orly',
  BGY: 'Milan-Bergame',
  MXP: 'Milan Malpensa',
  LIN: 'Milan Linate',
  FCO: 'Rome-Fiumicino',
  CIA: 'Rome-Ciampino',
  VCE: 'Venise Marco Polo',
  TSF: 'Venise-Trévise',
  CRL: 'Bruxelles-Charleroi',
  BRU: 'Bruxelles-Zaventem',
  BSL: 'Bâle-Mulhouse',
  ATH: 'Athènes',
  CPH: 'Copenhague',
  VIE: 'Vienne',
  HAM: 'Hambourg',
  WAW: 'Varsovie-Chopin',
  KRK: 'Cracovie',
  OTP: 'Bucarest Otopeni',
  LIS: 'Lisbonne',
  BCN: 'Barcelone El Prat',
  SVQ: 'Séville',
  VLC: 'Valence',
  EDI: 'Édimbourg',
  GOT: 'Göteborg-Landvetter',
  LPA: 'Grande Canarie',
  TFS: 'Ténérife Sud',
  TFN: 'Ténérife Nord',
  CTA: 'Catane',
  HER: 'Héraklion',
  CHQ: 'La Canée',
  JTR: 'Santorin',
  EFL: 'Céphalonie',
  FRA: 'Francfort',
  DUS: 'Düsseldorf',
  CGN: 'Cologne',
  GVA: 'Genève',
  ZRH: 'Zurich',
  MLA: 'Malte',
  FEZ: 'Fès',
  TNG: 'Tanger',
  RAK: 'Marrakech',
  NAP: 'Naples',
  PSA: 'Pise',
  BLQ: 'Bologne',
  PMO: 'Palerme',
  SKG: 'Thessalonique',
  PRG: 'Prague',
  BUD: 'Budapest',
  AMS: 'Amsterdam',
  DUB: 'Dublin',
  MAN: 'Manchester',
  BHX: 'Birmingham',
  BRS: 'Bristol',
  GLA: 'Glasgow',
  BER: 'Berlin',
  MUC: 'Munich',
  NCE: 'Nice',
  MRS: 'Marseille',
  TLS: 'Toulouse',
  NTE: 'Nantes',
  LYS: 'Lyon',
  BOD: 'Bordeaux',
  BIQ: 'Biarritz',
}

/** Airport display name (FR), falling back to destinationFull / city. */
export function airportDisplayNameFr(
  code?: string | null,
  label?: string | null,
): string {
  const iata = (code || '').trim().toUpperCase()
  if (iata && AIRPORT_FR_BY_IATA[iata]) return AIRPORT_FR_BY_IATA[iata]
  const raw = (label || '').trim()
  if (raw) {
    const translated = cityDisplayNameFr(null, raw)
    return translated || raw
  }
  return cityDisplayNameFr(iata, null) || iata
}

/** Card subtitle for arrival — name only, no IATA. */
export function arrivalAirportSubtitle(
  code?: string | null,
  destinationFull?: string | null,
): string {
  const iata = (code || '').trim().toUpperCase()
  const fromFull = (destinationFull || '').split(',')[0]?.trim() || ''
  return airportDisplayNameFr(iata, fromFull) || fromFull || iata
}

function hashCityKey(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i += 1) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0
  }
  return h
}

/** Pick a stable travel photo when the city is not in the curated map. */
function fallbackImageForKey(key: string): string {
  if (!key) return FALLBACK_CITY_IMAGE
  const pool = FALLBACK_CITY_IMAGES
  if (!pool.length) return FALLBACK_CITY_IMAGE
  return pool[hashCityKey(key) % pool.length] || FALLBACK_CITY_IMAGE
}

/**
 * Hero image for a city name (FR/EN) and optional IATA.
 * Uses Wikimedia-curated photos when available; otherwise a stable varied fallback.
 */
export function cityImageUrl(
  city: string | null | undefined,
  iata?: string | null,
): string {
  const code = (iata || '').trim().toUpperCase()
  if (code && CITY_FR_BY_IATA[code]) {
    const fromIata = normalizeCityKey(CITY_FR_BY_IATA[code])
    if (CITY_IMAGES[fromIata]) return CITY_IMAGES[fromIata]
  }

  if (city) {
    const key = normalizeCityKey(city)
    if (CITY_IMAGES[key]) return CITY_IMAGES[key]
    const head = key.split(/[\s,\-–—/]+/)[0]
    if (head && CITY_IMAGES[head]) return CITY_IMAGES[head]
    return fallbackImageForKey(key || head || code)
  }

  if (code) return fallbackImageForKey(code)
  return FALLBACK_CITY_IMAGE
}

/**
 * Resolve a card hero image. Ignores deprecated source.unsplash.com URLs
 * from the API and falls back to curated city photos.
 */
export function resolveTripImageUrl(opts: {
  city?: string | null
  iata?: string | null
  imageUrl?: string | null
}): string {
  const raw = (opts.imageUrl || '').trim()
  if (raw && !/source\.unsplash\.com/i.test(raw) && !/placehold/i.test(raw)) {
    return raw
  }
  return cityImageUrl(opts.city, opts.iata)
}

export function groupAirportsByCity(airports: Airport[]): CityAirportGroup[] {
  const map = new Map<string, CityAirportGroup>()
  for (const a of airports) {
    const city = cityDisplayNameFr(a.code, a.city)
    const country = (a.country || '').trim()
    if (!city) continue
    const key = `${normalizeCityKey(city)}|${normalizeCityKey(country)}`
    const existing = map.get(key)
    if (existing) {
      if (!existing.airports.some((x) => x.code === a.code)) {
        existing.airports.push(a)
      }
    } else {
      map.set(key, { key, city, country, airports: [a] })
    }
  }
  return [...map.values()].sort((a, b) => a.city.localeCompare(b.city, 'fr'))
}

/**
 * Popular cities for a departure's served destinations.
 * Preference list is filtered by what Ryanair actually flies — e.g. Londres
 * appears for MRS (STN) but not for BVA.
 */
export const PREFERRED_CITY_NAMES = [
  'Lisbonne',
  'Barcelone',
  'Rome',
  'Porto',
  'Madrid',
  'Milan',
  'Londres',
  'Dublin',
  'Budapest',
  'Prague',
  'Vienne',
  'Malte',
  'Palerme',
  'Séville',
  'Valence',
  'Naples',
  'Édimbourg',
  'Manchester',
  'Birmingham',
]

export function pickPopularCityGroups(
  groups: CityAirportGroup[],
  limit = 10,
  preferred: string[] = PREFERRED_CITY_NAMES,
): CityAirportGroup[] {
  if (!groups.length) return []
  const byCity = new Map(groups.map((g) => [g.city.toLowerCase(), g]))
  const out: CityAirportGroup[] = []
  const seen = new Set<string>()

  for (const name of preferred) {
    const g = byCity.get(name.toLowerCase())
    if (g && !seen.has(g.key)) {
      out.push(g)
      seen.add(g.key)
    }
    if (out.length >= limit) return out
  }

  for (const g of groups) {
    if (seen.has(g.key)) continue
    out.push(g)
    seen.add(g.key)
    if (out.length >= limit) break
  }
  return out
}

/** Parse stored airport list ("FCO" or "FCO,CIA" / "CDG,ORY,BVA"). */
export function parseArrivalCodes(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(/[,;|]/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{3}$/.test(c))
}

/** Alias — same encoding for departure multi-airport selections. */
export const parseAirportCodes = parseArrivalCodes

export function encodeArrivalCodes(codes: string[]): string | null {
  const unique = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))]
  return unique.length ? unique.join(',') : null
}

/** Alias — encode departure selection as "CDG,ORY,BVA". */
export const encodeAirportCodes = encodeArrivalCodes

/** True if every IATA in value exists in the catalog (or format-ok when catalog empty). */
export function isValidAirportSelection(
  value: string | null | undefined,
  airports: Airport[] = [],
): boolean {
  const codes = parseAirportCodes(value)
  if (!codes.length) return false
  if (!airports.length) return true
  const set = new Set(airports.map((a) => a.code.toUpperCase()))
  return codes.every((c) => set.has(c))
}

/**
 * Short airport name for chips (no IATA) — e.g. Paris + "Paris Orly" → "Orly".
 */
export function airportChipLabelFr(
  code?: string | null,
  city?: string | null,
): string {
  const full = airportDisplayNameFr(code)
  const c = (city || '').trim()
  if (c && full.toLowerCase().startsWith(c.toLowerCase())) {
    const rest = full.slice(c.length).replace(/^[\s\-–—]+/, '').trim()
    if (rest) return rest
  }
  return full || (code || '').trim().toUpperCase()
}

/** End-user label for a multi-airport selection — city first, never raw IATA. */
export function airportSelectionLabel(
  value: string | null | undefined,
  groups: CityAirportGroup[],
): string {
  const codes = parseAirportCodes(value)
  if (!codes.length) return ''
  const group = findCityGroupByCodes(groups, codes)
  if (group) {
    const selected = group.airports.filter((a) => codes.includes(a.code))
    if (selected.length === group.airports.length) {
      return selected.length > 1
        ? `${group.city} · tous les aéroports`
        : group.city
    }
    if (selected.length === 1) {
      return `${group.city} · ${airportChipLabelFr(selected[0].code, group.city)}`
    }
    return `${group.city} · ${selected.length} aéroports`
  }
  if (codes.length === 1) return airportDisplayNameFr(codes[0])
  return `${codes.length} aéroports`
}

export function findCityGroupByCodes(
  groups: CityAirportGroup[],
  codes: string[],
): CityAirportGroup | null {
  if (!codes.length) return null
  const set = new Set(codes.map((c) => c.toUpperCase()))
  for (const g of groups) {
    if (g.airports.some((a) => set.has(a.code))) return g
  }
  return null
}

export function findCityGroupByKey(
  groups: CityAirportGroup[],
  key: string | null | undefined,
): CityAirportGroup | null {
  if (!key) return null
  return groups.find((g) => g.key === key) ?? null
}

export function arrivalDisplayLabel(
  arrivalAirport: string | null | undefined,
  groups: CityAirportGroup[],
): { city: string; codes: string; isAny: boolean } {
  const codes = parseArrivalCodes(arrivalAirport)
  if (!codes.length) return { city: 'Toutes destinations', codes: '', isAny: true }
  const group = findCityGroupByCodes(groups, codes)
  if (group) {
    return {
      city: group.city,
      codes: group.airports.map((a) => a.code).join(' · '),
      isAny: false,
    }
  }
  return { city: codes.join(' · '), codes: codes.join(' · '), isAny: false }
}
