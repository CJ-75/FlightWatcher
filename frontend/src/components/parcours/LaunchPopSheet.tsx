import { useEffect } from 'react'
import type { ItineraryItem, LaunchPopLeg, LaunchPopPlan } from '@waypop/shared'
import {
  buildLaunchPopPlan,
  mapsOriginFromCoords,
  withMapsDirOrigin,
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

function openMaps(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function persistResume(itineraryId: string | undefined, dayOffset: number) {
  if (!itineraryId) return
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
  if (!navigator.geolocation) return Promise.resolve(null)
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

/** Fast cached/coarse fix first; refine only if needed. Never overwrite a good fix with null. */
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
    openMaps(leg.mapsUrl)
    return
  }
  const cached = peekCachedOrigin()
  if (cached) {
    openMaps(withMapsDirOrigin(leg.mapsUrl, cached))
    void readBrowserCoords()
    return
  }
  // Keep gesture → open sync, then navigate once GPS resolves (no Current Location flash).
  const win = window.open('about:blank', '_blank')
  void resolveLegMapsUrl(leg).then((url) => {
    if (win && !win.closed) win.location.href = url
    else openMaps(url)
  })
}

function PlayIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={`block translate-x-[0.5px] ${className}`}
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
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
          isTransit ? 'bg-[#2F6FAE]' : 'bg-ink'
        }`}
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`text-[10px] font-bold uppercase tracking-[0.08em] ${
            isTransit ? 'text-[#2F6FAE]' : 'text-[#8A7B6E]'
          }`}
        >
          {isTransit ? 'Transports' : 'À pied'}
        </p>
        <p className="mt-0.5 text-sm font-extrabold text-ink">
          {leg.title}
          {leg.durationLabel ? (
            <span className="ml-1 text-[12px] font-semibold text-muted">
              · {leg.durationLabel}
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-[12px] font-medium text-muted">{leg.subtitle}</p>
        {leg.kind === 'walk' && leg.preview !== leg.subtitle ? (
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[#8A7B6E]">
            {leg.preview}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => {
          persistResume(itineraryId, dayOffset)
          openLegMaps(leg)
        }}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-bold text-white ${
          isTransit ? 'bg-[#2F6FAE] hover:bg-[#255f96]' : 'bg-ink hover:bg-black'
        }`}
      >
        <PlayIcon />
        {leg.ctaLabel}
      </button>
    </div>
  )
}

/**
 * Sheet « Lancer le Pop » — transit puis marche par jour / segment.
 */
export function LaunchPopSheet({
  open,
  title,
  items,
  itineraryId,
  onClose,
}: Props) {
  useEffect(() => {
    if (open) prefetchBrowserCoords()
  }, [open])

  if (!open) return null
  const plan: LaunchPopPlan = buildLaunchPopPlan(items)

  return (
    <div className="app-dialog-root items-end sm:items-center">
      <button
        type="button"
        aria-label="Fermer"
        className="app-dialog-backdrop"
        onClick={onClose}
      />
      <div className="app-dialog-panel w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white/95 px-5 py-4 backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-bold text-muted"
          >
            Fermer
          </button>
          <h3 className="text-base font-extrabold text-ink">Lancer le Pop</h3>
          <span className="w-14" />
        </div>

        <div className="space-y-5 px-5 py-5">
          {title ? <p className="text-sm text-muted">{title}</p> : null}
          <p className="rounded-2xl bg-[#FFF7F2] px-3.5 py-3 text-[13px] leading-snug text-[#5C4F44]">
            D’abord rejoins le quartier en transports, puis lance les stops à
            pied.
          </p>

          {!plan.days.length ? (
            <p className="text-sm font-semibold text-muted">
              Aucun stop à lancer pour ce Pop.
            </p>
          ) : null}

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
                      <span className="ml-2 text-[11px] font-bold text-[#E85A28]">
                        Aujourd’hui
                      </span>
                    ) : null}
                  </h4>
                  <span className="text-[12px] font-semibold text-muted">
                    {day.stopCount} stop{day.stopCount > 1 ? 's' : ''}
                  </span>
                </div>

                {day.segments.map((seg) => (
                  <div key={seg.id} className="mb-3 space-y-2.5 last:mb-0">
                    {day.segments.length > 1 ? (
                      <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
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
