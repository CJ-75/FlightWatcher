/**
 * Lightweight opening-hours evaluation for trip dates.
 * Accepts OSM-like strings when possible; otherwise returns unknown.
 * Full OSM grammar lives server-side when available — this keeps chips consistent.
 */

export type OpenStatus = 'open' | 'closed' | 'unknown'

export type OpenChip = {
  status: OpenStatus
  label: string
  /** machine hint for tests */
  reason?: string
}

export type TripMoment = 'morning' | 'afternoon' | 'evening' | null | undefined

const MOMENT_HOUR: Record<string, number> = {
  morning: 10,
  afternoon: 15,
  evening: 20,
}

/** Parse simple OSM fragments like "Mo-Fr 09:00-18:00; Sa 10:00-14:00" or "24/7". */
function simpleIsOpen(
  raw: string,
  day: Date,
  hour: number,
): OpenStatus {
  const s = raw.trim()
  if (!s) return 'unknown'
  if (/^24\/7$/i.test(s) || /^open$/i.test(s)) return 'open'
  if (/^closed$/i.test(s)) return 'closed'

  // Day codes Mo=1 ... Su=0/7
  const jsDay = day.getDay() // 0 Sun
  const osmDay = jsDay === 0 ? 7 : jsDay
  const dayNames = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
  const code = dayNames[jsDay]

  const parts = s.split(';').map((p) => p.trim()).filter(Boolean)
  let matchedRule = false
  for (const part of parts) {
    if (/off/i.test(part) && part.includes(code)) {
      return 'closed'
    }
    const m = part.match(
      /^([A-Za-z]{2})(?:-([A-Za-z]{2}))?\s+(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/,
    )
    if (!m) continue
    const from = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].indexOf(m[1]) + 1
    const to = m[2]
      ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].indexOf(m[2]) + 1
      : from
    if (from < 1) continue
    const inRange =
      to >= from ? osmDay >= from && osmDay <= to : osmDay >= from || osmDay <= to
    if (!inRange) continue
    matchedRule = true
    const openH = Number(m[3]) + Number(m[4]) / 60
    const closeH = Number(m[5]) + Number(m[6]) / 60
    const nowH = hour + 0.01
    if (closeH > openH) {
      if (nowH >= openH && nowH < closeH) return 'open'
      return 'closed'
    }
  }
  return matchedRule ? 'closed' : 'unknown'
}

function formatDayFr(d: Date): string {
  return d.toLocaleDateString('fr-FR', { weekday: 'long' })
}

function momentLabelFr(moment: TripMoment): string {
  if (moment === 'morning') return 'matin'
  if (moment === 'afternoon') return 'après-midi'
  if (moment === 'evening') return 'soir'
  return 'journée'
}

/**
 * Evaluate opening for a calendar day + optional trip moment.
 * `holidayClosed` when local holiday util marks the day closed.
 */
export function evaluateOpening(opts: {
  openingHoursRaw?: string | null
  /** YYYY-MM-DD in local trip city */
  dateIso: string
  moment?: TripMoment
  holidayClosed?: boolean
}): OpenChip {
  if (opts.holidayClosed) {
    return {
      status: 'closed',
      label: `Fermé (${formatDayFr(new Date(opts.dateIso + 'T12:00:00'))} férié)`,
      reason: 'holiday',
    }
  }
  const raw = (opts.openingHoursRaw || '').trim()
  if (!raw) {
    return { status: 'unknown', label: 'Horaires non renseignés', reason: 'missing' }
  }
  const day = new Date(opts.dateIso + 'T12:00:00')
  if (Number.isNaN(day.getTime())) {
    return { status: 'unknown', label: 'Horaires non renseignés', reason: 'bad_date' }
  }
  const hour = MOMENT_HOUR[opts.moment || ''] ?? 12
  const status = simpleIsOpen(raw, day, hour)
  const when = `${formatDayFr(day)} ${momentLabelFr(opts.moment)}`
  if (status === 'open') {
    return { status, label: `Ouvert ${when} ✓`, reason: 'open' }
  }
  if (status === 'closed') {
    return { status, label: `Fermé ${when}`, reason: 'closed' }
  }
  return { status: 'unknown', label: 'Horaires non renseignés', reason: 'unparsed' }
}

export function openingChipClass(status: OpenStatus): string {
  if (status === 'open') return 'open'
  if (status === 'closed') return 'closed'
  return 'unknown'
}
