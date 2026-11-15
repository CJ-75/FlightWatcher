'use client'

import { useCallback, useState } from 'react'

/** Tiny client island — Web Share API with WhatsApp fallback. */
export function ShareButton({ title, url }: { title: string; url?: string }) {
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
      /* user cancel or unsupported */
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

  return (
    <button
      type="button"
      onClick={() => void share()}
      className="inline-flex items-center rounded-2xl border border-line bg-white px-4 py-2.5 text-sm font-bold text-ink hover:bg-primary-50"
    >
      {copied ? 'Lien copié' : 'Partager'}
    </button>
  )
}
