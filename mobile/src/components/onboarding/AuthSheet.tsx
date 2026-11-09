import React, { useEffect, useState } from 'react'
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ImageBackground,
  Dimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import {
  authSheetTitle,
  type AuthTrigger,
  type PendingAction,
  setPendingAction,
} from '@flightwatcher/shared'
import { useAuth } from '../../context/AuthContext'
import { getApi } from '../../lib/client'
import { colors, fonts } from '../../theme'
import { AppleLogoIcon } from '../AppleLogoIcon'
import { GoogleGIcon } from '../GoogleGIcon'

type Props = {
  open: boolean
  trigger: AuthTrigger
  inviteFirstName?: string | null
  pending?: PendingAction | null
  onClose: () => void
  onAuthenticated?: () => void
}

const SHEET_HERO =
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80&fm=jpg'

function track(event: string, meta?: Record<string, unknown>) {
  void getApi()
    .trackActivityEvent({
      domain: 'auth',
      event,
      surface: 'auth_sheet',
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      meta: meta || {},
    })
    .catch(() => {})
}

export function AuthSheet({
  open,
  trigger,
  inviteFirstName,
  pending,
  onClose,
  onAuthenticated,
}: Props) {
  const { signInWithGoogle, signInWithApple, signInWithOtp, user } = useAuth()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<'apple' | 'google' | 'email' | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setEmailSent(false)
    setBusy(null)
    track('auth_sheet_opened', { trigger })
    if (pending) void setPendingAction(pending)
  }, [open, trigger, pending])

  useEffect(() => {
    if (open && user) {
      track('auth_succeeded', { trigger })
      onAuthenticated?.()
      onClose()
    }
  }, [user, open, onAuthenticated, onClose, trigger])

  const runOAuth = async (method: 'apple' | 'google') => {
    setBusy(method)
    setError(null)
    track('auth_started', { trigger, method })
    const { error: err } =
      method === 'apple' ? await signInWithApple() : await signInWithGoogle()
    if (err) {
      track('auth_failed', { trigger, method, message: err.message })
      setError(err.message)
    }
    setBusy(null)
  }

  const runEmail = async () => {
    setBusy('email')
    setError(null)
    track('auth_started', { trigger, method: 'email' })
    const { error: err } = await signInWithOtp(email)
    if (err) {
      track('auth_failed', { trigger, method: 'email', message: err.message })
      setError(err.message)
      setBusy(null)
      return
    }
    setEmailSent(true)
    setBusy(null)
  }

  const title = authSheetTitle(trigger, { firstName: inviteFirstName })

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <ImageBackground
            source={{ uri: SHEET_HERO }}
            style={styles.heroBand}
            imageStyle={styles.heroBandImg}
          >
            <LinearGradient
              colors={['rgba(8,4,2,0.15)', 'rgba(8,4,2,0.88)']}
              style={styles.heroGrad}
            >
              <View style={styles.handle} />
              <Text style={styles.brand}>FlightWatcher</Text>
              <Text style={styles.title}>{title}</Text>
            </LinearGradient>
          </ImageBackground>

          <View style={styles.body}>
            <Text style={styles.lead}>
              Apple, Google ou un lien par e-mail — un geste, et on reprend.
            </Text>

            <Pressable
              style={[styles.btn, styles.btnGoogle]}
              disabled={!!busy}
              onPress={() => void runOAuth('google')}
            >
              {busy === 'google' ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <View style={styles.btnRow}>
                  <GoogleGIcon size={20} />
                  <Text style={styles.btnGoogleText}>Continuer avec Google</Text>
                </View>
              )}
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnApple]}
              disabled={!!busy}
              onPress={() => void runOAuth('apple')}
            >
              {busy === 'apple' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={styles.btnRow}>
                  <AppleLogoIcon size={20} color="#fff" />
                  <Text style={styles.btnAppleText}>Continuer avec Apple</Text>
                </View>
              )}
            </Pressable>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>ou</Text>
              <View style={styles.dividerLine} />
            </View>

            {emailSent ? (
              <Text style={styles.sent}>
                Lien envoyé à {email} — ouvre-le pour te connecter.
              </Text>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  placeholder="ton@email.com"
                  placeholderTextColor="rgba(40,32,24,0.35)"
                  value={email}
                  onChangeText={setEmail}
                  editable={!busy}
                />
                <Pressable
                  style={[styles.btn, styles.btnEmail]}
                  disabled={!!busy}
                  onPress={() => void runEmail()}
                >
                  {busy === 'email' ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnEmailText}>Recevoir un lien</Text>
                  )}
                </Pressable>
              </>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable onPress={onClose} style={styles.later}>
              <Text style={styles.laterText}>Plus tard</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,3,2,0.62)',
  },
  sheet: {
    maxHeight: Dimensions.get('window').height * 0.92,
    backgroundColor: '#FAF6F1',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  heroBand: { minHeight: 148 },
  heroBandImg: { borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  heroGrad: {
    minHeight: 148,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 18,
    justifyContent: 'flex-end',
  },
  handle: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -20,
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,249,245,0.35)',
  },
  brand: {
    fontFamily: fonts.extrabold,
    fontSize: 13,
    color: 'rgba(255,176,136,0.95)',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.6,
    color: '#FFF9F5',
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 28,
  },
  lead: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: 'rgba(40,32,24,0.62)',
    marginBottom: 16,
    lineHeight: 20,
  },
  btn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  btnApple: { backgroundColor: '#111' },
  btnAppleText: { fontFamily: fonts.semibold, fontSize: 15, color: '#fff' },
  btnGoogle: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(40,32,24,0.12)',
  },
  btnGoogleText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  btnEmail: { backgroundColor: colors.primary, marginTop: 4 },
  btnEmailText: { fontFamily: fonts.semibold, fontSize: 15, color: '#fff' },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(40,32,24,0.12)',
  },
  dividerText: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: 'rgba(40,32,24,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    fontFamily: fonts.regular,
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(40,32,24,0.12)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: '#fff',
    color: colors.ink,
  },
  sent: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: 'rgba(40,32,24,0.72)',
    lineHeight: 20,
  },
  error: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: '#b42318',
    marginTop: 10,
  },
  later: { marginTop: 14, alignItems: 'center', padding: 8 },
  laterText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: 'rgba(40,32,24,0.45)',
  },
})
