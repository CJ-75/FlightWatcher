'use client'

import { useEffect, useState } from 'react'
import { useAuthSheet } from '@/components/auth/AuthHost'
import { auth } from '@/lib/auth'
import { isPopKept, setPopKept } from '@/lib/keptPops'

type Props = {
  city: string
  slug: string
  title: string
  className?: string
  variant?: 'ghost' | 'icon'
}

export function KeepButton({
  city,
  slug,
  title,
  className = '',
  variant = 'ghost',
}: Props) {
  const key = `${city}/${slug}`
  const [kept, setKept] = useState(false)
  const { openAuthSheet, signedIn } = useAuthSheet()

  const sync = () => setKept(isPopKept(key))

  useEffect(() => {
    sync()
    const onChange = () => sync()
    window.addEventListener('wp:kept-changed', onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener('wp:kept-changed', onChange)
      window.removeEventListener('storage', onChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key is the storage identity
  }, [key])

  const applyToggle = (nextKept: boolean) => {
    setPopKept(key, { city, slug, title }, nextKept)
    setKept(nextKept)
  }

  const onClick = () => {
    void (async () => {
      // Unkeep stays local; only “like” requires auth
      if (kept) {
        applyToggle(false)
        return
      }
      const user = signedIn ? true : Boolean(await auth.getCurrentUser())
      if (!user) {
        openAuthSheet({
          trigger: 'favorite',
          pending: {
            type: 'like_itinerary',
            trigger: 'favorite',
            payload: { city, slug, title },
            createdAt: Date.now(),
          },
          onAuthenticated: () => applyToggle(true),
        })
        return
      }
      applyToggle(true)
    })()
  }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={kept}
        aria-label={kept ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        title={kept ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/95 shadow-soft transition-colors hover:bg-white [&>svg]:block ${
          kept ? 'text-[#FF6B35]' : 'text-ink'
        } ${className}`}
      >
        <HeartIcon filled={kept} />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
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

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}
