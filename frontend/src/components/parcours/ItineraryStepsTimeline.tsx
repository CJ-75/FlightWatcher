import {
  buildItineraryStepMapsUrl,
  formatDurationMinutes,
  groupItemsByDay,
  stepKindLabel,
  type ItineraryItem,
} from '@flightwatcher/shared'

type Props = {
  items: ItineraryItem[]
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

export function ItineraryStepsTimeline({ items, onBookActivity }: Props) {
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
              const mapsUrl = buildItineraryStepMapsUrl(it)
              const photosRaw = it.meta?.photos
              const photos = (
                Array.isArray(photosRaw) && photosRaw.length
                  ? photosRaw.map(String).filter(Boolean)
                  : it.photo
                    ? [it.photo]
                    : []
              ).slice(0, 5)
              const openStep = () => {
                if (!mapsUrl) return
                window.open(mapsUrl, '_blank', 'noopener,noreferrer')
              }
              const single = photos.length === 1 ? photos[0] : null
              const gallery = photos.length >= 2 ? photos : []
              const body = (
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex gap-3">
                    {single ? (
                      <img
                        src={single}
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
                      {it.kind === 'activity' && it.viator_product_code ? (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onBookActivity?.(it)
                            }}
                            className="text-xs font-bold text-[#FF6B35] hover:underline"
                          >
                            Réserver
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {gallery.length ? (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {gallery.map((uri, pi) => (
                        <img
                          key={`${uri}-${pi}`}
                          src={uri}
                          alt=""
                          className="h-20 w-20 shrink-0 rounded-xl object-cover"
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              )
              return (
                <li key={it.id || `${day.dayOffset}-${i}`} className="relative pb-3">
                  {!last ? (
                    <span
                      className="absolute left-[15px] top-10 bottom-0 w-px bg-[#EDE8E1]"
                      aria-hidden
                    />
                  ) : null}
                  <div className="relative flex gap-3 rounded-2xl bg-white p-3.5 shadow-[0_6px_18px_rgba(92,46,24,0.07)]">
                    <span className="relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FFF0E8] text-xs font-bold text-[#FF6B35] ring-1 ring-[#FF6B35]/20">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      {mapsUrl ? (
                        <button
                          type="button"
                          onClick={openStep}
                          className="w-full rounded-xl text-left transition-colors hover:bg-[#FFF8F3] active:bg-[#FFF0E8] -m-1.5 p-1.5"
                          aria-label={`Ouvrir ${title} dans Google Maps`}
                        >
                          {body}
                        </button>
                      ) : (
                        body
                      )}
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
