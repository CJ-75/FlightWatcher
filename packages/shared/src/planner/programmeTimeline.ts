/**
 * Build Programme day timeline from trip + trip_items (Path PDF §5).
 * Read-only surface — no editor. Adresses included when restaurantsEnabled.
 */

export type ProgrammeMoment = 'morning' | 'afternoon' | 'evening' | 'daytime'

export type ProgrammeItemKind =
  | 'flight_out'
  | 'flight_ret'
  | 'hotel'
  | 'activity'
  | 'address'
  | 'note'
  | 'placeholder'

export type ProgrammeSlotItem = {
  id: string
  kind: ProgrammeItemKind
  title: string
  subtitle?: string
  moment?: ProgrammeMoment | null
  dayOffset: number
  tripItemId?: string
  notes?: string | null
  status?: string | null
  /** Opens existing sheet when touched */
  action?: 'flight' | 'hotel' | 'activity' | 'address' | 'scan' | null
}

export type ProgrammeDaySlot = {
  moment: ProgrammeMoment
  label: string
  items: ProgrammeSlotItem[]
}

export type ProgrammeDay = {
  dayOffset: number
  label: string
  /** ISO date YYYY-MM-DD when known */
  date?: string | null
  slots: ProgrammeDaySlot[]
  /** True when no items that day */
  empty: boolean
}

export type ProgrammeTimeline = {
  days: ProgrammeDay[]
  unplaced: ProgrammeSlotItem[]
  /** No out/ret dates — show empty-state message instead of days */
  needsDates: boolean
  unplacedHint: string
}

const MOMENT_LABEL: Record<ProgrammeMoment, string> = {
  morning: 'Matin',
  afternoon: 'Après-midi',
  evening: 'Soir',
  daytime: 'Dans la journée',
}

const SLOT_ORDER: ProgrammeMoment[] = [
  'morning',
  'afternoon',
  'evening',
  'daytime',
]

function parseYmd(raw?: string | null): string | null {
  const s = String(raw || '').slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00`)
  d.setDate(d.getDate() + days)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** « Sam. 14 nov. » */
export function programmeDayLabelFr(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`)
  const raw = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d)
  return raw.replace(/\.$/, '') + (raw.endsWith('.') ? '' : '')
}

function formatDayLabel(dayOffset: number, outYmd: string | null): string {
  if (outYmd) {
    return programmeDayLabelFr(addDaysYmd(outYmd, dayOffset))
  }
  return `Jour ${dayOffset + 1}`
}

function normalizeMoment(raw?: string | null): ProgrammeMoment | null {
  const m = String(raw || '')
    .trim()
    .toLowerCase()
  if (m === 'morning' || m === 'matin') return 'morning'
  if (m === 'afternoon' || m === 'apres-midi' || m === 'après-midi')
    return 'afternoon'
  if (m === 'evening' || m === 'soir') return 'evening'
  if (m === 'daytime' || m === 'journée' || m === 'journee') return 'daytime'
  return null
}

/** True if arrival local calendar day is after departure local calendar day. */
export function isOvernightFlight(
  depIso?: string | null,
  arrIso?: string | null,
): boolean {
  const dep = String(depIso || '')
  const arr = String(arrIso || '')
  if (dep.length < 10 || arr.length < 10) return false
  return arr.slice(0, 10) > dep.slice(0, 10)
}

