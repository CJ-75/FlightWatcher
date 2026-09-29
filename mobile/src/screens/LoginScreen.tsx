import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { colors, fonts } from '../theme'
import * as WebBrowser from 'expo-web-browser'

WebBrowser.maybeCompleteAuthSession()

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
        colors={['#FFF9F5', '#FFE8DC', '#FF6B35']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Soft light orb */}
      <View style={styles.orb} />

      <View
        style={[
          styles.screen,
          {
            paddingTop: insets.top + 36,
            paddingBottom: Math.max(insets.bottom, 20) + 20,
          },
        ]}
      >
        <View style={styles.top}>
          <Text style={styles.mark}>FlightWatcher</Text>
        </View>

        <View style={styles.heroBlock}>
          <Text style={styles.hero}>
            Des weekends{'\n'}qui comptent.
          </Text>
          <Text style={styles.sub}>
            Les meilleurs aller-retour,{'\n'}selon ton budget.
          </Text>
        </View>

        <View style={styles.bottom}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={() => void onLogin()}
            disabled={loading}
            style={({ pressed }) => [
              styles.googleBtn,
              pressed && styles.googlePressed,
              loading && styles.googleDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <>
                <View style={styles.gMark}>
                  <Text style={styles.gLetter}>G</Text>
                </View>
                <Text style={styles.googleLabel}>Continuer avec Google</Text>
              </>
            )}
          </Pressable>

          {onContinueAsGuest ? (
            <Pressable onPress={onContinueAsGuest} style={styles.guestBtn} hitSlop={8}>
              <Text style={styles.guestLabel}>Continuer sans compte</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  orb: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  screen: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
  },
  top: {
    alignItems: 'flex-start',
  },
  mark: {
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
    letterSpacing: -0.2,
    includeFontPadding: false,
  },
  heroBlock: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 24,
  },
  hero: {
    fontFamily: fonts.extrabold,
    fontSize: 42,
    lineHeight: 48,
    letterSpacing: -1.6,
    color: colors.ink,
    includeFontPadding: false,
  },
  sub: {
    marginTop: 18,
    fontFamily: fonts.regular,
    fontSize: 17,
    lineHeight: 26,
    color: colors.inkSoft,
    includeFontPadding: false,
  },
  bottom: {
    gap: 4,
  },
  error: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: 10,
    includeFontPadding: false,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: colors.white,
    paddingHorizontal: 20,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  googlePressed: { transform: [{ scale: 0.985 }], opacity: 0.95 },
  googleDisabled: { opacity: 0.7 },
  gMark: {
    width: 30,
    height: 30,
    borderRadius: 15,
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
  googleLabel: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.ink,
    includeFontPadding: false,
  },
  guestBtn: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestLabel: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.white,
    includeFontPadding: false,
  },
})
