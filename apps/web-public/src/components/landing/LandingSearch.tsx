'use client'

import { useEffect, useMemo, useState } from 'react'
import { seedPopularAirports } from '@waypop/shared'

const ORIGIN_LS = 'fw_pop_origin'
const DEFAULT = 'LYS'

type CityOpt = { label: string; codes: string }

function departureCities(): CityOpt[] {
  const byCity = new Map<string, string[]>()
  for (const a of seedPopularAirports()) {
    const city = String(a.city || a.name || a.code).trim()
    if (!city) continue
    const list = byCity.get(city) || []
    if (!list.includes(a.code)) list.push(a.code)
    byCity.set(city, list)
  }
  return [...byCity.entries()]
    .map(([label, codes]) => ({ label, codes: codes.join(',') }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
}

/** Hero primary CTA: ville de départ + Voir les week-ends */
export function LandingSearch() {
  const cities = useMemo(() => departureCities(), [])
  const [origin, setOrigin] = useState(DEFAULT)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ORIGIN_LS)
      if (saved && /^[A-Z]{3}(,[A-Z]{3})*$/i.test(saved)) {
        setOrigin(saved.toUpperCase())
      }
    } catch {
      /* ignore */
    }
  }, [])

  const selectValue =
    cities.find((c) => c.codes === origin)?.codes ||
    cities.find((c) =>
      c.codes.split(',').includes(origin.split(',')[0] || ''),
    )?.codes ||
    origin

  return (
    <form
      className="flex w-full max-w-lg flex-col gap-3 sm:flex-row sm:items-stretch"
      onSubmit={(e) => {
        e.preventDefault()
        const o = origin.trim().toUpperCase() || DEFAULT
        try {
          localStorage.setItem(ORIGIN_LS, o)
        } catch {
          /* ignore */
        }
        window.location.href = `/sejours?origin=${encodeURIComponent(o)}`
      }}
    >
      <label className="flex min-w-0 flex-1 flex-col justify-center rounded-2xl border border-line bg-white px-4 py-3 shadow-soft">
        <span className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">
          Je pars de
        </span>
        <select
          value={selectValue}
          onChange={(e) => {
            const next = e.target.value
            setOrigin(next)
            try {
              localStorage.setItem(ORIGIN_LS, next)
            } catch {
              /* ignore */
            }
          }}
          className="mt-0.5 w-full border-0 bg-transparent p-0 text-sm font-extrabold text-ink outline-none"
          aria-label="Ville de départ"
        >
          {cities.map((c) => (
            <option key={c.codes} value={c.codes}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="wp-cta-ink shrink-0 sm:px-7">
        Voir les week-ends
      </button>
    </form>
  )
}
