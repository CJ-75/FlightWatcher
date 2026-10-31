import React from 'react'
import { Image, StyleSheet, View } from 'react-native'

/** Official Google « G » product mark (PNG — RN Image). */
const GOOGLE_G_PNG =
  'https://www.gstatic.com/images/branding/product/2x/googleg_48dp.png'

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

/** Prefetch so the login CTA paints with the mark ready. */
export function prefetchGoogleG() {
  void Image.prefetch(GOOGLE_G_PNG)
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
