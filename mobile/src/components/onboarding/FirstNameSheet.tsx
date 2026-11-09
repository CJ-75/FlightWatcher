import React, { useEffect, useState } from 'react'
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native'
import {
  loadOnboardingPrefs,
  saveOnboardingPrefs,
} from '@flightwatcher/shared'
import { getApi } from '../../lib/client'
import { colors, fonts } from '../../theme'

type Props = {
  open: boolean
  onDone: () => void
}

export function FirstNameSheet({ open, onDone }: Props) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    void getApi()
      .trackActivityEvent({
        domain: 'onboarding',
        event: 'first_name_prompt_shown',
        surface: 'onboarding',
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        meta: {},
      })
      .catch(() => {})
  }, [open])

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    try {
      await getApi().updateProfile({ first_name: trimmed, full_name: trimmed })
      await saveOnboardingPrefs({ firstNamePromptDone: true })
      void getApi()
        .trackActivityEvent({
          domain: 'onboarding',
          event: 'first_name_saved',
          surface: 'onboarding',
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
          meta: {},
        })
        .catch(() => {})
      onDone()
    } catch {
      /* still mark done to avoid loop */
      await saveOnboardingPrefs({ firstNamePromptDone: true })
      onDone()
    } finally {
      setBusy(false)
    }
  }

  const skip = async () => {
    await saveOnboardingPrefs({ firstNamePromptDone: true })
    onDone()
  }

  return (
    <Modal visible={open} animationType="fade" transparent>
      <View style={styles.root}>
        <View style={styles.panel}>
          <Text style={styles.title}>Comment on t’appelle ?</Text>
          <Text style={styles.lead}>Juste ton prénom — pour les invitations.</Text>
          <TextInput
            style={styles.input}
            placeholder="Prénom"
            placeholderTextColor="rgba(40,32,24,0.35)"
            value={name}
            onChangeText={setName}
            autoFocus
          />
          <Pressable
            style={[styles.btn, !name.trim() && styles.btnDisabled]}
            disabled={!name.trim() || busy}
            onPress={() => void save()}
          >
            <Text style={styles.btnText}>C’est bon</Text>
          </Pressable>
          <Pressable onPress={() => void skip()} style={styles.skip}>
            <Text style={styles.skipText}>Plus tard</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}

export async function shouldPromptFirstName(
  oauthFirstName: string | null | undefined,
): Promise<boolean> {
  if (oauthFirstName && String(oauthFirstName).trim()) return false
  const prefs = await loadOnboardingPrefs()
  return !prefs.firstNamePromptDone
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(18,16,14,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  panel: {
    backgroundColor: '#faf8f5',
    borderRadius: 16,
    padding: 22,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: colors.ink,
  },
  lead: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: 'rgba(40,32,24,0.62)',
    marginTop: 6,
    marginBottom: 16,
  },
  input: {
    fontFamily: fonts.regular,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(40,32,24,0.14)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#fff',
    color: colors.ink,
  },
  btn: {
    marginTop: 14,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { fontFamily: fonts.semibold, color: '#fff', fontSize: 15 },
  skip: { marginTop: 12, alignItems: 'center', padding: 8 },
  skipText: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: 'rgba(40,32,24,0.5)',
  },
})
