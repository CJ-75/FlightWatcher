import React, { useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { translate } from '@flightwatcher/shared'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/ui/Button'
import { colors, fonts, radius, shadow, spacing, type } from '../theme'
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
        colors={['#FFF8F4', '#FFE6D8', '#FFD4BC']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Soft brand orb */}
      <View style={styles.orb} />

      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + spacing.xxl,
            paddingBottom: Math.max(insets.bottom, spacing.xl) + spacing.lg,
            paddingHorizontal: spacing.xl,
          },
        ]}
      >
        <View style={styles.hero}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Weekend escape</Text>
          </View>
          <Text style={styles.brand}>FlightWatcher</Text>
          <Text style={styles.subtitle}>{translate('fr', 'app.subtitle')}</Text>
        </View>

        <View style={[styles.card, shadow.lift]}>
          <Text style={styles.cardTitle}>Connexion</Text>
          <Text style={styles.cardHint}>{translate('fr', 'login.subtitle')}</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Button
            variant="google"
            label={loading ? translate('fr', 'auth.signInProgressLong') : translate('fr', 'auth.signInWithGoogle')}
            onPress={onLogin}
            loading={loading}
            left={!loading ? <GoogleMark /> : undefined}
          />

          {onContinueAsGuest ? (
            <Button
              variant="ghost"
              label="Continuer sans compte"
              onPress={onContinueAsGuest}
              style={{ marginTop: spacing.sm }}
            />
          ) : null}
        </View>

        <Text style={styles.footer}>Ryanair · prix live · aller-retour</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  orb: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(255,107,53,0.18)',
    top: -40,
    right: -60,
  },
  content: { flex: 1, justifyContent: 'space-between' },
  hero: { marginTop: spacing.xl },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,107,53,0.25)',
  },
  badgeText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.primaryInk,
    letterSpacing: 0.3,
  },
  brand: { ...type.hero, fontSize: 40, lineHeight: 46 },
  subtitle: {
    ...type.body,
    marginTop: spacing.sm,
    fontSize: 17,
    color: colors.inkSoft,
    maxWidth: 280,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  cardTitle: { ...type.title, fontSize: 22, marginBottom: spacing.sm },
  cardHint: { ...type.caption, marginBottom: spacing.xl, lineHeight: 20 },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { fontFamily: fonts.medium, color: colors.danger, fontSize: 13 },
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
    fontSize: 16,
  },
  footer: {
    textAlign: 'center',
    fontFamily: fonts.medium,
    fontSize: 12,
    color: colors.faint,
    marginTop: spacing.xl,
  },
})
