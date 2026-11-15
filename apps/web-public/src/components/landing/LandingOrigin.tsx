'use client'

import { useState } from 'react'

const ORIGIN_LS = 'fw_pop_origin'

type Props = { dark?: boolean }

export function LandingOrigin({ dark }: Props) {
  const [origin, setOrigin] = useState('LYS')

  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        const o = origin.trim().toUpperCase() || 'LYS'
        try {
          localStorage.setItem(ORIGIN_LS, o)
        } catch {
          /* ignore */
        }
        window.location.href = `/pop/paris?origin=${encodeURIComponent(o)}`
      }}
    >
      <label className="block flex-1">
        <span
          className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${
            dark ? 'text-night-fg/55' : 'text-muted'
          }`}
        >
          Je pars de
        </span>
        <input
          value={origin}
          onChange={(e) =>
            setOrigin(e.target.value.toUpperCase().replace(/[^A-Z,]/g, ''))
          }
          className={`mt-2 w-full rounded-xl border px-4 py-3 text-sm font-bold outline-none transition-colors focus:border-primary-500 ${
            dark
              ? 'border-white/15 bg-white/10 text-night-fg placeholder:text-night-fg/40'
              : 'border-line bg-surface text-ink'
          }`}
          placeholder="LYS"
          maxLength={15}
          aria-label="Aéroport de départ"
        />
      </label>
      <button type="submit" className="wp-cta shrink-0">
        Voir les Pops
      </button>
    </form>
  )
}
