import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  Animated,
  PanResponder,
  type ListRenderItemInfo,
} from 'react-native'
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

const FIXED_PRESETS = TIME_PRESETS.filter((p) => p.id !== 'journee')
const JOURNEE = TIME_PRESETS.find((p) => p.id === 'journee')!

const TIME_OPTIONS = (() => {
  const out: string[] = []
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  out.push('23:59')
  return out
})()

const ROW_H = 44

function matchesPreset(min: string, max: string, pMin: string, pMax: string) {
  return min === pMin && max === pMax
}

function isFixedSlot(min: string, max: string) {
  return FIXED_PRESETS.some((p) => matchesPreset(min, max, p.min, p.max))
}

function TimeColumn({
  label,
  value,
  options,
  onSelect,
}: {
  label: string
  value: string
  options: string[]
  onSelect: (t: string) => void
}) {
  const listRef = useRef<FlatList<string>>(null)
  const idx = Math.max(0, options.indexOf(value))

  useEffect(() => {
    if (!options.length) return
    const t = setTimeout(() => {
      try {
        listRef.current?.scrollToIndex({
          index: Math.min(idx, options.length - 1),
          animated: false,
          viewPosition: 0.35,
        })
      } catch {
        /* ignore out-of-range */
      }
    }, 50)
    return () => clearTimeout(t)
  }, [idx, options.length])

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<string>) => {
      const active = item === value
      return (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onSelect(item)}
          style={[styles.timeOption, active && styles.timeOptionActive]}
        >
          <Text style={[styles.timeOptionText, active && styles.timeOptionTextActive]}>
            {item}
          </Text>
        </TouchableOpacity>
      )
    },
    [onSelect, value],
  )

  return (
    <View style={styles.col}>
      <Text style={styles.colLabel}>{label}</Text>
      <Text style={styles.colValue}>{value}</Text>
      <View style={styles.colList}>
        <FlatList
          ref={listRef}
          data={options}
          keyExtractor={(item) => item}
          renderItem={renderItem}
          getItemLayout={(_, index) => ({
            length: ROW_H,
            offset: ROW_H * index,
            index,
          })}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          keyboardShouldPersistTaps="always"
          initialNumToRender={12}
          windowSize={5}
          onScrollToIndexFailed={({ index }) => {
            listRef.current?.scrollToOffset({
              offset: Math.max(0, index * ROW_H - ROW_H * 2),
              animated: false,
            })
          }}
        />
      </View>
    </View>
  )
}

