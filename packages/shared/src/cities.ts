import type { Airport } from './types'

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

/** Resolve popular codes against a loaded airport list (order preserved). */
export function resolvePopularAirports(airports: Airport[]): Airport[] {
  const safe = Array.isArray(airports) ? airports : []
  const byCode = new Map(safe.map((a) => [a.code.toUpperCase(), a]))
  return POPULAR_AIRPORT_CODES.map((code) => byCode.get(code)).filter(
    (a): a is Airport => Boolean(a),
  )
}

const FALLBACK_CITY_IMAGE =
  'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=900&q=80&auto=format&fit=crop'

/** Curated Unsplash photos for popular Ryanair cities (stable URLs). */
const CITY_IMAGES: Record<string, string> = {
  lisbonne: 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=900&q=80&auto=format&fit=crop',
  lisbon: 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=900&q=80&auto=format&fit=crop',
  barcelone: 'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=900&q=80&auto=format&fit=crop',
  barcelona: 'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=900&q=80&auto=format&fit=crop',
  rome: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=900&q=80&auto=format&fit=crop',
  roma: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=900&q=80&auto=format&fit=crop',
  porto: 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=900&q=80&auto=format&fit=crop',
  budapest: 'https://images.unsplash.com/photo-1541343672885-9be56236302a?w=900&q=80&auto=format&fit=crop',
  cracovie: 'https://images.unsplash.com/photo-1517824806704-9040b037703b?w=900&q=80&auto=format&fit=crop',
  krakow: 'https://images.unsplash.com/photo-1517824806704-9040b037703b?w=900&q=80&auto=format&fit=crop',
  cracow: 'https://images.unsplash.com/photo-1517824806704-9040b037703b?w=900&q=80&auto=format&fit=crop',
  prague: 'https://images.unsplash.com/photo-1549918864-48ac979795d9?w=900&q=80&auto=format&fit=crop',
  praha: 'https://images.unsplash.com/photo-1549918864-48ac979795d9?w=900&q=80&auto=format&fit=crop',
  vienne: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=900&q=80&auto=format&fit=crop',
  vienna: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=900&q=80&auto=format&fit=crop',
  paris: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=900&q=80&auto=format&fit=crop',
  londres: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=900&q=80&auto=format&fit=crop',
  london: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=900&q=80&auto=format&fit=crop',
  milan: 'https://images.unsplash.com/photo-1513581166391-887a96ddeafd?w=900&q=80&auto=format&fit=crop',
  milano: 'https://images.unsplash.com/photo-1513581166391-887a96ddeafd?w=900&q=80&auto=format&fit=crop',
  madrid: 'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=900&q=80&auto=format&fit=crop',
  berlin: 'https://images.unsplash.com/photo-1560969184-10fe8719e047?w=900&q=80&auto=format&fit=crop',
  amsterdam: 'https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=900&q=80&auto=format&fit=crop',
  dubrovnik: 'https://images.unsplash.com/photo-1555990793-da11153b2473?w=900&q=80&auto=format&fit=crop',
  nicola: 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=900&q=80&auto=format&fit=crop',
  nice: 'https://images.unsplash.com/photo-1491167109373-3ebfe792f4e0?w=900&q=80&auto=format&fit=crop',
  marseille: 'https://images.unsplash.com/photo-1585834340592-c27c83957488?w=900&q=80&auto=format&fit=crop',
  seville: 'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=900&q=80&auto=format&fit=crop',
  sevilla: 'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=900&q=80&auto=format&fit=crop',
  valence: 'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=900&q=80&auto=format&fit=crop',
  valencia: 'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=900&q=80&auto=format&fit=crop',
  athènes: 'https://images.unsplash.com/photo-1555990538-17392572c5f0?w=900&q=80&auto=format&fit=crop',
  athens: 'https://images.unsplash.com/photo-1555990538-17392572c5f0?w=900&q=80&auto=format&fit=crop',
  dublin: 'https://images.unsplash.com/photo-1549918864-48ac979795d9?w=900&q=80&auto=format&fit=crop',
  edinbourg: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=900&q=80&auto=format&fit=crop',
  edinburgh: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=900&q=80&auto=format&fit=crop',
  catania: 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=900&q=80&auto=format&fit=crop',
  birmingham: 'https://images.unsplash.com/photo-1520986606214-8b456906c813?w=900&q=80&auto=format&fit=crop',
  palerme: 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=900&q=80&auto=format&fit=crop',
  palermo: 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=900&q=80&auto=format&fit=crop',
  malaga: 'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=900&q=80&auto=format&fit=crop',
  faro: 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=900&q=80&auto=format&fit=crop',
  naples: 'https://images.unsplash.com/photo-1534308143481-c55f00be8bd7?w=900&q=80&auto=format&fit=crop',
  napoli: 'https://images.unsplash.com/photo-1534308143481-c55f00be8bd7?w=900&q=80&auto=format&fit=crop',
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
  STN: 'Londres',
  LTN: 'Londres',
  LGW: 'Londres',
  LHR: 'Londres',
  SEN: 'Londres',
  BVA: 'Paris',
  CDG: 'Paris',
  ORY: 'Paris',
  XCR: 'Paris',
  LIS: 'Lisbonne',
  OPO: 'Porto',
  FAO: 'Faro',
  BCN: 'Barcelone',
  MAD: 'Madrid',
  SVQ: 'Séville',
  VLC: 'Valence',
  ALC: 'Alicante',
  AGP: 'Malaga',
  PMI: 'Palma',
  IBZ: 'Ibiza',
  ACE: 'Lanzarote',
  FUE: 'Fuerteventura',
  TFS: 'Tenerife',
  TFN: 'Tenerife',
  LPA: 'Grande Canarie',
  MAH: 'Minorque',
  FCO: 'Rome',
  CIA: 'Rome',
  BGY: 'Bergame',
  MXP: 'Milan',
  LIN: 'Milan',
  VCE: 'Venise',
  TSF: 'Venise',
  NAP: 'Naples',
  PSA: 'Pise',
  FLR: 'Florence',
  BLQ: 'Bologne',
  TRN: 'Turin',
  GOA: 'Gênes',
  PMO: 'Palerme',
  CTA: 'Catane',
  CAG: 'Cagliari',
  AHO: 'Alghero',
  BRI: 'Bari',
  BDS: 'Brindisi',
  AOI: 'Ancône',
  ATH: 'Athènes',
  SKG: 'Thessalonique',
  HER: 'Héraklion',
  CHQ: 'La Canée',
  RHO: 'Rhodes',
  KGS: 'Kos',
  JMK: 'Mykonos',
  JTR: 'Santorin',
  CFU: 'Corfou',
  ZTH: 'Zante',
  EFL: 'Céphalonie',
  PRG: 'Prague',
  WAW: 'Varsovie',
  KRK: 'Cracovie',
  GDN: 'Gdansk',
  WRO: 'Wroclaw',
  BUD: 'Budapest',
  OTP: 'Bucarest',
  BBU: 'Bucarest',
  SOF: 'Sofia',
  VIE: 'Vienne',
  SZG: 'Salzbourg',
  ZRH: 'Zurich',
  GVA: 'Genève',
  BSL: 'Bâle',
  BRU: 'Bruxelles',
  CRL: 'Charleroi',
  AMS: 'Amsterdam',
  CPH: 'Copenhague',
  ARN: 'Stockholm',
  GOT: 'Göteborg',
  OSL: 'Oslo',
  HEL: 'Helsinki',
  BER: 'Berlin',
  MUC: 'Munich',
  HAM: 'Hambourg',
  CGN: 'Cologne',
  DUS: 'Düsseldorf',
  FRA: 'Francfort',
  HAJ: 'Hanovre',
  DRS: 'Dresde',
  BRE: 'Brême',
  EDI: 'Édimbourg',
  GLA: 'Glasgow',
  MAN: 'Manchester',
  BHX: 'Birmingham',
  BRS: 'Bristol',
  DUB: 'Dublin',
  ORK: 'Cork',
  BFS: 'Belfast',
  RAK: 'Marrakech',
  CMN: 'Casablanca',
  TNG: 'Tanger',
  FEZ: 'Fès',
  AGA: 'Agadir',
  MLA: 'Malte',
  KEF: 'Reykjavik',
  TIA: 'Tirana',
  BEG: 'Belgrade',
  ZAG: 'Zagreb',
  SPU: 'Split',
  DBV: 'Dubrovnik',
  LJU: 'Ljubljana',
  BTS: 'Bratislava',
  NCE: 'Nice',
  MRS: 'Marseille',
  TLS: 'Toulouse',
  NTE: 'Nantes',
  LYS: 'Lyon',
  BOD: 'Bordeaux',
  BIQ: 'Biarritz',
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
}

