import React from 'react'
import { View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

type PopIconProps = {
  size?: number
  color?: string
}

/**
 * Icône Pop — éclat / spark (réutilisable tab + onboarding + UI).
 */
export function PopIcon({ size = 22, color = '#281F18' }: PopIconProps) {
  const stroke = Math.max(1.5, size * 0.085)
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {/* Main 4-point spark */}
        <Path
          d="M12 2.5c.35 3.2 1.9 5.4 4.5 6.5-2.6 1.1-4.15 3.3-4.5 6.5-.35-3.2-1.9-5.4-4.5-6.5 2.6-1.1 4.15-3.3 4.5-6.5Z"
          stroke={color}
          strokeWidth={stroke}
          strokeLinejoin="round"
        />
        {/* Small accent spark — top right */}
        <Path
          d="M19 3.5c.18 1.35.85 2.2 1.9 2.6-1.05.4-1.72 1.25-1.9 2.6-.18-1.35-.85-2.2-1.9-2.6 1.05-.4 1.72-1.25 1.9-2.6Z"
          stroke={color}
          strokeWidth={stroke * 0.9}
          strokeLinejoin="round"
        />
        {/* Small accent spark — bottom left */}
        <Path
          d="M5.2 16.2c.15 1.1.7 1.8 1.55 2.15-.85.35-1.4 1.05-1.55 2.15-.15-1.1-.7-1.8-1.55-2.15.85-.35 1.4-1.05 1.55-2.15Z"
          stroke={color}
          strokeWidth={stroke * 0.9}
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  )
}
