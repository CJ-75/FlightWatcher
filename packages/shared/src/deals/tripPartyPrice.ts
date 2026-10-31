/**
 * Party price display for Mon voyage — components rounded to € first, then total.
 * Never show « / pers. » when adults === 1.
 */

export type TripPartyPrice = {
  adults: number
  nights: number
  /** Flight € per person (rounded) */
  flightPp: number
  /** Flight total for the party */
  flightTotal: number
  /** Hotel stay total (all rooms / nights) */
  hotelTotal: number
  /** flightTotal + hotelTotal */
  total: number
  /** total ÷ adults, rounded to € (only meaningful for display when adults > 1) */
  perPerson: number
  /** Optional city tax payable on site (already rounded €) */
  cityTax: number | null
}

function euro(n: number): number {
  return Math.round(Number(n) || 0)
}

export function nightsBetween(out?: string | null, ret?: string | null): number {
  const a = String(out || '').slice(0, 10)
  const b = String(ret || '').slice(0, 10)
  if (a.length < 10 || b.length < 10) return 0
  const t0 = Date.parse(`${a}T12:00:00`)
  const t1 = Date.parse(`${b}T12:00:00`)
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return 0
  return Math.round((t1 - t0) / 86400000)
}

/**
 * @param flightPpRaw — trusted flight € / person (server)
 * @param hotelTotalRaw — trusted hotel public total for the stay
 * @param cityTaxRaw — optional city tax on site
 */
export function computeTripPartyPrice(input: {
  adults: number
  flightPp: number | null | undefined
  hotelTotal: number | null | undefined
  cityTax?: number | null
  outDate?: string | null
  retDate?: string | null
  nights?: number | null
}): TripPartyPrice {
  const adults = Math.max(1, Math.min(6, Math.round(Number(input.adults) || 1)))
  const flightPp = euro(Number(input.flightPp) || 0)
  const hotelTotal = euro(Number(input.hotelTotal) || 0)
  const flightTotal = flightPp * adults
  const total = flightTotal + hotelTotal
  const perPerson = euro(total / adults)
  const nights =
    input.nights != null && Number(input.nights) > 0
      ? Math.round(Number(input.nights))
      : nightsBetween(input.outDate, input.retDate)
  const cityTax =
    input.cityTax != null && Number(input.cityTax) > 0
      ? euro(Number(input.cityTax))
      : null
  return {
    adults,
    nights,
    flightPp,
    flightTotal,
    hotelTotal,
    total,
    perPerson,
    cityTax,
  }
}

/** Board code → French words in full (never show RO / BI / HB raw). */
export function boardLabelFr(board?: string | null): string | null {
  if (!board) return null
  const raw = String(board).trim()
  if (!raw) return null
  const b = raw.toUpperCase().replace(/[^A-Z]/g, '')
  // Prefer exact / leading codes from LiteAPI-style values ("RO", "BI", "RO - …")
  if (
    b === 'RO' ||
    (b.startsWith('RO') && b.length <= 4) ||
    /room.?only|chambre seule/i.test(raw)
  ) {
    return 'Chambre seule'
  }
  if (
    b === 'BI' ||
    b === 'BB' ||
    /breakfast|petit[-\s]?d[eé]j/i.test(raw)
  ) {
    return 'Petit-déjeuner inclus'
  }
  if (b === 'HB' || /half.?board|demi[-\s]?pension/i.test(raw)) {
    return 'Demi-pension'
  }
  if (b === 'FB' || /full.?board|pension compl/i.test(raw)) {
    return 'Pension complète'
  }
  if (b === 'AI' || /all.?inclusive|tout compris/i.test(raw)) {
    return 'Tout compris'
  }
  // Unknown short codes: hide rather than show jargon
  if (/^[A-Z]{1,3}$/.test(b)) return null
  // Already French / descriptive text
  return raw
}
