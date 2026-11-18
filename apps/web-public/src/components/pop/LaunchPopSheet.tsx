'use client'

import { useEffect, useMemo } from 'react'
import {
  buildLaunchPopPlan,
  mapsOriginFromCoords,
  withMapsDirOrigin,
  type ItineraryItem,
  type LaunchPopLeg,
  type LaunchPopPlan,
} from '@waypop/shared'

type Props = {
  open: boolean
  title?: string
  items: ItineraryItem[]
  itineraryId?: string
  onClose: () => void
}

const GEO_CACHE_MS = 120_000
let cachedOrigin: { value: string; at: number } | null = null
let inflightOrigin: Promise<string | null> | null = null

function persistResume(itineraryId: string | undefined, dayOffset: number) {
  if (!itineraryId || typeof window === 'undefined') return
  try {
    localStorage.setItem(
      `fw_launch_pop:${itineraryId}`,
      JSON.stringify({ lastDay: dayOffset, at: Date.now() }),
    )
  } catch {
    /* ignore */
  }
}

function peekCachedOrigin(): string | null {
  if (cachedOrigin && Date.now() - cachedOrigin.at < GEO_CACHE_MS) {
    return cachedOrigin.value
  }
  return null
}

function rememberOrigin(value: string) {
  cachedOrigin = { value, at: Date.now() }
}

function geolocateOnce(options: PositionOptions): Promise<string | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const value = mapsOriginFromCoords(
          pos.coords.latitude,
          pos.coords.longitude,
        )
        rememberOrigin(value)
        resolve(value)
      },
      () => resolve(null),
      options,
    )
  })
}

async function readBrowserCoords(): Promise<string | null> {
  const cached = peekCachedOrigin()
  if (cached) return cached
  if (inflightOrigin) return inflightOrigin

  inflightOrigin = (async () => {
    const quick = await geolocateOnce({
      enableHighAccuracy: false,
      timeout: 2500,
      maximumAge: GEO_CACHE_MS,
    })
    if (quick) return quick
    return geolocateOnce({
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 30_000,
    })
  })().finally(() => {
    inflightOrigin = null
  })

  return inflightOrigin
}

function prefetchBrowserCoords() {
  void readBrowserCoords()
}

async function resolveLegMapsUrl(leg: LaunchPopLeg): Promise<string> {
  if (leg.kind !== 'transit') return leg.mapsUrl
  const origin = peekCachedOrigin() || (await readBrowserCoords())
  return origin ? withMapsDirOrigin(leg.mapsUrl, origin) : leg.mapsUrl
}

function openLegMaps(leg: LaunchPopLeg) {
  if (leg.kind !== 'transit') {
    window.open(leg.mapsUrl, '_blank', 'noopener,noreferrer')
    return
  }
  const cached = peekCachedOrigin()
  if (cached) {
    window.open(
      withMapsDirOrigin(leg.mapsUrl, cached),
      '_blank',
      'noopener,noreferrer',
    )
    void readBrowserCoords()
    return
  }
  const win = window.open('about:blank', '_blank')
  void resolveLegMapsUrl(leg).then((url) => {
    if (win && !win.closed) win.location.href = url
    else window.open(url, '_blank', 'noopener,noreferrer')
  })
}

function PlayIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="block translate-x-[0.5px]"
    >
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z" />
    </svg>
  )
}

function LegRow({
  leg,
  index,
  itineraryId,
  dayOffset,
}: {
  leg: LaunchPopLeg
  index: number
  itineraryId?: string
  dayOffset: number
}) {
  const isTransit = leg.kind === 'transit'
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-3 py-3 ${
        isTransit
          ? 'border-[#B7D0E8] bg-[#EAF3FB]'
          : 'border-transparent bg-[#F7F4EF]'
      }`}
    >
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-cream ${
          isTransit ? 'bg-[#2F6FAE]' : 'bg-ink'
        }`}
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`text-[10px] font-bold uppercase tracking-[0.08em] ${
            isTransit ? 'text-[#2F6FAE]' : 'text-ink-muted'
          }`}
        >
          {isTransit ? 'Transports' : 'À pied'}
        </p>
        <p className="mt-0.5 text-sm font-extrabold text-ink">
          {leg.title}
          {leg.durationLabel ? (
            <span className="ml-1 text-[12px] font-semibold text-ink-muted">
              · {leg.durationLabel}
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-[12px] font-medium text-ink-muted">
          {leg.subtitle}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          persistResume(itineraryId, dayOffset)
          openLegMaps(leg)
        }}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-bold text-cream ${
          isTransit ? 'bg-[#2F6FAE] hover:bg-[#255f96]' : 'bg-ink hover:bg-[#2a2724]'
        }`}
      >
        <PlayIcon />
        {leg.ctaLabel}
      </button>
    </div>
  )
}

export function LaunchPopSheet({
  open,
  title,
  items,
  itineraryId,
  onClose,
}: Props) {
  const plan: LaunchPopPlan = useMemo(
    () => buildLaunchPopPlan(items),
    [items],
  )

  useEffect(() => {
    if (open) prefetchBrowserCoords()
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
      />
      <div className="relative z-[1] max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-cream shadow-soft sm:max-w-lg sm:rounded-[28px]">
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-cream/95 px-5 py-4 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-bold text-ink-muted"
          >
            Fermer
          </button>
          <h3 className="text-base font-extrabold text-ink">Lancer le Pop</h3>
          <span className="w-14" />
        </div>

        <div className="space-y-5 px-5 py-5">
          {title ? <p className="text-sm text-ink-muted">{title}</p> : null}
          <p className="rounded-2xl bg-accent-soft/60 px-3.5 py-3 text-[13px] leading-snug text-ink">
            D’abord rejoins le quartier en transports, puis lance les stops à
            pied.
          </p>

          {plan.days.map((day) => {
            let stepIndex = 0
            return (
              <section
                key={day.dayOffset}
                className={`rounded-2xl border px-4 py-3.5 ${
                  day.isToday
                    ? 'border-[rgba(255,107,53,0.35)] bg-[#FFF7F2]'
                    : 'border-line bg-white'
                }`}
              >
                <div className="mb-3 flex items-baseline justify-between gap-2">
                  <h4 className="text-sm font-extrabold text-ink">
                    {day.label}
                    {day.isToday ? (
                      <span className="ml-2 text-[11px] font-bold text-accent">
                        Aujourd’hui
                      </span>
                    ) : null}
                  </h4>
                  <span className="text-[12px] font-semibold text-ink-muted">
                    {day.stopCount} stop{day.stopCount > 1 ? 's' : ''}
                  </span>
                </div>

                {day.segments.map((seg) => (
                  <div key={seg.id} className="mb-3 space-y-2.5 last:mb-0">
                    {day.segments.length > 1 ? (
                      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
                        {seg.label} · {seg.stopCount} stops
                      </p>
                    ) : null}
                    {seg.legs.map((leg) => {
                      const index = stepIndex
                      stepIndex += 1
                      return (
                        <LegRow
                          key={leg.id}
                          leg={leg}
                          index={index}
                          itineraryId={itineraryId}
                          dayOffset={day.dayOffset}
                        />
                      )
                    })}
                  </div>
                ))}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
