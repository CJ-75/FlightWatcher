'use client'

import { useState } from 'react'

const ORIGIN_LS = 'fw_pop_origin'

/** Hero CTA — origin → hub Paris (pilot) or /pop/{city} later. */
export function LandingOrigin() {
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
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted">
          Je pars de
        </span>
        <input
          value={origin}
          onChange={(e) =>
            setOrigin(e.target.value.toUpperCase().replace(/[^A-Z,]/g, ''))
          }
          className="mt-1.5 w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm font-bold text-ink outline-none focus:border-primary-500"
          placeholder="LYS"
          maxLength={15}
          aria-label="Aéroport de départ"
        />
      </label>
      <button type="submit" className="app-btn-primary shrink-0">
        Voir les Pops
      </button>
    </form>
  )
}
