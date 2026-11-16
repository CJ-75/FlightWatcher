'use client'

import { useAuthSheet } from '@/components/auth/AuthHost'
import { auth, stashAuthReturn } from '@/lib/auth'

type Props = {
  href: string
  className?: string
  size?: 'md' | 'sm'
  /** soft = body (pêche douce) ; hero = verre sur photo */
  variant?: 'soft' | 'hero'
}

export function LaunchPopCta({
  href,
  className = '',
  size = 'md',
  variant = 'soft',
}: Props) {
  const { openAuthSheet, signedIn } = useAuthSheet()

  const pad =
    size === 'sm' ? 'px-4 py-2.5 text-sm' : 'px-5 py-3 text-sm sm:px-6 sm:py-3.5'

  const tone =
    variant === 'hero'
      ? 'border border-white/25 bg-white/10 text-white backdrop-blur-sm hover:bg-white/15'
      : 'bg-ink text-cream shadow-[0_12px_28px_rgba(29,27,25,0.28)] hover:bg-[#2a2724]'

  const go = () => {
    window.location.href = href
  }

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault()
    void (async () => {
      const user = signedIn ? true : Boolean(await auth.getCurrentUser())
      if (!user) {
        stashAuthReturn(href)
        openAuthSheet({
          trigger: 'favorite',
          pending: {
            type: 'create_trip_from_parcours',
            trigger: 'favorite',
            payload: { href },
            createdAt: Date.now(),
          },
          onAuthenticated: go,
        })
        return
      }
      go()
    })()
  }

  return (
    <a
      href={href}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-2xl font-bold no-underline transition-colors ${tone} ${pad} ${className}`}
    >
      <PlayIcon />
      Lancer le Pop
    </a>
  )
}

function PlayIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86a1 1 0 0 0-1.5.86z" />
    </svg>
  )
}
