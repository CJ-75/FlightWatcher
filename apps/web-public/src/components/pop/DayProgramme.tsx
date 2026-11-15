'use client'

import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { sanitizeUserFacingText } from '@waypop/shared'
import { Card } from '@/components/ui/Card'

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
    const el = document.getElementById(`${baseId}-tab-${days[next]!.day}`)
    el?.focus()
  }

  return (
    <section className="space-y-5" aria-labelledby={`${baseId}-heading`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2
          id={`${baseId}-heading`}
          className="text-xl font-extrabold text-ink"
        >
          Le programme
        </h2>
        <div className="flex flex-wrap gap-2">
          {launchHref ? (
            <a href={launchHref} className="app-btn-primary no-underline text-sm py-2.5 px-4">
              Lancer le Pop
            </a>
          ) : null}
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-2xl border border-line bg-white px-4 py-2.5 text-sm font-bold text-ink no-underline hover:bg-primary-50"
            >
              Voir sur la carte
            </a>
          ) : null}
        </div>
      </div>

      {days.length > 1 ? (
        <div
          role="tablist"
          aria-label="Jours du programme"
          className="flex gap-2 overflow-x-auto pb-1"
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
                className={`shrink-0 rounded-pill px-4 py-2 text-sm font-bold transition-colors ${
                  selected
                    ? 'bg-ink text-[color:var(--fw-primary-fg)]'
                    : 'bg-white text-ink border border-line hover:bg-primary-50'
                }`}
              >
                Jour {d.day + 1}
              </button>
            )
          })}
        </div>
      ) : null}

      {/* All days in HTML for SEO — tabs only hide/show */}
      {days.map((d) => {
        const selected = d.day === active
        return (
          <div
            key={d.day}
            id={`${baseId}-panel-${d.day}`}
            role="tabpanel"
            aria-labelledby={`${baseId}-tab-${d.day}`}
            hidden={!selected}
            className={selected ? 'space-y-4' : 'hidden'}
          >
            <h3 className="text-lg font-bold text-ink">Jour {d.day + 1}</h3>
            <ol className="relative space-y-4 border-l-2 border-line pl-5">
              {d.items.map((step, i) => {
                const maps = stopMapsUrl(step)
                const moment =
                  (step.moment && MOMENT_FR[step.moment]) ||
                  step.moment ||
                  `Stop ${i + 1}`
                return (
                  <li key={step.id || `${d.day}-${i}`} className="relative">
                    <span
                      className="absolute -left-[1.65rem] top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary-500 text-[11px] font-extrabold text-white"
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <Card className="overflow-hidden p-0">
                      {step.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={step.photo}
                          alt=""
                          className="h-40 w-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                      <div className="space-y-2 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-primary-700">
                          {moment}
                          {step.kind ? ` · ${step.kind}` : ''}
                        </p>
                        <p className="font-extrabold text-ink text-lg">
                          {step.title || step.places?.name || 'Étape'}
                        </p>
                        {step.note ? (
                          <p className="text-sm text-muted leading-relaxed whitespace-pre-line">
                            {sanitizeUserFacingText(step.note, {
                              multiline: true,
                            })}
                          </p>
                        ) : null}
                        {maps ? (
                          <a
                            href={maps}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block text-sm font-bold no-underline hover:underline"
                          >
                            Itinéraire →
                          </a>
                        ) : null}
                      </div>
                    </Card>
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
