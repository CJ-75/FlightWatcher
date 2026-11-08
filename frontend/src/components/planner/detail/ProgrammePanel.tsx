import { useMemo } from 'react'
import {
  buildProgrammeTimeline,
  type ProgrammeItemKind,
  type ProgrammeSlotItem,
} from '@flightwatcher/shared'

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
  outDate?: string | null
  retDate?: string | null
  flightLabel?: string | null
  hotelLabel?: string | null
  hasFlight?: boolean
  hasHotel?: boolean
  restaurantsEnabled?: boolean
  flightOutDepAt?: string | null
  flightOutArrAt?: string | null
  flightOutSubtitle?: string | null
  flightRetSubtitle?: string | null
  items: TripItemRow[]
  onOpenItem?: (item: ProgrammeSlotItem) => void
}

const KIND_LABEL: Record<ProgrammeItemKind, string> = {
  flight_out: 'Vol',
  flight_ret: 'Vol',
  hotel: 'Hôtel',
  activity: 'Activité',
  address: 'Adresse',
  note: 'Note',
  placeholder: 'Vol',
}

function statusFr(status?: string | null): string | null {
  const s = String(status || '').toLowerCase()
  if (s === 'idea' || s === 'idée') return 'Idée'
  if (s === 'validated' || s === 'validé' || s === 'valide') return 'Validé'
  if (s === 'reserved' || s === 'réservé' || s === 'booked') return 'Réservé'
  return null
}

function ItemRow({
  item,
  onOpen,
}: {
  item: ProgrammeSlotItem
  onOpen?: () => void
}) {
  const st = statusFr(item.status)
  const interactive = Boolean(onOpen && item.action)
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#A3988C]">
          {KIND_LABEL[item.kind]}
        </span>
        {st ? (
          <span className="rounded-full bg-[#EDE8E1] px-2 py-0.5 text-[10px] font-semibold text-[#5C4F44]">
            {st}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm font-semibold text-[#1A120E] dark:text-[#FFF9F5]">
        {item.title}
      </p>
      {item.subtitle ? (
        <p className="mt-0.5 text-xs text-[#8A7B6E]">{item.subtitle}</p>
      ) : null}
      {item.notes ? (
        <p className="mt-1.5 text-xs leading-relaxed text-[#6B5C50]">{item.notes}</p>
      ) : null}
    </>
  )
  if (interactive) {
    return (
      <li>
        <button
          type="button"
          onClick={onOpen}
          className="w-full rounded-2xl border border-[#FFDCC8]/60 bg-[#FFF9F5] px-4 py-3.5 text-left shadow-sm shadow-orange-950/5 transition hover:border-[#FF6B35]/35 hover:bg-[#FFF3EC] dark:border-[#3A2F28] dark:bg-[#2A221E]"
        >
          {inner}
        </button>
      </li>
    )
  }
  return (
    <li className="rounded-2xl border border-[#FFDCC8]/60 bg-[#FFF9F5] px-4 py-3.5 shadow-sm shadow-orange-950/5 dark:border-[#3A2F28] dark:bg-[#2A221E]">
      {inner}
    </li>
  )
}

/**
 * Programme lecture seule (PDF §5).
 */
export function ProgrammePanel({
  outDate,
  retDate,
  flightLabel,
  hotelLabel,
  hasFlight,
  hasHotel,
  restaurantsEnabled,
  flightOutDepAt,
  flightOutArrAt,
  flightOutSubtitle,
  flightRetSubtitle,
  items,
  onOpenItem,
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
        restaurantsEnabled,
        flightOutDepAt,
        flightOutArrAt,
        flightOutSubtitle,
        flightRetSubtitle,
        items,
      }),
    [
      outDate,
      retDate,
      flightLabel,
      hotelLabel,
      hasFlight,
      hasHotel,
      restaurantsEnabled,
      flightOutDepAt,
      flightOutArrAt,
      flightOutSubtitle,
      flightRetSubtitle,
      items,
    ],
  )

  if (timeline.needsDates) {
    return (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold tracking-tight text-[#1A120E] dark:text-[#FFF9F5]">
          Programme
        </h3>
        <p className="text-[13px] leading-relaxed text-[#6B5C50]">
          Les jours apparaîtront quand les dates seront fixées.
        </p>
        {timeline.unplaced.length > 0 ? (
          <UnplacedBlock
            items={timeline.unplaced}
            hint={timeline.unplacedHint}
            onOpenItem={onOpenItem}
          />
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h3 className="text-lg font-semibold tracking-tight text-[#1A120E] dark:text-[#FFF9F5]">
          Programme
        </h3>
        <p className="text-[13px] text-[#6B5C50]">
          Lecture du séjour tel qu’il est — toucher un élément ouvre sa fiche.
        </p>
      </header>

      {timeline.unplaced.length > 0 ? (
        <UnplacedBlock
          items={timeline.unplaced}
          hint={timeline.unplacedHint}
          onOpenItem={onOpenItem}
        />
      ) : null}

      <div className="relative space-y-6">
        {timeline.days.map((d) => (
          <section key={d.dayOffset} className="relative pl-5 sm:pl-6">
            <span
              className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-[#FF6B35] ring-4 ring-[#FFFBF8] dark:ring-[#241C18]"
              aria-hidden
            />
            <span
              className="absolute bottom-0 left-[3px] top-4 w-px bg-[#E8DDD4] dark:bg-[#3A2F28]"
              aria-hidden
            />
            <h4 className="text-[15px] font-semibold capitalize tracking-tight text-[#1A120E] dark:text-[#FFF9F5]">
              {d.label}
            </h4>
            {d.empty ? (
              <p className="mt-3 text-sm text-[#C4B8AC]">Journée libre</p>
            ) : (
              <div className="mt-4 space-y-4">
                {d.slots.map((slot) => (
                  <div key={slot.moment}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A3988C]">
                      {slot.label}
                    </p>
                    <ul className="mt-2 space-y-2.5">
                      {slot.items.map((it) => (
                        <ItemRow
                          key={it.id}
                          item={it}
                          onOpen={
                            onOpenItem && it.action
                              ? () => onOpenItem(it)
                              : undefined
                          }
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

function UnplacedBlock({
  items,
  hint,
  onOpenItem,
}: {
  items: ProgrammeSlotItem[]
  hint: string
  onOpenItem?: (item: ProgrammeSlotItem) => void
}) {
  return (
    <section className="rounded-2xl border border-dashed border-[#E8DDD4] bg-white p-4 dark:border-[#3A2F28] dark:bg-[#2A221E]">
      <h4 className="text-[15px] font-semibold tracking-tight text-[#1A120E] dark:text-[#FFF9F5]">
        À placer
      </h4>
      <p className="mt-1 text-[12px] font-medium text-[#8A6A58]">{hint}</p>
      <ul className="mt-3 space-y-2">
        {items.map((it) => (
          <ItemRow
            key={it.id}
            item={it}
            onOpen={
              onOpenItem && it.action ? () => onOpenItem(it) : undefined
            }
          />
        ))}
      </ul>
    </section>
  )
}
