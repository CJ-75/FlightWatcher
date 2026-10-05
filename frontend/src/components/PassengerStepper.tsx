interface PassengerStepperProps {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
}

export function PassengerStepper({
  value,
  onChange,
  min = 1,
  max = 6,
}: PassengerStepperProps) {
  const n = Math.min(max, Math.max(min, value || 1))

  return (
    <div className="mb-6 sm:mb-8 flex items-center justify-between gap-4">
      <div>
        <label className="text-base sm:text-lg font-bold text-slate-900 block">
          Passagers
        </label>
        <p className="text-sm text-slate-500 mt-0.5">Adultes · budget = prix total</p>
      </div>
      <div className="flex items-center gap-3 rounded-full bg-orange-50 px-2 py-1.5">
        <button
          type="button"
          aria-label="Moins de passagers"
          disabled={n <= min}
          onClick={() => onChange(Math.max(min, n - 1))}
          className="w-10 h-10 rounded-full bg-white text-primary-500 text-2xl font-bold leading-none shadow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform"
        >
          −
        </button>
        <span className="min-w-[1.5rem] text-center text-xl font-black text-slate-900">{n}</span>
        <button
          type="button"
          aria-label="Plus de passagers"
          disabled={n >= max}
          onClick={() => onChange(Math.min(max, n + 1))}
          className="w-10 h-10 rounded-full bg-white text-primary-500 text-2xl font-bold leading-none shadow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform"
        >
          +
        </button>
      </div>
    </div>
  )
}
