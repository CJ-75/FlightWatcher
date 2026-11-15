'use client'

import { useCallback, useState } from 'react'

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

  return (
    <button type="button" onClick={() => void share()} className="wp-cta-glass">
      {copied ? 'Lien copié' : 'Partager'}
    </button>
  )
}
