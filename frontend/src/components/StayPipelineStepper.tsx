import type { StayPipelineStep, StayStepId } from '@flightwatcher/shared'

type Props = {
  steps: StayPipelineStep[]
  onStepPress?: (id: StayStepId) => void
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

export function StayPipelineStepper({ steps, onStepPress }: Props) {
  const n = Math.max(steps.length, 1)
  let lastDone = -1
  for (let i = 0; i < steps.length; i++) {
    if (steps[i]?.state === 'done') lastDone = i
  }
  const progressPct =
    lastDone < 0 ? 0 : (lastDone / Math.max(n - 1, 1)) * 100

  return (
    <nav aria-label="Étapes du séjour" className="relative py-4 mb-3 select-none">
      {/* Even baseline behind icons */}
      <div
        className="pointer-events-none absolute top-[30px] left-0 right-0 h-[3px]"
        aria-hidden
        style={{
          marginLeft: `calc(100% / ${n} / 2)`,
          marginRight: `calc(100% / ${n} / 2)`,
        }}
      >
        <div className="h-full w-full rounded-full bg-line" />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-primary-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <ol className="relative z-[1] grid gap-2" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
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
                    window.alert(`${s.label} arrive bientôt sur FlightWatcher.`)
                    return
                  }
                  onStepPress?.(s.id)
                }}
                className="flex w-full flex-col items-center gap-1.5 text-center rounded-2xl px-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300"
              >
                <span
                  className={[
                    'relative z-[1] w-11 h-11 rounded-full flex items-center justify-center shadow-soft ring-4 ring-[#FFF9F5]',
                    isDone
                      ? 'bg-emerald-500 text-white'
                      : isCurrent
                        ? 'bg-primary-500 text-white'
                        : isOff
                          ? 'bg-canvas text-ink-faint border border-dashed border-line-strong'
                          : 'bg-white text-ink-soft border border-line-strong',
                  ].join(' ')}
                >
                  <StepGlyph id={s.id} />
                </span>
                <span
                  className={[
                    'text-[12px] sm:text-[13px] leading-tight px-0.5',
                    isCurrent
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
                      'text-[10px] sm:text-[11px] font-semibold leading-none',
                      isCurrent
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
