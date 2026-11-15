import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  className?: string
}

/** SPA card: white + border-line + rounded-2xl/3xl + shadow-soft */
export function Card({ children, className = '' }: Props) {
  return (
    <div
      className={`rounded-3xl border border-line bg-surface shadow-soft ${className}`}
    >
      {children}
    </div>
  )
}
