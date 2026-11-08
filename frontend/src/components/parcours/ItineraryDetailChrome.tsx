import type { ReactNode } from 'react'

const SERIF = '"Instrument Serif", "Times New Roman", Georgia, serif'

type Props = {
  heroUrl: string
  title: string
  metaChips?: string[]
  phaseLabel?: string
  budgetLabel?: string | null
  onBack: () => void
  onShare?: () => void
  onLike?: () => void
  liked?: boolean
  children: ReactNode
  stickyLeft?: string
  stickyCta?: string
  onStickyCta?: () => void
}

/** Chrome Path pour détail parcours — hero + feuille + barre fixe (§7). */
export function ItineraryDetailChrome({
  heroUrl,
  title,
  metaChips,
  phaseLabel = 'Parcours',
  budgetLabel,
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

  return (
    <div className="relative w-full min-h-screen bg-[#F7F4EF] pb-28">
      <section className="relative isolate min-h-[min(52vh,440px)] overflow-hidden">
        <img
          src={heroUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-[1.02] object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

        <div className="absolute left-4 top-4 z-10 flex gap-2 sm:left-6 sm:top-5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Retour"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white ring-1 ring-white/30 backdrop-blur-xl hover:bg-white/30"
          >
            ←
          </button>
        </div>
        <div className="absolute right-4 top-4 z-10 flex gap-2 sm:right-6 sm:top-5">
          {onShare ? (
            <button
              type="button"
              onClick={onShare}
              aria-label="Partager"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white ring-1 ring-white/30 backdrop-blur-xl hover:bg-white/30"
            >
              ↗
            </button>
          ) : null}
          {onLike ? (
            <button
              type="button"
              onClick={onLike}
              aria-label={liked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-ink shadow"
            >
              {liked ? '♥' : '♡'}
            </button>
          ) : null}
        </div>

        <div className="relative mx-auto flex min-h-[min(52vh,440px)] w-full max-w-6xl flex-col justify-end px-5 pb-16 pt-16 sm:px-8 lg:px-10 lg:pb-20">
          <div className="max-w-3xl space-y-3">
            <span className="inline-flex rounded-full bg-white/18 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/90 backdrop-blur-md ring-1 ring-white/25">
              {phaseLabel}
            </span>
            <h1
              className="max-w-[95%] text-[2.35rem] font-normal leading-[1.05] tracking-[-0.02em] text-white sm:text-5xl lg:text-6xl"
              style={{ fontFamily: SERIF, fontStyle: 'italic' }}
            >
              {title}
            </h1>
            {chips.length > 0 ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-white/85">
                {chips.map((c, i) => (
                  <span key={`${c}-${i}`} className="inline-flex items-center gap-2">
                    {i > 0 ? <span className="text-white/40">·</span> : null}
                    <span>{c}</span>
                  </span>
                ))}
              </div>
            ) : null}
            {budgetLabel ? (
              <p className="text-sm font-semibold text-white/90">{budgetLabel}</p>
            ) : null}
          </div>
        </div>
      </section>

      <div className="relative z-[1] -mt-8 rounded-t-[32px] bg-white px-5 pb-8 pt-5 shadow-[0_-8px_40px_rgba(20,12,8,0.12)] sm:px-8 lg:-mt-10 lg:rounded-t-[40px] lg:px-10 lg:pb-12 lg:pt-8">
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-[#EDE8E1]" aria-hidden />
        <div className="mx-auto w-full max-w-3xl">{children}</div>
      </div>

      {stickyCta ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#EDE8E1] bg-white/95 px-4 py-3 backdrop-blur-md">
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
