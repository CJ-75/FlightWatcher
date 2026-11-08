import { useEffect, useState, type ReactNode } from 'react'
import {
  TRIP_DETAIL_TABS,
  trackTripTabViewed,
  type TripDetailTabId,
  type TripPrimaryAction,
} from '@flightwatcher/shared'
import { getApiClient } from '../../../utils/apiClient'
import { HotelPhotoGallery } from '../../HotelPhotoGallery'

type HotelHero = {
  hotelId: string
  hotelName: string
  seedPhoto?: string | null
  seedPhotos?: string[]
}

type Props = {
  tripId: string
  heroUrl: string
  /** City shown as the hero headline */
  city: string
  /** When set, hero becomes a sliding hotel photo gallery */
  hotelHero?: HotelHero | null
  metaChips?: string[]
  phaseLabel: string
  primary: TripPrimaryAction
  onPrimary: () => void
  onBack: () => void
  onShare?: () => void
  onRename?: () => void
  titleEditing?: boolean
  titleDraft?: string
  onTitleDraftChange?: (value: string) => void
  onTitleSave?: () => void
  onTitleCancel?: () => void
  titleSaving?: boolean
  guideAvatarUrl?: string | null
  guideName?: string | null
  guideSubtitle?: string | null
  apercu: ReactNode
  programme: ReactNode
  voyageurs: ReactNode
  estimatedTotalLabel?: string | null
  initialTab?: TripDetailTabId
  activeTab?: TripDetailTabId
  onTabChange?: (tab: TripDetailTabId) => void
}

const SERIF = '"Instrument Serif", "Times New Roman", Georgia, serif'

function PencilIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

/**
 * Path chrome — V0.2 visual language (serif hero, cream sheet) +
 * hotel carousel, rename, voyageurs, sticky CTA.
 */
