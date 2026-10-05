import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { colors, fonts } from '../theme'

const MIN = 1
const MAX = 6

type Props = {
  value: number
  onChange: (n: number) => void
}

export function PassengerStepper({ value, onChange }: Props) {
  const n = Math.min(MAX, Math.max(MIN, value || 1))

  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.label}>Passagers</Text>
        <Text style={styles.hint}>Adultes · budget = par personne</Text>
      </View>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => onChange(Math.max(MIN, n - 1))}
          disabled={n <= MIN}
          style={[styles.btn, n <= MIN && styles.btnDisabled]}
          hitSlop={8}
        >
          <Text style={[styles.btnText, n <= MIN && styles.btnTextDisabled]}>−</Text>
        </Pressable>
        <Text style={styles.value}>{n}</Text>
        <Pressable
          onPress={() => onChange(Math.min(MAX, n + 1))}
          disabled={n >= MAX}
          style={[styles.btn, n >= MAX && styles.btnDisabled]}
          hitSlop={8}
        >
          <Text style={[styles.btnText, n >= MAX && styles.btnTextDisabled]}>+</Text>
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
  copy: {
    flex: 1,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    includeFontPadding: false,
  },
  hint: {
    marginTop: 2,
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.faint,
    includeFontPadding: false,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  btn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnText: {
    fontFamily: fonts.bold,
    fontSize: 20,
    lineHeight: 22,
    color: colors.primary,
    includeFontPadding: false,
    marginTop: -1,
  },
  btnTextDisabled: {
    color: colors.faint,
  },
  value: {
    minWidth: 22,
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: 18,
    color: colors.ink,
    includeFontPadding: false,
  },
})