/** French display name for a city, preferring IATA then EN→FR map. */
export function cityDisplayNameFr(
  code?: string | null,
  label?: string | null,
): string {
  const iata = (code || '').trim().toUpperCase()
  if (iata && CITY_FR_BY_IATA[iata]) return CITY_FR_BY_IATA[iata]
  const raw = (label || '').trim()
  if (!raw) return iata || ''
  const key = normalizeCityKey(raw)
  if (CITY_EN_TO_FR[key]) return CITY_EN_TO_FR[key]
  const head = key.split(/[\s,\-–—]+/)[0]
  if (head && CITY_EN_TO_FR[head]) return CITY_EN_TO_FR[head]
  return raw
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

/** Card subtitle: "Aéroport · XXX" for arrival. */
export function arrivalAirportSubtitle(
  code?: string | null,
  destinationFull?: string | null,
): string {
  const iata = (code || '').trim().toUpperCase()
  const fromFull = (destinationFull || '').split(',')[0]?.trim() || ''
  const airport = airportDisplayNameFr(iata, fromFull)
  if (!iata) return airport
  if (!airport || normalizeCityKey(airport) === normalizeCityKey(iata)) return iata
  return `${airport} · ${iata}`
}

export function cityImageUrl(city: string | null | undefined): string {
  if (!city) return FALLBACK_CITY_IMAGE
  const key = normalizeCityKey(city)
  return CITY_IMAGES[key] || FALLBACK_CITY_IMAGE
}

/**
 * Resolve a card hero image. Ignores deprecated source.unsplash.com URLs
 * from the API and falls back to curated city photos.
 */
export function resolveTripImageUrl(opts: {
  city?: string | null
  imageUrl?: string | null
}): string {
  const raw = (opts.imageUrl || '').trim()
  if (raw && !/source\.unsplash\.com/i.test(raw)) {
    return raw
  }
  return cityImageUrl(opts.city)
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

/** Parse stored arrival_airport ("FCO" or "FCO,CIA"). */
export function parseArrivalCodes(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(/[,;|]/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{3}$/.test(c))
}

export function encodeArrivalCodes(codes: string[]): string | null {
  const unique = [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))]
  return unique.length ? unique.join(',') : null
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
