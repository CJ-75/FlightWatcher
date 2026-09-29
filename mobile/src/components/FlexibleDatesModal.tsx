import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
  FlatList,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { DateAvecHoraire } from '@flightwatcher/shared'
import { formatDateFr, formatDateLocal, type FlexibleDates } from '@flightwatcher/shared'
import { HoursSheet } from './HoursSheet'
import { colors, fonts } from '../theme'

type Props = {
  visible: boolean
  value: FlexibleDates
  onChange: (v: FlexibleDates) => void
  onClose: () => void
}

function nextDays(count: number): string[] {
  const out: string[] = []
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  for (let i = 0; i < count; i++) {
    const cur = new Date(d)
    cur.setDate(d.getDate() + i)
    out.push(formatDateLocal(cur))
  }
  return out
}

export function FlexibleDatesModal({ visible, value, onChange, onClose }: Props) {
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState<'depart' | 'retour'>('depart')
  const [hoursTarget, setHoursTarget] = useState<DateAvecHoraire | null>(null)
  const days = useMemo(() => nextDays(60), [])

  const selected = tab === 'depart' ? value.dates_depart : value.dates_retour

  const toggleDate = (dateStr: string) => {
    const list = tab === 'depart' ? value.dates_depart : value.dates_retour
    const exists = list.find((d) => d.date === dateStr)
    let next: DateAvecHoraire[]
    if (exists) {
      next = list.filter((d) => d.date !== dateStr)
    } else {
      next = [...list, { date: dateStr, heure_min: '06:00', heure_max: '23:59' }]
      next.sort((a, b) => a.date.localeCompare(b.date))
    }
    if (tab === 'depart') {
      onChange({ ...value, dates_depart: next })
      if (!exists) setTab('retour')
    } else {
      onChange({ ...value, dates_retour: next })
    }
  }

  const updateHours = (updated: DateAvecHoraire) => {
    if (tab === 'depart') {
      onChange({
        ...value,
        dates_depart: value.dates_depart.map((d) => (d.date === updated.date ? updated : d)),
      })
    } else {
      onChange({
        ...value,
        dates_retour: value.dates_retour.map((d) => (d.date === updated.date ? updated : d)),
      })
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>Dates flexibles</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.done}>OK</Text>
          </Pressable>
        </View>

        <View style={styles.tabs}>
          {(['depart', 'retour'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              style={[styles.tab, tab === t && styles.tabActive]}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'depart' ? `Aller (${value.dates_depart.length})` : `Retour (${value.dates_retour.length})`}
              </Text>
            </Pressable>
          ))}
        </View>

        {selected.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectedRow}>
            {selected.map((d) => (
              <Pressable key={d.date} onPress={() => setHoursTarget(d)} style={styles.selectedChip}>
                <Text style={styles.selectedDate}>{formatDateFr(d.date)}</Text>
                <Text style={styles.selectedHours}>
                  {d.heure_min}–{d.heure_max}
                </Text>
                <Pressable
                  onPress={() => toggleDate(d.date)}
                  hitSlop={8}
                  style={styles.remove}
                >
                  <Text style={styles.removeText}>×</Text>
                </Pressable>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.hint}>Sélectionne une ou plusieurs dates {tab === 'depart' ? 'd’aller' : 'de retour'}</Text>
        )}

        <FlatList
          data={days}
          keyExtractor={(item) => item}
          numColumns={3}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
          renderItem={({ item }) => {
            const active = selected.some((d) => d.date === item)
            return (
              <Pressable
                onPress={() => toggleDate(item)}
                style={[styles.dayCell, active && styles.dayCellActive]}
              >
                <Text style={[styles.dayText, active && styles.dayTextActive]}>
                  {formatDateFr(item)}
                </Text>
              </Pressable>
            )
          }}
        />
      </View>

      <HoursSheet
        visible={!!hoursTarget}
        date={hoursTarget}
        type={tab}
        onClose={() => setHoursTarget(null)}
        onUpdate={updateHours}
      />
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas, paddingTop: 10 },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 20,
    lineHeight: 26,
    color: colors.ink,
    includeFontPadding: false,
  },
  done: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    color: colors.primary,
    includeFontPadding: false,
  },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 18,
    gap: 8,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  tabActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tabText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    includeFontPadding: false,
  },
  tabTextActive: { color: colors.primaryInk },
  hint: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    paddingHorizontal: 18,
    marginBottom: 10,
    includeFontPadding: false,
  },
  selectedRow: { maxHeight: 72, marginBottom: 8, paddingLeft: 14 },
  selectedChip: {
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
  },
  selectedDate: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.primaryInk,
    includeFontPadding: false,
  },
  selectedHours: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.muted,
    includeFontPadding: false,
  },
  remove: { position: 'absolute', top: 2, right: 4 },
  removeText: { fontSize: 16, color: colors.primaryInk, fontFamily: fonts.bold },
  dayCell: {
    flex: 1,
    margin: 4,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  dayCellActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 15,
    color: colors.ink,
    textAlign: 'center',
    includeFontPadding: false,
  },
  dayTextActive: { color: colors.white },
})
