import React, { useMemo, useState } from 'react'
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
  userHasPasswordLogin,
  userNeedsPasswordSetup,
  userOauthProviderId,
  userOauthProviderLabel,
} from '@flightwatcher/shared'
import { useAuth } from '../context/AuthContext'
import { getApi } from '../lib/client'
import { AppleLogoIcon } from '../components/AppleLogoIcon'
import { GoogleGIcon } from '../components/GoogleGIcon'
import { Button } from '../components/ui/Button'
import { ScreenBackground } from '../components/ScreenBackground'
import { colors, fonts, shadow, spacing, type } from '../theme'

export function SecurityScreen() {
  const insets = useSafeAreaInsets()
  const { user, viewUser, isGuest, signOut } = useAuth()
  const needsPasswordSetup = userNeedsPasswordSetup(user)
  const hasPassword = userHasPasswordLogin(user)
  const oauthId = userOauthProviderId(user)
  const oauthProvider = userOauthProviderLabel(user)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(!needsPasswordSetup)

  const signInHint = useMemo(() => {
    if (oauthId && hasPassword) {
      return translate('fr', 'auth.security.signInHintMixed', {
        provider: oauthProvider,
      })
    }
    if (oauthId) {
      return translate('fr', 'auth.security.signInHintOauth', {
        provider: oauthProvider,
      })
    }
    return translate('fr', 'auth.security.signInHintEmail')
  }, [oauthId, hasPassword, oauthProvider])

  const onDeleteAccount = () => {
    if (isGuest) {
      Alert.alert(
        translate('fr', 'auth.security.deleteTitle'),
        'Connexion requise pour supprimer un compte.',
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
                  'Le compte a été supprimé.',
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
        'Connexion requise pour gérer le mot de passe.',
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
            paddingBottom: insets.bottom + 48,
            gap: spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View>
            <Text style={styles.kicker}>
              {translate('fr', 'auth.security.title')}
            </Text>
            <Text style={styles.title}>
              {translate('fr', 'auth.security.pageTitle')}
            </Text>
            <Text style={styles.subtitle}>
              {translate('fr', 'auth.security.subtitle')}
            </Text>
          </View>

          {/* Connexion — Google / Apple / email */}
          <View style={[styles.card, shadow.soft]}>
            <Text style={styles.sectionEyebrow}>
              {translate('fr', 'auth.security.signInSection')}
            </Text>
            <View style={styles.providerRow}>
              <View style={styles.providerBadge}>
                {oauthId === 'apple' ? (
                  <AppleLogoIcon size={18} color="#111" />
                ) : oauthId === 'google' ? (
                  <GoogleGIcon size={18} />
                ) : (
                  <Text style={styles.providerGlyph}>@</Text>
                )}
              </View>
              <View style={styles.providerCopy}>
                <Text style={styles.providerTitle}>
                  {oauthId
                    ? translate('fr', 'auth.security.signInWith', {
                        provider: oauthProvider,
                      })
                    : translate('fr', 'auth.security.signInEmail')}
                </Text>
                {viewUser?.email ? (
                  <Text style={styles.providerEmail} numberOfLines={1}>
                    {viewUser.email}
                  </Text>
                ) : null}
              </View>
              {oauthId ? (
                <View style={styles.okChip}>
                  <Text style={styles.okChipText}>
                    {translate('fr', 'auth.security.active')}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.providerHint}>{signInHint}</Text>
          </View>

          {/* Mot de passe — optionnel pour OAuth */}
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
              {needsPasswordSetup
                ? translate('fr', 'auth.security.setPasswordHint', {
                    provider: oauthProvider,
                  })
                : translate('fr', 'auth.security.changePasswordHint')}
            </Text>

            {needsPasswordSetup && !showPasswordForm ? (
              <Pressable
                onPress={() => setShowPasswordForm(true)}
                style={({ pressed }) => [
                  styles.secondaryCta,
                  pressed && { opacity: 0.88 },
                ]}
              >
                <Text style={styles.secondaryCtaText}>
                  {translate('fr', 'auth.security.setPassword')}
                </Text>
              </Pressable>
            ) : (
              <View style={styles.formBlock}>
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
                  style={{ marginTop: spacing.sm }}
                />
                {feedback ? (
                  <Text style={styles.feedback}>{feedback}</Text>
                ) : null}
                {error ? <Text style={styles.error}>{error}</Text> : null}
              </View>
            )}
          </View>

          {/* Suppression — zone séparée, bouton pleine largeur */}
          <View style={styles.dangerCard}>
            <Text style={styles.dangerEyebrow}>
              {translate('fr', 'auth.security.dangerZone')}
            </Text>
            <Text style={styles.dangerTitle}>
              {translate('fr', 'auth.security.deleteTitle')}
            </Text>
            <Text style={styles.dangerHint}>
              {translate('fr', 'auth.security.deleteHint')}
            </Text>
            <Pressable
              onPress={onDeleteAccount}
              disabled={deleting}
              style={({ pressed }) => [
                styles.deleteBtn,
                pressed && { opacity: 0.9 },
                deleting && { opacity: 0.55 },
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
          </View>
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
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    gap: 10,
  },
  sectionEyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: colors.faint,
    textTransform: 'uppercase',
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  providerBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerGlyph: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.inkSoft,
  },
  providerCopy: { flex: 1, minWidth: 0, gap: 2 },
  providerTitle: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  providerEmail: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
  },
  providerHint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  okChip: {
    backgroundColor: colors.successSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  okChipText: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.success,
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
  secondaryCta: {
    marginTop: 4,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: colors.canvas,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryCtaText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.ink,
  },
  formBlock: { gap: 6 },
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
    marginTop: spacing.sm,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.primaryInk,
    lineHeight: 18,
  },
  error: {
    marginTop: spacing.xs,
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.danger,
    lineHeight: 18,
  },
  dangerCard: {
    marginTop: spacing.sm,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FECACA',
    backgroundColor: '#FFF8F8',
    padding: 18,
    gap: 8,
  },
  dangerEyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    color: '#E11D48',
    textTransform: 'uppercase',
  },
  dangerTitle: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
  },
  dangerHint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    marginBottom: 6,
  },
  deleteBtn: {
    marginTop: 4,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#FDA4AF',
    backgroundColor: '#FFF1F2',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 48,
  },
  deleteBtnText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: '#BE123C',
  },
})
