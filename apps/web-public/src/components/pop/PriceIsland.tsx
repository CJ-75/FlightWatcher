'use client'

import { PlannerAddCta } from '@/components/pop/PlannerAddCta'
import { PopShareChannels } from '@/components/pop/PopShareChannels'
import { useAuthGateNavigate } from '@/components/auth/useAuthGateNavigate'

const BAR_MIN_H = 'min-h-[4.25rem]'

type Props = {
  destCity: string
  cityLabel: string
  stopCount: number
  /** Number of programme days. */
  dayCount?: number
  variant?: 'card' | 'bar'
  className?: string
  shareUrl?: string
  shareTitle?: string
  shareSubtitle?: string | null
  shareImage?: string | null
}

export function PriceIsland({
  destCity,
  cityLabel,
  stopCount,
  dayCount = 2,
  variant = 'card',
  className = '',
  shareUrl,
  shareTitle,
  shareSubtitle,
  shareImage,
}: Props) {
  const gateNavigate = useAuthGateNavigate()
  const plannerHref = `/sejours?dest=${encodeURIComponent(destCity)}`
  const resolvedShareTitle = shareTitle || `Pop ${cityLabel}`

  if (variant === 'bar') {
    return (
      <div
        className={`fixed inset-x-0 bottom-0 z-50 border-t border-line bg-cream/95 px-4 py-3 text-ink backdrop-blur-md ${BAR_MIN_H} ${className}`}
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto flex max-w-pop items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
              {cityLabel}
            </p>
            <p className="truncate text-lg font-bold tracking-tight">
              Programme prêt
            </p>
          </div>
          <a
            href={plannerHref}
            onClick={(e) => {
              e.preventDefault()
              gateNavigate(plannerHref)
            }}
            className="relative shrink-0 overflow-hidden rounded-2xl bg-ink px-5 py-2.5 text-sm font-bold text-cream no-underline"
          >
            <span
              className="absolute inset-y-0 left-0 w-1 bg-[#FF6B35]"
              aria-hidden
            />
            Planner
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <aside className="overflow-hidden rounded-[1.25rem] border border-[#E8C4B4] bg-[#F3D9CC] shadow-soft">
        <div className="flex items-center justify-between gap-3 border-b border-[#E8C4B4] bg-[#EBC8B8] px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink">
            Week-end
          </p>
          <p className="hidden text-[11px] font-semibold text-ink/70 lg:block">
            {stopCount} stops
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-line">
            <div className="bg-gradient-to-br from-accent-soft/70 to-white px-4 py-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
                {cityLabel}
              </p>
              <p className="mt-1 text-[1.2rem] font-extrabold leading-snug tracking-tight text-ink">
                Programme prêt.
              </p>
              <p className="mt-1.5 text-[13px] leading-snug text-ink/75">
                Ajoute ce Pop au Planner : tu pourras y composer ton vol, puis
                inviter qui tu veux.
              </p>
            </div>
            {/* Desktop sidebar only — mobile already has durée/stops in the hero */}
            <div className="hidden grid-cols-2 gap-px border-y border-line bg-line lg:grid">
              <div className="bg-white px-4 py-2.5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">
                  {Math.max(1, dayCount) === 1 ? 'Jour' : 'Jours'}
                </p>
                <p className="mt-0.5 text-xl font-extrabold tracking-tight text-ink">
                  {Math.max(1, dayCount)}
                </p>
              </div>
              <div className="bg-white px-4 py-2.5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">
                  Stops
                </p>
                <p className="mt-0.5 text-xl font-extrabold tracking-tight text-ink">
                  {stopCount}
                </p>
              </div>
            </div>
            <ul className="space-y-0 px-3.5 py-2.5">
              {[
                'Parcours cadencé jour par jour',
                'Vol et hôtel depuis le Planner',
                'Partage du programme en un tap',
              ].map((line) => (
                <li
                  key={line}
                  className="flex items-center gap-2.5 py-1.5 text-[13px] font-medium text-ink"
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-extrabold text-accent"
                    aria-hidden
                  >
                    ✓
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 space-y-2">
            <PlannerAddCta href={plannerHref} />
            <p className="text-center text-[11px] font-semibold text-ink-muted">
              Organise à ton rythme, sans friction
            </p>
          </div>

          {shareUrl ? (
            <PopShareChannels
              title={resolvedShareTitle}
              url={shareUrl}
              subtitle={shareSubtitle}
              image={shareImage}
            />
          ) : null}
        </div>
      </aside>
    </div>
  )
}
