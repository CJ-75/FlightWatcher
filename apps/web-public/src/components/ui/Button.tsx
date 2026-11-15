import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'ink' | 'ghost'

const variants: Record<Variant, string> = {
  /** SPA: .app-btn-primary + rounded-2xl px-5 py-3 */
  primary: 'app-btn-primary',
  /** Maquette: pill sombre */
  ink: 'app-btn-ink',
  ghost:
    'inline-flex items-center justify-center gap-2 rounded-2xl border border-line bg-white px-5 py-3 text-sm font-bold text-ink hover:bg-primary-50',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  children: ReactNode
}

/** SPA ↔ Next: button primary / ghost chips — same Tailwind classes as DealsTab CTAs. */
export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <button type="button" className={`${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  )
}
