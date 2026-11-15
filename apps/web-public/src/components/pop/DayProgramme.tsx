'use client'

import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { formatDurationMinutes, sanitizeUserFacingText } from '@waypop/shared'
import { StopVisual } from '@/components/pop/StopVisual'
import { WpEyebrow } from '@/components/ui/WpEyebrow'
import { WpRule } from '@/components/ui/WpRule'
import { pickExclusivePhoto } from '@/lib/popPhotos'

export type PopStop = {
  id?: string
  title?: string | null
  note?: string | null
  photo?: string | null
  place_id?: string | null
  photo_source?: string | null
  photo_license?: string | null
  day_offset?: number | null
  moment?: string | null
  kind?: string | null
  meta?: {
    maps_url?: string
    lat?: number
    lng?: number
    travel_minutes?: number
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
  cityLabel: string
  colorKey?: string | null
  city?: string
  coverImage?: string | null
  h2?: string
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

export function DayProgramme({
  days,
  mapsUrl,
  launchHref,
  cityLabel,
  colorKey,
  city,
  coverImage,
  h2,
}: Props) {
  const baseId = useId()
  const [active, setActive] = useState(days[0]?.day ?? 0)

  useEffect(() => {
    if (!days.some((d) => d.day === active) && days[0]) {
      setActive(days[0].day)
    }
  }, [days, active])

  const exclusiveByStop = (() => {
    const used = new Set<string>()
    pickExclusivePhoto(coverImage, used)
    const map = new Map<string, string | null>()
    for (const d of days) {
      d.items.forEach((step, idx) => {
        const key = String(step.id || `${d.day}-${idx}`)
        map.set(key, pickExclusivePhoto(step.photo, used))
      })
    }
    return map
  })()

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
          <WpEyebrow>Programme</WpEyebrow>
          <h2
            id={`${baseId}-heading`}
            className="mt-2 text-2xl font-extrabold tracking-tight text-ink sm:text-[1.75rem]"
          >
            {h2 || `Programme à ${cityLabel}`}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {launchHref ? (
            <a href={launchHref} className="wp-cta-ghost text-sm py-2.5">
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
          className="flex flex-wrap gap-x-6 gap-y-2 border-b border-line"
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
                const travel = formatDurationMinutes(
                  typeof step.meta?.travel_minutes === 'number'
                    ? step.meta.travel_minutes
                    : null,
                )
                const exclusive =
                  exclusiveByStop.get(String(step.id || `${d.day}-${i}`)) ??
                  null
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
                        {travel && i > 0 ? (
                          <p className="mb-3 text-xs font-semibold text-muted">
                            ≈ {travel} depuis le stop précédent
                          </p>
                        ) : null}
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

                        {/* Mobile: title then photo. Desktop: photo 176×128 + text */}
                        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
                          <div className="order-2 w-full sm:order-1 sm:w-auto">
                            <div className="sm:hidden">
                              <StopVisual
                                photo={exclusive}
                                title={stopTitle}
                                colorKey={colorKey}
                                city={city}
                                layout="stack"
                                photoSource={step.photo_source}
                                photoLicense={step.photo_license}
                              />
                            </div>
                            <div className="hidden sm:block">
                              <StopVisual
                                photo={exclusive}
                                title={stopTitle}
                                colorKey={colorKey}
                                city={city}
                                layout="row"
                                photoSource={step.photo_source}
                                photoLicense={step.photo_license}
                              />
                            </div>
                          </div>
                          <div className="order-1 min-w-0 flex-1 sm:order-2">
                            <h4 className="text-xl font-extrabold tracking-tight text-ink">
                              {stopTitle}
                            </h4>
                            {step.note ? (
                              <p className="mt-2 text-[15px] leading-relaxed text-ink-soft whitespace-pre-line">
                                {sanitizeUserFacingText(step.note, {
                                  multiline: true,
                                })}
                              </p>
                            ) : null}
                          </div>
                        </div>

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
