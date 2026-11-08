import type { TripDetailStepTile } from '@flightwatcher/shared'
import type { StayStepId } from '@flightwatcher/shared'

type Props = {
  steps: TripDetailStepTile[]
  onStepPress?: (id: StayStepId) => void
}

function StepIcon({ id }: { id: StayStepId }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (id === 'flight') {
    return (
      <svg {...common}>
        <path d="M10.5 18.5l-1.8 2.7h1.7l2.6-2.7 6.4.9.9-.9-5.4-3.5 3.5-6.2h-.9L11.2 10 7.6 7.2H6.7l1.8 3.5-4.4 2.6v.9l6.4-.7z" />
      </svg>
    )
  }
  if (id === 'hotel') {
    return (
      <svg {...common}>
        <path d="M3 20h18M5 20V9l7-4 7 4v11M9 20v-5h6v5" />
      </svg>
    )
  }
  if (id === 'activities') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="2.75" />
        <path d="M12 3.5v2.5M12 18v2.5M4.8 4.8l1.8 1.8M17.4 17.4l1.8 1.8M3.5 12h2.5M18 12h2.5M4.8 19.2l1.8-1.8M17.4 6.6l1.8-1.8" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M12 20.5s6.2-4 6.2-9.6a6.2 6.2 0 10-12.4 0c0 5.6 6.2 9.6 6.2 9.6z" />
      <circle cx="12" cy="10.6" r="1.9" />
    </svg>
  )
}

/**
 * Path « Étapes » — compact line icons, quiet surfaces.
 */
export function PathStepsTiles({ steps, onStepPress }: Props) {
  if (!steps.length) return null
  return (
    <div
      className={`grid gap-2 ${
        steps.length >= 4
          ? 'grid-cols-4'
          : steps.length === 3
            ? 'grid-cols-3'
            : 'grid-cols-2'
      }`}
    >
      {steps.map((step) => {
        const live = step.state === 'current'
        const done = step.state === 'done'
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onStepPress?.(step.id)}
            className={`flex flex-col items-center gap-1.5 rounded-2xl px-1 py-3 text-center transition ${
              live
                ? 'bg-[#FFF7F2] ring-1 ring-[#FF6B35]/30'
                : done
                  ? 'bg-[#F3FAF6] ring-1 ring-[#0F8A5F]/12'
                  : 'bg-white ring-1 ring-[#EDE4DC] hover:bg-[#FFFBF8]'
            }`}
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full ${
                live
                  ? 'bg-[#FF6B35] text-white'
                  : done
                    ? 'bg-[#0F8A5F] text-white'
                    : 'bg-[#F7F2ED] text-[#6B5C50]'
              }`}
            >
              <StepIcon id={step.id} />
            </span>
            <span className="text-[11px] font-semibold text-[#1A120E]">
              {step.label}
            </span>
            <span
              className={`text-[10px] font-medium ${
                live
                  ? 'text-[#E85A28]'
                  : done
                    ? 'text-[#0F8A5F]'
                    : 'text-[#9A8778]'
              }`}
            >
              {step.statusLabel}
            </span>
          </button>
        )
      })}
    </div>
  )
}
