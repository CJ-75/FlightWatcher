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

/** Resolve popular codes against a loaded airport list (order preserved). */
export function resolvePopularAirports(airports: Airport[]): Airport[] {
  const safe = Array.isArray(airports) ? airports : []
  const byCode = new Map(safe.map((a) => [a.code.toUpperCase(), a]))
  return POPULAR_AIRPORT_CODES.map((code) => byCode.get(code)).filter(
    (a): a is Airport => Boolean(a),
  )
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
