import React from 'react'
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native'
import { colors } from '../../theme'

type Props = {
  value: boolean
  onValueChange: (next: boolean) => void
  disabled?: boolean
  style?: ViewStyle
}

/** Compact warm switch — no Animated (instant first paint). */
export function ElegantSwitch({
  value,
  onValueChange,
  disabled,
  style,
}: Props) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [
        styles.hit,
        style,
        (disabled || pressed) && { opacity: 0.72 },
      ]}
    >
      <View style={[styles.track, value && styles.trackOn]}>
        <View style={[styles.thumb, value && styles.thumbOn]} />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  hit: {
    justifyContent: 'center',
  },
  track: {
    width: 48,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#EDE4DC',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  trackOn: {
    backgroundColor: colors.primary,
  },
  thumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignSelf: 'flex-start',
    shadowColor: '#5C2E18',
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  thumbOn: {
    alignSelf: 'flex-end',
  },
})
