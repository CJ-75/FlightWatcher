import { useEffect, useMemo, useRef, useState } from 'react'
import type { Airport } from '../types'
import {
  airportSelectionLabel,
  encodeAirportCodes,
  findCityGroupByCodes,
  groupAirportsByCity,
  parseAirportCodes,
  type CityAirportGroup,
} from '@flightwatcher/shared'
import { getApiClient, normalizeAirports } from '../utils/apiClient'

type Props = {
  value: string
  onChange: (encoded: string) => void
}

export function CityAirportSelect({ value, onChange }: Props) {
  const [airports, setAirports] = useState<Airport[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const raw = await getApiClient().getAirports()
        if (!cancelled) {
          setAirports(normalizeAirports(raw as Airport[] | { airports: Airport[] }))
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const groups = useMemo(() => groupAirportsByCity(airports), [airports])
  const selectedCodes = useMemo(() => parseAirportCodes(value), [value])
  const selectedGroup = useMemo(
    () => findCityGroupByCodes(groups, selectedCodes),
    [groups, selectedCodes],
  )
  const label = useMemo(
    () => airportSelectionLabel(value, groups),
    [value, groups],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return groups
      .filter(
        (g) =>
          g.city.toLowerCase().includes(q) ||
          g.country.toLowerCase().includes(q) ||
          g.airports.some(
            (a) =>
              a.code.toLowerCase().includes(q) ||
              a.name.toLowerCase().includes(q),
          ),
      )
      .slice(0, 40)
  }, [groups, query])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const selectCity = (group: CityAirportGroup) => {
    const encoded = encodeAirportCodes(group.airports.map((a) => a.code))
    if (encoded) onChange(encoded)
    setQuery('')
    setOpen(false)
  }

  const toggleAirport = (code: string) => {
    const upper = code.toUpperCase()
    const set = new Set(selectedCodes)
    if (set.has(upper)) {
      if (set.size <= 1) return
      set.delete(upper)
    } else {
      set.add(upper)
    }
    const encoded = encodeAirportCodes([...set])
    if (encoded) onChange(encoded)
  }

  const selectAllInGroup = () => {
    if (!selectedGroup) return
    const encoded = encodeAirportCodes(selectedGroup.airports.map((a) => a.code))
    if (encoded) onChange(encoded)
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        value={open ? query : label || ''}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          setOpen(true)
          setQuery('')
        }}
        placeholder="Paris, Lyon, Londres…"
        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-slate-200 rounded-xl text-sm sm:text-base focus:border-primary-500 focus:ring-2 focus:ring-primary-200 hover:border-slate-300 min-h-[44px]"
      />

      {selectedGroup && selectedGroup.airports.length > 1 ? (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500">
              Aéroports de {selectedGroup.city}
            </p>
            <button
              type="button"
              onClick={selectAllInGroup}
              className="text-xs font-bold text-primary-600 hover:text-primary-700"
            >
              Tous
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedGroup.airports.map((a) => {
              const on = selectedCodes.includes(a.code)
              return (
                <button
                  key={a.code}
                  type="button"
                  onClick={() => toggleAirport(a.code)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border min-h-[34px] ${
                    on
                      ? 'bg-primary-50 text-primary-700 border-primary-300'
                      : 'bg-white text-slate-500 border-slate-200'
                  }`}
                  title={a.name}
                >
                  {a.code}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {open && filtered.length > 0 ? (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 sm:max-h-80 overflow-y-auto">
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
            Villes
          </div>
          {filtered.map((g) => {
            const active = selectedGroup?.key === g.key
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => selectCity(g)}
                className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-primary-50 transition-colors min-h-[56px] ${
                  active ? 'bg-primary-100' : ''
                }`}
              >
                <div className="font-semibold text-gray-800">{g.city}</div>
                <div className="text-xs sm:text-sm text-gray-500 mt-0.5">
                  {g.airports.length} aéroport{g.airports.length > 1 ? 's' : ''} ·{' '}
                  {g.airports.map((a) => a.code).join(' · ')}
                  {g.country ? ` · ${g.country}` : ''}
                </div>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
