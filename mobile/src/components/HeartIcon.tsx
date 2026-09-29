import React from 'react'
import { View, StyleProp, ViewStyle } from 'react-native'
import { colors } from '../theme'

type Props = {
  size?: number
  /** Filled = solid brand heart; outline = soft muted heart */
  filled?: boolean
  color?: string
  style?: StyleProp<ViewStyle>
}

/** Geometric heart — sharper than emoji ♥ on iOS/Android. */
export function HeartIcon({
  size = 22,
  filled = true,
  color,
  style,
}: Props) {
  const tint = color ?? (filled ? colors.primary : colors.faint)
  const s = size
  const lobe = s * 0.56
  const diamond = s * 0.5

  return (
    <View
      style={[
        {
          width: s,
          height: s * 0.9,
          alignItems: 'center',
          opacity: filled ? 1 : 0.85,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', zIndex: 2 }}>
        <View
          style={{
            width: lobe,
            height: lobe,
            borderRadius: lobe / 2,
            backgroundColor: tint,
          }}
        />
        <View
          style={{
            width: lobe,
            height: lobe,
            borderRadius: lobe / 2,
            backgroundColor: tint,
            marginLeft: -lobe * 0.2,
          }}
        />
      </View>
      <View
        style={{
          width: diamond,
          height: diamond,
          backgroundColor: tint,
          transform: [{ rotate: '45deg' }],
          marginTop: -lobe * 0.5,
          zIndex: 1,
        }}
      />
    </View>
  )
}
