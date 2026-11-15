'use client'

import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { sanitizeUserFacingText } from '@waypop/shared'
import { PopImage } from '@/components/pop/PopImage'
import { WpRule } from '@/components/ui/WpRule'

export type PopStop = {
  id?: string
  title?: string | null
  note?: string | null
  photo?: string | null
  day_offset?: number | null
  moment?: string | null
  kind?: string | null
  meta?: {
    maps_url?: string
    lat?: number
    lng?: number
    [key: string]: unknown
  } | null
  places?: {
    name?: string
    meta?: Record<string, unknown> | null
  } | null
}

type DayGroup = { day: number; items: PopStop[] }

type Props = {
  days: DayGroup[]
  mapsUrl?: string | null
  launchHref?: string
}

const MOMENT_FR: Record<string, string> = {
  morning: 'Matin',
  afternoon: 'Après-midi',
  evening: 'Soir',
}

function stopMapsUrl(step: PopStop): string | null {
  if (step.meta?.maps_url) return String(step.meta.maps_url)
  const lat = step.meta?.lat
  const lng = step.meta?.lng
  if (typeof lat === 'number' && typeof lng === 'number') {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
  }
  const name = step.places?.name || step.title
  if (name) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`
  }
  return null
}

export function DayProgramme({ days, mapsUrl, launchHref }: Props) {
  const baseId = useId()
  const [active, setActive] = useState(days[0]?.day ?? 0)

  useEffect(() => {
    if (!days.some((d) => d.day === active) && days[0]) {
      setActive(days[0].day)
    }
  }, [days, active])

  const onKeyNav = (e: KeyboardEvent, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next =
      e.key === 'ArrowRight'
        ? Math.min(index + 1, days.length - 1)
        : Math.max(index - 1, 0)
    setActive(days[next]!.day)
    document.getElementById(`${baseId}-tab-${days[next]!.day}`)?.focus()
  }

  return (
    <section className="space-y-8" aria-labelledby={`${baseId}-heading`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-600">
            Programme
          </p>
          <h2
            id={`${baseId}-heading`}
            className="mt-2 text-2xl font-extrabold tracking-tight text-ink sm:text-[1.75rem]"
          >
            Jour par jour
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {launchHref ? (
            <a href={launchHref} className="wp-cta text-sm py-2.5">
              Lancer le Pop
            </a>
          ) : null}
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="wp-cta-ghost text-sm py-2.5"
            >
              Carte
            </a>
          ) : null}
        </div>
      </div>

      {days.length > 1 ? (
        <div
          role="tablist"
          aria-label="Jours du programme"
          className="flex gap-6 overflow-x-auto border-b border-line"
        >
          {days.map((d, i) => {
            const selected = d.day === active
            return (
              <button
                key={d.day}
                id={`${baseId}-tab-${d.day}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${baseId}-panel-${d.day}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(d.day)}
                onKeyDown={(e) => onKeyNav(e, i)}
                className={`relative shrink-0 pb-3 text-sm font-bold transition-colors ${
                  selected ? 'text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                Jour {d.day + 1}
                {selected ? (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-500" />
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}

      {days.map((d) => {
        const selected = d.day === active
        return (
          <div
            key={d.day}
            id={`${baseId}-panel-${d.day}`}
            role="tabpanel"
            aria-labelledby={`${baseId}-tab-${d.day}`}
            hidden={!selected}
            className={selected ? 'space-y-0' : 'hidden'}
          >
            <h3 className="sr-only">Jour {d.day + 1}</h3>
            <ol>
              {d.items.map((step, i) => {
                const maps = stopMapsUrl(step)
                const moment =
                  (step.moment && MOMENT_FR[step.moment]) ||
                  step.moment ||
                  `Stop ${i + 1}`
                const stopTitle = step.title || step.places?.name || 'Étape'
                const isLast = i === d.items.length - 1
                return (
                  <li key={step.id || `${d.day}-${i}`} className="relative">
                    <div className="grid gap-5 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-6">
                      <div className="relative hidden sm:block">
                        <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-sm font-extrabold text-ink">
                          {i + 1}
                        </span>
                        {!isLast ? (
                          <span
                            className="absolute left-5 top-10 h-[calc(100%-0.5rem)] w-px bg-line"
                            aria-hidden
                          />
                        ) : null}
                      </div>

                      <article className="pb-10">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-600">
                            <span className="sm:hidden">{i + 1} · </span>
                            {moment}
                          </p>
                          {maps ? (
                            <a
                              href={maps}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-bold no-underline hover:underline"
                            >
                              Itinéraire
                            </a>
                          ) : null}
                        </div>
                        <h4 className="mt-2 text-xl font-extrabold tracking-tight text-ink">
                          {stopTitle}
                        </h4>
                        {step.photo ? (
                          <div className="mt-4 overflow-hidden rounded-2xl">
                            <PopImage
                              src={step.photo}
                              alt=""
                              variant="stop"
                              className="h-48 sm:h-56"
                            />
                          </div>
                        ) : null}
                        {step.note ? (
                          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-ink-soft whitespace-pre-line">
                            {sanitizeUserFacingText(step.note, {
                              multiline: true,
                            })}
                          </p>
                        ) : null}
                        {!isLast ? <WpRule className="mt-8 sm:hidden" /> : null}
                      </article>
                    </div>
                  </li>
                )
              })}
            </ol>
          </div>
        )
      })}
    </section>
  )
}
