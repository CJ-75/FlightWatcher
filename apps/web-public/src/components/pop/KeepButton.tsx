'use client'

import { useEffect, useState } from 'react'

const LS = 'fw_kept_pops'

type Props = {
  city: string
  slug: string
  title: string
  className?: string
}

export function KeepButton({ city, slug, title, className = '' }: Props) {
  const key = `${city}/${slug}`
  const [kept, setKept] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS)
      const list = raw ? (JSON.parse(raw) as string[]) : []
      setKept(list.includes(key))
    } catch {
      /* ignore */
    }
  }, [key])

  const toggle = () => {
    try {
      const raw = localStorage.getItem(LS)
      const list = raw ? (JSON.parse(raw) as string[]) : []
      const next = kept ? list.filter((x) => x !== key) : [...list, key]
      localStorage.setItem(LS, JSON.stringify(next))
      if (!kept) {
        localStorage.setItem(
          `${LS}:${key}`,
          JSON.stringify({ city, slug, title, at: Date.now() }),
        )
      }
      setKept(!kept)
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={
        className.includes('bg-')
          ? `inline-flex items-center justify-center gap-2 rounded-2xl border px-6 py-3.5 text-sm font-bold tracking-tight ${className}`
          : `wp-cta-ghost ${className}`
      }
      aria-pressed={kept}
    >
      {kept ? 'Gardé ✓' : 'Garder'}
    </button>
  )
}
