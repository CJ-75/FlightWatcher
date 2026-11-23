/**
 * Expo push registration → POST /api/deals/push-tokens
 * Never prompt at cold launch — call after PermissionPreprompt or Profile.
 */
import { Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { getApi } from './client'

const KEY_LAST_TOKEN = 'fw_push_last_token'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined
  return (
    extra?.eas?.projectId ||
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId ||
    undefined
  )
}

export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('default', {
    name: 'WayPop',
    importance: Notifications.AndroidImportance.DEFAULT,
  })
}

export async function registerPushToken(opts?: {
  notif_group?: boolean
  notif_pops?: boolean
}): Promise<{ ok: boolean; token?: string; reason?: string }> {
  await ensureAndroidChannel()
  const { status: existing } = await Notifications.getPermissionsAsync()
  let status = existing
  if (existing !== 'granted') {
    const req = await Notifications.requestPermissionsAsync()
    status = req.status
  }
  if (status !== 'granted') {
    return { ok: false, reason: 'denied' }
  }

  const pid = projectId()
  const tokenRes = await Notifications.getExpoPushTokenAsync(
    pid ? { projectId: pid } : undefined,
  )
  const token = tokenRes.data
  if (!token || token.length < 8) {
    return { ok: false, reason: 'no_token' }
  }

  const last = await AsyncStorage.getItem(KEY_LAST_TOKEN)
  const prefsChanged =
    opts?.notif_group !== undefined || opts?.notif_pops !== undefined
  if (last === token && !prefsChanged) {
    return { ok: true, token }
  }

  await getApi().registerPushToken({
    token,
    platform: Platform.OS,
    locale: 'fr',
    notif_group: opts?.notif_group,
    notif_pops: opts?.notif_pops,
  })
  await AsyncStorage.setItem(KEY_LAST_TOKEN, token)
  return { ok: true, token }
}

/** Silent re-register if OS permission already granted (login / resume). */
export async function refreshPushTokenIfGranted(): Promise<void> {
  try {
    const { status } = await Notifications.getPermissionsAsync()
    if (status !== 'granted') return
    await registerPushToken()
  } catch {
    /* ignore */
  }
}

export async function recordPushPresence(
  entityType: 'trip' | 'pop',
  entityId: string,
): Promise<void> {
  if (!entityId) return
  try {
    await getApi().recordPushPresence({
      entity_type: entityType,
      entity_id: entityId,
    })
  } catch {
    /* ignore */
  }
}
