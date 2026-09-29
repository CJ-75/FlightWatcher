import React, { useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { translate } from '@flightwatcher/shared'
import { useAuth } from '../context/AuthContext'
import { colors, radius, spacing } from '../theme'
import * as WebBrowser from 'expo-web-browser'

WebBrowser.maybeCompleteAuthSession()

export function LoginScreen({ onContinueAsGuest }: { onContinueAsGuest?: () => void }) {
  const { signInWithGoogle } = useAuth()
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
    <LinearGradient colors={[colors.loginFrom, colors.loginTo]} style={styles.gradient}>
      <View style={styles.card}>
        <Text style={styles.brand}>{translate('fr', 'login.title')}</Text>
        <Text style={styles.subtitle}>{translate('fr', 'app.subtitle')}</Text>
        <Text style={styles.hint}>{translate('fr', 'login.subtitle')}</Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          style={[styles.googleBtn, loading && styles.disabled]}
          onPress={onLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.slate600} />
          ) : (
            <>
              <Text style={styles.googleG}>G</Text>
              <Text style={styles.googleText}>{translate('fr', 'auth.signInWithGoogle')}</Text>
            </>
          )}
        </Pressable>

        {onContinueAsGuest ? (
          <Pressable style={styles.ghost} onPress={onContinueAsGuest}>
            <Text style={styles.ghostText}>Continuer sans compte</Text>
          </Pressable>
        ) : null}
      </View>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  brand: {
    fontSize: 34,
    fontWeight: '900',
    color: colors.slate900,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.slate600,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  hint: {
    fontSize: 14,
    color: colors.slate500,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { color: colors.danger, fontSize: 13 },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  googleG: {
    fontSize: 20,
    fontWeight: '900',
    color: '#4285F4',
  },
  googleText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.slate700,
  },
  disabled: { opacity: 0.55 },
  ghost: { marginTop: spacing.xl, alignItems: 'center' },
  ghostText: { color: colors.slate600, fontWeight: '600', fontSize: 14 },
})
