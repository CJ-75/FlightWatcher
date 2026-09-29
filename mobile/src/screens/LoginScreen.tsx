import React, { useState } from 'react'
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { translate } from '@flightwatcher/shared'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/Button'
import { colors, fonts, radius, shadow } from '../theme'
import * as WebBrowser from 'expo-web-browser'

WebBrowser.maybeCompleteAuthSession()

function GoogleMark() {
  return (
    <View style={styles.gMark}>
      <Text style={styles.gLetter}>G</Text>
    </View>
  )
}

export function LoginScreen({ onContinueAsGuest }: { onContinueAsGuest?: () => void }) {
  const { signInWithGoogle } = useAuth()
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onLogin = async () => {
    setLoading(true)
    setError(null)
    const { error: err } = await signInWithGoogle()
    if (err) setError(err.message)
    setLoading(false)
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1A0F0A', '#2A1510', '#FF6B35']}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['transparent', 'rgba(255,107,53,0.35)']}
        style={styles.glow}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.screen,
            {
              paddingTop: insets.top + 20,
              paddingBottom: Math.max(insets.bottom, 16) + 12,
            },
          ]}
        >
          <View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>FlightWatcher</Text>
            </View>
            <Text style={styles.brand}>
              Des weekends{'\n'}qui comptent.
            </Text>
            <Text style={styles.subtitle}>
              Les meilleurs aller-retour Ryanair selon ton budget.
            </Text>
          </View>

          <View style={[styles.card, shadow.lift]}>
            <Text style={styles.cardTitle}>Bienvenue</Text>
            <Text style={styles.cardHint}>
              Sauve tes recherches et favoris sur tous tes appareils.
            </Text>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText} numberOfLines={2}>
                  {error}
                </Text>
              </View>
            ) : null}

            <Button
              variant="google"
              label={
                loading
                  ? translate('fr', 'auth.signInProgressLong')
                  : 'Continuer avec Google'
              }
              onPress={onLogin}
              loading={loading}
              left={!loading ? <GoogleMark /> : undefined}
            />

            {onContinueAsGuest ? (
              <Button
                variant="ghost"
                label="Continuer sans compte"
                onPress={onContinueAsGuest}
                style={{ marginTop: 2 }}
              />
            ) : null}

            <Text style={styles.legal}>
              En continuant, tu acceptes l’usage de tes recherches pour améliorer FlightWatcher.
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1A0F0A' },
  flex: { flex: 1 },
  screen: {
    flex: 1,
    paddingHorizontal: 22,
    justifyContent: 'space-between',
  },
  glow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  badgeText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.white,
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  brand: {
    fontFamily: fonts.extrabold,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -1.2,
    color: colors.white,
    marginBottom: 10,
    includeFontPadding: false,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.78)',
    maxWidth: 300,
    includeFontPadding: false,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  cardTitle: {
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.ink,
    marginBottom: 6,
    includeFontPadding: false,
  },
  cardHint: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    marginBottom: 16,
    includeFontPadding: false,
  },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
  },
  errorText: {
    fontFamily: fonts.medium,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    includeFontPadding: false,
  },
  gMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gLetter: {
    fontFamily: fonts.extrabold,
    color: '#4285F4',
    fontSize: 15,
    lineHeight: 20,
    includeFontPadding: false,
  },
  legal: {
    marginTop: 12,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: colors.faint,
    textAlign: 'center',
    includeFontPadding: false,
  },
})
