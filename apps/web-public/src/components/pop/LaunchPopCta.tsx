'use client'

import { useState } from 'react'
import type { ItineraryItem } from '@waypop/shared'
import { useAuthSheet } from '@/components/auth/AuthHost'
import { auth } from '@/lib/auth'
import { LaunchPopSheet } from '@/components/pop/LaunchPopSheet'

type Props = {
  items: ItineraryItem[]
  itineraryId: string
  title?: string
  className?: string
  size?: 'md' | 'sm'
  /** soft = body (pêche douce) ; hero = verre sur photo */
  variant?: 'soft' | 'hero'
}

export function LaunchPopCta({
  items,
  itineraryId,
  title,
  className = '',
  size = 'md',
  variant = 'soft',
}: Props) {
  const { openAuthSheet, signedIn } = useAuthSheet()
  const [open, setOpen] = useState(false)

  const pad =
    size === 'sm' ? 'px-4 py-2.5 text-sm' : 'px-5 py-3 text-sm sm:px-6 sm:py-3.5'

  const tone =
    variant === 'hero'
      ? 'border border-white/25 bg-white/10 text-white backdrop-blur-sm hover:bg-white/15'
      : 'bg-ink text-cream shadow-[0_12px_28px_rgba(29,27,25,0.28)] hover:bg-[#2a2724]'

  const openSheet = () => setOpen(true)

  const onClick = () => {
    void (async () => {
      const user = signedIn ? true : Boolean(await auth.getCurrentUser())
      if (!user) {
        openAuthSheet({
          trigger: 'favorite',
          pending: {
            type: 'create_trip_from_parcours',
            trigger: 'favorite',
            payload: { itineraryId },
            createdAt: Date.now(),
          },
          onAuthenticated: openSheet,
        })
        return
      }
      openSheet()
    })()
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center justify-center gap-2 rounded-2xl font-bold leading-none transition-colors ${tone} ${pad} ${className}`}
      >
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
          <PlayIcon />
        </span>
        <span>Lancer le Pop</span>
      </button>
      <LaunchPopSheet
        open={open}
        title={title}
        items={items}
        itineraryId={itineraryId}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

function PlayIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="block translate-x-[0.5px]"
    >
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z" />
    </svg>
  )
}
