import type { ReactNode } from 'react'

/** Next-only meta tag. */
export function WpTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
      {children}
    </span>
  )
}
