import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { InvitePreview } from '@flightwatcher/shared'
import { cityDisplayNameFr, parseAirportCodes } from '@flightwatcher/shared'
import {
  getDevInvitePreview,
  resolveDevInviteTripId,
} from '../dev/guestPreview'
import { getApi } from '../lib/client'
import {
  clearPendingInvite,
  rememberPendingInvite,
} from '../lib/pendingInvite'
import { useAuth } from '../context/AuthContext'
import { GoogleGIcon } from '../components/GoogleGIcon'
import { ScreenBackground } from '../components/ScreenBackground'
import type { RootStackParamList } from '../navigation/types'
import { colors, fonts, radius, shadow, spacing } from '../theme'

type Props = NativeStackScreenProps<RootStackParamList, 'PlannerInvite'>

function formatDate(dateStr?: string | null) {
  if (!dateStr) return '—'
  const s = String(dateStr).slice(0, 10)
  return new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  })
}

function routeLabel(value?: string | null): string {
  const codes = parseAirportCodes(value || '')
  if (!codes.length) return value || '—'
  const cities = [...new Set(codes.map((c) => cityDisplayNameFr(c)))]
  if (cities.length === 1) {
    return codes.length > 1
      ? `${cities[0]} · ${codes.join(' · ')}`
      : `${cities[0]} · ${codes[0]}`
  }
  return codes.map((c) => `${cityDisplayNameFr(c)} (${c})`).join(' · ')
}

const SIGNUP_STEPS = [
  {
    title: 'Crée ton compte',
    detail: 'Connexion Google en un tap — rapide et sécurisé.',
  },
  {
    title: 'Rejoins le voyage',
    detail: 'Tu es ajouté au planner partagé automatiquement.',
  },
  {
    title: 'Suis le séjour',
    detail: 'Vol, hôtel et activités — tout le parcours ensemble.',
  },
] as const

