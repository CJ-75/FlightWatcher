import React from 'react'
import { Text, StyleSheet, type TextStyle, type StyleProp } from 'react-native'
import { fwColor, fwType } from '@flightwatcher/shared'
import { fonts } from '../theme'

type Props = {
  children: string
  style?: StyleProp<TextStyle>
}

/** Surtitre accent — jetons shared (§8.2). */
export function FwKicker({ children, style }: Props) {
  return <Text style={[styles.kicker, style]}>{children}</Text>
}

const styles = StyleSheet.create({
  kicker: {
    fontFamily: fonts.bold,
    fontSize: fwType.kicker.size,
    letterSpacing: fwType.kicker.trackingEm * fwType.kicker.size,
    textTransform: 'uppercase',
    color: fwColor.light.accent,
    includeFontPadding: false,
  },
})
