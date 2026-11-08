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

function ShareSvg() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8 7l4-4 4 4"
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
        strokeLinejoin="round"
      />
    </svg>
  )
}

function HeartSvg({ filled }: { filled?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

const actionBtnClass =
  'inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-[#4A3428] shadow-sm hover:bg-white'

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
  const stickyRef = useRef<HTMLDivElement>(null)
  const [stickyH, setStickyH] = useState(72)

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
      {/* Fixed header — three actions stay while page scrolls */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 pt-[max(1rem,env(safe-area-inset-top,0px))]">
        <div className="pointer-events-auto mx-auto flex max-w-6xl items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            onClick={onBack}
            aria-label="Retour"
            className={actionBtnClass}
          >
            <span className="-ml-0.5 -mt-0.5 text-[28px] font-bold leading-none">
              ‹
            </span>
          </button>
          <div className="flex gap-2">
            {onShare ? (
              <button
                type="button"
                onClick={onShare}
                aria-label="Partager"
                className={actionBtnClass}
              >
                <ShareSvg />
              </button>
            ) : null}
            {onLike ? (
              <button
                type="button"
                onClick={onLike}
                aria-label={
                  liked ? 'Retirer des favoris' : 'Ajouter aux favoris'
                }
                className={`${actionBtnClass} ${
                  liked
                    ? 'text-[color:var(--fw-accent,#ff6b35)]'
                    : 'text-[#4A3428]'
                }`}
              >
                <HeartSvg filled={liked} />
              </button>
            ) : null}
          </div>
        </div>
      </div>

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

        <div className="relative mx-auto flex min-h-[min(58vh,520px)] w-full max-w-6xl flex-col justify-end px-5 pb-14 pt-24 sm:px-8 lg:px-10 lg:pb-16">
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
                  <span
                    key={`${c}-${i}`}
                    className="inline-flex items-center gap-2"
                  >
                    {i > 0 ? <span className="text-white/40">·</span> : null}
                    <span>{c}</span>
                  </span>
                ))}
              </div>
            ) : null}
            {dateLabel ? (
              <p className="text-[15px] font-semibold text-white/95">
                {dateLabel}
              </p>
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
