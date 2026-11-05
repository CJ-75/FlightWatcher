import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { colors, fonts } from '../theme'

type Props = {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  label?: string
}

export function PassengerStepper({
  value,
  onChange,
  min = 1,
  max = 6,
  label = 'Qui part',
}: Props) {
  const n = Math.min(max, Math.max(min, value || min))

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => onChange(Math.max(min, n - 1))}
          disabled={n <= min}
          style={[styles.btn, n <= min && styles.btnDisabled]}
          hitSlop={8}
        >
          <Text style={[styles.btnText, n <= min && styles.btnTextDisabled]}>−</Text>
        </Pressable>
        <Text style={styles.value}>{n}</Text>
        <Pressable
          onPress={() => onChange(Math.min(max, n + 1))}
          disabled={n >= max}
          style={[styles.btn, n >= max && styles.btnDisabled]}
          hitSlop={8}
        >
          <Text style={[styles.btnText, n >= max && styles.btnTextDisabled]}>+</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  btn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.4 },
  btnText: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.primary,
    lineHeight: 24,
  },
  btnTextDisabled: { color: colors.muted },
  value: {
    minWidth: 24,
    textAlign: 'center',
    fontFamily: fonts.extrabold,
    fontSize: 18,
    color: colors.ink,
  },
})
