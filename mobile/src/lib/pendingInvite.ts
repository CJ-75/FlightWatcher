/**
 * Persists planner invite token across Google OAuth / app relaunch.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'fw_pending_planner_invite_v1'

export async function rememberPendingInvite(token: string): Promise<void> {
  const t = String(token || '').trim()
  if (!t) return
  try {
    await AsyncStorage.setItem(KEY, t)
  } catch {
    /* ignore */
  }
}

export async function readPendingInvite(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    const t = String(raw || '').trim()
    return t || null
  } catch {
    return null
  }
}

export async function clearPendingInvite(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
