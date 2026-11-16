'use client'

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  defaultAirportCodesForCity,
  encodeAirportCodes,
  findCityGroupByCodes,
  groupAirportsByCity,
  parseAirportCodes,
  seedPopularAirports,
  type CityAirportGroup,
} from '@waypop/shared'
import { CountryFlag } from '@/components/ui/CountryFlag'

type Props = {
  value: string
  onChange: (codes: string) => void
  className?: string
}

type MenuPos = { top: number; left: number; width: number; maxHeight: number }

function cityKey(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

export function PopOriginSelect({
  value,
  onChange,
  className = '',
}: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputWrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const groups = useMemo(
    () =>
      groupAirportsByCity(seedPopularAirports()).filter(
        (g) => cityKey(g.country) === 'france',
      ),
    [],
  )

  const selectedCodes = useMemo(() => parseAirportCodes(value), [value])
  const selectedGroup = useMemo(
    () => findCityGroupByCodes(groups, selectedCodes),
    [groups, selectedCodes],
  )
  const label = selectedGroup?.city || ''

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = [...groups].sort((a, b) =>
      a.city.localeCompare(b.city, 'fr'),
    )
    if (!q) return list
    return list.filter((g) => g.city.toLowerCase().includes(q)).slice(0, 40)
  }, [groups, query])

  const updateMenuPos = () => {
    const el = inputWrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const gap = 6
    const vv = window.visualViewport
    const viewH = vv?.height ?? window.innerHeight
    const viewTop = vv?.offsetTop ?? 0
    const spaceBelow = viewTop + viewH - r.bottom - 12
    const spaceAbove = r.top - viewTop - 12
    const preferBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove
    const maxHeight = Math.max(
      140,
      Math.min(300, preferBelow ? spaceBelow : spaceAbove),
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDoc, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDoc, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selectCity = (group: CityAirportGroup) => {
    const encoded = encodeAirportCodes(
      defaultAirportCodesForCity(group.airports.map((a) => a.code)),
    )
    if (encoded) onChange(encoded)
    setQuery('')
    setOpen(false)
  }

  const showMenu = open && menuPos != null

  const menu = showMenu
    ? createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-label="Villes de départ"
          className="fixed z-[13000] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-white shadow-lift"
          style={{
            top: menuPos.top,
            left: menuPos.left,
            width: menuPos.width,
            maxHeight: menuPos.maxHeight,
          }}
        >
          <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-line bg-cream/95 px-3.5 py-2.5 backdrop-blur-sm">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">
              Villes
            </span>
            <span className="text-[10px] font-semibold text-ink-muted">
              {filtered.length}
            </span>
          </div>
          {filtered.length === 0 ? (
            <p className="px-3.5 py-4 text-sm text-ink-muted">
              Aucune ville
              {query.trim() ? ` pour « ${query.trim()} »` : ''}.
            </p>
          ) : (
            filtered.map((g) => {
              const active = selectedGroup?.key === g.key
              return (
                <button
                  key={g.key}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => selectCity(g)}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-accent-soft/60 ${
                    active ? 'bg-accent-soft' : ''
                  }`}
                >
                  <CountryFlag
                    country={g.country}
                    className="h-[13px] w-5"
                    title={g.country}
                  />
                  <span className="min-w-0 flex-1 text-sm font-bold text-ink">
                    {g.city}
                  </span>
                  {active ? (
                    <span className="text-sm font-bold text-accent" aria-hidden>
                      ✓
                    </span>
                  ) : null}
                </button>
              )
            })
          )}
        </div>,
        document.body,
      )
    : null

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div ref={inputWrapRef} className="relative">
        <input
          type="text"
          value={open ? query : label}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => {
            setOpen(true)
            setQuery('')
          }}
          placeholder="Rechercher une ville"
          aria-label="Ville de départ"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          className={`w-full appearance-none rounded-2xl border border-line bg-white py-3 text-sm font-extrabold text-ink outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 ${
            selectedGroup ? 'pl-10 pr-10' : 'px-4 pr-10'
          }`}
        />
        {selectedGroup && !open ? (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5"
            aria-hidden
          >
            <CountryFlag
              country={selectedGroup.country}
              className="h-3 w-[18px]"
              title={selectedGroup.country}
            />
          </div>
        ) : null}
        <span
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted"
          aria-hidden
        >
          {open ? '✕' : '▾'}
        </span>
      </div>
      {menu}
    </div>
  )
}
