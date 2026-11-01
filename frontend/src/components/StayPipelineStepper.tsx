import type { StayPipelineStep, StayStepId } from '@flightwatcher/shared'

type Props = {
  steps: StayPipelineStep[]
  onStepPress?: (id: StayStepId) => void
}

export function StayPipelineStepper({ steps, onStepPress }: Props) {
  return (
    <nav
      aria-label="Étapes du séjour"
      className="flex items-start justify-between gap-1 py-3 mb-2 select-none"
    >
      {steps.map((s, i) => {
        const isOff = s.state === 'off'
        const isDone = s.state === 'done'
        const isCurrent = s.state === 'current'
        return (
          <div key={s.id} className="flex items-start flex-1 min-w-0">
            {i > 0 ? (
              <div
                className={`h-0.5 flex-1 mt-[15px] mx-1 rounded-full ${
                  steps[i - 1]?.state === 'done' ? 'bg-primary-200' : 'bg-line'
                }`}
                aria-hidden
              />
            ) : null}
            <button
              type="button"
              disabled={false}
              onClick={() => {
                if (isOff) {
                  window.alert(`${s.label} arrive bientôt sur FlightWatcher.`)
                  return
                }
                onStepPress?.(s.id)
              }}
              className="flex flex-col items-center gap-1 w-16 shrink-0 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 rounded-xl"
            >
              <span
                className={[
                  'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-[1.5px]',
                  isDone
                    ? 'bg-emerald-50 border-emerald-600 text-emerald-700'
                    : isCurrent
                      ? 'bg-primary-500 border-primary-500 text-white'
                      : isOff
                        ? 'bg-cream border-line border-dashed text-ink-faint'
                        : 'bg-white border-line-strong text-ink-muted',
                ].join(' ')}
              >
                {isDone ? '✓' : i + 1}
              </span>
              <span
                className={[
                  'text-[11px] tracking-tight',
                  isCurrent
                    ? 'font-bold text-ink'
                    : isOff
                      ? 'font-semibold text-ink-faint'
                      : 'font-semibold text-ink-muted',
                ].join(' ')}
              >
                {s.shortLabel}
              </span>
              {s.hint ? (
                <span
                  className={`text-[9px] font-medium ${
                    isCurrent ? 'text-primary-700' : 'text-ink-faint'
                  }`}
                >
                  {s.hint}
                </span>
              ) : null}
            </button>
          </div>
        )
      })}
    </nav>
  )
}
