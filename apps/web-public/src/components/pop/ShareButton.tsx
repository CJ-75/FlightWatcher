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
  variant?: 'ghost' | 'link'
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
        `https://wa.me/?text=${encodeURIComponent(`${title} — ${href}`)}`,
        '_blank',
        'noopener,noreferrer',
      )
    }
  }, [title, url])

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
