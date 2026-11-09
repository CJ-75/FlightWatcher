import React from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

type Props = {
  size?: number
  color?: string
}

/** Classic Apple mark for Sign in with Apple. */
export function AppleLogoIcon({ size = 22, color = '#FFFFFF' }: Props) {
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityIgnoresInvertColors>
        <Path
          fill={color}
          d="M16.365 1.43c0 1.14-.418 2.208-1.19 3.048-.807.89-2.15 1.576-3.287 1.485-.148-1.106.43-2.25 1.19-3.048.807-.85 2.2-1.48 3.287-1.485zm5.07 16.428c-.51 1.17-.75 1.69-1.4 2.725-.91 1.43-2.19 3.21-3.78 3.23-1.41.02-1.78-.92-3.7-.91-1.92.01-2.33.93-3.74.91-1.59-.02-2.81-1.63-3.72-3.06-2.54-4.02-2.81-8.74-1.24-11.24 1.12-1.78 2.89-2.82 4.55-2.82 1.69 0 2.75 1.02 4.14 1.02 1.35 0 2.17-1.03 4.15-1.03 1.48 0 3.05.8 4.16 2.19-3.65 2-3.05 7.23.58 8.99z"
        />
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
