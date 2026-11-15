'use client'

import { useCallback, useState } from 'react'

export function ShareButton({
  title,
  url,
  className = '',
  variant = 'ghost',
}: {
  title: string
  url?: string
  className?: string
  variant?: 'ghost' | 'link' | 'hero'
}) {
  const [copied, setCopied] = useState(false)

  const share = useCallback(async () => {
    const href =
      url || (typeof window !== 'undefined' ? window.location.href : '')
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title, url: href, text: title })
        return
      }
    } catch {
      /* cancel */
    }
    try {
      await navigator.clipboard.writeText(href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(`${title} ${href}`)}`,
        '_blank',
        'noopener,noreferrer',
      )
    }
  }, [title, url])

  const base =
    variant === 'hero'
      ? 'inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20'
      : variant === 'link'
        ? 'inline-flex h-9 w-9 items-center justify-center rounded-full text-ink/70 hover:bg-ink/5 hover:text-ink'
        : 'inline-flex h-11 w-11 items-center justify-center rounded-full border border-ink/15 bg-white text-ink hover:bg-sand'

  return (
    <button
      type="button"
      onClick={() => void share()}
      className={`${base} ${className}`}
      aria-label={copied ? 'Lien copié' : 'Partager'}
      title={copied ? 'Lien copié' : 'Partager'}
    >
      {copied ? <CheckIcon /> : <ShareIcon />}
    </button>
  )
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v11"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M8 7l4-4 4 4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 12v6a2 2 0 002 2h10a2 2 0 002-2v-6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12l5 5L20 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
