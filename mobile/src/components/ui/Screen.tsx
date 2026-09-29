import React from 'react'
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, spacing } from '../../theme'

type Props = {
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
  /** Extra bottom padding beyond safe area (e.g. above tab bar) */
  bottomExtra?: number
  edges?: Array<'top' | 'bottom' | 'left' | 'right'>
  backgroundColor?: string
}

export function Screen({
  children,
  style,
  bottomExtra = 0,
  edges = ['top', 'left', 'right'],
  backgroundColor = colors.canvas,
}: Props) {
  const insets = useSafeAreaInsets()
  const pad = {
    paddingTop: edges.includes('top') ? Math.max(insets.top, spacing.sm) : 0,
    paddingBottom: edges.includes('bottom') ? insets.bottom + bottomExtra : bottomExtra,
    paddingLeft: edges.includes('left') ? Math.max(insets.left, spacing.xl) : spacing.xl,
    paddingRight: edges.includes('right') ? Math.max(insets.right, spacing.xl) : spacing.xl,
  }

  // Cast: monorepo has conflicting @types/react (web 18 vs mobile 19)
  return <View style={[styles.root, { backgroundColor }, pad, style]}>{children as never}</View>
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})
