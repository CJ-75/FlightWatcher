import type { ReactNode } from 'react'

/** Next-only section label — quiet uppercase. */
export function WpEyebrow({
  children,
  tone = 'accent',
}: {
  children: ReactNode
  tone?: 'accent' | 'light' | 'muted'
}) {
  const color =
    tone === 'light'
      ? 'text-white/70'
      : tone === 'muted'
        ? 'text-muted'
        : 'text-primary-600'

  return (
    <p
      className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${color}`}
    >
      {children}
    </p>
  )
}
