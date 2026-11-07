/**
 * Build Programme day timeline from trip + trip_items (Path Lot 3).
 * No Adresses/restaurants in this surface for now.
 */

export type ProgrammeMoment = 'morning' | 'afternoon' | 'evening'

export type ProgrammeItemKind = 'flight_out' | 'flight_ret' | 'hotel' | 'activity' | 'note'

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
}

export type ProgrammeDay = {
  dayOffset: number
  label: string
  slots: {
    moment: ProgrammeMoment
    label: string
    items: ProgrammeSlotItem[]
  }[]
}

export type ProgrammeTimeline = {
  days: ProgrammeDay[]
  unplaced: ProgrammeSlotItem[]
}

const MOMENT_LABEL: Record<ProgrammeMoment, string> = {
  morning: 'Matin',
  afternoon: 'Après-midi',
  evening: 'Soir',
}

const MOMENTS: ProgrammeMoment[] = ['morning', 'afternoon', 'evening']

function dayLabelFr(dayOffset: number, outDate?: string | null): string {
  if (dayOffset === 0) return 'Arrivée'
  if (outDate && outDate.length >= 10) {
    const d = new Date(`${outDate.slice(0, 10)}T12:00:00`)
    d.setDate(d.getDate() + dayOffset)
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    }).format(d)
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
  return null
}

export function buildProgrammeTimeline(input: {
  outDate?: string | null
  retDate?: string | null
  nights?: number
  flightLabel?: string | null
  hotelLabel?: string | null
  hasFlight?: boolean
  hasHotel?: boolean
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
  const out = input.outDate || null
  const ret = input.retDate || null
  let span = Math.max(0, Math.round(Number(input.nights) || 0))
  if (!span && out && ret) {
    const t0 = Date.parse(`${out.slice(0, 10)}T12:00:00`)
    const t1 = Date.parse(`${ret.slice(0, 10)}T12:00:00`)
    if (Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0) {
      span = Math.round((t1 - t0) / 86400000)
    }
  }
  const lastDay = Math.max(span, 1)

  const unplaced: ProgrammeSlotItem[] = []
  const byDay = new Map<number, ProgrammeSlotItem[]>()

  const push = (item: ProgrammeSlotItem) => {
    if (item.dayOffset < 0 || item.moment == null) {
      unplaced.push(item)
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
      dayOffset: 0,
      moment: 'morning',
    })
    push({
      id: 'flight-ret',
      kind: 'flight_ret',
      title: input.flightLabel
        ? `${input.flightLabel} · retour`
        : 'Vol retour',
      dayOffset: lastDay,
      moment: 'evening',
    })
  } else {
    // Skeleton so empty trips don't look broken
    push({
      id: 'flight-out-skel',
      kind: 'flight_out',
      title: 'Vol aller (à choisir)',
      dayOffset: 0,
      moment: 'morning',
    })
  }

  if (input.hasHotel) {
    push({
      id: 'hotel-checkin',
      kind: 'hotel',
      title: input.hotelLabel || 'Hôtel',
      subtitle: 'Arrivée',
      dayOffset: 0,
      moment: 'afternoon',
    })
  }

  for (const raw of input.items || []) {
    if (String(raw.status || '') === 'skipped') continue
    const type = String(raw.item_type || 'activity')
    if (type === 'restaurant') continue // Adresses hors plan
    const dayOffset =
      raw.day_offset == null || Number.isNaN(Number(raw.day_offset))
        ? -1
        : Math.max(0, Math.round(Number(raw.day_offset)))
    const moment = normalizeMoment(raw.moment)
    push({
      id: `item-${raw.id}`,
      kind: type === 'hotel' ? 'hotel' : 'activity',
      title: String(raw.title || raw.name || 'Activité'),
      dayOffset,
      moment,
      tripItemId: raw.id,
      notes: raw.notes || null,
      status: raw.status || null,
    })
  }

  const days: ProgrammeDay[] = []
  for (let d = 0; d <= lastDay; d++) {
    const items = byDay.get(d) || []
    days.push({
      dayOffset: d,
      label: dayLabelFr(d, out),
      slots: MOMENTS.map((moment) => ({
        moment,
        label: MOMENT_LABEL[moment],
        items: items.filter((it) => it.moment === moment),
      })),
    })
  }

  return { days, unplaced }
}
