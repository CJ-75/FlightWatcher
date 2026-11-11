import React from 'react'
import { View } from 'react-native'

type Props = {
  /** Outer mark size (px). Default 18. */
  size?: number
  /** Bar thickness (px). Default 2.5. */
  thickness?: number
  color?: string
}

/**
 * Geometric “+” — no font metrics, always optically centered in a FAB.
 */
export function FabPlusMark({
  size = 18,
  thickness = 2.5,
  color = '#fff',
}: Props) {
  const bar = {
    position: 'absolute' as const,
    backgroundColor: color,
    borderRadius: thickness / 2,
  }
  return (
    <View
      pointerEvents="none"
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View style={[bar, { width: size, height: thickness }]} />
      <View style={[bar, { width: thickness, height: size }]} />
    </View>
  )
}
