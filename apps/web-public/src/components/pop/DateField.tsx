'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatDateLocal, formatIsoDateFrSlash } from '@waypop/shared'

type Props = {
  value: string
  onChange: (iso: string) => void
  minDate?: string
  className?: string
}

const MONTHS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
]
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

function parseIso(iso: string): Date | null {
  const s = String(iso || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return new Date(`${s}T12:00:00`)
}

export function DateField({ value, onChange, minDate, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => {
    const d = parseIso(value) || new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(
    null,
  )

  useEffect(() => {
    const d = parseIso(value)
    if (d) setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
  }, [value])

  useEffect(() => {
    if (!open || !rootRef.current) {
      setPos(null)
      return
    }
    const r = rootRef.current.getBoundingClientRect()
    setPos({
      top: r.bottom + 6,
      left: Math.min(r.left, window.innerWidth - 300),
      width: Math.max(r.width, 280),
    })
  }, [open, month])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: Event) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onDoc, true)
    return () => document.removeEventListener('pointerdown', onDoc, true)
  }, [open])

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const startPad = (first.getDay() + 6) % 7
    const daysInMonth = new Date(
      month.getFullYear(),
      month.getMonth() + 1,
      0,
    ).getDate()
    const out: Array<{ day: number; iso: string } | null> = []
    for (let i = 0; i < startPad; i++) out.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(month.getFullYear(), month.getMonth(), d)
      out.push({ day: d, iso: formatDateLocal(date) })
    }
    return out
  }, [month])

  const min = minDate || ''
  const label = value ? formatIsoDateFrSlash(value) : 'JJ/MM/AAAA'

  const menu =
    open && pos
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[13000] rounded-2xl border border-line bg-white p-3 pb-2 shadow-lift"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
          >
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-sand"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() - 1, 1),
                  )
                }
                aria-label="Mois précédent"
              >
                ‹
              </button>
              <p className="text-sm font-extrabold text-ink">
                {MONTHS[month.getMonth()]} {month.getFullYear()}
              </p>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-sand"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() + 1, 1),
                  )
                }
                aria-label="Mois suivant"
              >
                ›
              </button>
            </div>
            <div className="mb-1 grid grid-cols-7 gap-1">
              {DAYS.map((d) => (
                <span
                  key={d}
                  className="text-center text-[10px] font-bold uppercase tracking-wide text-ink-muted"
                >
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, i) => {
                if (!cell) return <span key={`e-${i}`} className="h-9" />
                const disabled = !!min && cell.iso < min
                const selected = cell.iso === value
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onChange(cell.iso)
                      setOpen(false)
                    }}
                    className={`flex h-9 items-center justify-center rounded-full text-sm font-bold ${
                      selected
                        ? 'bg-ink text-cream'
                        : disabled
                          ? 'cursor-not-allowed text-ink-muted/40'
                          : 'text-ink hover:bg-accent-soft'
                    }`}
                  >
                    {cell.day}
                  </button>
                )
              })}
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-h-[44px] items-center justify-between rounded-xl border border-line bg-white px-3 py-2.5 text-left text-sm font-semibold text-ink"
      >
        <span className={value ? 'text-ink' : 'font-medium text-ink-muted'}>
          {label}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
          className="text-ink-muted"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 11h18" />
        </svg>
      </button>
      {menu}
    </div>
  )
}
