'use client'

import { useEffect, useState } from 'react'

/**
 * Preview only — never in production builds without an explicit preview cookie.
 * Next.js Dev Tools are already omitted from `next start` / Vercel prod.
 */
export function PreviewBadge() {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      try {
        const raw = document.cookie || ''
        const pop = raw.match(/(?:^|;\s*)pop_v=([12])/)?.[1]
        const landing = raw.match(/(?:^|;\s*)landing_v=([12])/)?.[1]
        if (pop) setLabel(`Preview Pop v${pop}`)
        else if (landing) setLabel(`Preview Landing v${landing}`)
      } catch {
        /* ignore */
      }
      return
    }
    // Dev: show only when preview cookie is set (same as prod preview)
    try {
      const raw = document.cookie || ''
      const pop = raw.match(/(?:^|;\s*)pop_v=([12])/)?.[1]
      const landing = raw.match(/(?:^|;\s*)landing_v=([12])/)?.[1]
      if (pop) setLabel(`Preview Pop v${pop}`)
      else if (landing) setLabel(`Preview Landing v${landing}`)
    } catch {
      /* ignore */
    }
  }, [])

  if (!label) return null
  return (
    <div
      className="fixed bottom-20 left-3 z-[60] rounded-pill bg-ink px-3 py-1.5 text-[11px] font-bold text-[color:var(--fw-primary-fg)] shadow-lift sm:bottom-4"
      role="status"
    >
      {label} ·{' '}
      <a
        href="?pop_v=reset"
        className="text-primary-100 no-underline hover:underline"
      >
        reset
      </a>
    </div>
  )
}
