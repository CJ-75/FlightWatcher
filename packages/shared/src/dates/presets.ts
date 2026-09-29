import type { DateAvecHoraire } from '../types'

export type DatePresetId = 'weekend' | 'next-weekend' | 'next-week' | 'flexible'

export type FlexibleDates = {
  dates_depart: DateAvecHoraire[]
  dates_retour: DateAvecHoraire[]
}

/** Format local YYYY-MM-DD (évite les décalages toISOString). */
export function formatDateLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 1=lundi … 7=dimanche */
export function getDayOfWeekMondayBased(date: Date): number {
  const jsDay = date.getDay()
  return jsDay === 0 ? 7 : jsDay
}

export function formatDateFr(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00')
  const days = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']
  const months = [
    'janv.',
    'févr.',
    'mars',
    'avr.',
    'mai',
    'juin',
    'juil.',
    'août',
    'sept.',
    'oct.',
    'nov.',
    'déc.',
  ]
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`
}

const defaultHours = { heure_min: '06:00', heure_max: '23:59' }

/**
 * Génère les dates aller/retour selon le preset (logique alignée web DateWithTimes).
 * `flexible` retourne des listes vides — à remplir manuellement.
 */
export function generateDatesFromPreset(preset: DatePresetId): FlexibleDates {
  if (preset === 'flexible') {
    return { dates_depart: [], dates_retour: [] }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentDay = getDayOfWeekMondayBased(today)
  const dates_depart: DateAvecHoraire[] = []
  const dates_retour: DateAvecHoraire[] = []

  if (preset === 'weekend') {
    let departureDate: Date
    let returnDate: Date

    if (currentDay === 5) {
      departureDate = new Date(today)
      returnDate = new Date(today)
      returnDate.setDate(today.getDate() + (7 - currentDay))
    } else {
      const saturdayOffset = 6 - currentDay
      const sundayOffset = 7 - currentDay
      const finalSaturdayOffset =
        currentDay === 7 ? saturdayOffset + 7 : saturdayOffset < 0 ? saturdayOffset + 7 : saturdayOffset
      const finalSundayOffset =
        currentDay === 7 ? sundayOffset + 7 : sundayOffset < 0 ? sundayOffset + 7 : sundayOffset
      departureDate = new Date(today)
      departureDate.setDate(today.getDate() + finalSaturdayOffset)
      returnDate = new Date(today)
      returnDate.setDate(today.getDate() + finalSundayOffset)
    }

    dates_depart.push({ date: formatDateLocal(departureDate), ...defaultHours })
    dates_retour.push({ date: formatDateLocal(returnDate), ...defaultHours })
  } else if (preset === 'next-weekend') {
    if (currentDay === 5) {
      const fridayDate = new Date(today)
      fridayDate.setDate(today.getDate() + 7)
      const sundayDate = new Date(today)
      sundayDate.setDate(today.getDate() + (14 - currentDay))
      dates_depart.push({ date: formatDateLocal(fridayDate), ...defaultHours })
      dates_retour.push({ date: formatDateLocal(sundayDate), ...defaultHours })
    } else if (currentDay === 6 || currentDay === 7) {
      const fridayDate = new Date(today)
      fridayDate.setDate(today.getDate() + (12 - currentDay))
      const sundayDate = new Date(today)
      sundayDate.setDate(today.getDate() + (14 - currentDay))
      dates_depart.push({ date: formatDateLocal(fridayDate), ...defaultHours })
      dates_retour.push({ date: formatDateLocal(sundayDate), ...defaultHours })
    } else {
      const saturdayDate = new Date(today)
      saturdayDate.setDate(today.getDate() + (13 - currentDay))
      const sundayDate = new Date(today)
      sundayDate.setDate(today.getDate() + (14 - currentDay))
      dates_depart.push({ date: formatDateLocal(saturdayDate), ...defaultHours })
      dates_retour.push({ date: formatDateLocal(sundayDate), ...defaultHours })
    }
  } else if (preset === 'next-week') {
    const nextMonday = new Date(today)
    nextMonday.setDate(today.getDate() + (8 - currentDay))
    const add = (base: Date, offset: number) => {
      const d = new Date(base)
      d.setDate(base.getDate() + offset)
      return { date: formatDateLocal(d), ...defaultHours }
    }
    dates_depart.push(add(nextMonday, 0), add(nextMonday, 1), add(nextMonday, 2))
    dates_retour.push(add(nextMonday, 3), add(nextMonday, 4), add(nextMonday, 5))
  }

  return { dates_depart, dates_retour }
}

export const TIME_PRESETS = [
  { id: 'nuit', label: 'Nuit', emoji: '🌙', min: '00:00', max: '06:00' },
  { id: 'matin', label: 'Matin', emoji: '🌅', min: '06:01', max: '12:00' },
  { id: 'apres-midi', label: 'Après-midi', emoji: '☀️', min: '12:01', max: '18:00' },
  { id: 'soir', label: 'Soir', emoji: '🌆', min: '18:01', max: '23:59' },
  { id: 'journee', label: 'Journée', emoji: '🕐', min: '06:00', max: '23:59' },
] as const

export function buildRyanairBookingUrl(trip: {
  aller: { origin: string; destination: string; departureTime: string }
  retour: { departureTime: string }
}): string {
  const origin = trip.aller.origin
  const destination = trip.aller.destination
  const departureDate = trip.aller.departureTime.split('T')[0]
  const returnDate = trip.retour.departureTime.split('T')[0]
  return `https://www.ryanair.com/fr/fr/trip/flights/select?adults=1&teens=0&children=0&infants=0&dateOut=${departureDate}&dateIn=${returnDate}&isConnectedFlight=false&isReturn=true&discount=0&promoCode=&originIata=${origin}&destinationIata=${destination}`
}

export function tripFavoriteKey(trip: {
  aller: { flightNumber?: string; departureTime: string }
  retour: { flightNumber?: string; departureTime: string }
}): string {
  return `${trip.aller.flightNumber || ''}|${trip.aller.departureTime}|${trip.retour.flightNumber || ''}|${trip.retour.departureTime}`
}
