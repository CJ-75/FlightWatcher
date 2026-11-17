'use client'

import { useState } from 'react'
import { PopAddPlannerSheet } from '@/components/pop/PopAddPlannerSheet'

type Props = {
  /** @deprecated kept for call sites; sheet uses itinerary instead of href */
  href?: string
  className?: string
  children?: React.ReactNode
  /** planner = peach fill CTA ; ink = hero dark pill */
  variant?: 'planner' | 'ink'
  itineraryId: string
  itineraryTitle: string
  citySlug: string
  slug?: string | null
}

export function PlannerAddCta({
  className = '',
  children,
  variant = 'planner',
  itineraryId,
  itineraryTitle,
  citySlug,
  slug,
}: Props) {
  const [open, setOpen] = useState(false)

  const tone =
    variant === 'ink'
      ? 'wp-cta-ink px-5 py-3 text-sm sm:px-7 sm:py-3.5'
      : 'wp-cta-planner !rounded-xl !px-4 !py-3 !text-sm'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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
      </button>
      <PopAddPlannerSheet
        open={open}
        onClose={() => setOpen(false)}
        itinerary={{
          id: itineraryId,
          title: itineraryTitle,
          city_slug: citySlug,
          slug: slug || null,
        }}
      />
    </>
  )
}
