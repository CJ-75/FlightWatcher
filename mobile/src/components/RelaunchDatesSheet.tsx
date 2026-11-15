import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  formatTripDateRangeFr,
  generateDatesFromPreset,
  PLANNER_RELAUNCH_CONFIRM_FR,
  PLANNER_RELAUNCH_LEAD_FR,
  PLANNER_RELAUNCH_TITLE_FR,
  type DatePresetId,
  type FlexibleDates,
} from '@waypop/shared'
import { FlexibleDatesModal } from './FlexibleDatesModal'
import { colors, fonts, shadow } from '../theme'

type Props = {
  visible: boolean
  busy?: boolean
  onClose: () => void
  onConfirm: (dates: FlexibleDates) => void
}

const PRESETS: { id: DatePresetId; label: string; hint: string }[] = [
  { id: 'weekend', label: 'Ce week-end', hint: 'Sam → Dim' },
  { id: 'next-weekend', label: 'Week-end prochain', hint: 'Dans ~7 jours' },
  { id: 'next-week', label: 'Semaine prochaine', hint: 'Lun → Sam' },
]

export function RelaunchDatesSheet({
  visible,
  busy,
  onClose,
  onConfirm,
}: Props) {
  const insets = useSafeAreaInsets()
  const [preset, setPreset] = useState<DatePresetId>('next-weekend')
  const [custom, setCustom] = useState<FlexibleDates | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)

  const dates = useMemo(() => {
    if (custom?.dates_depart?.length && custom?.dates_retour?.length) {
      return custom
    }
    return generateDatesFromPreset(preset === 'flexible' ? 'next-weekend' : preset)
  }, [custom, preset])

  const rangeLabel = useMemo(() => {
    const out = dates.dates_depart[0]?.date
    const ret = dates.dates_retour[dates.dates_retour.length - 1]?.date
    if (!out || !ret) return null
    return formatTripDateRangeFr(out, ret)
  }, [dates])

  const pickPreset = (id: DatePresetId) => {
    setCustom(null)
    setPreset(id)
  }

  return (
    <>
      <Modal
        visible={visible && !pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={busy ? undefined : onClose}
      >
        <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} />
        <View
          style={[
            styles.sheet,
            shadow.lift,
            { paddingBottom: Math.max(insets.bottom, 16) + 8 },
          ]}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>{PLANNER_RELAUNCH_TITLE_FR}</Text>
          <Text style={styles.lead}>{PLANNER_RELAUNCH_LEAD_FR}</Text>

          <View style={styles.presets}>
            {PRESETS.map((p) => {
              const active = !custom && preset === p.id
              return (
                <Pressable
                  key={p.id}
                  onPress={() => pickPreset(p.id)}
                  disabled={busy}
                  style={[styles.preset, active && styles.presetOn]}
                >
                  <Text style={[styles.presetLabel, active && styles.presetLabelOn]}>
                    {p.label}
                  </Text>
                  <Text style={[styles.presetHint, active && styles.presetHintOn]}>
                    {p.hint}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <Pressable
            onPress={() => setPickerOpen(true)}
            disabled={busy}
            style={styles.customBtn}
          >
            <Text style={styles.customBtnText}>
              {custom ? 'Modifier les dates choisies' : 'Choisir d’autres dates'}
            </Text>
          </Pressable>

          {rangeLabel ? (
            <Text style={styles.summary}>Recherche : {rangeLabel}</Text>
          ) : null}

          <Pressable
            onPress={() => onConfirm(dates)}
            disabled={
              busy || !dates.dates_depart.length || !dates.dates_retour.length
            }
            style={({ pressed }) => [
              styles.cta,
              pressed && { opacity: 0.92 },
              (busy || !dates.dates_depart.length) && { opacity: 0.55 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>{PLANNER_RELAUNCH_CONFIRM_FR}</Text>
            )}
          </Pressable>

          <Pressable onPress={onClose} disabled={busy} style={styles.cancel}>
            <Text style={styles.cancelText}>Annuler</Text>
          </Pressable>
        </View>
      </Modal>

      <FlexibleDatesModal
        visible={pickerOpen}
        value={
          custom || {
            dates_depart: dates.dates_depart,
            dates_retour: dates.dates_retour,
          }
        }
        onChange={(v) => {
          setCustom(v)
          setPreset('flexible')
        }}
        onClose={() => setPickerOpen(false)}
      />
    </>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,12,8,0.45)',
  },
  sheet: {
    marginTop: 'auto',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.lineStrong,
    marginBottom: 16,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    letterSpacing: -0.6,
    color: colors.ink,
    marginBottom: 8,
  },
  lead: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
    marginBottom: 18,
  },
  presets: { gap: 10, marginBottom: 12 },
  preset: {
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.canvas,
  },
  presetOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  presetLabel: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
  },
  presetLabelOn: { color: colors.primaryInk },
  presetHint: {
    marginTop: 2,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
  },
  presetHintOn: { color: colors.primaryInk },
  customBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    marginBottom: 8,
  },
  customBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.primaryDeep,
  },
  summary: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.inkSoft,
    marginBottom: 14,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: '#fff',
  },
  cancel: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  cancelText: {
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.muted,
  },
})
