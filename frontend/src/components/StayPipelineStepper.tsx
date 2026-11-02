import { motion } from 'framer-motion'
import type { StayPipelineStep, StayStepId } from '@flightwatcher/shared'

type Props = {
  steps: StayPipelineStep[]
  onStepPress?: (id: StayStepId) => void
  /** @deprecated Prefer journey — kept for MyTrip / legacy shells */
  variant?: 'light' | 'dark' | 'journey'
}

function StepGlyph({
  id,
  className,
}: {
  id: StayStepId
  className?: string
}) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'currentColor',
    className: className || 'w-[18px] h-[18px]',
    'aria-hidden': true as const,
  }
  switch (id) {
    case 'flight':
      return (
        <svg {...common}>
          <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
        </svg>
      )
    case 'hotel':
      return (
        <svg {...common}>
          <path d="M4 11V19H6V11H4ZM7 11V19H17V11H7ZM18 11V19H20V11H18ZM3 21H21V19H3V21ZM7 9H17C18.1 9 19 8.1 19 7V5C19 3.9 18.1 3 17 3H7C5.9 3 5 3.9 5 5V7C5 8.1 5.9 9 7 9ZM7 5H17V7H7V5Z" />
        </svg>
      )
    case 'activities':
      return (
        <svg {...common}>
          <path d="M20 6H15.82C15.4 4.84 14.3 4 13 4H11C9.7 4 8.6 4.84 8.18 6H4C2.9 6 2 6.9 2 8V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6ZM11 6H13C13.55 6 14 6.45 14 7S13.55 8 13 8H11C10.45 8 10 7.55 10 7S10.45 6 11 6ZM20 18H4V8H20V18ZM12 10C10.34 10 9 11.34 9 13S10.34 16 12 16 15 14.66 15 13 13.66 10 12 10Z" />
        </svg>
      )
    case 'restaurants':
      return (
        <svg {...common}>
          <path d="M11 9H9V2H7V9H5V2H3V9C3 11.12 4.66 12.84 6.75 12.97V22H9.25V12.97C11.34 12.84 13 11.12 13 9V2H11V9ZM16 6V14H18.5V22H21V2C18.24 2 16 4.24 16 6Z" />
        </svg>
      )
    default:
      return null
  }
}

