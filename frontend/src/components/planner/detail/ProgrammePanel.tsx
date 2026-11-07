import { useMemo, useState } from 'react'
import {
  buildProgrammeTimeline,
  type ProgrammeItemKind,
  type ProgrammeMoment,
  type ProgrammeSlotItem,
} from '@flightwatcher/shared'
import { getApiClient } from '../../../utils/apiClient'
import { TRIP_DETAIL_EVENTS } from '@flightwatcher/shared'

type TripItemRow = {
  id: string
  item_type?: string
  title?: string | null
  name?: string | null
  day_offset?: number | null
  moment?: string | null
  notes?: string | null
  status?: string | null
}

type Props = {
  tripId: string
  outDate?: string | null
  retDate?: string | null
  flightLabel?: string | null
  hotelLabel?: string | null
  hasFlight?: boolean
  hasHotel?: boolean
  items: TripItemRow[]
  onItemsChange?: () => void
  activitiesSlot?: React.ReactNode
}

const MOMENTS: { id: ProgrammeMoment; label: string }[] = [
  { id: 'morning', label: 'Matin' },
  { id: 'afternoon', label: 'Après-midi' },
  { id: 'evening', label: 'Soir' },
]

const SERIF = '"Instrument Serif", Georgia, serif'

const KIND_META: Record<
  ProgrammeItemKind,
  { label: string; tone: string }
> = {
  flight_out: { label: 'Vol', tone: 'bg-[#1A120E] text-white' },
  flight_ret: { label: 'Vol', tone: 'bg-[#1A120E] text-white' },
  hotel: { label: 'Hôtel', tone: 'bg-[#E8DFD6] text-[#5C4F44]' },
  activity: { label: 'Activité', tone: 'bg-[#FFF0E8] text-[#C2410C]' },
  note: { label: 'Note', tone: 'bg-[#F0EEEA] text-[#6B5C50]' },
}

