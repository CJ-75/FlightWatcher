import React from 'react'
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { colors, fonts, radius, spacing } from '../../theme'

const LABELS = ['L’idée', 'Les lieux', 'Le rendu'] as const

type Props = {
  step: 1 | 2 | 3
  style?: StyleProp<ViewStyle>
}

export function CreateFlowProgress({ step, style }: Props) {
  return (
    <View
      style={[styles.wrap, style]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: 3, now: step }}
    >
      {LABELS.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3
        const done = n < step
        const active = n === step
        return (
          <View key={label} style={styles.cell}>
            <Text
              style={[
                styles.label,
                done && styles.labelDone,
                active && styles.labelActive,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  done && styles.fillDone,
                  active && styles.fillActive,
                ]}
              />
            </View>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 4,
    marginBottom: 14,
    marginHorizontal: spacing.xl,
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.faint,
    marginBottom: 7,
    textAlign: 'center',
  },
  labelDone: {
    fontFamily: fonts.semibold,
    color: colors.primaryInk,
  },
  labelActive: {
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    width: 0,
    borderRadius: 2,
  },
  fillDone: {
    width: '100%',
    backgroundColor: colors.primaryMuted,
  },
  fillActive: {
    width: '100%',
    backgroundColor: colors.primary,
  },
})
