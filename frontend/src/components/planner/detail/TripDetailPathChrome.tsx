import { useEffect, useState, type ReactNode } from 'react'
import {
  TRIP_DETAIL_TABS,
  trackTripTabViewed,
  type TripDetailTabId,
  type TripPrimaryAction,
} from '@flightwatcher/shared'
import { getApiClient } from '../../../utils/apiClient'

type Props = {
  tripId: string
  heroUrl: string
  title: string
  metaLine: string
  phaseLabel: string
  primary: TripPrimaryAction
  onPrimary: () => void
  onBack: () => void
  onShare?: () => void
  onMore?: () => void
  groupRow: ReactNode
  apercu: ReactNode
  programme: ReactNode
  carnet: ReactNode
  estimatedTotalLabel?: string | null
}

/**
 * Path skin chrome: hero + sheet + tabs + sticky primary CTA.
 */
export function TripDetailPathChrome({
  tripId,
  heroUrl,
  title,
  metaLine,
  phaseLabel,
  primary,
  onPrimary,
  onBack,
  onShare,
  onMore,
  groupRow,
  apercu,
  programme,
  carnet,
  estimatedTotalLabel,
}: Props) {
  const [tab, setTab] = useState<TripDetailTabId>('apercu')

  useEffect(() => {
    void trackTripTabViewed((body) => getApiClient().trackActivityEvent(body), {
      tripId,
      variant: 'v2',
      tab,
      platform: 'web',
    })
  }, [tab, tripId])

  const body =
    tab === 'apercu' ? apercu : tab === 'programme' ? programme : carnet

  return (
    <div className="relative w-full pb-28">
      <section className="relative isolate min-h-[min(38vh,320px)] overflow-hidden">
        <img
          src={heroUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#140c08] via-[#140c08]/45 to-black/30" />
        <div className="relative flex min-h-[min(38vh,320px)] flex-col justify-between p-5 sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-lg font-bold text-white backdrop-blur-md ring-1 ring-white/25"
              aria-label="Retour"
            >
              ←
            </button>
            <div className="flex items-center gap-2">
              {onShare ? (
                <button
                  type="button"
                  onClick={onShare}
                  className="inline-flex h-11 items-center rounded-full bg-white/15 px-4 text-sm font-bold text-white backdrop-blur-md ring-1 ring-white/25"
                >
                  Partager
                </button>
              ) : null}
              {onMore ? (
                <button
                  type="button"
                  onClick={onMore}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md ring-1 ring-white/25"
                  aria-label="Plus"
                >
                  ⋯
                </button>
              ) : null}
            </div>
          </div>
          <div className="space-y-2 pb-8">
            <span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white/90 backdrop-blur-md ring-1 ring-white/20">
              {phaseLabel}
            </span>
            <h1
              className="text-3xl font-semibold italic tracking-tight text-white sm:text-4xl"
              style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}
            >
              {title}
            </h1>
            <p className="text-sm font-medium text-white/75">{metaLine}</p>
          </div>
        </div>
      </section>

      <div className="relative z-[1] -mt-6 rounded-t-[28px] bg-[#FFF9F5] px-4 pb-6 pt-5 sm:px-6">
        <div className="mb-4">{groupRow}</div>
        <div
          role="tablist"
          aria-label="Sections du voyage"
          className="mb-5 flex gap-1 border-b border-orange-100"
        >
          {TRIP_DETAIL_TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={`relative flex-1 px-2 py-3 text-sm font-bold transition-colors ${
                  active ? 'text-[#1A120E]' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {t.label}
                {active ? (
                  <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[#FF6B35]" />
                ) : null}
              </button>
            )
          })}
        </div>
        <div role="tabpanel">{body}</div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-orange-100/80 bg-[#FFF9F5]/95 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          {estimatedTotalLabel ? (
            <p className="min-w-0 flex-1 text-sm font-bold text-[#1A120E]">
              {estimatedTotalLabel}
            </p>
          ) : (
            <span className="flex-1" />
          )}
          {primary.informational ? (
            <p className="max-w-[60%] text-right text-sm font-semibold text-slate-500">
              {primary.label}
            </p>
          ) : (
            <button
              type="button"
              onClick={onPrimary}
              className="inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-full bg-[#1A120E] px-6 text-sm font-extrabold text-white shadow-lg hover:bg-black"
            >
              {primary.label}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
