/**
 * Conversion copy when live hotel price differs from the listed snapshot.
 * Never expose provider names (LiteAPI, etc.) in the UI.
 * Hotel UI prices are always shown **per night** (never / pers.).
 */

export const HOTEL_PRICE_PER_NIGHT_UNIT_FR = '/ nuit'
export const HOTEL_PRICE_PER_NIGHT_LABEL_FR = '€ / nuit'
export const HOTEL_PRICE_STAY_LABEL_FR = 'séjour'

/** Nights between YYYY-MM-DD check-in / check-out. */
export function hotelNightsBetween(
  checkin?: string | null,
  checkout?: string | null,
): number | null {
  const a = String(checkin || '').slice(0, 10)
  const b = String(checkout || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) {
    return null
  }
  try {
    const t0 = new Date(`${a}T12:00:00`).getTime()
    const t1 = new Date(`${b}T12:00:00`).getTime()
    const n = Math.round((t1 - t0) / 86400000)
    return n > 0 ? n : null
  } catch {
    return null
  }
}

/** Stay total € from public total or hotel_pp × adults. */
export function hotelStayTotalFr(opts: {
  publicHotelPrice?: number | null
  hotelPp?: number | null
  adults?: number | null
}): number | null {
  const pub = Number(opts.publicHotelPrice)
  if (Number.isFinite(pub) && pub > 0) return Math.round(pub * 100) / 100
  const pp = Number(opts.hotelPp)
  const adults = Math.max(1, Number(opts.adults) || 1)
  if (Number.isFinite(pp) && pp > 0) {
    return Math.round(pp * adults * 100) / 100
  }
  return null
}

/** Rounded € / night for hotel cards and CTAs. */
export function hotelPricePerNightFr(opts: {
  publicHotelPrice?: number | null
  hotelPp?: number | null
  adults?: number | null
  nights?: number | null
  checkin?: string | null
  checkout?: string | null
}): { amount: number; label: string } | null {
  const nights =
    opts.nights != null && Number(opts.nights) > 0
      ? Number(opts.nights)
      : hotelNightsBetween(opts.checkin, opts.checkout)
  const total = hotelStayTotalFr(opts)
  if (total == null || !(total > 0)) return null
  if (nights != null && nights > 0) {
    return {
      amount: Math.round(total / nights),
      label: HOTEL_PRICE_PER_NIGHT_UNIT_FR,
    }
  }
  return { amount: Math.round(total), label: HOTEL_PRICE_STAY_LABEL_FR }
}

export const HOTEL_PRICE_CHECKING_FR = 'On vérifie le prix en direct…'

export const HOTEL_PRICE_UPDATED_TITLE_FR = 'Nouveau tarif hôtel'

/** Confirm step title (checkout). */
export const HOTEL_PRICE_CONFIRM_TITLE_FR = 'Tarif confirmé en direct'

export const HOTEL_PRICE_CONTINUE_FR = 'Oui, continuer'
export const HOTEL_PRICE_PICK_OTHER_FR = 'Voir d’autres hôtels'
export const HOTEL_PRICE_CANCEL_FR = 'Annuler'

/**
 * Body for the jump dialog when locking a hotel (compose → pay).
 * `live` / `listed` = public stay totals in €.
 */
export function hotelPriceJumpBodyFr(live: number, listed: number): string {
  const next = Math.round(live)
  const prev = Math.round(listed)
  if (next > prev) {
    return `Le prix vient de monter à ${next} € pour le séjour (affiché ${prev} €). Tu confirmes ce tarif pour réserver ta chambre ?`
  }
  if (next < prev) {
    return `Bonne nouvelle : le prix est passé à ${next} € (affiché ${prev} €). Tu confirmes pour réserver ta chambre ?`
  }
  return `Prix du séjour : ${next} €. Tu confirmes pour réserver ta chambre ?`
}

/** Short confirm banner under checkout when price moved. */
export function hotelPriceConfirmBodyFr(liveTotal: number): string {
  const n = Math.round(liveTotal)
  return `Total hôtel : ${n} €. C’est le prix actuel. Confirme pour réserver ta chambre.`
}

/**
 * Pack / stay price jump (deal checkout). Prefer stay totals via
 * `hotelPriceJumpBodyFr` when hotel-only; this keeps € amounts without « / pers. ».
 */
export function hotelPricePpJumpBodyFr(fromPp: number, toPp: number): string {
  const a = Math.round(fromPp)
  const b = Math.round(toPp)
  if (b > a) {
    return `Le prix est passé de ${a} € à ${b} €. Tu confirmes pour continuer ?`
  }
  if (b < a) {
    return `Le prix est passé de ${a} € à ${b} €. Tu confirmes pour continuer ?`
  }
  return `Prix : ${b} €. Tu confirmes pour continuer ?`
}