export function PlannerInviteScreen({ route, navigation }: Props) {
  const { token } = route.params
  const insets = useSafeAreaInsets()
  const { user, isGuest, signInWithGoogle, continueAsGuest, setAppearLoggedOut } =
    useAuth()
  const loggedIn = Boolean(user) && !isGuest
  // Bypass Google uniquement en __DEV__ sur tokens / parcours de test Expo.
  const expoTest =
    __DEV__ &&
    (String(token || '').startsWith('dev-invite-') || isGuest || !loggedIn)
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const autoJoined = useRef(false)

  const load = useCallback(async () => {
    if (!token) {
      setError('Lien invalide')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      await rememberPendingInvite(token)
      const local = __DEV__ ? getDevInvitePreview(token) : null
      if (local) {
        setPreview(local)
        return
      }
      const data = await getApi().getInvitePreview(token)
      setPreview(data)
    } catch (e) {
      const fallback = __DEV__ ? getDevInvitePreview(token) : null
      if (fallback) {
        setPreview(fallback)
        setError(null)
      } else {
        setError(e instanceof Error ? e.message : 'Invitation introuvable')
        setPreview(null)
      }
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const join = useCallback(async () => {
    if (!token) return
    setJoining(true)
    setError(null)
    try {
      // Expo / __DEV__ : skip Google + API join, ouvre le trip local.
      if (expoTest) {
        const tripId = resolveDevInviteTripId(token)
        if (!tripId) throw new Error('Voyage de test introuvable')
        setAppearLoggedOut(false)
        continueAsGuest()
        await clearPendingInvite()
        navigation.replace('TripDetail', { tripId })
        return
      }
      if (!loggedIn) return
      const res = await getApi().joinInvite(token)
      await clearPendingInvite()
      navigation.replace('TripDetail', { tripId: res.trip_id })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de rejoindre')
      autoJoined.current = false
    } finally {
      setJoining(false)
    }
  }, [
    token,
    loggedIn,
    expoTest,
    navigation,
    continueAsGuest,
    setAppearLoggedOut,
  ])

  // Après inscription / login réel → rejoindre automatiquement.
  useEffect(() => {
    if (expoTest) return
    if (!loggedIn || !preview || autoJoined.current || joining) return
    autoJoined.current = true
    void join()
  }, [expoTest, loggedIn, preview, joining, join])

  const onSignUp = async () => {
    setSigningIn(true)
    setError(null)
    await rememberPendingInvite(token)
    const { error: err } = await signInWithGoogle()
    if (err) {
      setError(err.message)
      setSigningIn(false)
      return
    }
    // OAuth redirect — on reprend au retour session.
  }

  /** Bypass Google — uniquement __DEV__ / Expo. */
  const onExpoTestContinue = () => {
    void join()
  }

  const outStr = preview?.dates_depart?.[0]?.date || ''
  const innStr = preview?.dates_retour?.[0]?.date || ''
  const tripLabel = preview?.name || 'ce voyage'

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.xl,
          paddingTop: 16,
          paddingBottom: insets.bottom + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : error && !preview ? (
          <View style={[styles.card, shadow.soft]}>
            <Text style={styles.error}>{error}</Text>
            <Pressable style={styles.btn} onPress={() => void load()}>
              <Text style={styles.btnText}>Réessayer</Text>
            </Pressable>
          </View>
        ) : preview ? (
          <View style={styles.stack}>
            <View style={[styles.card, shadow.soft]}>
              <Text style={styles.kicker}>Invitation</Text>
              <Text style={styles.name}>{preview.name}</Text>
              <Text style={styles.meta}>
                {routeLabel(preview.departure_airport)}
                {preview.arrival_airport
                  ? ` → ${routeLabel(preview.arrival_airport)}`
                  : ' → destination ouverte'}
              </Text>
              <Text style={styles.meta}>
                {formatDate(outStr)} → {formatDate(innStr)} · {preview.passengers}{' '}
                pers. · max {preview.budget_max} €/pers
              </Text>
              {preview.organizer_name ? (
                <Text style={styles.org}>
                  Organisé par {preview.organizer_name}
                </Text>
              ) : (
                <Text style={styles.org}>Organisé avec FlightWatcher</Text>
              )}
              {preview.members_count != null ? (
                <Text style={styles.meta}>
                  {preview.members_count} participant
                  {preview.members_count > 1 ? 's' : ''}
                </Text>
              ) : null}
            </View>

            {expoTest && String(token || '').startsWith('dev-invite-') ? (
              <View style={[styles.signupCard, shadow.soft]}>
                <Text style={styles.signupKicker}>Test Expo</Text>
                <Text style={styles.signupTitle}>
                  Onboarding invitation — {tripLabel}
                </Text>
                <Text style={styles.signupLead}>
                  Mode test non officiel : on saute Google et on ouvre le voyage
                  local.
                </Text>

                <View style={styles.steps}>
                  {SIGNUP_STEPS.map((step, i) => (
                    <View key={step.title} style={styles.stepRow}>
                      <View style={styles.stepNum}>
                        <Text style={styles.stepNumText}>{i + 1}</Text>
                      </View>
                      <View style={styles.stepCopy}>
                        <Text style={styles.stepTitle}>{step.title}</Text>
                        <Text style={styles.stepDetail}>{step.detail}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable
                  style={[styles.btn, joining && styles.btnDisabled]}
                  disabled={joining}
                  onPress={onExpoTestContinue}
                >
                  {joining ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.btnText}>
                      Continuer sans Google (test)
                    </Text>
                  )}
                </Pressable>
              </View>
            ) : !loggedIn ? (
              <View style={[styles.signupCard, shadow.soft]}>
                <Text style={styles.signupKicker}>Inscription</Text>
                <Text style={styles.signupTitle}>
                  Crée ton compte pour rejoindre {tripLabel}
                </Text>
                <Text style={styles.signupLead}>
                  Un parcours dédié aux invités — tu retrouves le voyage juste
                  après la connexion.
                </Text>

                <View style={styles.steps}>
                  {SIGNUP_STEPS.map((step, i) => (
                    <View key={step.title} style={styles.stepRow}>
                      <View style={styles.stepNum}>
                        <Text style={styles.stepNumText}>{i + 1}</Text>
                      </View>
                      <View style={styles.stepCopy}>
                        <Text style={styles.stepTitle}>{step.title}</Text>
                        <Text style={styles.stepDetail}>{step.detail}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable
                  style={[
                    styles.googleBtn,
                    shadow.soft,
                    signingIn && { opacity: 0.7 },
                  ]}
                  disabled={signingIn}
                  onPress={() => void onSignUp()}
                >
                  {signingIn ? (
                    <ActivityIndicator color={colors.ink} />
                  ) : (
                    <>
                      <View style={styles.googleIconWrap}>
                        <GoogleGIcon size={18} />
                      </View>
                      <Text style={styles.googleBtnText}>
                        Continuer avec Google
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : (
              <View style={[styles.card, shadow.soft]}>
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Pressable
                  style={[styles.btn, joining && styles.btnDisabled]}
                  onPress={() => void join()}
                  disabled={joining}
                >
                  {joining ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.btnText}>Rejoindre le voyage</Text>
                  )}
                </Pressable>
                {joining ? (
                  <Text style={styles.joiningHint}>
                    Inscription OK — on t’ajoute au voyage…
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  stack: { gap: 14 },
  card: {
    marginTop: 4,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 22,
    gap: 10,
  },
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.primary,
    textTransform: 'uppercase',
  },
  name: {
    fontFamily: fonts.extrabold,
    fontSize: 24,
    color: colors.ink,
    letterSpacing: -0.5,
  },
  meta: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  org: { fontFamily: fonts.semibold, fontSize: 14, color: colors.inkSoft },
  error: { fontFamily: fonts.medium, fontSize: 14, color: '#B91C1C' },
  btn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontFamily: fonts.bold, fontSize: 16, color: colors.white },
  joiningHint: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },
  signupCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: 22,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryMuted,
  },
  signupKicker: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 1.3,
    color: colors.primaryInk,
    textTransform: 'uppercase',
  },
  signupTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    color: colors.ink,
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  signupLead: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  steps: { gap: 10, marginTop: 4 },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    padding: 12,
  },
  stepNum: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontFamily: fonts.extrabold,
    fontSize: 14,
    color: colors.white,
  },
  stepCopy: { flex: 1, gap: 2, minWidth: 0 },
  stepTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.ink,
  },
  stepDetail: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 16,
  },
  googleBtn: {
    marginTop: 8,
    minHeight: 52,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  googleIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleBtnText: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
  },
})
