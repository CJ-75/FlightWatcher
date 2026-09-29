import React from 'react'
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { DateAvecHoraire } from '@flightwatcher/shared'
import { TIME_PRESETS, formatDateFr } from '@flightwatcher/shared'
import { colors, fonts } from '../theme'

type Props = {
  visible: boolean
  date: DateAvecHoraire | null
  type: 'depart' | 'retour'
  onClose: () => void
  onUpdate: (date: DateAvecHoraire) => void
}

export function HoursSheet({ visible, date, type, onClose, onUpdate }: Props) {
  const insets = useSafeAreaInsets()
  if (!date) return null

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>
          Horaires · {type === 'depart' ? 'Aller' : 'Retour'}
        </Text>
        <Text style={styles.sub}>{formatDateFr(date.date)}</Text>
        <Text style={styles.current}>
          {date.heure_min || '06:00'} → {date.heure_max || '23:59'}
        </Text>
        <View style={styles.grid}>
          {TIME_PRESETS.map((p) => {
            const active = date.heure_min === p.min && date.heure_max === p.max
            return (
              <Pressable
                key={p.id}
                onPress={() => {
                  onUpdate({ ...date, heure_min: p.min, heure_max: p.max })
                  onClose()
                }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={styles.emoji}>{p.emoji}</Text>
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{p.label}</Text>
                <Text style={[styles.chipRange, active && styles.chipLabelActive]}>
                  {p.min}–{p.max}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(12,18,34,0.45)' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    marginBottom: 14,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 18,
    lineHeight: 24,
    color: colors.ink,
    includeFontPadding: false,
  },
  sub: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    marginTop: 2,
    includeFontPadding: false,
  },
  current: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    lineHeight: 22,
    color: colors.primary,
    marginVertical: 12,
    includeFontPadding: false,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    width: '48%',
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    padding: 12,
    backgroundColor: colors.canvas,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  emoji: { fontSize: 18, marginBottom: 4 },
  chipLabel: {
    fontFamily: fonts.bold,
    fontSize: 14,
    lineHeight: 18,
    color: colors.ink,
    includeFontPadding: false,
  },
  chipLabelActive: { color: colors.primaryInk },
  chipRange: {
    fontFamily: fonts.medium,
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
    marginTop: 2,
    includeFontPadding: false,
  },
})
