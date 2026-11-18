import { useState } from 'react'

type Props = {
  wantFlight: boolean
  wantHotel: boolean
  busy?: boolean
  /** Hide Vol when no real origin→dest link (Pop route gate). Default true. */
  showFlight?: boolean
  /** Enable flight: may need departure/dates collection first */
  onEnableFlight: () => void | Promise<void>
  onDisableFlight: () => void | Promise<void>
  onEnableHotel: () => void | Promise<void>
  onDisableHotel: () => void | Promise<void>
}

/**
 * Vol / Hôtel interrupteurs — activables après ajout Pop.
 */
export function TripOptInToggles({
  wantFlight,
  wantHotel,
  busy,
  showFlight = true,
  onEnableFlight,
  onDisableFlight,
  onEnableHotel,
  onDisableHotel,
}: Props) {
  const [pending, setPending] = useState<'flight' | 'hotel' | null>(null)
  const locked = Boolean(busy || pending)
  const flightVisible = showFlight

  const run = async (key: 'flight' | 'hotel', fn: () => void | Promise<void>) => {
    setPending(key)
    try {
      await fn()
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8A7B6E]">
        Options séjour
      </p>
      {flightVisible ? (
        <ToggleRow
          label="Vol"
          hint={
            wantFlight
              ? 'Scan et réservation WayPop'
              : 'Activer pour chercher un vol'
          }
          checked={wantFlight}
          disabled={locked}
          onToggle={() =>
            void run('flight', () =>
              wantFlight ? onDisableFlight() : onEnableFlight(),
            )
          }
        />
      ) : null}
      <ToggleRow
        label="Hôtel"
        hint={
          wantHotel
            ? 'Compose près de la destination'
            : 'Activer pour chercher un hôtel'
        }
        checked={wantHotel}
        disabled={locked}
        onToggle={() =>
          void run('hotel', () =>
            wantHotel ? onDisableHotel() : onEnableHotel(),
          )
        }
      />
      {(!flightVisible || !wantFlight) && !wantHotel ? (
        <p className="px-0.5 text-[12px] font-medium text-[#8A7B6E]">
          Tu n’es pas sur place ? Pense au vol et à l’hôtel quand le groupe est
          prêt.
        </p>
      ) : null}
    </div>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  disabled,
  onToggle,
}: {
  label: string
  hint: string
  checked: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left transition disabled:opacity-60 ${
        checked
          ? 'border-[rgba(255,107,53,0.3)] bg-[#FFF7F2]'
          : 'border-[#EDE4DC] bg-white hover:bg-[#F7F2ED]'
      }`}
    >
      <span>
        <span className="block text-sm font-extrabold text-[#1A120E]">
          {label}
        </span>
        <span className="mt-0.5 block text-[12px] font-medium text-[#8A7B6E]">
          {hint}
        </span>
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${
          checked ? 'bg-[#FF6B35]' : 'bg-[#E8DFD6]'
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
            checked ? 'left-[1.35rem]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  )
}
