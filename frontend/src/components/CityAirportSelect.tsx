import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Airport } from '../types'
import {
  airportChipLabelFr,
  airportSelectionLabel,
  encodeAirportCodes,
  findCityGroupByCodes,
  groupAirportsByCity,
  parseAirportCodes,
  type CityAirportGroup,
} from '@flightwatcher/shared'
import { getApiClient, normalizeAirports } from '../utils/apiClient'
import { CountryFlag } from './CountryFlag'

type Props = {
  value: string
  onChange: (encoded: string) => void
}

const PLACEHOLDER_CITIES = [
  { city: 'Paris', country: 'France' },
  { city: 'Lyon', country: 'France' },
  { city: 'Marseille', country: 'France' },
] as const

const FLAG_CLASS = 'w-[18px] h-3 sm:w-5 sm:h-[14px]'

export function CityAirportSelect({ value, onChange }: Props) {
  const [airports, setAirports] = useState<Airport[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
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

  const showAnimatedPlaceholder = !open && !label
  const showSelectedFlag = !open && !!selectedGroup && !!label

  useEffect(() => {
    if (!showAnimatedPlaceholder) return
    const id = window.setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_CITIES.length)
    }, 2200)
    return () => window.clearInterval(id)
  }, [showAnimatedPlaceholder])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = !q
      ? groups
      : groups.filter(
          (g) =>
            g.city.toLowerCase().includes(q) ||
            g.country.toLowerCase().includes(q) ||
            g.airports.some(
              (a) =>
                a.code.toLowerCase().includes(q) ||
                a.name.toLowerCase().includes(q),
            ),
        )
    return list.slice(0, 40)
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

  const placeholder = PLACEHOLDER_CITIES[placeholderIndex]

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
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
          placeholder=""
          aria-label="Ville de départ"
          className={`w-full py-2.5 sm:py-3 border-2 border-slate-200 rounded-xl text-sm sm:text-base focus:border-primary-500 focus:ring-2 focus:ring-primary-200 hover:border-slate-300 min-h-[44px] pr-3 sm:pr-4 ${
            showSelectedFlag || showAnimatedPlaceholder
              ? 'pl-10 sm:pl-11'
              : 'pl-3 sm:pl-4'
          }`}
        />

        {showSelectedFlag && selectedGroup ? (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 sm:pl-3.5"
            aria-hidden
          >
            <CountryFlag
              country={selectedGroup.country}
              className={FLAG_CLASS}
              title={selectedGroup.country}
            />
          </div>
        ) : null}

        {showAnimatedPlaceholder ? (
          <div
            className="pointer-events-none absolute inset-0 flex items-center pl-3 sm:pl-3.5 pr-3"
            aria-hidden
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={placeholder.city}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="inline-flex items-center gap-2 text-sm sm:text-base text-slate-400 font-medium"
              >
                <CountryFlag country={placeholder.country} className={FLAG_CLASS} />
                {placeholder.city}
              </motion.span>
            </AnimatePresence>
          </div>
        ) : null}
      </div>

      {selectedGroup && selectedGroup.airports.length > 1 ? (
        <div className="mt-2 mb-0">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-slate-500 inline-flex items-center gap-1.5">
              <CountryFlag country={selectedGroup.country} className="w-3.5 h-2.5" />
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
          <div className="flex flex-wrap gap-1.5">
            {selectedGroup.airports.map((a) => {
              const on = selectedCodes.includes(a.code)
              return (
                <motion.button
                  key={a.code}
                  type="button"
                  onClick={() => toggleAirport(a.code)}
                  aria-pressed={on}
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: 'spring', stiffness: 480, damping: 28 }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border min-h-[32px] transition-colors duration-200 ease-out ${
                    on
                      ? 'bg-primary-50 text-primary-700 border-primary-300'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-primary-200 hover:bg-primary-50/40'
                  }`}
                  title={a.name}
                >
                  <span
                    className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border transition-all duration-200 ease-out ${
                      on
                        ? 'bg-primary-500 border-primary-500 scale-100'
                        : 'bg-white border-slate-300 scale-95'
                    }`}
                    aria-hidden
                  >
                    <span
                      className={`text-[9px] leading-none text-white transition-opacity duration-200 ${
                        on ? 'opacity-100' : 'opacity-0'
                      }`}
                    >
                      ✓
                    </span>
                  </span>
                  {airportChipLabelFr(a.code, selectedGroup.city)}
                </motion.button>
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
            const n = g.airports.length
            return (
              <button
                key={g.key}
                type="button"
                onClick={() => selectCity(g)}
                className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-primary-50 transition-colors min-h-[56px] ${
                  active ? 'bg-primary-100' : ''
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <CountryFlag
                    country={g.country}
                    className="w-5 h-[14px]"
                    title={g.country}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-800">{g.city}</div>
                    <div className="text-xs sm:text-sm text-gray-500 mt-0.5">
                      {n > 1 ? `${n} aéroports` : '1 aéroport'}
                      {g.country ? ` · ${g.country}` : ''}
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
