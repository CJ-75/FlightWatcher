import { useEffect, useState } from 'react'
import {
  buildItineraryMapsUrl,
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

function stepPhotos(it: ItineraryItem): string[] {
  const raw = it.meta?.photos
  const fromMeta = Array.isArray(raw)
    ? raw.map(String).filter(Boolean)
    : []
  if (fromMeta.length) return fromMeta.slice(0, 5)
  return it.photo ? [it.photo] : []
}

function PhotoLightbox({
  photos,
  index,
  title,
  onClose,
  onIndexChange,
}: {
  photos: string[]
  index: number
  title: string
  onClose: () => void
  onIndexChange: (i: number) => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onIndexChange(Math.max(0, index - 1))
      if (e.key === 'ArrowRight')
        onIndexChange(Math.min(photos.length - 1, index + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, onClose, onIndexChange, photos.length])

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-[#0E0A08]/96"
      role="dialog"
      aria-modal
      aria-label={`Photos — ${title}`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <p className="min-w-0 flex-1 truncate text-[15px] font-bold text-[#FFF8F3]">
          {title}
        </p>
        <span className="text-[13px] font-semibold text-[#FFF8F3]/70">
          {index + 1} / {photos.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/12 text-2xl leading-none text-[#FFF8F3]"
          aria-label="Fermer"
        >
          ×
        </button>
      </div>
      <button
        type="button"
        className="flex min-h-0 flex-1 items-center justify-center border-0 bg-transparent p-4"
        onClick={onClose}
      >
        <img
          src={photos[index]}
          alt=""
          className="max-h-full max-w-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </button>
      {photos.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto px-4 pb-4">
          {photos.map((uri, i) => (
            <button
              key={`${uri}-${i}`}
              type="button"
              onClick={() => onIndexChange(i)}
              className={`h-[52px] w-[52px] shrink-0 overflow-hidden rounded-[10px] border-2 p-0 ${
                i === index
                  ? 'border-[#FF6B35] opacity-100'
                  : 'border-transparent opacity-65'
              }`}
            >
              <img src={uri} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function ItineraryStepsTimeline({ items, onBookActivity }: Props) {
  const days = groupItemsByDay(items)
  const [lb, setLb] = useState<{
    photos: string[]
    index: number
    title: string
  } | null>(null)

  if (!days.length) {
    return <p className="text-sm text-[#A3988C]">Aucune étape pour l’instant.</p>
  }

  return (
    <div className="space-y-8">
      {days.map((day) => (
        <div key={day.dayOffset}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-base font-bold text-[#1A120E]">{day.label}</h3>
            {(() => {
              const dayMaps = buildItineraryMapsUrl(day.items)
              if (!dayMaps) return null
              const n = String(day.dayOffset + 1)
              return (
                <a
                  href={dayMaps}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#1A120E] py-1.5 pl-1.5 pr-3 no-underline"
                  aria-label={`Lancer le parcours ${day.label}`}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1A120E]">
                    <span
                      aria-hidden
                      className="ml-0.5 inline-block h-0 w-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-[#FFF8F3]"
                    />
                  </span>
                  <span className="text-xs font-bold text-[#FFF8F3]">
                    Parcours J{n}
                  </span>
                </a>
              )
            })()}
          </div>
          <ol className="space-y-3">
            {day.items.map((it, i) => {
              const title = it.title || it.places?.name || `Étape ${i + 1}`
              const dur = formatDurationMinutes(it.duration_minutes)
              const mapsUrl = buildItineraryStepMapsUrl(it)
              const photos = stepPhotos(it)
              const single = photos.length === 1 ? photos[0] : null
              const gallery = photos.length >= 2 ? photos : []
              const kindLine = [stepKindLabel(it.kind), dur]
                .filter(Boolean)
                .join(' · ')

              const openStep = () => {
                if (!mapsUrl) return
                window.open(mapsUrl, '_blank', 'noopener,noreferrer')
              }

              const row = (
                <div className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FFF0E8] text-xs font-bold text-[#FF6B35]">
                    {i + 1}
                  </span>
                  {single ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setLb({ photos, index: 0, title })
                      }}
                      className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl border-0 bg-[#EDE8E1] p-0"
                    >
                      <img
                        src={single}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#A3988C]">
                      {kindLine}
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
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onBookActivity?.(it)
                        }}
                        className="mt-2 text-xs font-bold text-[#FF6B35] hover:underline"
                      >
                        Réserver
                      </button>
                    ) : null}
                  </div>
                </div>
              )

              return (
                <li key={it.id || `${day.dayOffset}-${i}`}>
                  <article className="rounded-2xl bg-white p-3.5 shadow-[0_6px_18px_rgba(92,46,24,0.07)]">
                    {mapsUrl ? (
                      <button
                        type="button"
                        onClick={openStep}
                        className="w-full rounded-xl text-left transition-opacity hover:opacity-80"
                        aria-label={`Ouvrir ${title} dans Google Maps`}
                      >
                        {row}
                      </button>
                    ) : (
                      row
                    )}
                    {gallery.length ? (
                      <div className="mt-3 flex gap-2 overflow-x-auto">
                        {gallery.map((uri, pi) => (
                          <button
                            key={`${uri}-${pi}`}
                            type="button"
                            onClick={() =>
                              setLb({ photos, index: pi, title })
                            }
                            className="h-24 w-24 shrink-0 overflow-hidden rounded-[14px] border-0 bg-[#EDE8E1] p-0"
                          >
                            <img
                              src={uri}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </article>
                </li>
              )
            })}
          </ol>
        </div>
      ))}

      {lb ? (
        <PhotoLightbox
          photos={lb.photos}
          index={lb.index}
          title={lb.title}
          onClose={() => setLb(null)}
          onIndexChange={(i) =>
            setLb((prev) => (prev ? { ...prev, index: i } : prev))
          }
        />
      ) : null}
    </div>
  )
}
