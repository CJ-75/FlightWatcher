import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { translate } from '@flightwatcher/shared'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/Button'
import { colors, fonts, radius, shadow, spacing } from '../theme'
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
        locations={[0, 0.45, 1]}
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
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + 28,
            paddingBottom: Math.max(insets.bottom, 20) + 24,
            paddingHorizontal: 22,
            justifyContent: 'space-between',
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>FlightWatcher</Text>
            </View>
            <Text style={styles.brand}>Des weekends{'\n'}qui comptent.</Text>
            <Text style={styles.subtitle}>
              Scanne les meilleurs aller-retour Ryanair selon ton budget — en un geste.
            </Text>
          </View>

          <View style={[styles.card, shadow.lift]}>
            <Text style={styles.cardTitle}>Bienvenue</Text>
            <Text style={styles.cardHint}>
              Connecte-toi pour sauver tes recherches et favoris sur tous tes appareils.
            </Text>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
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
                style={{ marginTop: 4 }}
              />
            ) : null}

            <Text style={styles.legal}>
              En continuant, tu acceptes l’usage de tes recherches pour améliorer FlightWatcher.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1A0F0A' },
  flex: { flex: 1 },
  glow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '55%',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 20,
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
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: -1.4,
    color: colors.white,
    marginBottom: 14,
    includeFontPadding: false,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(255,255,255,0.78)',
    maxWidth: 320,
    includeFontPadding: false,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  cardTitle: {
    fontFamily: fonts.bold,
    fontSize: 24,
    lineHeight: 32,
    color: colors.ink,
    marginBottom: 8,
    includeFontPadding: false,
  },
  cardHint: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.muted,
    marginBottom: 22,
    includeFontPadding: false,
  },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorText: {
    fontFamily: fonts.medium,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 20,
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
    marginTop: 16,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.faint,
    textAlign: 'center',
    includeFontPadding: false,
  },
})
