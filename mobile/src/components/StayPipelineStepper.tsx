import React from 'react'
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native'
import type { StayPipelineStep, StayStepId } from '@flightwatcher/shared'
import { colors, fonts, radius } from '../theme'

type Props = {
  steps: StayPipelineStep[]
  onStepPress?: (id: StayStepId) => void
}

export function StayPipelineStepper({ steps, onStepPress }: Props) {
  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      {steps.map((s, i) => {
        const isOff = s.state === 'off'
        const isDone = s.state === 'done'
        const isCurrent = s.state === 'current'
        return (
          <React.Fragment key={s.id}>
            {i > 0 ? (
              <View
                style={[
                  styles.connector,
                  (isDone || steps[i - 1]?.state === 'done') && styles.connectorDone,
                ]}
              />
            ) : null}
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: isCurrent, disabled: isOff }}
              onPress={() => {
                if (isOff) {
                  Alert.alert('Bientôt', `${s.label} arrive bientôt sur FlightWatcher.`)
                  return
                }
                onStepPress?.(s.id)
              }}
              style={styles.step}
            >
              <View
                style={[
                  styles.dot,
                  isDone && styles.dotDone,
                  isCurrent && styles.dotCurrent,
                  isOff && styles.dotOff,
                ]}
              >
                <Text
                  style={[
                    styles.dotText,
                    (isDone || isCurrent) && styles.dotTextOn,
                    isOff && styles.dotTextOff,
                  ]}
                >
                  {isDone ? '✓' : i + 1}
                </Text>
              </View>
              <Text
                style={[
                  styles.label,
                  isCurrent && styles.labelCurrent,
                  isOff && styles.labelOff,
                  isDone && styles.labelDone,
                ]}
                numberOfLines={1}
              >
                {s.shortLabel}
              </Text>
              {s.hint ? (
                <Text
                  style={[styles.hint, isOff && styles.hintOff, isCurrent && styles.hintCurrent]}
                  numberOfLines={1}
                >
                  {s.hint}
                </Text>
              ) : null}
            </Pressable>
          </React.Fragment>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  connector: {
    flex: 1,
    height: 2,
    backgroundColor: colors.line,
    marginTop: 15,
    marginHorizontal: 2,
    borderRadius: 1,
  },
  connectorDone: {
    backgroundColor: colors.primaryMuted,
  },
  step: {
    alignItems: 'center',
    width: 64,
    gap: 4,
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
  },
  dotCurrent: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dotOff: {
    backgroundColor: colors.canvas,
    borderColor: colors.line,
    borderStyle: 'dashed',
  },
  dotText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.muted,
  },
  dotTextOn: {
    color: colors.white,
  },
  dotTextOff: {
    color: colors.faint,
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.muted,
    letterSpacing: -0.2,
  },
  labelCurrent: {
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  labelDone: {
    color: colors.inkSoft,
  },
  labelOff: {
    color: colors.faint,
  },
  hint: {
    fontFamily: fonts.medium,
    fontSize: 9,
    color: colors.faint,
  },
  hintCurrent: {
    color: colors.primaryInk,
  },
  hintOff: {
    color: colors.faint,
  },
})
