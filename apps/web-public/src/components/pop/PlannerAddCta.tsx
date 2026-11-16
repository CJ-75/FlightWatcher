'use client'

import { useAuthGateNavigate } from '@/components/auth/useAuthGateNavigate'

type Props = {
  href: string
  className?: string
  children?: React.ReactNode
  /** planner = peach fill CTA ; ink = hero dark pill */
  variant?: 'planner' | 'ink'
}

export function PlannerAddCta({
  href,
  className = '',
  children,
  variant = 'planner',
}: Props) {
  const gate = useAuthGateNavigate()

  const tone =
    variant === 'ink'
      ? 'wp-cta-ink px-5 py-3 text-sm sm:px-7 sm:py-3.5'
      : 'wp-cta-planner !rounded-xl !px-4 !py-3 !text-sm'

  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault()
        gate(href)
      }}
      className={`inline-flex items-center justify-center gap-2 leading-none ${tone} ${className}`}
    >
      {children ?? (
        <>
          <span>Ajouter au Planner</span>
          {variant === 'planner' ? (
            <span
              className="wp-cta-planner-arrow inline-flex items-center leading-none"
              aria-hidden
            >
              →
            </span>
          ) : null}
        </>
      )}
    </a>
  )
}
