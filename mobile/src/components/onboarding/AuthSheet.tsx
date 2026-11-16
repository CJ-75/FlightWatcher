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
  friendlyAuthError,
  type AuthTrigger,
  type PendingAction,
  setPendingAction,
} from '@waypop/shared'
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

type Step = 'providers' | 'email'
type EmailMode = 'login' | 'signup'
type Busy = 'apple' | 'google' | 'email' | null

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
  const { signInWithGoogle, signInWithApple, signInWithOtp, signInWithEmail, user } =
    useAuth()
  const [step, setStep] = useState<Step>('providers')
  const [mode, setMode] = useState<EmailMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<Busy>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setStep('providers')
    setMode('login')
    setError(null)
    setEmailSent(false)
    setBusy(null)
    setEmail('')
    setPassword('')
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
      setError(friendlyAuthError(err.message))
    }
    setBusy(null)
  }

  const runEmail = async () => {
    setBusy('email')
    setError(null)
    track('auth_started', {
      trigger,
      method: mode === 'login' ? 'email_password' : 'email_otp',
    })

    if (mode === 'login') {
      const { error: err } = await signInWithEmail(email, password)
      if (err) {
        track('auth_failed', {
          trigger,
          method: 'email_password',
          message: err.message,
        })
        setError(friendlyAuthError(err.message))
        setBusy(null)
        return
      }
      setBusy(null)
      return
    }

    const { error: err } = await signInWithOtp(email)
    if (err) {
      track('auth_failed', { trigger, method: 'email_otp', message: err.message })
      setError(friendlyAuthError(err.message))
      setBusy(null)
      return
    }
    setEmailSent(true)
    setBusy(null)
  }

  const title = authSheetTitle(trigger, { firstName: inviteFirstName })
  const lead =
    step === 'providers'
      ? 'Choisis comment tu veux continuer — en un geste.'
      : mode === 'login'
        ? 'Ton email et ton mot de passe, et c’est reparti.'
        : 'On t’envoie un lien magique — pas de mot de passe à retenir.'

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
              <Text style={styles.brand}>WayPop</Text>
              <Text style={styles.title}>{title}</Text>
            </LinearGradient>
          </ImageBackground>

          <View style={styles.body}>
            <Text style={styles.lead}>{lead}</Text>

            {step === 'providers' ? (
              <>
                <Pressable
                  style={[styles.btn, styles.btnOutline]}
                  disabled={!!busy}
                  onPress={() => void runOAuth('google')}
                >
                  {busy === 'google' ? (
                    <ActivityIndicator color={colors.ink} />
                  ) : (
                    <View style={styles.btnRow}>
                      <GoogleGIcon size={20} />
                      <Text style={styles.btnOutlineText}>Continuer avec Google</Text>
                    </View>
                  )}
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.btnOutline]}
                  disabled={!!busy}
                  onPress={() => void runOAuth('apple')}
                >
                  {busy === 'apple' ? (
                    <ActivityIndicator color={colors.ink} />
                  ) : (
                    <View style={styles.btnRow}>
                      <AppleLogoIcon size={20} color={colors.ink} />
                      <Text style={styles.btnOutlineText}>Continuer avec Apple</Text>
                    </View>
                  )}
                </Pressable>
                <Pressable
                  style={[styles.btn, styles.btnPrimary]}
                  disabled={!!busy}
                  onPress={() => {
                    setError(null)
                    setStep('email')
                  }}
                >
                  <Text style={styles.btnPrimaryText}>Continuer avec Email</Text>
                </Pressable>
                <Pressable onPress={onClose} style={styles.later}>
                  <Text style={styles.laterText}>Plus tard</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  onPress={() => {
                    setEmailSent(false)
                    setError(null)
                    setStep('providers')
                  }}
                  style={styles.back}
                >
                  <Text style={styles.backText}>← Autres options</Text>
                </Pressable>

                {emailSent ? (
                  <Text style={styles.sent}>
                    Lien envoyé à {email} — ouvre-le pour activer ton compte.
                  </Text>
                ) : (
                  <>
                    <View style={styles.tabs}>
                      <Pressable
                        style={[styles.tab, mode === 'login' && styles.tabActive]}
                        onPress={() => {
                          setMode('login')
                          setError(null)
                        }}
                      >
                        <Text
                          style={[
                            styles.tabText,
                            mode === 'login' && styles.tabTextActive,
                          ]}
                        >
                          Connexion
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.tab, mode === 'signup' && styles.tabActive]}
                        onPress={() => {
                          setMode('signup')
                          setError(null)
                          setPassword('')
                        }}
                      >
                        <Text
                          style={[
                            styles.tabText,
                            mode === 'signup' && styles.tabTextActive,
                          ]}
                        >
                          Inscription
                        </Text>
                      </Pressable>
                    </View>

                    <TextInput
                      style={styles.input}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                      placeholder="toi@email.com"
                      placeholderTextColor="rgba(40,32,24,0.35)"
                      value={email}
                      onChangeText={setEmail}
                      editable={!busy}
                    />
                    {mode === 'login' ? (
                      <TextInput
                        style={styles.input}
                        secureTextEntry
                        autoComplete="password"
                        placeholder="Mot de passe"
                        placeholderTextColor="rgba(40,32,24,0.35)"
                        value={password}
                        onChangeText={setPassword}
                        editable={!busy}
                      />
                    ) : (
                      <Text style={styles.hint}>
                        Pas de mot de passe : tu reçois un lien pour confirmer.
                      </Text>
                    )}
                    <Pressable
                      style={[styles.btn, styles.btnPrimary]}
                      disabled={!!busy}
                      onPress={() => void runEmail()}
                    >
                      {busy === 'email' ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.btnPrimaryText}>
                          {mode === 'login' ? 'Se connecter' : 'Recevoir mon lien'}
                        </Text>
                      )}
                    </Pressable>
                  </>
                )}
              </>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}
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
    backgroundColor: '#FFF9F5',
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
    fontSize: 20,
    lineHeight: 24,
    color: 'rgba(255,176,136,0.95)',
    letterSpacing: -0.6,
    marginBottom: 8,
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
    justifyContent: 'center',
    marginBottom: 10,
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  btnOutline: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(40,32,24,0.12)',
  },
  btnOutlineText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  btnPrimary: { backgroundColor: colors.ink },
  btnPrimaryText: { fontFamily: fonts.semibold, fontSize: 15, color: '#FFF9F5' },
  back: { marginBottom: 12, paddingVertical: 4 },
  backText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: 'rgba(40,32,24,0.55)',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(29,27,25,0.05)',
    borderRadius: 14,
    padding: 4,
    marginBottom: 12,
    gap: 4,
  },
  tab: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#fff',
  },
  tabText: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: 'rgba(40,32,24,0.5)',
  },
  tabTextActive: {
    fontFamily: fonts.semibold,
    color: colors.ink,
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
    marginBottom: 10,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(29,27,25,0.8)',
    backgroundColor: 'rgba(255,231,220,0.7)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
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
  later: { marginTop: 6, alignItems: 'center', padding: 8 },
  laterText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: 'rgba(40,32,24,0.45)',
  },
})
