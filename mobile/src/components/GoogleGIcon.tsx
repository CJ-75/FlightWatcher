import React from 'react'
import { Image, StyleSheet, View } from 'react-native'

/** Classic Google « G » logo used in Sign-In branding docs. */
const GOOGLE_G_PNG =
  'https://developers.google.com/identity/images/g-logo.png'

type Props = {
  size?: number
}

export function GoogleGIcon({ size = 22 }: Props) {
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Image
        source={{ uri: GOOGLE_G_PNG }}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  )
}

export function prefetchGoogleG() {
  void Image.prefetch(GOOGLE_G_PNG)
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