export function TripDetailPathChrome({
  tripId,
  heroUrl,
  city,
  hotelHero,
  metaChips,
  phaseLabel,
  primary,
  onPrimary,
  onBack: _onBack,
  onShare,
  onRename,
  titleEditing,
  titleDraft,
  onTitleDraftChange,
  onTitleSave,
  onTitleCancel,
  titleSaving,
  guideAvatarUrl,
  guideName,
  guideSubtitle,
  apercu,
  programme,
  voyageurs,
  estimatedTotalLabel,
  initialTab = 'apercu',
  activeTab,
  onTabChange,
}: Props) {
  const [tabInternal, setTabInternal] = useState<TripDetailTabId>(initialTab)
  const tab = activeTab ?? tabInternal
  const setTab = (next: TripDetailTabId) => {
    onTabChange?.(next)
    if (activeTab == null) setTabInternal(next)
  }

  useEffect(() => {
    void trackTripTabViewed((body) => getApiClient().trackActivityEvent(body), {
      tripId,
      variant: 'v2',
      tab,
      platform: 'web',
    })
  }, [tab, tripId])

  const body =
    tab === 'programme'
      ? programme
      : tab === 'voyageurs'
        ? voyageurs
        : apercu
  const chips = (metaChips || []).filter(Boolean)

  const heroCopy = (
    <div className="max-w-3xl space-y-3">
      <span className="inline-flex rounded-full bg-white/18 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/90 backdrop-blur-md ring-1 ring-white/25">
        {phaseLabel}
      </span>
      {titleEditing ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            onTitleSave?.()
          }}
        >
          <input
            autoFocus
            value={titleDraft ?? ''}
            onChange={(e) => onTitleDraftChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                onTitleCancel?.()
              }
            }}
            maxLength={80}
            disabled={titleSaving}
            className="min-w-0 flex-1 rounded-xl border border-white/25 bg-white/10 px-3.5 py-2 text-2xl font-normal italic tracking-tight text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 sm:text-3xl"
            style={{ fontFamily: SERIF }}
            placeholder="Nom du voyage"
            aria-label="Nom du voyage"
          />
          <button
            type="submit"
            disabled={titleSaving}
            className="min-h-[40px] rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-[#1A120E] disabled:opacity-60"
          >
            {titleSaving ? '…' : 'OK'}
          </button>
          <button
            type="button"
            disabled={titleSaving}
            onClick={onTitleCancel}
            className="min-h-[40px] rounded-xl border border-white/25 bg-white/10 px-3.5 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Annuler
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <h1
            className="max-w-[90%] text-[2.35rem] font-normal leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl lg:text-6xl"
            style={{ fontFamily: SERIF, fontStyle: 'italic' }}
          >
            {city}
          </h1>
          {onRename ? (
            <button
              type="button"
              onClick={onRename}
              aria-label="Renommer"
              title="Renommer"
              className="mb-1.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white ring-1 ring-white/30 backdrop-blur-xl hover:bg-white/30"
            >
              <PencilIcon />
            </button>
          ) : null}
        </div>
      )}
      {chips.length > 0 ? (
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
      ) : null}
    </div>
  )

  return (
    <div className="relative w-full bg-[#F7F4EF] pb-24 lg:-mx-6 lg:w-[calc(100%+3rem)] xl:-mx-8 xl:w-[calc(100%+4rem)]">
      <section className="relative isolate min-h-[min(52vh,440px)] overflow-hidden lg:min-h-[min(48vh,520px)]">
        {hotelHero ? (
          <div className="absolute inset-0">
            <HotelPhotoGallery
              variant="hero"
              className="h-full min-h-full w-full"
              hotelId={hotelHero.hotelId}
              seedPhoto={hotelHero.seedPhoto || heroUrl}
              seedPhotos={
                hotelHero.seedPhotos?.length
                  ? hotelHero.seedPhotos
                  : [hotelHero.seedPhoto || heroUrl].filter(Boolean)
              }
              alt={hotelHero.hotelName}
              hotelName={hotelHero.hotelName}
              cityLabel={city}
              overlay={
                <div className="mx-auto w-full max-w-6xl px-5 pb-16 pt-4 sm:px-8 lg:px-10 lg:pb-20">
                  {heroCopy}
                </div>
              }
            />
          </div>
        ) : (
          <>
            <img
              src={heroUrl}
              alt=""
              aria-hidden
              fetchPriority="high"
              decoding="async"
              className="absolute inset-0 h-full w-full scale-[1.02] object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
            <div className="relative mx-auto flex min-h-[min(52vh,440px)] w-full max-w-6xl flex-col justify-end px-5 pb-16 pt-4 sm:px-8 lg:min-h-[min(48vh,520px)] lg:px-10 lg:pb-20">
              {heroCopy}
            </div>
          </>
        )}
      </section>

      <div className="relative z-[1] -mt-8 rounded-t-[32px] bg-white px-5 pb-8 pt-5 shadow-[0_-8px_40px_rgba(20,12,8,0.12)] sm:px-8 lg:-mt-10 lg:rounded-t-[40px] lg:px-10 lg:pb-12 lg:pt-8">
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-[#EDE8E1] lg:mb-5" aria-hidden />
        <div className="mx-auto w-full max-w-6xl">
          {(guideName || guideSubtitle) && (
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
                  className="shrink-0 rounded-full bg-[#1A120E] px-3.5 py-2 text-xs font-bold text-white transition hover:bg-black lg:px-5 lg:py-2.5 lg:text-sm"
                >
                  Inviter
                </button>
              ) : null}
            </div>
          )}

          <div
            role="tablist"
            aria-label="Sections du voyage"
            className="mb-5 flex gap-5 border-b border-[#EDE8E1] lg:mb-7 lg:gap-8"
          >
            {TRIP_DETAIL_TABS.map((t) => {
              const selected = tab === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(t.id)}
                  className={`relative pb-3 text-[13px] font-semibold tracking-tight transition-colors lg:pb-4 lg:text-sm ${
                    selected
                      ? 'text-[#1A120E]'
                      : 'text-[#A3988C] hover:text-[#6B5C50]'
                  }`}
                >
                  {t.label}
                  {selected ? (
                    <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[#1A120E]" />
                  ) : null}
                </button>
              )
            })}
          </div>

          <div role="tabpanel" className="min-h-[40vh]">
            {body}
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#EDE8E1]/90 bg-white/95 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-1 sm:px-2 lg:px-4">
          {estimatedTotalLabel ? (
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8A7B6E]">
                Total
              </p>
              <p className="truncate text-[15px] font-semibold tracking-tight text-[#1A120E]">
                {estimatedTotalLabel}
              </p>
            </div>
          ) : (
            <span className="flex-1" />
          )}
          {primary.informational ? (
            <p className="max-w-[55%] text-right text-[13px] font-medium text-[#8A7B6E]">
              {primary.label}
            </p>
          ) : (
            <button
              type="button"
              onClick={onPrimary}
              className="inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-full bg-[#1A120E] px-6 text-[14px] font-semibold text-white transition hover:bg-black active:scale-[0.98]"
            >
              {primary.label}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
