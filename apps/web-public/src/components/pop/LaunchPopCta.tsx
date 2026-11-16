'use client'

import { useAuthGateNavigate } from '@/components/auth/useAuthGateNavigate'

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
  const gate = useAuthGateNavigate()

  const pad =
    size === 'sm' ? 'px-4 py-2.5 text-sm' : 'px-5 py-3 text-sm sm:px-6 sm:py-3.5'

  const tone =
    variant === 'hero'
      ? 'border border-white/25 bg-white/10 text-white backdrop-blur-sm hover:bg-white/15'
      : 'bg-ink text-cream shadow-[0_12px_28px_rgba(29,27,25,0.28)] hover:bg-[#2a2724]'

  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault()
        gate(href)
      }}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl font-bold leading-none no-underline transition-colors ${tone} ${pad} ${className}`}
    >
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
        <PlayIcon />
      </span>
      <span>Lancer le Pop</span>
    </a>
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
