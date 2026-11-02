/**
 * Ville Activités — même catalogue / UI que CityAirportSelect (drapeaux),
 * sans sélection d’aéroports.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ACTIVITY_CITY_OPTIONS_FR,
  activityCitySlugFromLabel,
  groupAirportsByCity,
  resolvePopularCityGroups,
  seedPopularAirports,
  type CityAirportGroup,
} from '@flightwatcher/shared'
import { loadAirportsOnce, peekAirports } from '../hooks/useAirports'
import { CountryFlag } from './CountryFlag'

type CityOpt = { slug: string; label: string; country?: string }

type Props = {
  valueSlug: string
  valueLabel?: string
  onChange: (city: CityOpt) => void
}

const PLACEHOLDER_CITIES = [
  { city: 'Paris', country: 'France' },
  { city: 'Lyon', country: 'France' },
  { city: 'Marseille', country: 'France' },
] as const

const FLAG_CLASS = 'w-[18px] h-3 sm:w-5 sm:h-[14px]'
const SEED = seedPopularAirports()

type MenuPos = { top: number; left: number; width: number; maxHeight: number }

function toOpt(g: CityAirportGroup): CityOpt {
  return {
    slug: activityCitySlugFromLabel(g.city),
    label: g.city,
    country: g.country || undefined,
  }
}

function seedFallbackCities(): CityOpt[] {
  const bySlug = new Map(
    groupAirportsByCity(SEED)
      .map(toOpt)
      .filter((c) => c.slug)
      .map((c) => [c.slug, c] as const),
  )
  return ACTIVITY_CITY_OPTIONS_FR.map((c) => {
    const hit = bySlug.get(c.slug)
    return hit || { slug: c.slug, label: c.label }
  })
}

export function ActivityCitySelect({ valueSlug, valueLabel, onChange }: Props) {
  const peeked = peekAirports()
  const [airports, setAirports] = useState(() => (peeked.length ? peeked : SEED))
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputWrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const applyList = (list: typeof airports) => {
    if (list.length) setAirports(list)
    else setAirports(SEED)
  }

  const reloadAirports = (force = true) => {
    setLoading(true)
    setLoadError(false)
    void (async () => {
      try {
        const list = await loadAirportsOnce({ force })
        applyList(list)
        setLoadError(list.length === 0)
      } catch {
        setLoadError(true)
        applyList([])
      } finally {
        setLoading(false)
      }
    })()
  }

  // Seed cities first — load full airports only when the picker opens.
  useEffect(() => {
    if (!open) return
    if (peekAirports().length) {
      applyList(peekAirports())
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const list = await loadAirportsOnce()
        if (cancelled) return
        applyList(list)
        setLoadError(list.length === 0)
      } catch {
        if (!cancelled) {
          setLoadError(true)
          applyList([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  const groups = useMemo(() => groupAirportsByCity(airports), [airports])
  const catalogReady = groups.length >= 20

  const allCities = useMemo(() => {
    if (!catalogReady) return seedFallbackCities()
    return groups
      .map(toOpt)
      .filter((c) => c.slug)
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  }, [groups, catalogReady])

  const popular = useMemo(() => {
    if (!catalogReady) return seedFallbackCities().slice(0, 12)
    return resolvePopularCityGroups(groups, airports)
      .map(toOpt)
      .filter((c) => c.slug)
  }, [groups, airports, catalogReady])

  const selected = useMemo(() => {
    const hit = allCities.find((c) => c.slug === valueSlug)
    if (hit) return hit
    if (valueSlug) {
      const fromGroup = groups.find(
        (g) => activityCitySlugFromLabel(g.city) === valueSlug,
      )
      if (fromGroup) return toOpt(fromGroup)
      return { slug: valueSlug, label: valueLabel || valueSlug }
    }
    return null
  }, [allCities, valueSlug, valueLabel, groups])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return popular
    return allCities
      .filter(
        (c) =>
          c.label.toLowerCase().includes(q) ||
          c.slug.includes(q.replace(/\s+/g, '-')) ||
          (c.country || '').toLowerCase().includes(q),
      )
      .slice(0, 40)
  }, [query, allCities, popular])

  const showAnimatedPlaceholder = !open && !selected
  const showSelectedFlag = !open && !!selected?.country

  useEffect(() => {
    if (!showAnimatedPlaceholder) return
    const id = window.setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_CITIES.length)
    }, 2200)
    return () => window.clearInterval(id)
  }, [showAnimatedPlaceholder])

  const updateMenuPos = () => {
    const el = inputWrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const gap = 4
    const vv = window.visualViewport
    const viewH = vv?.height ?? window.innerHeight
    const viewTop = vv?.offsetTop ?? 0
    const spaceBelow = viewTop + viewH - r.bottom - 12
    const spaceAbove = r.top - viewTop - 12
    const preferBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove
    const maxHeight = Math.max(
      140,
      Math.min(320, preferBelow ? spaceBelow : spaceAbove),
    )
    setMenuPos({
      top: preferBelow
        ? r.bottom + gap
        : Math.max(viewTop + 8, r.top - gap - maxHeight),
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
    window.visualViewport?.addEventListener('resize', onWin)
    window.visualViewport?.addEventListener('scroll', onWin)
    return () => {
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
      window.visualViewport?.removeEventListener('resize', onWin)
      window.visualViewport?.removeEventListener('scroll', onWin)
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
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100 sticky top-0 bg-white flex items-center justify-between gap-2">
            <span>Villes</span>
            {loading ? (
              <span className="normal-case tracking-normal font-medium text-slate-400">
                Mise à jour…
              </span>
            ) : null}
          </div>
          {loadError && filtered.length === 0 ? (
            <div className="px-3 py-4 space-y-2">
              <p className="text-sm text-slate-600">Impossible de charger les villes.</p>
              <button
                type="button"
                onClick={() => reloadAirports(true)}
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
            filtered.map((c) => {
              const active = c.slug === valueSlug
              return (
                <button
                  key={`${c.slug}-${c.country || ''}`}
                  type="button"
                  onClick={() => {
                    onChange(c)
                    setQuery('')
                    setOpen(false)
                  }}
                  className={`w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-primary-50 transition-colors min-h-[56px] ${
                    active ? 'bg-primary-100' : ''
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <CountryFlag
                      country={c.country}
                      className="w-5 h-[14px]"
                      title={c.country}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-gray-800">{c.label}</div>
                      {c.country ? (
                        <div className="text-xs sm:text-sm text-gray-500 mt-0.5">
                          {c.country}
                        </div>
                      ) : null}
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
          value={open ? query : selected?.label || ''}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            setOpen(true)
            setQuery('')
          }}
          placeholder=""
          aria-label="Ville"
          aria-expanded={open}
          autoComplete="off"
          className={`w-full py-2.5 sm:py-3 border-2 border-slate-200 rounded-xl text-sm sm:text-base focus:border-primary-500 focus:ring-2 focus:ring-primary-200 hover:border-slate-300 min-h-[44px] pr-3 sm:pr-4 ${
            showSelectedFlag || showAnimatedPlaceholder
              ? 'pl-10 sm:pl-11'
              : 'pl-3 sm:pl-4'
          }`}
        />

        {showSelectedFlag && selected ? (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 sm:pl-3.5"
            aria-hidden
          >
            <CountryFlag
              country={selected.country}
              className={FLAG_CLASS}
              title={selected.country}
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
      {menu}
    </div>
  )
}
