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
        colors={['#FF8A55', '#FF6B35', '#FFF9F5']}
        locations={[0, 0.42, 0.78]}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.screen,
            {
              paddingTop: insets.top + 28,
              paddingBottom: Math.max(insets.bottom, 16) + 16,
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
                style={{ marginTop: 4 }}
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
  root: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  screen: {
    flex: 1,
    paddingHorizontal: 22,
    justifyContent: 'space-between',
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginBottom: 16,
  },
  badgeText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.white,
    letterSpacing: 0.6,
    includeFontPadding: false,
  },
  brand: {
    fontFamily: fonts.extrabold,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -1.3,
    color: colors.white,
    marginBottom: 12,
    includeFontPadding: false,
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.92)',
    maxWidth: 300,
    includeFontPadding: false,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 18,
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
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    marginBottom: 18,
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
    backgroundColor: colors.primarySoft,
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
    marginTop: 14,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
    textAlign: 'center',
    includeFontPadding: false,
  },
})
