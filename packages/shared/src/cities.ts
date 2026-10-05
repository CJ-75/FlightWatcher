import type { Airport } from './types'

export interface CityAirportGroup {
  key: string
  city: string
  country: string
  airports: Airport[]
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
}

function normalizeCityKey(city: string): string {
  return city
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function cityImageUrl(city: string | null | undefined): string {
  if (!city) return FALLBACK_CITY_IMAGE
  const key = normalizeCityKey(city)
  return CITY_IMAGES[key] || FALLBACK_CITY_IMAGE
}

export function groupAirportsByCity(airports: Airport[]): CityAirportGroup[] {
  const map = new Map<string, CityAirportGroup>()
  for (const a of airports) {
    const city = (a.city || '').trim()
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
