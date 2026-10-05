import React from 'react'
import { View, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { colors } from '../theme'

/** Shared warm peach canvas used across Main tabs. */
export function ScreenBackground() {
  return (
    <>
      <LinearGradient
        colors={['#FFDCC8', '#FFE8DC', '#FFF9F5']}
        locations={[0, 0.28, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.orbA} />
      <View pointerEvents="none" style={styles.orbB} />
    </>
  )
}

const styles = StyleSheet.create({
  orbA: {
    position: 'absolute',
    top: -60,
    right: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,107,53,0.12)',
  },
  orbB: {
    position: 'absolute',
    top: 180,
    left: -70,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,61,107,0.08)',
  },
})

export const screenCanvasColor = colors.canvas
