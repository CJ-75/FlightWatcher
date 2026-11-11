import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { colors, fonts } from '../../theme'

const LABELS = ['Ville', 'Étapes', 'Aperçu'] as const

type Props = {
  step: 1 | 2 | 3
}

export function CreateFlowProgress({ step }: Props) {
  return (
    <View style={styles.wrap} accessibilityRole="progressbar">
      {LABELS.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3
        const done = n < step
        const active = n === step
        return (
          <View key={label} style={styles.item}>
            <View
              style={[
                styles.dot,
                done && styles.dotDone,
                active && styles.dotActive,
              ]}
            >
              {done ? <View style={styles.check} /> : null}
            </View>
            <Text
              style={[
                styles.label,
                (done || active) && styles.labelOn,
              ]}
            >
              {label}
            </Text>
            {i < LABELS.length - 1 ? (
              <View style={[styles.rail, done && styles.railDone]} />
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  dotDone: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  check: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.faint,
    marginLeft: 6,
    marginRight: 8,
  },
  labelOn: {
    color: colors.ink,
  },
  rail: {
    width: 18,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.line,
    marginRight: 8,
  },
  railDone: {
    backgroundColor: colors.primaryMuted,
  },
})
