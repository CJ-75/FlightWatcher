import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { colors, fonts, spacing } from '../theme'

type Props = {
  title: string
  onClose: () => void
  closeLabel?: string
}

/** Compact modal top bar (pay / in-app browser) — same language as stack back. */
export function ModalScreenHeader({
  title,
  onClose,
  closeLabel = 'Fermer',
}: Props) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onClose}
        style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
      >
        <Text style={styles.closeText}>{closeLabel}</Text>
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.spacer} />
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: colors.canvas,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  close: {
    minWidth: 72,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closePressed: {
    backgroundColor: colors.primaryMuted,
  },
  closeText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.primaryDeep,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.semibold,
    fontSize: 15,
    letterSpacing: -0.2,
    color: colors.ink,
    paddingHorizontal: 8,
  },
  spacer: { minWidth: 72 },
})
