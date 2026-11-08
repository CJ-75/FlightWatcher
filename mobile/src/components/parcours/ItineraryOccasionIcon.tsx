import React from 'react'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import type { ItineraryOccasion } from '@flightwatcher/shared'

type Props = {
  occasion: ItineraryOccasion | string
  size?: number
  color?: string
}

export function ItineraryOccasionIcon({
  occasion,
  size = 18,
  color = '#FF6B35',
}: Props) {
  const s = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
  }
  const stroke = {
    stroke: color,
    strokeWidth: 1.85,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  switch (occasion) {
    case 'romantique':
      return (
        <Svg {...s}>
          <Path
            d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.8C19 15.6 12 20 12 20z"
            {...stroke}
          />
        </Svg>
      )
    case 'ferie':
      return (
        <Svg {...s}>
          <Rect x="3" y="5" width="18" height="16" rx="2" {...stroke} />
          <Path d="M16 3v4M8 3v4M3 11h18" {...stroke} />
        </Svg>
      )
    case 'soleil':
      return (
        <Svg {...s}>
          <Circle cx="12" cy="12" r="4" {...stroke} />
          <Path
            d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
            {...stroke}
          />
        </Svg>
      )
    case 'pluie':
      return (
        <Svg {...s}>
          <Path
            d="M7 15a5 5 0 1 1 9.9-1.5A3.5 3.5 0 1 1 17 20H7.5A3.5 3.5 0 0 1 7 15z"
            {...stroke}
          />
          <Path d="M9 21v1M12 20v2M15 21v1" {...stroke} />
        </Svg>
      )
    case 'petit_budget':
      return (
        <Svg {...s}>
          <Path d="M18 6.5a7 7 0 1 0 0 11" {...stroke} />
          <Path d="M6 10h8M6 14h8" {...stroke} />
        </Svg>
      )
    case 'nuit':
      return (
        <Svg {...s}>
          <Path d="M20 14.5A7.5 7.5 0 1 1 10 4.5 6 6 0 0 0 20 14.5z" {...stroke} />
        </Svg>
      )
    default:
      return (
        <Svg {...s}>
          <Circle cx="9" cy="8" r="3" {...stroke} />
          <Circle cx="16" cy="9" r="2.5" {...stroke} />
          <Path d="M3 19c0-3 2.5-5 6-5s6 2 6 5" {...stroke} />
        </Svg>
      )
  }
}
