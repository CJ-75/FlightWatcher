import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  translate,
  userNeedsPasswordSetup,
  userOauthProviderLabel,
} from '@flightwatcher/shared'
import { useAuth } from '../context/AuthContext'
import { getApi } from '../lib/client'
import { Button } from '../components/ui/Button'
import { ScreenBackground } from '../components/ScreenBackground'
import { colors, fonts, shadow, spacing, type } from '../theme'

export function SecurityScreen() {
  const insets = useSafeAreaInsets()
  const { user, viewUser, isGuest, signOut } = useAuth()
  const needsPasswordSetup = userNeedsPasswordSetup(user)
  const oauthProvider = userOauthProviderLabel(user)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const onDeleteAccount = () => {
    if (isGuest) {
      Alert.alert(
        translate('fr', 'auth.security.deleteTitle'),
        'Connecte-toi pour supprimer un compte.',
      )
      return
    }
    Alert.alert(
      translate('fr', 'auth.security.deleteTitle'),
      translate('fr', 'auth.security.deletePopup'),
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: translate('fr', 'auth.security.deleteButton'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeleting(true)
              try {
                await getApi().deleteAccount({ confirm: 'SUPPRIMER' })
                await signOut()
                Alert.alert(
                  translate('fr', 'auth.security.deleteDone'),
                  'Ton compte a été supprimé.',
                )
              } catch (e) {
                Alert.alert(
                  translate('fr', 'auth.security.deleteTitle'),
                  e instanceof Error
                    ? e.message
                    : translate('fr', 'auth.security.deleteError'),
                )
              } finally {
                setDeleting(false)
              }
            })()
          },
        },
      ],
    )
  }

  const submit = async () => {
    if (isGuest) {
      Alert.alert(
        translate('fr', 'auth.security.title'),
        'Connecte-toi avec Google pour changer ton mot de passe.',
      )
      return
    }
    setFeedback(null)
    setError(null)
    if (newPassword.length < 8) {
      setError(translate('fr', 'auth.security.passwordTooShort'))
      return
    }
    if (newPassword !== confirm) {
      setError(translate('fr', 'auth.security.passwordMismatch'))
      return
    }
    setBusy(true)
    try {
      await getApi().changePassword({
        current_password: needsPasswordSetup ? '' : currentPassword,
        new_password: newPassword,
      })
      const message = translate('fr', 'auth.security.passwordUpdated')
      setFeedback(message)
      setCurrentPassword('')
      setNewPassword('')
      setConfirm('')
      Alert.alert(translate('fr', 'auth.security.title'), message)
    } catch (e) {
      const message =
        e instanceof Error ? e.message : translate('fr', 'auth.security.changeError')
      setError(message)
      Alert.alert(translate('fr', 'auth.security.title'), message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.lg,
            paddingBottom: insets.bottom + 40,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.kicker}>{translate('fr', 'auth.security.title')}</Text>
          <Text style={styles.title}>{translate('fr', 'auth.security.pageTitle')}</Text>
          {viewUser?.email ? (
            <Text style={styles.email}>{viewUser.email}</Text>
          ) : null}

          <View style={[styles.card, shadow.soft]}>
            <Text style={styles.cardTitle}>
              {translate(
                'fr',
                needsPasswordSetup
                  ? 'auth.security.setPassword'
                  : 'auth.security.changePassword',
              )}
            </Text>
            <Text style={styles.cardHint}>
              {translate(
                'fr',
                needsPasswordSetup
                  ? 'auth.security.setPasswordHint'
                  : 'auth.security.changePasswordHint',
              )}
            </Text>
            {needsPasswordSetup ? (
              <View style={styles.oauthBanner}>
                <Text style={styles.oauthBannerText}>
                  {translate('fr', 'auth.security.oauthNoPassword', {
                    provider: oauthProvider,
                  })}
                </Text>
              </View>
            ) : null}

            {!needsPasswordSetup ? (
              <>
                <Text style={styles.label}>
                  {translate('fr', 'auth.security.currentPassword')}
                </Text>
                <TextInput
                  style={styles.input}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  placeholderTextColor={colors.faint}
                />
              </>
            ) : null}

            <Text style={styles.label}>
              {translate('fr', 'auth.security.newPassword')}
            </Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              placeholderTextColor={colors.faint}
            />

            <Text style={styles.label}>
              {translate('fr', 'auth.security.confirmPassword')}
            </Text>
            <TextInput
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              placeholderTextColor={colors.faint}
            />

            <Button
              label={
                busy
                  ? translate('fr', 'auth.security.saving')
                  : translate('fr', 'auth.security.savePassword')
              }
              onPress={() => void submit()}
              loading={busy}
              disabled={busy}
              style={{ marginTop: spacing.md }}
            />
            {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>

          <Pressable
            onPress={onDeleteAccount}
            disabled={deleting}
            style={({ pressed }) => [
              styles.deleteBtn,
              pressed && { opacity: 0.85 },
              deleting && { opacity: 0.5 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={translate('fr', 'auth.security.deleteButton')}
          >
            <Text style={styles.deleteBtnText}>
              {deleting
                ? translate('fr', 'auth.security.deleteBusy')
                : translate('fr', 'auth.security.deleteButton')}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.primary,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: { ...type.title, marginBottom: 6 },
  email: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    gap: 6,
  },
  cardTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
  },
  cardHint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  oauthBanner: {
    backgroundColor: colors.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: spacing.sm,
  },
  oauthBannerText: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.inkSoft,
    lineHeight: 18,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.canvas,
  },
  feedback: {
    marginTop: spacing.md,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.primaryInk,
    lineHeight: 18,
  },
  error: {
    marginTop: spacing.sm,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: '#DC2626',
    lineHeight: 18,
  },
  deleteBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.lg,
    backgroundColor: '#FFF1F2',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FECDD3',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  deleteBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: '#BE123C',
  },
})