function JourneyStepper({
  steps,
  onStepPress,
}: {
  steps: StayPipelineStep[]
  onStepPress?: (id: StayStepId) => void
}) {
  return (
    <nav aria-label="Étapes du séjour" className="relative select-none">
      <ol className="flex items-stretch gap-1.5 sm:gap-2">
        {steps.map((s, index) => {
          const isOff = s.state === 'off'
          const isDone = s.state === 'done'
          const isCurrent = s.state === 'current'
          return (
            <li key={s.id} className="min-w-0 flex-1">
              <motion.button
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  type: 'spring',
                  stiffness: 380,
                  damping: 28,
                  delay: index * 0.05,
                }}
                whileHover={isOff ? undefined : { y: -2 }}
                whileTap={isOff ? undefined : { scale: 0.98 }}
                onClick={() => {
                  if (isOff) {
                    window.alert(
                      s.hint === 'Après l’hôtel'
                        ? 'Réserve d’abord ton hôtel pour débloquer les adresses.'
                        : `${s.label} arrive bientôt sur FlightWatcher.`,
                    )
                    return
                  }
                  onStepPress?.(s.id)
                }}
                className={[
                  'relative flex h-full w-full flex-col gap-2 rounded-2xl px-2.5 py-3 text-left transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 sm:px-3',
                  isCurrent
                    ? 'bg-[#FF6B35] text-white shadow-lg shadow-orange-500/30 ring-1 ring-orange-400/40'
                    : isDone
                      ? 'bg-emerald-100/90 text-emerald-950 ring-1 ring-emerald-200/80'
                      : isOff
                        ? 'bg-[#F3E6DC]/70 text-slate-400 ring-1 ring-dashed ring-orange-200/60'
                        : 'bg-[#FFF6EE]/85 text-ink ring-1 ring-orange-200/70 shadow-sm',
                ].join(' ')}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={[
                      'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                      isCurrent
                        ? 'bg-white/20 text-white'
                        : isDone
                          ? 'bg-emerald-500 text-white'
                          : isOff
                            ? 'bg-[#EAD9CC] text-slate-400'
                            : 'bg-[#F0E0D4] text-slate-700',
                    ].join(' ')}
                  >
                    {isDone ? (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <StepGlyph id={s.id} className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={[
                        'truncate text-[12px] leading-tight sm:text-[13px]',
                        isCurrent
                          ? 'font-extrabold text-white'
                          : isDone
                            ? 'font-bold text-emerald-900'
                            : isOff
                              ? 'font-semibold text-slate-400'
                              : 'font-bold text-ink',
                      ].join(' ')}
                    >
                      {s.label}
                    </p>
                    {s.hint ? (
                      <p
                        className={[
                          'mt-0.5 truncate text-[10px] font-semibold leading-none sm:text-[11px]',
                          isCurrent
                            ? 'text-white/80'
                            : isDone
                              ? 'text-emerald-700/80'
                              : isOff
                                ? 'text-slate-400'
                                : 'text-slate-500',
                        ].join(' ')}
                      >
                        {s.hint}
                      </p>
                    ) : (
                      <p
                        className={[
                          'mt-0.5 text-[10px] font-semibold leading-none',
                          isCurrent ? 'text-white/70' : 'text-slate-400',
                        ].join(' ')}
                      >
                        {isDone ? 'Fait' : isCurrent ? 'Maintenant' : isOff ? 'Bientôt' : 'À venir'}
                      </p>
                    )}
                  </div>
                </div>
                {isCurrent ? (
                  <motion.span
                    aria-hidden
                    className="absolute inset-x-3 bottom-1.5 h-0.5 rounded-full bg-white/50"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 0.45, ease: 'easeOut', delay: 0.15 }}
                    style={{ transformOrigin: 'left' }}
                  />
                ) : null}
              </motion.button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** Legacy circular rail — still used by some light pages. */
function ClassicStepper({
  steps,
  onStepPress,
  dark,
}: {
  steps: StayPipelineStep[]
  onStepPress?: (id: StayStepId) => void
  dark: boolean
}) {
  const n = Math.max(steps.length, 1)
  let lastDone = -1
  for (let i = 0; i < steps.length; i++) {
    if (steps[i]?.state === 'done') lastDone = i
  }
  const progressPct = lastDone < 0 ? 0 : (lastDone / Math.max(n - 1, 1)) * 100

  return (
    <nav aria-label="Étapes du séjour" className="relative py-2 select-none">
      <div
        className="pointer-events-none absolute top-[26px] left-0 right-0 h-[2px]"
        aria-hidden
        style={{
          marginLeft: `calc(100% / ${n} / 2)`,
          marginRight: `calc(100% / ${n} / 2)`,
        }}
      >
        <div
          className={`h-full w-full rounded-full ${
            dark ? 'bg-white/12' : 'bg-line'
          }`}
        />
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${
            dark
              ? 'bg-gradient-to-r from-[#FF6B35] to-[#FFB088]'
              : 'bg-primary-300'
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <ol
        className="relative z-[1] grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
      >
        {steps.map((s) => {
          const isOff = s.state === 'off'
          const isDone = s.state === 'done'
          const isCurrent = s.state === 'current'
          return (
            <li key={s.id} className="min-w-0">
              <button
                type="button"
                onClick={() => {
                  if (isOff) {
                    window.alert(
                      s.hint === 'Après l’hôtel'
                        ? 'Réserve d’abord ton hôtel pour débloquer les adresses.'
                        : `${s.label} arrive bientôt sur FlightWatcher.`,
                    )
                    return
                  }
                  onStepPress?.(s.id)
                }}
                className={[
                  'flex w-full flex-col items-center gap-1.5 text-center rounded-2xl px-1 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300',
                  dark && isCurrent ? 'bg-white/10' : '',
                ].join(' ')}
              >
                <span
                  className={[
                    `relative z-[1] w-10 h-10 rounded-full flex items-center justify-center ring-[3px] ${
                      dark ? 'ring-[#1A2030]' : 'ring-white'
                    }`,
                    isDone
                      ? 'bg-emerald-500 text-white shadow-[0_0_0_1px_rgba(16,185,129,0.35)]'
                      : isCurrent
                        ? dark
                          ? 'bg-[#FF6B35] text-white shadow-[0_8px_20px_rgba(255,107,53,0.35)]'
                          : 'bg-primary-500 text-white shadow-soft'
                        : isOff
                          ? dark
                            ? 'bg-white/10 text-white/35 border border-dashed border-white/20'
                            : 'bg-canvas text-ink-faint border border-dashed border-line-strong'
                          : dark
                            ? 'bg-white/10 text-white/80 border border-white/15'
                            : 'bg-white text-ink-soft border border-line-strong shadow-soft',
                  ].join(' ')}
                >
                  <StepGlyph id={s.id} className="w-4 h-4" />
                </span>
                <span
                  className={[
                    'text-[11px] sm:text-[12px] leading-tight px-0.5',
                    dark
                      ? isOff
                        ? 'font-semibold text-white/35'
                        : isCurrent
                          ? 'font-extrabold text-white'
                          : isDone
                            ? 'font-bold text-white/80'
                            : 'font-bold text-white/55'
                      : isCurrent
                        ? 'font-extrabold text-ink'
                        : isDone
                          ? 'font-bold text-ink-soft'
                          : isOff
                            ? 'font-semibold text-ink-faint'
                            : 'font-bold text-ink-muted',
                  ].join(' ')}
                >
                  {s.label}
                </span>
                {s.hint ? (
                  <span
                    className={[
                      'text-[10px] font-semibold leading-none',
                      dark
                        ? isCurrent
                          ? 'text-orange-200'
                          : isDone
                            ? 'text-emerald-300/90'
                            : 'text-white/30'
                        : isCurrent
                          ? 'text-primary-700'
                          : isDone
                            ? 'text-emerald-700'
                            : 'text-ink-faint',
                    ].join(' ')}
                  >
                    {s.hint}
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function StayPipelineStepper({
  steps,
  onStepPress,
  variant = 'journey',
}: Props) {
  if (variant === 'journey' || variant === 'light') {
    // light pages also get the journey rail — less “school checklist”
    return <JourneyStepper steps={steps} onStepPress={onStepPress} />
  }
  return (
    <ClassicStepper steps={steps} onStepPress={onStepPress} dark={variant === 'dark'} />
  )
}
