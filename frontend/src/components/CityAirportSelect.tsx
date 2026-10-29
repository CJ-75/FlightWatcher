import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import type { Airport } from '../types'
import {
  airportSelectionLabel,
  encodeAirportCodes,
  findCityGroupByCodes,
  groupAirportsByCity,
  parseAirportCodes,
  resolvePopularCityGroups,
  type CityAirportGroup,
} from '@flightwatcher/shared'
import { loadAirportsOnce, peekAirports } from '../hooks/useAirports'
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

type MenuPos = { top: number; left: number; width: number; maxHeight: number }

export function CityAirportSelect({ value, onChange }: Props) {
  const [airports, setAirports] = useState<Airport[]>(() => peekAirports())
  const [loading, setLoading] = useState(() => peekAirports().length === 0)
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputWrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const reloadAirports = () => {
    setLoading(true)
    setLoadError(false)
    void (async () => {
      try {
        const list = await loadAirportsOnce()
        setAirports(list)
        setLoadError(list.length === 0)
      } catch {
        setLoadError(true)
      } finally {
        setLoading(false)
      }
    })()
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await loadAirportsOnce()
        if (cancelled) return
        setAirports(list)
        setLoadError(list.length === 0)
      } catch {
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
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

  const popularGroups = useMemo(
    () => resolvePopularCityGroups(groups, airports),
    [groups, airports],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return popularGroups
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
  }, [groups, popularGroups, query])

  const updateMenuPos = () => {
    const el = inputWrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const gap = 4
    const spaceBelow = window.innerHeight - r.bottom - 12
    const spaceAbove = r.top - 12
    const preferBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove
    const maxHeight = Math.max(
      140,
      Math.min(320, preferBelow ? spaceBelow : spaceAbove),
    )
    setMenuPos({
      top: preferBelow ? r.bottom + gap : Math.max(8, r.top - gap - maxHeight),
      left: r.left,
      width: r.width,
      maxHeight,
    })
  }

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null)
      return
    }
    updateMenuPos()
    const onWin = () => updateMenuPos()
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, true)
    return () => {
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: Event) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onDoc, true)
    return () => document.removeEventListener('pointerdown', onDoc, true)
  }, [open])

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
  const showMenu = open && menuPos != null

  const menu = showMenu
    ? createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Villes"
          className="fixed z-[200] bg-white border border-gray-300 rounded-lg shadow-xl overflow-y-auto overscroll-contain"
          style={{
            top: menuPos.top,
            left: menuPos.left,
            width: menuPos.width,
            maxHeight: menuPos.maxHeight,
          }}
        >
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100 sticky top-0 bg-white">
            Villes
          </div>
          {loading ? (
            <p className="px-3 py-4 text-sm text-slate-500">Chargement des villes…</p>
          ) : loadError ? (
            <div className="px-3 py-4 space-y-2">
              <p className="text-sm text-slate-600">Impossible de charger les villes.</p>
              <button
                type="button"
                onClick={reloadAirports}
                className="text-sm font-bold text-primary-600"
              >
                Réessayer
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-4 text-sm text-slate-500">
              Aucune ville trouvée{query.trim() ? ` pour « ${query.trim()} »` : ''}.
            </p>
          ) : (
            filtered.map((g) => {
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
            })
          )}
        </div>,
        document.body,
      )
    : null

  return (
    <div ref={rootRef} className="relative">
      <div ref={inputWrapRef} className="relative">
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
          aria-expanded={open}
          autoComplete="off"
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
                  {a.code}
                </motion.button>
              )
            })}
          </div>
        </div>
      ) : null}

      {menu}
    </div>
  )
}
