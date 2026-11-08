import { useEffect, useRef, useState, type ReactNode } from 'react'
type Props = {
  heroUrl: string
  title: string
  metaChips?: string[]
  phaseLabel?: string
  dateLabel?: string | null
  onBack: () => void
  onShare?: () => void
  onLike?: () => void
  liked?: boolean
  children: ReactNode
  stickyLeft?: string
  stickyCta?: string
  onStickyCta?: () => void
}

function IconShare() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12M8 7l4-4 4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconHeart({ filled }: { filled?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 20.5 4.5 13A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7.5 6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  )
}

/** Chrome Path pour détail parcours — hero full-bleed + feuille + barre opaque. */
export function ItineraryDetailChrome({
  heroUrl,
  title,
  metaChips,
  phaseLabel = 'Parcours',
  dateLabel,
  onBack,
  onShare,
  onLike,
  liked,
  children,
  stickyLeft,
  stickyCta,
  onStickyCta,
}: Props) {
  const chips = (metaChips || []).filter(Boolean)
  const [scrolled, setScrolled] = useState(false)
  const stickyRef = useRef<HTMLDivElement>(null)
  const [stickyH, setStickyH] = useState(72)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 220)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const el = stickyRef.current
    if (!el) return
    const sync = () => setStickyH(el.getBoundingClientRect().height)
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    return () => ro.disconnect()
  }, [stickyCta])

  return (
    <div
      className="relative w-full min-h-screen bg-[#F7F4EF]"
      style={{ paddingBottom: stickyCta ? stickyH + 16 : 32 }}
    >
      {scrolled ? (
        <div className="fixed inset-x-0 top-0 z-50 border-b border-[#EDE8E1] bg-white pt-[env(safe-area-inset-top,0px)]">
          <div className="mx-auto flex h-12 max-w-6xl items-center gap-1 px-4">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 text-[16px] font-semibold text-[#1A120E]"
              aria-label="Retour Parcours"
            >
              <span className="text-2xl leading-none">‹</span>
              <span>Parcours</span>
            </button>
          </div>
        </div>
      ) : null}

      <section className="relative isolate min-h-[min(58vh,520px)] overflow-hidden">
        <img
          src={heroUrl}
          alt=""
          aria-hidden
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />

        <div className="absolute right-4 top-[calc(env(safe-area-inset-top,0px)+1.25rem)] z-10 flex gap-2 sm:right-6">
          {onShare ? (
            <button
              type="button"
              onClick={onShare}
              aria-label="Partager"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/18 text-white ring-1 ring-white/35 backdrop-blur-xl hover:bg-white/28"
            >
              <IconShare />
            </button>
          ) : null}
          {onLike ? (
            <button
              type="button"
              onClick={onLike}
              aria-label={liked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/18 text-white ring-1 ring-white/35 backdrop-blur-xl hover:bg-white/28"
            >
              <IconHeart filled={liked} />
            </button>
          ) : null}
        </div>

        <div className="relative mx-auto flex min-h-[min(58vh,520px)] w-full max-w-6xl flex-col justify-end px-5 pb-14 pt-20 sm:px-8 lg:px-10 lg:pb-16">
          <div className="max-w-3xl space-y-3">
            <span className="inline-flex rounded-full bg-white/18 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/95 backdrop-blur-md ring-1 ring-white/25">
              {phaseLabel}
            </span>
            <h1 className="max-w-[95%] text-[2.35rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-white drop-shadow sm:text-5xl lg:text-6xl">
              {title}
            </h1>
            {chips.length > 0 ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-white/90">
                {chips.map((c, i) => (
                  <span key={`${c}-${i}`} className="inline-flex items-center gap-2">
                    {i > 0 ? <span className="text-white/40">·</span> : null}
                    <span>{c}</span>
                  </span>
                ))}
              </div>
            ) : null}
            {dateLabel ? (
              <p className="text-[15px] font-semibold text-white/95">{dateLabel}</p>
            ) : null}
          </div>
        </div>
      </section>

      <div className="relative z-[1] -mt-8 rounded-t-[32px] bg-white px-5 pb-8 pt-7 shadow-[0_-8px_40px_rgba(20,12,8,0.12)] sm:px-8 lg:-mt-10 lg:rounded-t-[40px] lg:px-10 lg:pb-12 lg:pt-8">
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </div>

      {stickyCta ? (
        <div
          ref={stickyRef}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-[#EDE8E1] bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]"
        >
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#1A120E]">
                {stickyLeft || ' '}
              </p>
            </div>
            <button
              type="button"
              onClick={onStickyCta}
              className="shrink-0 rounded-full bg-[#1A120E] px-5 py-3 text-sm font-bold text-white hover:bg-black"
            >
              {stickyCta}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