export function HoursSheet({ visible, date, type, onClose, onUpdate }: Props) {
  const insets = useSafeAreaInsets()
  const [customOpen, setCustomOpen] = useState(false)
  const [draftMin, setDraftMin] = useState('06:00')
  const [draftMax, setDraftMax] = useState('12:00')
  const dragY = useRef(new Animated.Value(0)).current

  const dismiss = useCallback(() => {
    Animated.timing(dragY, {
      toValue: 420,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        dragY.setValue(0)
        onClose()
      }
    })
  }, [dragY, onClose])

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) =>
          g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) => {
          if (g.dy > 0) dragY.setValue(g.dy)
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > 80 || g.vy > 0.8) {
            dismiss()
          } else {
            Animated.spring(dragY, {
              toValue: 0,
              useNativeDriver: true,
              bounciness: 6,
            }).start()
          }
        },
      }),
    [dismiss, dragY],
  )

  useEffect(() => {
    if (!visible || !date) {
      setCustomOpen(false)
      dragY.setValue(0)
      return
    }
    const min = date.heure_min || '06:00'
    const max = date.heure_max || '12:00'
    setDraftMin(min)
    setDraftMax(max)
    setCustomOpen(!isFixedSlot(min, max))
    dragY.setValue(0)
  }, [visible, date?.date, dragY])

  const journeeActive = customOpen || (date ? !isFixedSlot(draftMin, draftMax) : false)

  const minOptions = useMemo(
    () => TIME_OPTIONS.filter((t) => t <= draftMax),
    [draftMax],
  )
  const maxOptions = useMemo(
    () => TIME_OPTIONS.filter((t) => t >= draftMin),
    [draftMin],
  )

  if (!date) return null

  const commit = (min: string, max: string) => {
    setDraftMin(min)
    setDraftMax(max)
    onUpdate({ ...date, heure_min: min, heure_max: max })
  }

  const applyFixed = (min: string, max: string) => {
    commit(min, max)
    setCustomOpen(false)
    dismiss()
  }

  const openJournee = () => {
    if (customOpen) {
      // Collapse custom pickers
      setCustomOpen(false)
      return
    }
    if (isFixedSlot(draftMin, draftMax)) {
      commit(JOURNEE.min, JOURNEE.max)
    }
    setCustomOpen(true)
  }

  const setMin = (value: string) => {
    const max = value > draftMax ? value : draftMax
    commit(value, max)
  }

  const setMax = (value: string) => {
    const min = value < draftMin ? value : draftMin
    commit(min, value)
  }

  const backdropOpacity = dragY.interpolate({
    inputRange: [0, 320],
    outputRange: [1, 0.15],
    extrapolate: 'clamp',
  })

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={dismiss}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 16, transform: [{ translateY: dragY }] },
          ]}
        >
          <View {...pan.panHandlers} style={styles.dragZone}>
            <Pressable onPress={dismiss} hitSlop={12} style={styles.handleHit}>
              <View style={styles.handle} />
            </Pressable>

            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  Horaires · {type === 'depart' ? 'Aller' : 'Retour'}
                </Text>
                <Text style={styles.sub}>{formatDateFr(date.date)}</Text>
              </View>
              <Pressable onPress={dismiss} hitSlop={10}>
                <Text style={styles.close}>Fermer</Text>
              </Pressable>
            </View>

            <Text style={styles.current}>
              {draftMin} → {draftMax}
            </Text>
          </View>

          <View style={styles.grid}>
            {FIXED_PRESETS.map((p) => {
              const active = matchesPreset(draftMin, draftMax, p.min, p.max)
              return (
                <Pressable
                  key={p.id}
                  onPress={() => applyFixed(p.min, p.max)}
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

            <Pressable
              onPress={openJournee}
              style={[styles.chip, styles.chipWide, journeeActive && styles.chipActive]}
            >
              <Text style={styles.emoji}>{JOURNEE.emoji}</Text>
              <Text style={[styles.chipLabel, journeeActive && styles.chipLabelActive]}>
                {JOURNEE.label}
              </Text>
              <Text style={[styles.chipRange, journeeActive && styles.chipLabelActive]}>
                {customOpen ? 'Masquer les horaires' : 'Choisir les horaires'}
              </Text>
            </Pressable>
          </View>

          {customOpen ? (
            <View style={styles.customBox}>
              <Text style={styles.customTitle}>Horaires personnalisés</Text>
              <View style={styles.pickers}>
                <TimeColumn
                  label="De"
                  value={draftMin}
                  options={minOptions}
                  onSelect={setMin}
                />
                <TimeColumn
                  label="À"
                  value={draftMax}
                  options={maxOptions}
                  onSelect={setMax}
                />
              </View>
              <TouchableOpacity activeOpacity={0.85} onPress={dismiss} style={styles.doneBtn}>
                <Text style={styles.doneBtnText}>Valider</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12,18,34,0.45)' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '88%',
    zIndex: 2,
  },
  handleHit: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 12,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.lineStrong,
  },
  dragZone: {
    paddingBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 4,
  },
  close: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.primary,
    includeFontPadding: false,
    marginTop: 2,
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
  chipWide: { width: '100%' },
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
  customBox: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  customTitle: {
    fontFamily: fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 10,
    includeFontPadding: false,
  },
  pickers: { flexDirection: 'row', gap: 12 },
  col: { flex: 1, minWidth: 0 },
  colLabel: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
    includeFontPadding: false,
  },
  colValue: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.primary,
    marginTop: 2,
    marginBottom: 8,
    includeFontPadding: false,
  },
  colList: {
    height: ROW_H * 5,
    borderRadius: 14,
    backgroundColor: colors.canvas,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    overflow: 'hidden',
  },
  timeOption: {
    height: ROW_H,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  timeOptionActive: { backgroundColor: colors.primarySoft },
  timeOptionText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.inkSoft,
    textAlign: 'center',
    includeFontPadding: false,
  },
  timeOptionTextActive: { color: colors.primary, fontFamily: fonts.extrabold },
  doneBtn: {
    marginTop: 12,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneBtnText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    lineHeight: 22,
    color: colors.white,
    includeFontPadding: false,
  },
})
