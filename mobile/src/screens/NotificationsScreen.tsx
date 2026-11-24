import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Linking, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getApi } from '../lib/client'
import {
  loadPushPrefs,
  peekPushPrefs,
  writePushPrefs,
} from '../lib/pushPrefsCache'
import { registerPushToken } from '../lib/pushRegistration'
import { ElegantSwitch } from '../components/ui/ElegantSwitch'
import { colors, fonts, radius, shadow, spacing, type } from '../theme'

type PrefKey = 'notif_group' | 'notif_pops'

export function NotificationsScreen() {
  const insets = useSafeAreaInsets()
  const seeded = peekPushPrefs()
  const [notifGroup, setNotifGroup] = useState(seeded.notif_group)
  const [notifPops, setNotifPops] = useState(seeded.notif_pops)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadPushPrefs(() => getApi().getPushPrefs())
      .then((r) => {
        if (cancelled) return
        setNotifGroup(r.notif_group)
        setNotifPops(r.notif_pops)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = async (key: PrefKey, value: boolean) => {
    if (busy) return
    setBusy(true)
    if (key === 'notif_group') setNotifGroup(value)
    else setNotifPops(value)
    writePushPrefs({ [key]: value })
    try {
      const nextGroup = key === 'notif_group' ? value : notifGroup
      const nextPops = key === 'notif_pops' ? value : notifPops
      const reg = await registerPushToken({
        notif_group: nextGroup,
        notif_pops: nextPops,
      })
      if (!reg.ok && reg.reason === 'denied') {
        await Linking.openSettings()
      }
      await getApi().patchPushPrefs({ [key]: value })
    } catch {
      if (key === 'notif_group') setNotifGroup(!value)
      else setNotifPops(!value)
      writePushPrefs({ [key]: !value })
    } finally {
      setBusy(false)
    }
  }

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: spacing.lg,
          paddingHorizontal: spacing.lg,
          paddingBottom: Math.max(insets.bottom, 24),
        },
      ]}
    >
      <Text style={styles.kicker}>COMPTE</Text>
      <Text style={styles.title}>Notifications</Text>
      <Text style={styles.subtitle}>
        Deux réglages, c’est tout. Tu peux tout couper quand tu veux.
      </Text>

      <View style={[styles.card, shadow.soft]}>
        <PrefRow
          title="Groupe"
          detail="Quand quelqu’un rejoint, t’invite ou fixe les dates."
          value={notifGroup}
          disabled={busy}
          onChange={(v) => void toggle('notif_group', v)}
        />
        <View style={styles.divider} />
        <PrefRow
          title="Pops"
          detail="Rappel pour planifier un Pop gardé, et la veille du départ."
          value={notifPops}
          disabled={busy}
          onChange={(v) => void toggle('notif_pops', v)}
        />
      </View>
    </View>
  )
}

function PrefRow({
  title,
  detail,
  value,
  disabled,
  onChange,
}: {
  title: string
  detail: string
  value: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [
        styles.row,
        pressed && !disabled && { opacity: 0.92 },
      ]}
    >
      <View style={styles.copy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <ElegantSwitch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: colors.primary,
    marginBottom: 2,
  },
  title: { ...type.title, marginBottom: 6 },
  subtitle: {
    fontFamily: fonts.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  copy: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  rowDetail: {
    marginTop: 4,
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginLeft: 16,
  },
})

export default NotificationsScreen