export function buildProgrammeTimeline(input: {
  outDate?: string | null
  retDate?: string | null
  nights?: number
  flightLabel?: string | null
  hotelLabel?: string | null
  hasFlight?: boolean
  hasHotel?: boolean
  restaurantsEnabled?: boolean
  /** Outbound departure / arrival ISO for overnight detection */
  flightOutDepAt?: string | null
  flightOutArrAt?: string | null
  flightOutSubtitle?: string | null
  flightRetSubtitle?: string | null
  items?: Array<{
    id: string
    item_type?: string
    title?: string | null
    name?: string | null
    day_offset?: number | null
    moment?: string | null
    notes?: string | null
    status?: string | null
  }>
}): ProgrammeTimeline {
  const out = parseYmd(input.outDate)
  const ret = parseYmd(input.retDate)
  const needsDates = !out && !ret

  const unplacedHint =
    'Le placement par jour arrive bientôt'

  if (needsDates && !input.hasFlight && !input.hasHotel) {
    return {
      days: [],
      unplaced: [],
      needsDates: true,
      unplacedHint,
    }
  }

  let span = Math.max(0, Math.round(Number(input.nights) || 0))
  if (!span && out && ret) {
    const t0 = Date.parse(`${out}T12:00:00`)
    const t1 = Date.parse(`${ret}T12:00:00`)
    if (Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0) {
      span = Math.round((t1 - t0) / 86400000)
    }
  }
  // At least one day when dates unknown but we still show skeleton
  const lastDay = out || ret ? Math.max(span, out && ret ? span : 0) : 0
  const overnight = isOvernightFlight(
    input.flightOutDepAt,
    input.flightOutArrAt,
  )
  const arrivalDayOffset = overnight ? 1 : 0

  const unplaced: ProgrammeSlotItem[] = []
  const byDay = new Map<number, ProgrammeSlotItem[]>()

  const push = (item: ProgrammeSlotItem) => {
    if (item.dayOffset < 0) {
      unplaced.push({ ...item, moment: item.moment ?? null })
      return
    }
    const list = byDay.get(item.dayOffset) || []
    list.push(item)
    byDay.set(item.dayOffset, list)
  }

  if (input.hasFlight) {
    push({
      id: 'flight-out',
      kind: 'flight_out',
      title: input.flightLabel || 'Vol aller',
      subtitle: input.flightOutSubtitle || undefined,
      dayOffset: 0,
      moment: 'morning',
      action: 'flight',
      status: 'reserved',
    })
    // Arrival shown next day when overnight
    if (overnight && arrivalDayOffset > 0) {
      push({
        id: 'flight-out-arrival',
        kind: 'flight_out',
        title: 'Arrivée',
        subtitle: input.flightOutSubtitle || undefined,
        dayOffset: arrivalDayOffset,
        moment: 'morning',
        action: 'flight',
      })
    }
    push({
      id: 'flight-ret',
      kind: 'flight_ret',
      title: input.flightLabel
        ? `${input.flightLabel} · retour`
        : 'Vol retour',
      subtitle: input.flightRetSubtitle || undefined,
      dayOffset: lastDay,
      moment: 'evening',
      action: 'flight',
      status: 'reserved',
    })
  } else if (out || ret) {
    push({
      id: 'flight-out-skel',
      kind: 'placeholder',
      title: 'Vol à choisir',
      dayOffset: 0,
      moment: 'morning',
      action: 'scan',
    })
  }

  if (input.hasHotel) {
    push({
      id: 'hotel-checkin',
      kind: 'hotel',
      title: 'Arrivée à l’hôtel',
      subtitle: input.hotelLabel || undefined,
      dayOffset: Math.min(arrivalDayOffset, lastDay),
      moment: 'afternoon',
      action: 'hotel',
    })
    if (lastDay > 0) {
      push({
        id: 'hotel-checkout',
        kind: 'hotel',
        title: 'Départ de l’hôtel',
        subtitle: input.hotelLabel || undefined,
        dayOffset: lastDay,
        moment: 'morning',
        action: 'hotel',
      })
    }
  }

  for (const raw of input.items || []) {
    if (String(raw.status || '') === 'skipped') continue
    const type = String(raw.item_type || 'activity')
    if (type === 'restaurant' && !input.restaurantsEnabled) continue
    const dayOffset =
      raw.day_offset == null || Number.isNaN(Number(raw.day_offset))
        ? -1
        : Math.max(0, Math.round(Number(raw.day_offset)))
    let moment = normalizeMoment(raw.moment)
    // Placed on a day but no moment → « Dans la journée »
    if (dayOffset >= 0 && moment == null) moment = 'daytime'
    const kind: ProgrammeItemKind =
      type === 'hotel'
        ? 'hotel'
        : type === 'restaurant'
          ? 'address'
          : 'activity'
    push({
      id: `item-${raw.id}`,
      kind,
      title: String(raw.title || raw.name || (kind === 'address' ? 'Adresse' : 'Activité')),
      dayOffset,
      moment,
      tripItemId: raw.id,
      notes: raw.notes || null,
      status: raw.status || null,
      action: kind === 'address' ? 'address' : kind === 'hotel' ? 'hotel' : 'activity',
    })
  }

  if (needsDates) {
    return {
      days: [],
      unplaced,
      needsDates: true,
      unplacedHint,
    }
  }

  const days: ProgrammeDay[] = []
  const maxDay = Math.max(
    lastDay,
    ...Array.from(byDay.keys()),
    0,
  )
  for (let d = 0; d <= maxDay; d++) {
    const items = byDay.get(d) || []
    const date = out ? addDaysYmd(out, d) : null
    const slots: ProgrammeDaySlot[] = SLOT_ORDER.map((moment) => ({
      moment,
      label: MOMENT_LABEL[moment],
      items: items.filter((it) => it.moment === moment),
    })).filter((s) => s.items.length > 0)
    days.push({
      dayOffset: d,
      label: formatDayLabel(d, out),
      date,
      slots,
      empty: items.length === 0,
    })
  }

  return { days, unplaced, needsDates: false, unplacedHint }
}
