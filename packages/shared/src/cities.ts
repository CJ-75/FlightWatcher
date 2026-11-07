import type { Airport } from './types'
import { bundledAirports } from './airportsBundle'
import {
  CITY_IMAGES,
  FALLBACK_CITY_IMAGE,
  FALLBACK_CITY_IMAGES,
} from './cityImages'
import {
  countryIsoFromIata,
  countryToFlagIso,
  parseCountryFromFull,
} from './countries'

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

/** Image-map key: same as normalizeCityKey, with spaces → hyphens (New York → new-york). */
function cityImageKey(city: string): string {
  return normalizeCityKey(city).replace(/[\s_/]+/g, '-')
}

/** IATA → French city (metro / common Ryanair destinations). */
const CITY_FR_BY_IATA: Record<string, string> = {
  "AAE": "Annaba",
  "ACE": "Lanzarote",
  "ADD": "Addis-Abeba",
  "AER": "Sotchi",
  "AGA": "Agadir",
  "AGP": "Malaga",
  "AHO": "Alghero",
  "AJA": "Ajaccio",
  "AKL": "Auckland",
  "ALA": "Almaty",
  "ALC": "Alicante",
  "ALG": "Alger",
  "AMM": "Amman",
  "AMS": "Amsterdam",
  "AOI": "Ancône",
  "AQJ": "Aqaba",
  "ARN": "Stockholm",
  "ASF": "Astrakhan",
  "ATH": "Athènes",
  "ATL": "Atlanta",
  "AUH": "Abou Dabi",
  "AYT": "Antalya",
  "BAH": "Manama",
  "BBU": "Bucarest",
  "BCN": "Barcelone",
  "BDS": "Brindisi",
  "BEG": "Belgrade",
  "BER": "Berlin",
  "BEY": "Beyrouth",
  "BFS": "Belfast",
  "BGO": "Bergen",
  "BGY": "Bergame",
  "BHX": "Birmingham",
  "BIA": "Bastia",
  "BIO": "Bilbao",
  "BIQ": "Biarritz",
  "BKK": "Bangkok",
  "BLQ": "Bologne",
  "BLR": "Bangalore",
  "BNE": "Brisbane",
  "BNX": "Banja Luka",
  "BOD": "Bordeaux",
  "BOJ": "Burgas",
  "BOM": "Mumbai",
  "BOS": "Boston",
  "BRE": "Brême",
  "BRI": "Bari",
  "BRQ": "Brno",
  "BRS": "Bristol",
  "BRU": "Bruxelles",
  "BSL": "Bâle",
  "BTS": "Bratislava",
  "BUD": "Budapest",
  "BUS": "Batoumi",
  "BVA": "Paris",
  "BVE": "Brive",
  "BZR": "Béziers",
  "CAG": "Cagliari",
  "CAI": "Le Caire",
  "CAN": "Canton",
  "CCF": "Carcassonne",
  "CDG": "Paris",
  "CFE": "Clermont-Ferrand",
  "CFU": "Corfou",
  "CGK": "Jakarta",
  "CGN": "Cologne",
  "CHQ": "La Canée",
  "CIA": "Rome",
  "CLJ": "Cluj-Napoca",
  "CLY": "Calvi",
  "CMF": "Chambéry",
  "CMB": "Colombo",
  "CMN": "Casablanca",
  "CNX": "Chiang Mai",
  "CPH": "Copenhague",
  "CPT": "Le Cap",
  "CRL": "Charleroi",
  "CTA": "Catane",
  "DBV": "Dubrovnik",
  "DCA": "Washington",
  "DEL": "Delhi",
  "DFW": "Dallas",
  "DJE": "Djerba",
  "DLE": "Dole",
  "DME": "Moscou",
  "DMK": "Bangkok",
  "DOH": "Doha",
  "DPS": "Denpasar",
  "DRS": "Dresde",
  "DTM": "Dortmund",
  "DUB": "Dublin",
  "DUR": "Durban",
  "DUS": "Düsseldorf",
  "DWC": "Dubaï",
  "DXB": "Dubaï",
  "ECN": "Ercan",
  "EDI": "Édimbourg",
  "EFL": "Céphalonie",
  "EGC": "Bergerac",
  "EIN": "Eindhoven",
  "ESU": "Essaouira",
  "ETZ": "Metz",
  "EVN": "Erevan",
  "EWR": "New York",
  "FAO": "Faro",
  "FCO": "Rome",
  "FEZ": "Fès",
  "FLR": "Florence",
  "FMM": "Memmingen",
  "FNC": "Funchal",
  "FRA": "Francfort",
  "FRU": "Bichkek",
  "FSC": "Figari",
  "FUE": "Fuerteventura",
  "GDN": "Gdansk",
  "GLA": "Glasgow",
  "GMP": "Séoul",
  "GNB": "Grenoble",
  "GOA": "Gênes",
  "GOI": "Goa",
  "GOT": "Göteborg",
  "GRO": "Gérone",
  "GRX": "Grenade",
  "GRZ": "Graz",
  "GVA": "Genève",
  "GYD": "Bakou",
  "HAJ": "Hanovre",
  "HAM": "Hambourg",
  "HEL": "Helsinki",
  "HER": "Héraklion",
  "HHN": "Hahn",
  "HKG": "Hong Kong",
  "HKT": "Phuket",
  "HND": "Tokyo",
  "HRG": "Hurghada",
  "HYD": "Hyderabad",
  "IAD": "Washington",
  "IAS": "Iasi",
  "IBZ": "Ibiza",
  "ICN": "Séoul",
  "IEV": "Kiev",
  "INI": "Nis",
  "INN": "Innsbruck",
  "IST": "Istanbul",
  "ITM": "Osaka",
  "JED": "Djeddah",
  "JFK": "New York",
  "JMK": "Mykonos",
  "JNB": "Johannesbourg",
  "JTR": "Santorin",
  "KBP": "Kiev",
  "KEF": "Reykjavik",
  "KGS": "Kos",
  "KIX": "Osaka",
  "KLX": "Kalamata",
  "KRK": "Cracovie",
  "KRR": "Krasnodar",
  "KTW": "Katowice",
  "KUL": "Kuala Lumpur",
  "KVA": "Kavala",
  "KWI": "Koweït",
  "KZN": "Kazan",
  "MLE": "Malé",
  "LAX": "Los Angeles",
  "LBA": "Leeds",
  "LCA": "Larnaca",
  "LCJ": "Lodz",
  "LED": "Saint-Pétersbourg",
  "PUL": "Saint-Pétersbourg",
  "LEI": "Almería",
  "LEJ": "Leipzig",
  "LGA": "New York",
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
  "LWO": "Lviv",
  "LXR": "Louxor",
  "LYS": "Lyon",
  "MAA": "Chennai",
  "MAD": "Madrid",
  "MAH": "Minorque",
  "MAN": "Manchester",
  "MCT": "Mascate",
  "MED": "Médine",
  "MEL": "Melbourne",
  "MIA": "Miami",
  "MIR": "Monastir",
  "MLA": "Malte",
  "MLH": "Mulhouse",
  "MMX": "Malmö",
  "MNL": "Manille",
  "MPL": "Montpellier",
  "MRS": "Marseille",
  "MRV": "Mineralnye Vody",
  "MSQ": "Minsk",
  "MUC": "Munich",
  "MXP": "Milan",
  "NAP": "Naples",
  "NBO": "Nairobi",
  "NCE": "Nice",
  "NCL": "Newcastle",
  "NDR": "Nador",
  "NQZ": "Astana",
  "NRN": "Weeze",
  "NRT": "Tokyo",
  "NTE": "Nantes",
  "NUE": "Nuremberg",
  "NYO": "Stockholm",
  "ODS": "Odessa",
  "OHD": "Ohrid",
  "OPO": "Porto",
  "ORD": "Chicago",
  "ORK": "Cork",
  "ORN": "Oran",
  "ORY": "Paris",
  "OSL": "Oslo",
  "OTP": "Bucarest",
  "OUD": "Oujda",
  "OUL": "Oulu",
  "OVB": "Novossibirsk",
  "OVD": "Asturies",
  "PDL": "Ponta Delgada",
  "PEK": "Pékin",
  "PER": "Perth",
  "PFO": "Paphos",
  "PGF": "Perpignan",
  "PIS": "Poitiers",
  "PKX": "Pékin",
  "PMI": "Palma",
  "PMO": "Palerme",
  "POZ": "Poznan",
  "PRG": "Prague",
  "PRN": "Pristina",
  "PSA": "Pise",
  "PSR": "Pescara",
  "PUY": "Pula",
  "PVG": "Shanghai",
  "PVK": "Préveza",
  "RAI": "Praia",
  "RAK": "Marrakech",
  "RBA": "Rabat",
  "RDZ": "Rodez",
  "REK": "Reykjavik",
  "REU": "Reus",
  "RHO": "Rhodes",
  "RKV": "Reykjavik",
  "ROV": "Rostov-sur-le-Don",
  "RTM": "Rotterdam",
  "RUH": "Riyad",
  "RVN": "Rovaniemi",
  "SAW": "Istanbul",
  "SBZ": "Sibiu",
  "SCN": "Sarrebruck",
  "SCQ": "Saint-Jacques-de-Compostelle",
  "SDR": "Santander",
  "SEA": "Seattle",
  "SEN": "Londres",
  "SFO": "San Francisco",
  "SHA": "Shanghai",
  "SHJ": "Charjah",
  "SID": "Sal",
  "SIN": "Singapour",
  "SJJ": "Sarajevo",
  "SKG": "Thessalonique",
  "SKP": "Skopje",
  "SLL": "Salalah",
  "SNN": "Shannon",
  "SOF": "Sofia",
  "SPU": "Split",
  "SSH": "Charm el-Cheikh",
  "STN": "Londres",
  "STR": "Stuttgart",
  "SUF": "Lamezia",
  "SVG": "Stavanger",
  "SVO": "Moscou",
  "SVQ": "Séville",
  "SVX": "Iekaterinbourg",
  "SXB": "Strasbourg",
  "SYD": "Sydney",
  "SZG": "Salzbourg",
  "TAS": "Tachkent",
  "TBS": "Tbilissi",
  "TFN": "Tenerife",
  "TFS": "Tenerife",
  "TGD": "Podgorica",
  "TIA": "Tirana",
  "TIV": "Tivat",
  "TKU": "Turku",
  "TLS": "Toulouse",
  "TLV": "Tel Aviv",
  "TMP": "Tampere",
  "TNG": "Tanger",
  "TOS": "Tromsø",
  "TPE": "Taipei",
  "TRN": "Turin",
  "TRS": "Trieste",
  "TSF": "Venise",
  "TSR": "Timisoara",
  "TUF": "Tours",
  "TUN": "Tunis",
  "UFA": "Oufa",
  "VAR": "Varna",
  "VCE": "Venise",
  "VIE": "Vienne",
  "VKO": "Moscou",
  "VLC": "Valence",
  "WAW": "Varsovie",
  "WRO": "Wroclaw",
  "XCR": "Paris",
  "XRY": "Jerez",
  "YUL": "Montréal",
  "YVR": "Vancouver",
  "YYZ": "Toronto",
  "ZAD": "Zadar",
  "ZAG": "Zagreb",
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
  'saint petersburg': 'Saint-Pétersbourg',
  'saint-petersburg': 'Saint-Pétersbourg',
  'st petersburg': 'Saint-Pétersbourg',
  'st. petersburg': 'Saint-Pétersbourg',
  petersburg: 'Saint-Pétersbourg',
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
      /\b(international|intl|airport|aéroport|aeroport|a[ée]rodrome|aerodrome|airfield|heliport|seaplane|hydravion|terminal)\b/gi,
      ' ',
    )
    .replace(/^(de|du|des|d'|of|the)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when the string is only a 3-letter IATA-like code. */
export function looksLikeIataTrigram(value: string): boolean {
  return /^[A-Za-z]{3}$/.test((value || '').trim())
}

/** Small fields / aerodromes — exclude from Search departure & destination pickers. */
export function isAerodromeAirport(airport: {
  name?: string | null
  city?: string | null
}): boolean {
  const blob = `${airport.name || ''} ${airport.city || ''}`
  return /\b(a[ée]rodrome|aerodrome|airfield|heliport|ulm|seaplane|hydravion)\b/i.test(
    blob,
  )
}

/** Keep commercial / passenger airports for Search city pickers. */
export function filterSearchAirports<T extends { name?: string | null; city?: string | null; code?: string | null }>(
  airports: T[],
): T[] {
  return (airports || []).filter((a) => {
    if (!a?.code || String(a.code).trim().length !== 3) return false
    if (isAerodromeAirport(a)) return false
    return true
  })
}

/** Best-effort ISO flag for an activity / favoris destination label ("Lisbonne", "Rome, Italie"). */
export function countryIsoForCityLabel(label?: string | null): string | null {
  if (!label) return null
  const trimmed = String(label).trim()
  if (!trimmed) return null
  const fromFull = countryToFlagIso(parseCountryFromFull(trimmed))
  if (fromFull) return fromFull
  const cityPart = trimmed.split(',')[0]?.trim() || trimmed
  const key = normalizeCityKey(cityPart)
  if (!key) return null
  for (const [iata, frCity] of Object.entries(CITY_FR_BY_IATA)) {
    if (normalizeCityKey(frCity) === key) {
      const iso = countryIsoFromIata(iata)
      if (iso) return iso
    }
  }
  for (const a of SEED_AIRPORTS) {
    if (
      normalizeCityKey(a.city) === key ||
      normalizeCityKey(cityDisplayNameFr(a.code, a.city)) === key
    ) {
      return countryToFlagIso(a.country) || countryIsoFromIata(a.code)
    }
  }
  return countryToFlagIso(cityPart)
}

/** Lazy IATA → city from shipped airports.bundle (fills gaps beyond CITY_FR_BY_IATA). */
let _bundleCityByIata: Map<string, string> | null = null

function cityFromAirportBundle(iata: string): string | null {
  if (!iata) return null
  if (!_bundleCityByIata) {
    _bundleCityByIata = new Map()
    for (const a of bundledAirports()) {
      const code = String(a.code || '')
        .trim()
        .toUpperCase()
      const city = String(a.city || '').trim()
      if (
        code.length === 3 &&
        city &&
        !looksLikeIataTrigram(city) &&
        !_bundleCityByIata.has(code)
      ) {
        _bundleCityByIata.set(code, city)
      }
    }
  }
  return _bundleCityByIata.get(iata) || null
}

/** French display name for a city, preferring IATA then EN→FR / label. */
export function cityDisplayNameFr(
  code?: string | null,
  label?: string | null,
): string {
  // Prefer first IATA when search criteria leaked a multi-airport string.
  const parsed = parseArrivalCodes(code)
  const iata = (parsed[0] || (code || '').trim().toUpperCase())
  if (iata && CITY_FR_BY_IATA[iata]) return CITY_FR_BY_IATA[iata]
  const fromBundle = iata ? cityFromAirportBundle(iata) : null
  if (fromBundle) return fromBundle

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
  if (fromBundle) return fromBundle
  // Avoid flashing "VKO" / "EVN" as the title when the label was also a trigram
  if (beforeComma && !looksLikeIataTrigram(beforeComma)) return beforeComma
  return beforeComma || iata || ''
}

/** City label for a Destination row — never prefer bare IATA over a real name. */
export function destinationDisplayNameFr(dest: {
  code?: string | null
  nom?: string | null
  destinationFull?: string | null
}): string {
  const code = String(dest.code || '').trim().toUpperCase()
  const label = dest.destinationFull || dest.nom || ''
  const city = cityDisplayNameFr(code, label)
  if (city && !looksLikeIataTrigram(city)) return city
  const fromNom = cityDisplayNameFr(code, dest.nom)
  if (fromNom && !looksLikeIataTrigram(fromNom)) return fromNom
  return city || fromNom || code
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
  RAI: 'Praia',
  ALG: 'Alger',
  FNC: 'Funchal',
  CMN: 'Casablanca',
  CAI: 'Le Caire',
  DXB: 'Dubaï',
  AUH: 'Abou Dabi',
  BKK: 'Bangkok',
  JFK: 'New York',
  YUL: 'Montréal',
  NRT: 'Tokyo',
  OSL: 'Oslo',
  HEL: 'Helsinki',
  IBZ: 'Ibiza',
  BER: 'Berlin',
  AMS: 'Amsterdam',
  GLA: 'Glasgow',
  NAP: 'Naples',
  PSA: 'Pise',
  BLQ: 'Bologne',
  PMO: 'Palerme',
  SKG: 'Thessalonique',
  PRG: 'Prague',
  BUD: 'Budapest',
  DUB: 'Dublin',
  MAN: 'Manchester',
  BHX: 'Birmingham',
  BRS: 'Bristol',
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

/** Hero backgrounds need >330px; Wikimedia REST thumbs are tiny by default. */
const CITY_HERO_WIDTH = 1280

export function upscaleCityHeroUrl(url: string, width = CITY_HERO_WIDTH): string {
  const raw = (url || '').trim()
  if (!raw) return raw
  if (/thumb\.wikimedia\.org|upload\.wikimedia\.org/i.test(raw)) {
    // Handles `/330px-` and `/langfr-330px-` variants.
    return raw.replace(/(\d+)px-/i, `${width}px-`)
  }
  if (/images\.unsplash\.com/i.test(raw)) {
    try {
      const u = new URL(raw)
      u.searchParams.set('w', String(Math.max(width, 1200)))
      u.searchParams.set('q', u.searchParams.get('q') || '80')
      u.searchParams.set('auto', u.searchParams.get('auto') || 'format')
      u.searchParams.set('fit', u.searchParams.get('fit') || 'crop')
      return u.toString()
    } catch {
      return raw
    }
  }
  return raw
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
    const fromIata = cityImageKey(CITY_FR_BY_IATA[code])
    if (CITY_IMAGES[fromIata]) return upscaleCityHeroUrl(CITY_IMAGES[fromIata])
  }

  if (city) {
    const key = cityImageKey(city)
    if (CITY_IMAGES[key]) return upscaleCityHeroUrl(CITY_IMAGES[key])
    const head = key.split(/[\s,\-–—/]+/)[0]
    if (head && CITY_IMAGES[head]) return upscaleCityHeroUrl(CITY_IMAGES[head])
    return upscaleCityHeroUrl(fallbackImageForKey(key || head || code))
  }

  if (code) return upscaleCityHeroUrl(fallbackImageForKey(code))
  return upscaleCityHeroUrl(FALLBACK_CITY_IMAGE)
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
    return upscaleCityHeroUrl(raw)
  }
  return cityImageUrl(opts.city, opts.iata)
}

export function groupAirportsByCity(airports: Airport[]): CityAirportGroup[] {
  const map = new Map<string, CityAirportGroup>()
  for (const a of filterSearchAirports(airports)) {
    const city = cityDisplayNameFr(a.code, a.city || a.name)
    const country = (a.country || '').trim()
    // Skip unresolved labels that would show as "CDG" / "VKO" in the picker.
    if (!city || looksLikeIataTrigram(city)) continue
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
  'Amsterdam',
  'Athènes',
  'Berlin',
  'Vienne',
  'Venise',
  'Dublin',
  'Budapest',
  'Prague',
  'Malte',
  'Palerme',
  'Séville',
  'Valence',
  'Naples',
  'Édimbourg',
  'Glasgow',
  'Oslo',
  'Helsinki',
  'Ibiza',
  'Héraklion',
  'Funchal',
  'Marrakech',
  'Agadir',
  'Casablanca',
  'Alger',
  'Le Caire',
  'Dubaï',
  'Abou Dabi',
  'Praia',
  'Bangkok',
  'New York',
  'Montréal',
  'Tokyo',
  'Manchester',
  'Birmingham',
]

export function pickPopularCityGroups(
  groups: CityAirportGroup[],
  limit = 10,
  preferred: string[] = PREFERRED_CITY_NAMES,
): CityAirportGroup[] {
  if (!groups.length) return []
  // Accent-insensitive keys so « Dubaï » matches airport city « Dubai »
  const byCity = new Map(groups.map((g) => [normalizeCityKey(g.city), g]))
  const out: CityAirportGroup[] = []
  const seen = new Set<string>()

  for (const name of preferred) {
    const g = byCity.get(normalizeCityKey(name))
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

/**
 * One IATA for a real flight leg / boarding pass.
 * Multi-airport selections (CDG,ORY,BVA) are search criteria — never a ticket.
 */
export function primaryAirportCode(value?: string | null): string {
  const codes = parseAirportCodes(value)
  if (codes[0]) return codes[0]
  const raw = (value || '').trim().toUpperCase()
  return /^[A-Z]{3}$/.test(raw) ? raw : ''
}

type FlightLegLike = {
  origin?: string | null
  destination?: string | null
  originFull?: string | null
  destinationFull?: string | null
  [key: string]: unknown
}

type TripAirportsLike = {
  aller?: FlightLegLike | null
  retour?: FlightLegLike | null
  destination_code?: string | null
  [key: string]: unknown
}

/**
 * Boarding-pass safe trip: exactly one origin IATA + one destination IATA.
 * Does not mutate the input.
 */
export function sanitizeTripAirports<T extends TripAirportsLike>(trip: T): T {
  const allerIn = trip.aller || {}
  const retourIn = trip.retour || {}
  const origin = primaryAirportCode(allerIn.origin as string | null | undefined)
  const destination = primaryAirportCode(
    (allerIn.destination as string | null | undefined) ||
      (trip.destination_code as string | null | undefined),
  )
  const aller = {
    ...allerIn,
    origin: origin || String(allerIn.origin || ''),
    destination: destination || String(allerIn.destination || ''),
  }
  const retour = {
    ...retourIn,
    origin: destination || primaryAirportCode(retourIn.origin as string | null | undefined) || String(retourIn.origin || ''),
    destination: origin || primaryAirportCode(retourIn.destination as string | null | undefined) || String(retourIn.destination || ''),
  }
  return {
    ...trip,
    aller,
    retour,
    destination_code: destination || String(trip.destination_code || ''),
  }
}

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
