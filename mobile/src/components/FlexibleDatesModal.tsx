import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { DateAvecHoraire } from '@flightwatcher/shared'
import { formatDateFr, formatDateLocal, type FlexibleDates } from '@flightwatcher/shared'
import { HoursSheet } from './HoursSheet'
import { colors, fonts, shadow } from '../theme'

type Props = {
  visible: boolean
  value: FlexibleDates
  onChange: (v: FlexibleDates) => void
  onClose: () => void
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const DAY_SIZE = 40

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

function monthLabel(d: Date) {
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

function buildMonthCells(month: Date): (string | null)[] {
  const first = startOfMonth(month)
  const jsDay = first.getDay()
  const mondayOffset = jsDay === 0 ? 6 : jsDay - 1
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < mondayOffset; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(formatDateLocal(new Date(month.getFullYear(), month.getMonth(), day)))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function todayStr() {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  return formatDateLocal(t)
}

export function FlexibleDatesModal({ visible, value, onChange, onClose }: Props) {
  const insets = useSafeAreaInsets()
  const [tab, setTab] = useState<'depart' | 'retour'>('depart')
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [hoursTarget, setHoursTarget] = useState<DateAvecHoraire | null>(null)
  const today = useMemo(() => todayStr(), [])

  useEffect(() => {
    if (visible) {
      setCursor(startOfMonth(new Date()))
      setTab('depart')
    }
  }, [visible])

  const cells = useMemo(() => buildMonthCells(cursor), [cursor])
  const departSet = useMemo(() => new Set(value.dates_depart.map((d) => d.date)), [value.dates_depart])
  const retourSet = useMemo(() => new Set(value.dates_retour.map((d) => d.date)), [value.dates_retour])
  const selected = tab === 'depart' ? value.dates_depart : value.dates_retour

  const toggleDate = (dateStr: string) => {
    if (dateStr < today) return

    // Retour cannot be before first aller
    if (tab === 'retour' && value.dates_depart.length > 0) {
      const minAller = value.dates_depart.map((d) => d.date).sort()[0]
      if (dateStr < minAller) return
    }

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
    } else {
      onChange({ ...value, dates_retour: next })
    }
  }

  const clearCurrent = () => {
    if (tab === 'depart') onChange({ ...value, dates_depart: [] })
    else onChange({ ...value, dates_retour: [] })
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

  const removeDate = (type: 'depart' | 'retour', dateStr: string) => {
    if (type === 'depart') {
      onChange({
        ...value,
        dates_depart: value.dates_depart.filter((d) => d.date !== dateStr),
      })
    } else {
      onChange({
        ...value,
        dates_retour: value.dates_retour.filter((d) => d.date !== dateStr),
      })
    }
  }

  const canConfirm = value.dates_depart.length > 0 && value.dates_retour.length > 0
  const primaryCta =
    tab === 'depart'
      ? value.dates_depart.length === 0
        ? { label: 'Choisis au moins un aller', disabled: true, action: () => undefined }
        : {
            label: `Continuer · ${value.dates_depart.length} aller${value.dates_depart.length > 1 ? 's' : ''}`,
            disabled: false,
            action: () => setTab('retour'),
          }
      : canConfirm
        ? {
            label: `Valider · ${value.dates_depart.length} aller · ${value.dates_retour.length} retour`,
            disabled: false,
            action: onClose,
          }
        : {
            label: 'Choisis au moins un retour',
            disabled: true,
            action: () => undefined,
          }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.handle} />

        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Dates flexibles</Text>
            <Text style={styles.subtitle}>
              {tab === 'depart'
                ? 'Étape 1 — sélectionne un ou plusieurs allers'
                : 'Étape 2 — sélectionne un ou plusieurs retours'}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        </View>

        {/* Step pills */}
        <View style={styles.steps}>
          <Pressable
            onPress={() => setTab('depart')}
            style={[styles.step, tab === 'depart' && styles.stepActive]}
          >
            <View style={[styles.stepNum, tab === 'depart' && styles.stepNumActive]}>
              <Text style={[styles.stepNumText, tab === 'depart' && styles.stepNumTextActive]}>1</Text>
            </View>
            <View>
              <Text style={[styles.stepTitle, tab === 'depart' && styles.stepTitleActive]}>Allers</Text>
              <Text style={styles.stepMeta}>
                {value.dates_depart.length === 0
                  ? 'Aucun'
                  : `${value.dates_depart.length} date${value.dates_depart.length > 1 ? 's' : ''}`}
              </Text>
            </View>
          </Pressable>
          <View style={styles.stepLine} />
          <Pressable
            onPress={() => value.dates_depart.length > 0 && setTab('retour')}
            style={[
              styles.step,
              tab === 'retour' && styles.stepActive,
              value.dates_depart.length === 0 && styles.stepLocked,
            ]}
          >
            <View style={[styles.stepNum, tab === 'retour' && styles.stepNumActive]}>
              <Text style={[styles.stepNumText, tab === 'retour' && styles.stepNumTextActive]}>2</Text>
            </View>
            <View>
              <Text style={[styles.stepTitle, tab === 'retour' && styles.stepTitleActive]}>Retours</Text>
              <Text style={styles.stepMeta}>
                {value.dates_retour.length === 0
                  ? 'Aucun'
                  : `${value.dates_retour.length} date${value.dates_retour.length > 1 ? 's' : ''}`}
              </Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.monthNav}>
          <Pressable onPress={() => setCursor((c) => addMonths(c, -1))} style={styles.navBtn}>
            <Text style={styles.navBtnText}>‹</Text>
          </Pressable>
          <Text style={styles.monthTitle}>{monthLabel(cursor)}</Text>
          <Pressable onPress={() => setCursor((c) => addMonths(c, 1))} style={styles.navBtn}>
            <Text style={styles.navBtnText}>›</Text>
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {WEEKDAYS.map((w, i) => (
            <Text key={`${w}-${i}`} style={styles.weekDay}>
              {w}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((dateStr, i) => {
            if (!dateStr) return <View key={`e-${i}`} style={styles.cell} />

            const isDepart = departSet.has(dateStr)
            const isRetour = retourSet.has(dateStr)
            const isActive = tab === 'depart' ? isDepart : isRetour
            const isOther = tab === 'depart' ? isRetour : isDepart
            const past = dateStr < today
            const beforeAller =
              tab === 'retour' &&
              value.dates_depart.length > 0 &&
              dateStr < value.dates_depart.map((d) => d.date).sort()[0]
            const disabled = past || beforeAller
            const isToday = dateStr === today
            const dayNum = Number(dateStr.slice(8, 10))

            return (
              <Pressable
                key={dateStr}
                disabled={disabled}
                onPress={() => toggleDate(dateStr)}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.day,
                    isToday && !isActive && !isOther && styles.dayToday,
                    isOther && styles.dayOther,
                    isActive && styles.dayActive,
                    disabled && styles.dayDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      isOther && styles.dayTextOther,
                      isActive && styles.dayTextActive,
                      disabled && styles.dayTextDisabled,
                    ]}
                  >
                    {dayNum}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </View>

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
            <Text style={styles.legendText}>{tab === 'depart' ? 'Aller sélectionné' : 'Retour sélectionné'}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.primaryMuted }]} />
            <Text style={styles.legendText}>{tab === 'depart' ? 'Retour' : 'Aller'}</Text>
          </View>
        </View>

        {selected.length > 0 ? (
          <View style={styles.selectedBlock}>
            <View style={styles.selectedHeader}>
              <Text style={styles.selectedTitle}>
                {tab === 'depart' ? 'Allers' : 'Retours'} ({selected.length})
              </Text>
              <Pressable onPress={clearCurrent} hitSlop={8}>
                <Text style={styles.clearText}>Tout effacer</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {selected.map((d) => (
                <View key={d.date} style={styles.selectedChip}>
                  <Pressable onPress={() => setHoursTarget(d)} style={{ flex: 1 }}>
                    <Text style={styles.selectedDate}>{formatDateFr(d.date)}</Text>
                    <Text style={styles.selectedHours}>
                      {d.heure_min}–{d.heure_max}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => removeDate(tab, d.date)}
                    hitSlop={8}
                    style={styles.removeBtn}
                  >
                    <Text style={styles.removeText}>×</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
            <Text style={styles.hoursHint}>Touche une date pour régler les horaires</Text>
          </View>
        ) : (
          <Text style={styles.hint}>
            {tab === 'depart'
              ? 'Tape plusieurs jours si tu es flexible sur l’aller'
              : 'Tape les jours possibles pour le retour'}
          </Text>
        )}

        <Pressable
          onPress={primaryCta.action}
          disabled={primaryCta.disabled}
          style={[styles.confirm, primaryCta.disabled && styles.confirmDisabled, shadow.glow]}
        >
          <Text style={styles.confirmText}>{primaryCta.label}</Text>
        </Pressable>
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
  root: {
    flex: 1,
    backgroundColor: colors.white,
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    gap: 12,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.ink,
    letterSpacing: -0.5,
    includeFontPadding: false,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    marginTop: 4,
    includeFontPadding: false,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.primaryInk,
    includeFontPadding: false,
  },
  steps: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 6,
  },
  step: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  stepActive: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  stepLocked: { opacity: 0.45 },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumActive: { backgroundColor: colors.primary },
  stepNumText: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.primaryInk,
    includeFontPadding: false,
  },
  stepNumTextActive: { color: colors.white },
  stepTitle: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.inkSoft,
    includeFontPadding: false,
  },
  stepTitleActive: { color: colors.ink },
  stepMeta: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.muted,
    marginTop: 1,
    includeFontPadding: false,
  },
  stepLine: {
    width: 10,
    height: 2,
    backgroundColor: colors.lineStrong,
    borderRadius: 1,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnText: {
    fontFamily: fonts.bold,
    fontSize: 22,
    color: colors.primary,
    lineHeight: 26,
    includeFontPadding: false,
  },
  monthTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
    textTransform: 'capitalize',
    includeFontPadding: false,
  },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.faint,
    includeFontPadding: false,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '14.2857%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: {
    width: DAY_SIZE,
    height: DAY_SIZE,
    borderRadius: DAY_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayToday: {
    backgroundColor: colors.primarySoft,
  },
  dayOther: {
    backgroundColor: colors.primaryMuted,
  },
  dayActive: {
    backgroundColor: colors.primary,
  },
  dayDisabled: {
    opacity: 0.3,
  },
  dayText: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    lineHeight: 18,
    color: colors.ink,
    textAlign: 'center',
    includeFontPadding: false,
  },
  dayTextOther: {
    color: colors.primaryInk,
  },
  dayTextActive: {
    color: colors.white,
    fontFamily: fonts.bold,
  },
  dayTextDisabled: {
    color: colors.faint,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
    marginBottom: 8,
    justifyContent: 'center',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.muted,
    includeFontPadding: false,
  },
  selectedBlock: {
    marginBottom: 8,
  },
  selectedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  selectedTitle: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.ink,
    includeFontPadding: false,
  },
  clearText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.primary,
    includeFontPadding: false,
  },
  selectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 8,
    marginRight: 8,
    gap: 6,
  },
  selectedDate: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.ink,
    includeFontPadding: false,
  },
  selectedHours: {
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.muted,
    marginTop: 1,
    includeFontPadding: false,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  removeText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.primaryInk,
    includeFontPadding: false,
  },
  hoursHint: {
    marginTop: 8,
    fontFamily: fonts.medium,
    fontSize: 11,
    color: colors.faint,
    includeFontPadding: false,
  },
  hint: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    marginVertical: 12,
    includeFontPadding: false,
  },
  confirm: {
    marginTop: 'auto',
    backgroundColor: colors.primary,
    borderRadius: 16,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  confirmDisabled: { opacity: 0.4 },
  confirmText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.white,
    textAlign: 'center',
    includeFontPadding: false,
  },
})
