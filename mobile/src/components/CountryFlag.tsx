import React, { useMemo, useState } from 'react'
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native'
import { countryToFlagIso } from '@flightwatcher/shared'

export { countryToFlagIso }

type Props = {
  country?: string | null
  iso?: string | null
  style?: StyleProp<ImageStyle>
  size?: { width: number; height: number }
}

export function CountryFlag({
  country,
  iso: isoProp,
  style,
  size = { width: 20, height: 14 },
}: Props) {
  const iso = useMemo(
    () => (isoProp || countryToFlagIso(country) || '').toLowerCase() || null,
    [country, isoProp],
  )
  const [failed, setFailed] = useState(false)

  if (!iso || failed) {
    return (
      <View
        style={[styles.fallback, { width: size.width, height: size.height }]}
      />
    )
  }

  return (
    <Image
      source={{ uri: `https://flagcdn.com/w80/${iso}.png` }}
      style={[styles.flag, { width: size.width, height: size.height }, style]}
      resizeMode="cover"
      onError={() => setFailed(true)}
      accessibilityIgnoresInvertColors
    />
  )
}

const styles = StyleSheet.create({
  flag: {
    borderRadius: 2,
    backgroundColor: '#e8e4df',
  },
  fallback: {
    borderRadius: 2,
    backgroundColor: '#e8e4df',
  },
})
