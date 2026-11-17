'use client'

import { useRouter } from 'next/navigation'

type Props = {
  /** Fallback if no history (deep link) */
  href: string
  className?: string
}

/** Retour discret — au-dessus du fil d’Ariane. */
export function PopBackButton({ href, className = '' }: Props) {
  const router = useRouter()

  return (
    <button
      type="button"
      aria-label="Retour"
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          router.back()
          return
        }
        router.push(href)
      }}
      className={`inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide text-white/75 transition hover:text-white ${className}`}
    >
      <BackIcon />
      <span>Retour</span>
    </button>
  )
}

function BackIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
