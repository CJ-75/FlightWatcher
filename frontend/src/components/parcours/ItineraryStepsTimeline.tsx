import {
  formatDurationMinutes,
  groupItemsByDay,
  stepKindLabel,
  type ItineraryItem,
} from '@flightwatcher/shared'

type Props = {
  items: ItineraryItem[]
  onOpenMaps?: (item: ItineraryItem) => void
  onBookActivity?: (item: ItineraryItem) => void
}

function KindIcon({ kind }: { kind: string }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (kind === 'activity') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="2.75" />
        <path d="M12 3.5v2.5M12 18v2.5M4.8 4.8l1.8 1.8M17.4 17.4l1.8 1.8M3.5 12h2.5M18 12h2.5M4.8 19.2l1.8-1.8M17.4 6.6l1.8-1.8" />
      </svg>
    )
  }
  if (kind === 'place') {
    return (
      <svg {...common}>
        <path d="M12 20.5s6.2-4 6.2-9.6a6.2 6.2 0 10-12.4 0c0 5.6 6.2 9.6 6.2 9.6z" />
        <circle cx="12" cy="10.6" r="1.9" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M4 12h12" />
      <path d="M13 7l5 5-5 5" />
    </svg>
  )
}

export function ItineraryStepsTimeline({
  items,
  onOpenMaps,
  onBookActivity,
}: Props) {
  const days = groupItemsByDay(items)
  if (!days.length) {
    return <p className="text-sm text-[#A3988C]">Aucune étape pour l’instant.</p>
  }

  return (
    <div className="space-y-8">
      {days.map((day) => (
        <div key={day.dayOffset}>
          {days.length > 1 ? (
            <h3 className="mb-4 text-base font-bold text-[#1A120E]">{day.label}</h3>
          ) : null}
          <ol className="relative space-y-0">
            {day.items.map((it, i) => {
              const last = i === day.items.length - 1
              const title = it.title || it.places?.name || `Étape ${i + 1}`
              const dur = formatDurationMinutes(it.duration_minutes)
              return (
                <li key={it.id || `${day.dayOffset}-${i}`} className="relative flex gap-4 pb-6">
                  {!last ? (
                    <span
                      className="absolute left-[15px] top-8 bottom-0 w-px bg-[#EDE8E1]"
                      aria-hidden
                    />
                  ) : null}
                  <span className="relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FFF0E8] text-xs font-bold text-[#FF6B35] ring-1 ring-[#FF6B35]/20">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex gap-3">
                      {it.photo ? (
                        <img
                          src={it.photo}
                          alt=""
                          className="h-[72px] w-[72px] shrink-0 rounded-2xl object-cover"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#A3988C]">
                          <KindIcon kind={it.kind} />
                          {stepKindLabel(it.kind)}
                          {dur ? ` · ${dur}` : ''}
                        </p>
                        <p className="mt-0.5 text-[15px] font-bold text-[#1A120E]">
                          {title}
                        </p>
                        {it.note ? (
                          <p className="mt-1 text-sm leading-relaxed text-[#6B5C50]">
                            {it.note}
                          </p>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {it.kind === 'place' && onOpenMaps ? (
                            <button
                              type="button"
                              onClick={() => onOpenMaps(it)}
                              className="text-xs font-bold text-[#FF6B35] hover:underline"
                            >
                              Ouvrir dans Maps
                            </button>
                          ) : null}
                          {it.kind === 'activity' && it.viator_product_code ? (
                            <button
                              type="button"
                              onClick={() => onBookActivity?.(it)}
                              className="text-xs font-bold text-[#FF6B35] hover:underline"
                            >
                              Réserver
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </div>
  )
}
