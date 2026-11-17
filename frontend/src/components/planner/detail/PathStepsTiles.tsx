import type { TripDetailStepTile } from '@waypop/shared'
import type { StayStepId } from '@waypop/shared'

type Props = {
  steps: TripDetailStepTile[]
  onStepPress?: (id: StayStepId) => void
}

function StepIcon({ id, color }: { id: StayStepId; color: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (id === 'flight') {
    return (
      <svg {...common}>
        <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
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

/** Path « Étapes » — parity mobile (cream / live / done). */
export function PathStepsTiles({ steps, onStepPress }: Props) {
  if (!steps.length) return null
  return (
    <div className="flex w-full gap-2 lg:gap-2.5">
      {steps.map((step) => {
        const live = step.state === 'current'
        const done = step.state === 'done'
        const iconColor = live || done ? '#fff' : '#6B5C50'
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onStepPress?.(step.id)}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-2xl border px-1 py-3 text-center transition ${
              live
                ? 'border-[rgba(255,107,53,0.3)] bg-[#FFF7F2]'
                : done
                  ? 'border-[rgba(15,138,95,0.12)] bg-[#F3FAF6]'
                  : 'border-[#EDE4DC] bg-white hover:bg-[#F7F2ED]'
            }`}
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full ${
                live
                  ? 'bg-[#FF6B35]'
                  : done
                    ? 'bg-[#0F8A5F]'
                    : 'bg-[#F7F2ED]'
              }`}
            >
              <StepIcon id={step.id} color={iconColor} />
            </span>
            <span className="text-[11px] font-semibold leading-tight text-[#1A120E]">
              {step.label}
            </span>
            {step.statusLabel ? (
              <span
                className={`max-w-full truncate px-1 text-[10px] font-medium ${
                  live
                    ? 'text-[#E85A28]'
                    : done
                      ? 'text-[#0F8A5F]'
                      : 'text-[#9A8778]'
                }`}
              >
                {step.statusLabel}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
