interface PassengerStepperProps {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  /** Compact row for cards (Alertes) */
  compact?: boolean
  label?: string
}

export function PassengerStepper({
  value,
  onChange,
  min = 1,
  max = 6,
  compact = false,
  label = 'Voyageurs',
}: PassengerStepperProps) {
  const n = Math.min(max, Math.max(min, value || 1))

  return (
    <div
      className={
        compact
          ? 'flex items-center justify-between gap-3'
          : 'mb-6 sm:mb-8 flex items-center justify-between gap-4'
      }
    >
      <label
        className={
          compact
            ? 'text-sm font-bold text-slate-700'
            : 'text-base sm:text-lg font-bold text-slate-900 block'
        }
      >
        {label}
      </label>
      <div
        className={
          compact
            ? 'flex items-center gap-2 rounded-full bg-orange-50 px-1.5 py-1'
            : 'flex items-center gap-3 rounded-full bg-orange-50 px-2 py-1.5'
        }
      >
        <button
          type="button"
          aria-label="Moins de voyageurs"
          disabled={n <= min}
          onClick={() => onChange(Math.max(min, n - 1))}
          className={
            compact
              ? 'w-8 h-8 rounded-full bg-white text-primary-500 text-xl font-bold leading-none shadow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform'
              : 'w-10 h-10 rounded-full bg-white text-primary-500 text-2xl font-bold leading-none shadow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform'
          }
        >
          −
        </button>
        <span
          className={
            compact
              ? 'min-w-[1.25rem] text-center text-base font-black text-slate-900'
              : 'min-w-[1.5rem] text-center text-xl font-black text-slate-900'
          }
        >
          {n}
        </span>
        <button
          type="button"
          aria-label="Plus de voyageurs"
          disabled={n >= max}
          onClick={() => onChange(Math.min(max, n + 1))}
          className={
            compact
              ? 'w-8 h-8 rounded-full bg-white text-primary-500 text-xl font-bold leading-none shadow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform'
              : 'w-10 h-10 rounded-full bg-white text-primary-500 text-2xl font-bold leading-none shadow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform'
          }
        >
          +
        </button>
      </div>
    </div>
  )
}
