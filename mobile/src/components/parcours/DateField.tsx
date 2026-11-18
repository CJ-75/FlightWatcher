import React, { useMemo, useState } from 'react'
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { formatDateLocal, formatIsoDateFrSlash } from '@waypop/shared'
import { colors, fonts } from '../../theme'

type Props = {
  value: string
  onChange: (iso: string) => void
  minDate?: string
}

const MONTHS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
]
const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function parseIso(iso: string): Date | null {
  const s = String(iso || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  return new Date(`${s}T12:00:00`)
}

export function DateField({ value, onChange, minDate }: Props) {
  const [open, setOpen] = useState(false)
  const initial = parseIso(value) || new Date()
  const [month, setMonth] = useState(
    () => new Date(initial.getFullYear(), initial.getMonth(), 1),
  )

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const startPad = (first.getDay() + 6) % 7
    const daysInMonth = new Date(
      month.getFullYear(),
      month.getMonth() + 1,
      0,
    ).getDate()
    const out: Array<{ day: number; iso: string } | null> = []
    for (let i = 0; i < startPad; i++) out.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(month.getFullYear(), month.getMonth(), d)
      out.push({ day: d, iso: formatDateLocal(date) })
    }
    return out
  }, [month])

  const min = minDate || ''
  const label = value ? formatIsoDateFrSlash(value) : 'JJ/MM/AAAA'

  return (
    <>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={[styles.triggerText, !value && styles.triggerMuted]}>
          {label}
        </Text>
        <View style={styles.calIcon}>
          <View style={styles.calIconTop} />
          <View style={styles.calIconBody} />
        </View>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <Pressable
                style={styles.navBtn}
                onPress={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() - 1, 1),
                  )
                }
              >
                <Text style={styles.navText}>‹</Text>
              </Pressable>
              <Text style={styles.monthTitle}>
                {MONTHS[month.getMonth()]} {month.getFullYear()}
              </Text>
              <Pressable
                style={styles.navBtn}
                onPress={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() + 1, 1),
                  )
                }
              >
                <Text style={styles.navText}>›</Text>
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {DAYS.map((d, i) => (
                <Text key={`${d}-${i}`} style={styles.weekDay}>
                  {d}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {cells.map((cell, i) => {
                if (!cell) {
                  return <View key={`e-${i}`} style={styles.dayCell} />
                }
                const disabled = !!min && cell.iso < min
                const selected = cell.iso === value
                return (
                  <Pressable
                    key={cell.iso}
                    disabled={disabled}
                    onPress={() => {
                      onChange(cell.iso)
                      setOpen(false)
                    }}
                    style={[
                      styles.dayCell,
                      selected && styles.daySelected,
                      disabled && styles.dayDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        selected && styles.dayTextSelected,
                        disabled && styles.dayTextDisabled,
                      ]}
                    >
                      {cell.day}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <Pressable style={styles.close} onPress={() => setOpen(false)}>
              <Text style={styles.closeText}>Fermer</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    marginTop: 6,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
  },
  triggerText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  triggerMuted: {
    fontFamily: fonts.medium,
    color: colors.muted,
  },
  calIcon: {
    width: 16,
    height: 16,
    justifyContent: 'flex-end',
  },
  calIconTop: {
    height: 3,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    backgroundColor: colors.muted,
  },
  calIconBody: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.muted,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    marginTop: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F4EF',
  },
  navText: { fontFamily: fonts.bold, fontSize: 22, color: colors.ink },
  monthTitle: { fontFamily: fonts.extrabold, fontSize: 15, color: colors.ink },
  weekRow: { flexDirection: 'row', marginBottom: 2 },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.muted,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: '14.28%',
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelected: {
    backgroundColor: colors.ink,
    borderRadius: 999,
  },
  dayDisabled: { opacity: 0.35 },
  dayText: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  dayTextSelected: { color: '#fff' },
  dayTextDisabled: { color: colors.muted },
  close: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F7F4EF',
  },
  closeText: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
})