function KindBadge({ kind }: { kind: ProgrammeItemKind }) {
  const meta = KIND_META[kind] || KIND_META.activity
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.tone}`}
    >
      {meta.label}
    </span>
  )
}

function SlotCard({
  item,
  onEdit,
}: {
  item: ProgrammeSlotItem
  onEdit?: () => void
}) {
  return (
    <li className="rounded-2xl bg-[#F7F4EF] px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <KindBadge kind={item.kind} />
          <p className="text-sm font-semibold text-[#1A120E]">{item.title}</p>
          {item.subtitle ? (
            <p className="text-xs text-[#8A7B6E]">{item.subtitle}</p>
          ) : null}
          {item.notes ? (
            <p className="text-xs leading-relaxed text-[#6B5C50]">{item.notes}</p>
          ) : null}
        </div>
        {onEdit ? (
          <button
            type="button"
            className="shrink-0 text-xs font-semibold text-[#1A120E] underline decoration-[#EDE8E1] underline-offset-2"
            onClick={onEdit}
          >
            Modifier
          </button>
        ) : null}
      </div>
    </li>
  )
}

export function ProgrammePanel({
  tripId,
  outDate,
  retDate,
  flightLabel,
  hotelLabel,
  hasFlight,
  hasHotel,
  items,
  onItemsChange,
  activitiesSlot,
}: Props) {
  const timeline = useMemo(
    () =>
      buildProgrammeTimeline({
        outDate,
        retDate,
        flightLabel,
        hotelLabel,
        hasFlight,
        hasHotel,
        items,
      }),
    [outDate, retDate, flightLabel, hotelLabel, hasFlight, hasHotel, items],
  )

  const [focusDay, setFocusDay] = useState<number | 'all'>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [day, setDay] = useState(0)
  const [moment, setMoment] = useState<ProgrammeMoment>('afternoon')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const visibleDays =
    focusDay === 'all'
      ? timeline.days
      : timeline.days.filter((d) => d.dayOffset === focusDay)

  const placedCount = timeline.days.reduce(
    (n, d) => n + d.slots.reduce((m, s) => m + s.items.length, 0),
    0,
  )

  const startEdit = (item: TripItemRow) => {
    setEditingId(item.id)
    setDay(Math.max(0, Number(item.day_offset) || 0))
    setMoment(
      (String(item.moment || 'afternoon') as ProgrammeMoment) || 'afternoon',
    )
    setNotes(String(item.notes || ''))
  }

  const saveEdit = async () => {
    if (!editingId || busy) return
    setBusy(true)
    try {
      await getApiClient().patchTripItem(editingId, {
        day_offset: day,
        moment,
        notes: notes.trim() || null,
      })
      void getApiClient()
        .trackActivityEvent({
          domain: 'planner',
          event: TRIP_DETAIL_EVENTS.itemPlaced,
          surface: 'trip_detail',
          platform: 'web',
          planned_trip_id: tripId,
          trip_item_id: editingId,
          meta: {
            variant: 'v2',
            day_offset: day,
            moment,
            item_type: 'activity',
          },
        })
        .catch(() => undefined)
      setEditingId(null)
      onItemsChange?.()
    } catch {
      /* toast upstream */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-7">
      <header className="space-y-2">
        <h3
          className="text-2xl font-normal italic text-[#1A120E] lg:text-3xl"
          style={{ fontFamily: SERIF }}
        >
          Programme
        </h3>
        <p className="text-sm leading-relaxed text-[#6B5C50]">
          {timeline.days.length} jour{timeline.days.length > 1 ? 's' : ''} ·{' '}
          {placedCount} étape{placedCount > 1 ? 's' : ''}
          {timeline.unplaced.length > 0
            ? ` · ${timeline.unplaced.length} à placer`
            : ''}
          . Vol, hôtel et activités jour par jour.
        </p>
      </header>

      {timeline.days.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setFocusDay('all')}
            className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
              focusDay === 'all'
                ? 'bg-[#1A120E] text-white'
                : 'bg-[#F7F4EF] text-[#5C4F44] hover:bg-[#EFEAE3]'
            }`}
          >
            Tout
          </button>
          {timeline.days.map((d) => (
            <button
              key={d.dayOffset}
              type="button"
              onClick={() => setFocusDay(d.dayOffset)}
              className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold capitalize transition ${
                focusDay === d.dayOffset
                  ? 'bg-[#1A120E] text-white'
                  : 'bg-[#F7F4EF] text-[#5C4F44] hover:bg-[#EFEAE3]'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      ) : null}

      {timeline.unplaced.length > 0 ? (
        <section className="rounded-[24px] bg-[#F7F4EF] p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h4
              className="text-lg font-normal italic text-[#1A120E]"
              style={{ fontFamily: SERIF }}
            >
              À placer
            </h4>
            <span className="text-xs font-semibold text-[#A3988C]">
              {timeline.unplaced.length}
            </span>
          </div>
          <p className="mt-1 text-xs text-[#8A7B6E]">
            Glisse ces idées dans un jour et un moment du séjour.
          </p>
          <ul className="mt-3 space-y-2">
            {timeline.unplaced.map((it) => (
              <li
                key={it.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-white px-3.5 py-3 ring-1 ring-black/[0.04]"
              >
                <div className="min-w-0 space-y-1">
                  <KindBadge kind={it.kind} />
                  <p className="text-sm font-medium text-[#1A120E]">{it.title}</p>
                </div>
                {it.tripItemId ? (
                  <button
                    type="button"
                    className="shrink-0 rounded-full bg-[#1A120E] px-3 py-1.5 text-xs font-semibold text-white"
                    onClick={() => {
                      const raw = items.find((x) => x.id === it.tripItemId)
                      if (raw) startEdit(raw)
                    }}
                  >
                    Placer
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="relative space-y-8">
        {visibleDays.map((d, dayIdx) => (
          <section key={d.dayOffset} className="relative pl-6 sm:pl-8">
            <span
              className="absolute left-0 top-2 h-3 w-3 rounded-full bg-[#1A120E] ring-4 ring-white"
              aria-hidden
            />
            {dayIdx < visibleDays.length - 1 || focusDay === 'all' ? (
              <span
                className="absolute bottom-0 left-[5px] top-5 w-px bg-[#EDE8E1]"
                aria-hidden
              />
            ) : null}
            <h4
              className="text-xl font-normal capitalize italic text-[#1A120E] lg:text-2xl"
              style={{ fontFamily: SERIF }}
            >
              {d.label}
            </h4>
            <div className="mt-4 space-y-4">
              {d.slots.map((slot) => (
                <div key={slot.moment}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A3988C]">
                    {slot.label}
                  </p>
                  {slot.items.length === 0 ? (
                    <div className="mt-2 rounded-2xl border border-dashed border-[#E4DCD3] bg-white/60 px-4 py-3">
                      <p className="text-sm text-[#C4B8AC]">Moment libre</p>
                    </div>
                  ) : (
                    <ul className="mt-2 space-y-2.5">
                      {slot.items.map((it) => (
                        <SlotCard
                          key={it.id}
                          item={it}
                          onEdit={
                            it.tripItemId
                              ? () => {
                                  const raw = items.find(
                                    (x) => x.id === it.tripItemId,
                                  )
                                  if (raw) startEdit(raw)
                                }
                              : undefined
                          }
                        />
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {activitiesSlot ? (
        <section className="space-y-3 border-t border-[#EDE8E1] pt-7">
          <h4
            className="text-xl font-normal italic text-[#1A120E]"
            style={{ fontFamily: SERIF }}
          >
            Idées & activités
          </h4>
          <p className="text-sm text-[#6B5C50]">
            Ajoute des expériences à placer ensuite dans le programme.
          </p>
          {activitiesSlot}
        </section>
      ) : null}

      {editingId ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-[28px] bg-white p-5 shadow-xl sm:p-6">
            <h4
              className="text-2xl font-normal italic text-[#1A120E]"
              style={{ fontFamily: SERIF }}
            >
              Placer dans le programme
            </h4>
            <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-[#A3988C]">
              Jour
              <select
                value={day}
                onChange={(e) => setDay(Number(e.target.value) || 0)}
                className="mt-1.5 w-full rounded-2xl bg-[#F7F4EF] px-3.5 py-3 text-sm font-semibold capitalize text-[#1A120E] outline-none"
              >
                {timeline.days.map((d) => (
                  <option key={d.dayOffset} value={d.dayOffset}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wider text-[#A3988C]">
              Moment
              <select
                value={moment}
                onChange={(e) => setMoment(e.target.value as ProgrammeMoment)}
                className="mt-1.5 w-full rounded-2xl bg-[#F7F4EF] px-3.5 py-3 text-sm font-semibold text-[#1A120E] outline-none"
              >
                {MOMENTS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-[11px] font-semibold uppercase tracking-wider text-[#A3988C]">
              Note
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Horaires, tips, rendez-vous…"
                className="mt-1.5 w-full rounded-2xl bg-[#F7F4EF] px-3.5 py-3 text-sm text-[#1A120E] outline-none placeholder:text-[#C4B8AC]"
              />
            </label>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="flex-1 rounded-full bg-[#F7F4EF] py-3.5 text-sm font-semibold text-[#1A120E]"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveEdit()}
                className="flex-1 rounded-full bg-[#1A120E] py-3.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
