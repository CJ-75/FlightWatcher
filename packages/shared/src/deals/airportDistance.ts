/**
 * Single source for airport → city centre distance (Lot C / airport_display seed).
 * Show only when > 25 km. Format: « Bergame est à 48 km de Milan ».
 */

/** IATA → { km, place label used in sentence subject } */
export const AIRPORT_DISTANCE_SEED: Record<
  string,
  { km: number; place: string }
> = {
  BVA: { km: 85, place: 'Beauvais' },
  CRL: { km: 46, place: 'Charleroi' },
  BGY: { km: 48, place: 'Bergame' },
  TSF: { km: 30, place: 'Trévise' },
  STN: { km: 60, place: 'Stansted' },
  LTN: { km: 55, place: 'Luton' },
  SEN: { km: 65, place: 'Southend' },
  CIA: { km: 15, place: 'Ciampino' },
  FCO: { km: 30, place: 'Fiumicino' },
  ORY: { km: 18, place: 'Orly' },
  CDG: { km: 25, place: 'Roissy' },
  /** Vatry — trop loin de Paris pour sélection ville par défaut (>150 km). */
  XCR: { km: 165, place: 'Vatry' },
  HHN: { km: 120, place: 'Hahn' },
  NRN: { km: 70, place: 'Weeze' },
  EIN: { km: 110, place: 'Eindhoven' },
}

export function distanceKmForIata(iata?: string | null): number | null {
  const code = String(iata || '')
    .trim()
    .toUpperCase()
  if (!code) return null
  const row = AIRPORT_DISTANCE_SEED[code]
  return row ? row.km : null
}

/**
 * « Bergame est à 48 km de Milan » when km > 25.
 * @param destCity — destination city name (e.g. Milan), not the airport.
 */
/** Max km from city centre for airports auto-selected when picking a city. */
export const CITY_AIRPORT_DEFAULT_MAX_KM = 150

/**
 * Default IATA list when the user picks a city group.
 * Excludes far airports (e.g. Paris → Vatry XCR) so they stay opt-in.
 */
export function defaultAirportCodesForCity(codes: string[]): string[] {
  const unique = [
    ...new Set(
      codes.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean),
    ),
  ]
  if (!unique.length) return []
  const near = unique.filter((code) => {
    const km = distanceKmForIata(code)
    return km == null || km <= CITY_AIRPORT_DEFAULT_MAX_KM
  })
  return near.length ? near : unique
}

export function distantAirportLine(
  iata?: string | null,
  destCity?: string | null,
): string | null {
  const code = String(iata || '')
    .trim()
    .toUpperCase()
  const row = AIRPORT_DISTANCE_SEED[code]
  if (!row || row.km <= 25) return null
  const km = Math.round(row.km)
  const city = String(destCity || '').trim()
  if (city) return `${row.place} est à ${km} km de ${city}`
  return `${row.place} est à ${km} km du centre`
}
