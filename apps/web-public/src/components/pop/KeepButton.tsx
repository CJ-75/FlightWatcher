'use client'

import { useEffect, useState } from 'react'

const LS = 'fw_kept_pops'

type Props = {
  city: string
  slug: string
  title: string
  className?: string
}

function isSignedIn(): boolean {
  try {
    return /(?:^|;\s*)wp_signed_in=1(?:;|$)/.test(document.cookie)
  } catch {
    return false
  }
}

/** Heart-only keep — hidden when not logged in. */
export function KeepButton({ city, slug, title, className = '' }: Props) {
  const key = `${city}/${slug}`
  const [kept, setKept] = useState(false)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    setAuthed(isSignedIn())
    try {
      const raw = localStorage.getItem(LS)
      const list = raw ? (JSON.parse(raw) as string[]) : []
      setKept(list.includes(key))
    } catch {
      /* ignore */
    }
  }, [key])

  if (!authed) return null

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
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 ${className}`}
      aria-pressed={kept}
      aria-label={kept ? 'Retirer des gardés' : 'Garder'}
      title={kept ? 'Gardé' : 'Garder'}
    >
      <KeepIcon filled={kept} />
    </button>
  )
}

function KeepIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 21s-7.2-4.35-9.6-9.1C.9 8.7 2.4 5.5 6 5.5c2.1 0 3.5 1.2 4.2 2.2.7-1 2.1-2.2 4.2-2.2 3.6 0 5.1 3.2 3.6 6.4C19.2 16.65 12 21 12 21z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}
