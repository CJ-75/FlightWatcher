import type { ReactNode } from 'react'

type Props = {
  active?: boolean
  children: ReactNode
  className?: string
}

/**
 * SPA ↔ Next mapping:
 * DealsTab chip active: `rounded-full px-3 py-1.5 text-[11px] font-bold border bg-primary-500 text-white border-primary-500`
 * inactive: `bg-white text-muted border-line`
 */
export function Chip({ active, children, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-bold border ${
        active
          ? 'bg-primary-500 text-white border-primary-500'
          : 'bg-white text-muted border-line'
      } ${className}`}
    >
      {children}
    </span>
  )
}
