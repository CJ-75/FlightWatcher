import type { OccasionIconId } from '@flightwatcher/shared'
import { resolveOccasionIconId } from '@flightwatcher/shared'

type Props = {
  icon?: string | null
  slug?: string | null
  size?: number
  className?: string
}

/** Stroke SVG icons for occasion chips (no external icon pack). */
export function OccasionIcon({ icon, slug, size = 18, className }: Props) {
  const id = resolveOccasionIconId(icon, slug)
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <OccasionIconPaths id={id} />
    </svg>
  )
}

function OccasionIconPaths({ id }: { id: OccasionIconId }) {
  switch (id) {
    case 'briefcase':
      return (
        <>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M3 13h18" />
          <path d="M9 13v2" />
          <path d="M15 13v2" />
        </>
      )
    case 'calendar':
      return (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4" />
          <path d="M8 3v4" />
          <path d="M3 11h18" />
          <path d="M8 15h2" />
          <path d="M14 15h2" />
        </>
      )
    case 'clock':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      )
    case 'heart':
      return (
        <path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.6 12 20 12 20z" />
      )
    case 'gift':
      return (
        <>
          <rect x="4" y="10" width="16" height="10" rx="1.5" />
          <path d="M12 10v10" />
          <path d="M4 14h16" />
          <path d="M12 10c-2.5 0-4-1.6-4-3.2S9.5 4 12 6.2 16 4 16 6.8 13.5 10 12 10z" />
        </>
      )
    case 'euro':
      return (
        <>
          <path d="M18 6.5a7 7 0 1 0 0 11" />
          <path d="M6 10h8" />
          <path d="M6 14h8" />
        </>
      )
    case 'compass':
      return (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m14.5 9.5-1.8 4.7-4.7 1.8 1.8-4.7z" />
        </>
      )
    case 'sun':
      return (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.9 4.9 1.4 1.4" />
          <path d="m17.7 17.7 1.4 1.4" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m4.9 19.1 1.4-1.4" />
          <path d="m17.7 6.3 1.4-1.4" />
        </>
      )
    case 'thermometer':
      return (
        <>
          <path d="M12 3a2.5 2.5 0 0 1 2.5 2.5V14a3.5 3.5 0 1 1-5 0V5.5A2.5 2.5 0 0 1 12 3z" />
          <path d="M12 14v3" />
        </>
      )
    case 'luggage':
      return (
        <>
          <rect x="5" y="8" width="14" height="12" rx="2" />
          <path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          <path d="M5 13h14" />
        </>
      )
    case 'tree':
      return (
        <>
          <path d="M12 21v-5" />
          <path d="M8 21h8" />
          <path d="M12 3 7 10h3l-3 5h10l-3-5h3z" />
        </>
      )
    case 'bridge':
      return (
        <>
          <path d="M4 16v-2a8 8 0 0 1 16 0v2" />
          <path d="M4 16h16" />
          <path d="M8 16v-3" />
          <path d="M12 16v-4" />
          <path d="M16 16v-3" />
          <path d="M3 19h18" />
        </>
      )
    case 'champagne':
      return (
        <>
          <path d="M9 3h6l-1 8a3 3 0 0 1-4 0z" />
          <path d="M12 14v5" />
          <path d="M9 21h6" />
          <path d="M16 4c1.5.5 2.5 2 2.5 3.5" />
          <path d="m18 2 .5 1.5L20 4l-1.5.5L18 6l-.5-1.5L16 4l1.5-.5z" />
        </>
      )
    case 'moon':
      return <path d="M20 14.5A7.5 7.5 0 0 1 9.5 4 7.5 7.5 0 1 0 20 14.5z" />
    case 'sparkles':
    default:
      return (
        <>
          <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
          <path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z" />
        </>
      )
  }
}
