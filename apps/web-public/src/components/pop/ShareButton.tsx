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
  variant?: 'ghost' | 'link' | 'icon'
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

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={() => void share()}
        aria-label={copied ? 'Lien copié' : 'Partager'}
        title={copied ? 'Lien copié' : 'Partager'}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-ink shadow-soft transition-colors hover:bg-white ${className}`}
      >
        {copied ? (
          <CheckIcon />
        ) : (
          <ShareIcon />
        )}
      </button>
    )
  }

  const base =
    variant === 'link'
      ? 'border-0 bg-transparent p-0 text-xs font-bold text-ink/70 underline-offset-2 hover:text-ink hover:underline'
      : 'wp-cta-glass'

  return (
    <button
      type="button"
      onClick={() => void share()}
      className={`${base} ${className}`}
    >
      {copied ? 'Lien copié' : 'Partager'}
    </button>
  )
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8 7l4-4 4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"
        stroke="currentColor"
        strokeWidth="2"
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
        d="M5 12.5 10 17l9-10"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
