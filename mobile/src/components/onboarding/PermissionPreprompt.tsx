/**
 * Lot 5 — soft preprompts for push / location with 14-day cooldown.
 * Never request OS permission at cold launch.
 */
import React, { useEffect, useState } from 'react'
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getApi } from '../../lib/client'
import { colors, fonts } from '../../theme'

const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000
const KEY_PUSH = 'fw_perm_push_asked_at'
const KEY_LOC = 'fw_perm_loc_asked_at'

type Kind = 'push' | 'location'

type Props = {
  kind: Kind
  open: boolean
  onClose: () => void
  /** Called only if user accepts — parent requests real OS permission. */
  onAccept: () => void | Promise<void>
}

function track(event: string, meta: Record<string, unknown>) {
  void getApi()
    .trackActivityEvent({
      domain: 'onboarding',
      event,
      surface: 'permissions',
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      meta,
    })
    .catch(() => {})
}

export async function shouldShowPermissionPreprompt(kind: Kind): Promise<boolean> {
  try {
    const key = kind === 'push' ? KEY_PUSH : KEY_LOC
    const raw = await AsyncStorage.getItem(key)
    if (!raw) return true
    const at = Number(raw)
    if (!Number.isFinite(at)) return true
    return Date.now() - at >= COOLDOWN_MS
  } catch {
    return true
  }
}

export function PermissionPreprompt({ kind, open, onClose, onAccept }: Props) {
  useEffect(() => {
    if (!open) return
    track('permission_preprompt_shown', { kind })
  }, [open, kind])

  const title =
    kind === 'push'
      ? 'Reste au courant des bons prix'
      : 'Des idées près de chez toi'
  const body =
    kind === 'push'
      ? 'Active les notifs pour savoir quand un week-end baisse. Tu peux tout couper à tout moment.'
      : 'On affine les départs sans te tracker en continu — juste pour mieux te proposer.'

  const defer = async () => {
    const key = kind === 'push' ? KEY_PUSH : KEY_LOC
    await AsyncStorage.setItem(key, String(Date.now()))
    track('permission_deferred', { kind })
    onClose()
  }

  const accept = async () => {
    const key = kind === 'push' ? KEY_PUSH : KEY_LOC
    await AsyncStorage.setItem(key, String(Date.now()))
    track('permission_accepted', { kind })
    await onAccept()
    onClose()
  }

  return (
    <Modal visible={open} transparent animationType="fade">
      <View style={styles.root}>
        <View style={styles.panel}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <Pressable style={styles.cta} onPress={() => void accept()}>
            <Text style={styles.ctaText}>
              {kind === 'push' ? 'Activer les notifs' : 'Autoriser'}
            </Text>
          </Pressable>
          <Pressable style={styles.later} onPress={() => void defer()}>
            <Text style={styles.laterText}>Plus tard</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

/** Hook helper: queue after first trip / meaningful action. */
export function usePermissionGate(kind: Kind) {
  const [open, setOpen] = useState(false)
  const maybeOpen = async () => {
    if (await shouldShowPermissionPreprompt(kind)) setOpen(true)
  }
  return { open, setOpen, maybeOpen }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(18,16,14,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  panel: {
    backgroundColor: '#faf8f5',
    borderRadius: 18,
    padding: 22,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: 'rgba(40,32,24,0.65)',
    marginTop: 8,
    lineHeight: 21,
    marginBottom: 18,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  ctaText: { fontFamily: fonts.semibold, color: '#fff', fontSize: 15 },
  later: { marginTop: 12, alignItems: 'center', padding: 8 },
  laterText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: 'rgba(40,32,24,0.5)',
  },
})
