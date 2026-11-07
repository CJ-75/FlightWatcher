import { useMemo, useState } from 'react'
import {
  buildProgrammeTimeline,
  type ProgrammeMoment,
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

  const [editingId, setEditingId] = useState<string | null>(null)
  const [day, setDay] = useState(0)
  const [moment, setMoment] = useState<ProgrammeMoment>('afternoon')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

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
    <div className="space-y-6">
      {timeline.unplaced.length > 0 ? (
        <section className="rounded-2xl border border-dashed border-orange-200 bg-white/70 p-4">
          <h3 className="text-sm font-extrabold text-[#1A120E]">À placer</h3>
          <ul className="mt-3 space-y-2">
            {timeline.unplaced.map((it) => (
              <li
                key={it.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-[#FFF9F5] px-3 py-2"
              >
                <span className="text-sm font-semibold text-slate-800">
                  {it.title}
                </span>
                {it.tripItemId ? (
                  <button
                    type="button"
                    className="text-xs font-bold text-[#FF6B35]"
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

      {timeline.days.map((d) => (
        <section key={d.dayOffset} className="space-y-3">
          <h3 className="text-base font-extrabold capitalize text-[#1A120E]">
            {d.label}
          </h3>
          {d.slots.map((slot) => (
            <div key={slot.moment} className="pl-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {slot.label}
              </p>
              {slot.items.length === 0 ? (
                <p className="mt-1 text-sm text-slate-400">—</p>
              ) : (
                <ul className="mt-1.5 space-y-2">
                  {slot.items.map((it) => (
                    <li
                      key={it.id}
                      className="rounded-2xl border border-orange-100 bg-white px-3.5 py-3 shadow-sm"
                    >
                      <p className="text-sm font-bold text-[#1A120E]">
                        {it.title}
                      </p>
                      {it.subtitle ? (
                        <p className="text-xs text-slate-500">{it.subtitle}</p>
                      ) : null}
                      {it.notes ? (
                        <p className="mt-1 text-xs text-slate-600">{it.notes}</p>
                      ) : null}
                      {it.tripItemId ? (
                        <button
                          type="button"
                          className="mt-2 text-xs font-bold text-[#FF6B35]"
                          onClick={() => {
                            const raw = items.find((x) => x.id === it.tripItemId)
                            if (raw) startEdit(raw)
                          }}
                        >
                          Modifier
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      ))}

      {editingId ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-xl">
            <h4 className="text-lg font-extrabold text-[#1A120E]">
              Placer dans le programme
            </h4>
            <label className="mt-4 block text-xs font-bold uppercase text-slate-500">
              Jour (offset)
              <input
                type="number"
                min={0}
                value={day}
                onChange={(e) => setDay(Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
              />
            </label>
            <label className="mt-3 block text-xs font-bold uppercase text-slate-500">
              Moment
              <select
                value={moment}
                onChange={(e) => setMoment(e.target.value as ProgrammeMoment)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
              >
                {MOMENTS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block text-xs font-bold uppercase text-slate-500">
              Note
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="flex-1 rounded-full border border-slate-200 py-3 text-sm font-bold"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveEdit()}
                className="flex-1 rounded-full bg-[#1A120E] py-3 text-sm font-extrabold text-white disabled:opacity-50"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activitiesSlot}
    </div>
  )
}
