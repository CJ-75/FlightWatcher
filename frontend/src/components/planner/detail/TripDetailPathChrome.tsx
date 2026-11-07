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
  /** Soft chips under the title (ex. France · Voyage · Vol choisi) */
  metaChips?: string[]
  phaseLabel: string
  primary: TripPrimaryAction
  onPrimary: () => void
  onBack: () => void
  onShare?: () => void
  onMore?: () => void
  onSave?: () => void
  /** Avatar URL for organizer / guide row */
  guideAvatarUrl?: string | null
  guideName?: string | null
  guideSubtitle?: string | null
  groupRow?: ReactNode
  apercu: ReactNode
  programme: ReactNode
  carnet: ReactNode
  /** Quick “Inside” chips — Path-style icon row */
  insideChips?: {
    label: string
    icon?: string
    tab?: TripDetailTabId
    onClick?: () => void
  }[]
}

const SERIF = '"Instrument Serif", "Times New Roman", Georgia, serif'

/**
 * Path skin chrome — closer to the Parisian Romance detail reference.
 */
export function TripDetailPathChrome({
  tripId,
  heroUrl,
  title,
  metaLine,
  metaChips,
  phaseLabel,
  primary,
  onPrimary,
  onBack,
  onShare,
  onMore,
  onSave,
  guideAvatarUrl,
  guideName,
  guideSubtitle,
  groupRow,
  apercu,
  programme,
  carnet,
  insideChips,
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

  const chips =
    metaChips && metaChips.length
      ? metaChips
      : [phaseLabel].filter(Boolean)

  return (
    <div className="relative w-full bg-[#F7F4EF] pb-10 lg:-mx-6 lg:w-[calc(100%+3rem)] xl:-mx-8 xl:w-[calc(100%+4rem)]">
      {/* Hero — full width of the planner column on desktop */}
      <section className="relative isolate min-h-[min(52vh,440px)] overflow-hidden lg:min-h-[min(48vh,520px)] lg:rounded-b-none">
        <img
          src={heroUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-[1.02] object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

        <div className="relative mx-auto flex min-h-[min(52vh,440px)] w-full max-w-6xl flex-col justify-between px-5 pb-14 pt-4 sm:px-8 lg:min-h-[min(48vh,520px)] lg:px-10 lg:pb-16">
          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-base text-white shadow-sm backdrop-blur-xl ring-1 ring-white/30"
              aria-label="Retour"
            >
              ←
            </button>
            <div className="flex items-center gap-2">
              {onShare ? (
                <button
                  type="button"
                  onClick={onShare}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-xl ring-1 ring-white/30 lg:h-11 lg:w-auto lg:gap-2 lg:px-4"
                  aria-label="Partager"
                >
                  <span>↗</span>
                  <span className="hidden text-sm font-semibold lg:inline">
                    Partager
                  </span>
                </button>
              ) : null}
              {onMore ? (
                <button
                  type="button"
                  onClick={onMore}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-xl ring-1 ring-white/30"
                  aria-label="Plus"
                >
                  ⋯
                </button>
              ) : null}
            </div>
          </div>

          <div className="max-w-3xl space-y-3">
            <div className="flex items-end justify-between gap-3">
              <h1
                className="max-w-[90%] text-[2.35rem] font-normal leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl lg:text-6xl"
                style={{ fontFamily: SERIF, fontStyle: 'italic' }}
              >
                {title}
              </h1>
              {onSave ? (
                <button
                  type="button"
                  onClick={onSave}
                  className="mb-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg text-white backdrop-blur-xl ring-1 ring-white/30"
                  aria-label="Enregistrer"
                >
                  ♡
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-white/85 lg:text-sm">
              {chips.map((c, i) => (
                <span key={`${c}-${i}`} className="inline-flex items-center gap-2">
                  {i > 0 ? (
                    <span className="text-white/40" aria-hidden>
                      ·
                    </span>
                  ) : null}
                  <span>{c}</span>
                </span>
              ))}
            </div>
            {metaLine && chips.join(' · ') !== metaLine ? (
              <p className="text-xs font-medium text-white/55 lg:text-sm">
                {metaLine}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* Sheet overlapping hero */}
      <div className="relative z-[1] -mt-8 rounded-t-[32px] bg-white px-5 pb-8 pt-5 shadow-[0_-8px_40px_rgba(20,12,8,0.12)] sm:px-8 lg:-mt-10 lg:rounded-t-[40px] lg:px-10 lg:pb-12 lg:pt-8">
        <div className="mx-auto w-full max-w-6xl">
          {/* Guide / organizer row */}
          {(guideName || groupRow) && (
            <div className="mb-5 flex items-center justify-between gap-3 lg:mb-7">
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-[#EDE8E1] ring-2 ring-white lg:h-12 lg:w-12">
                  {guideAvatarUrl ? (
                    <img
                      src={guideAvatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-sm font-bold text-[#6B5C50]">
                      {(guideName || '?').slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#1A120E] lg:text-base">
                    {guideName || 'Organisateur'}
                  </p>
                  <p className="truncate text-xs text-[#8A7B6E] lg:text-sm">
                    {guideSubtitle || 'Organisateur du voyage'}
                  </p>
                </div>
              </div>
              {onShare ? (
                <button
                  type="button"
                  onClick={onShare}
                  className="shrink-0 rounded-full bg-[#1A120E] px-3.5 py-2 text-xs font-bold text-white lg:px-5 lg:py-2.5 lg:text-sm"
                >
                  Inviter
                </button>
              ) : null}
            </div>
          )}
          {groupRow && !guideName ? <div className="mb-4">{groupRow}</div> : null}

          <div
            role="tablist"
            aria-label="Sections du voyage"
            className="mb-5 flex gap-5 border-b border-[#EDE8E1] lg:mb-7 lg:gap-8"
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
                  className={`relative pb-3 text-[13px] font-semibold tracking-tight transition-colors lg:pb-4 lg:text-sm ${
                    active
                      ? 'text-[#1A120E]'
                      : 'text-[#A3988C] hover:text-[#6B5C50]'
                  }`}
                >
                  {t.label}
                  {active ? (
                    <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[#1A120E]" />
                  ) : null}
                </button>
              )
            })}
          </div>

          {tab === 'apercu' && insideChips && insideChips.length > 0 ? (
            <div className="mb-6 grid max-w-xl grid-cols-4 gap-2 lg:mb-8 lg:max-w-2xl lg:gap-3">
              {insideChips.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => {
                    if (chip.tab) setTab(chip.tab)
                    chip.onClick?.()
                  }}
                  className="flex flex-col items-center gap-2 rounded-2xl bg-[#F7F4EF] px-1 py-3 text-center transition hover:bg-[#EFEAE3] lg:py-4"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-base shadow-sm ring-1 ring-black/5 lg:h-11 lg:w-11">
                    {chip.icon || chip.label.slice(0, 1)}
                  </span>
                  <span className="text-[10px] font-semibold leading-tight text-[#5C4F44] lg:text-xs">
                    {chip.label}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <div role="tabpanel" className="min-h-[40vh]">
            {body}
          </div>

          {!primary.informational ? (
            <div className="mt-8 flex justify-end border-t border-[#EDE8E1] pt-6">
              <button
                type="button"
                onClick={onPrimary}
                className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-[#1A120E] px-7 text-[15px] font-semibold text-white transition hover:bg-black"
              >
                {primary.label}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
