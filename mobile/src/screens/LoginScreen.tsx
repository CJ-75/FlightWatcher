import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Image,
  ImageBackground,
  Dimensions,
  PixelRatio,
  PanResponder,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { colors } from '../theme'
import * as WebBrowser from 'expo-web-browser'

WebBrowser.maybeCompleteAuthSession()

/**
 * iPhone contract: ImageBackground → LinearGradient → Text/CTA as children.
 * No fade overlay at all (any Animated opacity over the hero covers text/CTA).
 */

const { width: W } = Dimensions.get('window')
const HERO_W = Math.min(2000, Math.round(Math.max(W, 390) * Math.min(PixelRatio.get(), 3)))
const HOLD_MS = 8500
const SWIPE_DX = 56

type Slide = { city: string; country: string; id: string }

const SLIDES: Slide[] = [
  { city: 'Budapest', country: 'Hongrie', id: 'photo-1541343672885-9be56236302a' },
  { city: 'Lisbonne', country: 'Portugal', id: 'photo-1754151630904-da4334bddfbf' },
  { city: 'Barcelone', country: 'Espagne', id: 'photo-1583422409516-2895a77efded' },
  { city: 'Rome', country: 'Italie', id: 'photo-1555992828-ca4dbe41d294' },
  { city: 'Marrakech', country: 'Maroc', id: 'photo-1653323792487-6ecc6217040b' },
]

function uri(id: string) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${HERO_W}&q=90&fm=jpg`
}

const URIS = SLIDES.map((s) => uri(s.id))

export function LoginScreen() {
  const { signInWithGoogle, continueAsGuest } = useAuth()
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(false)
  const [slide, setSlide] = useState(0)

  const slideRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const armTimer = () => {
    clearTimer()
    timerRef.current = setTimeout(() => {
      goRef.current(1)
    }, HOLD_MS)
  }

  const go = useCallback((dirOrIndex: number, absolute = false) => {
    const next = absolute
      ? dirOrIndex
      : (slideRef.current + dirOrIndex + SLIDES.length) % SLIDES.length
    if (next === slideRef.current) return
    slideRef.current = next
    setSlide(next)
    armTimer()
  }, [])

  const goRef = useRef(go)
  goRef.current = go

  useEffect(() => {
    URIS.forEach((u) => {
      void Image.prefetch(u)
    })
  }, [])

  useEffect(() => {
    armTimer()
    return () => clearTimer()
  }, [])

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 1.25,
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) < SWIPE_DX) return
        if (g.dx < 0) goRef.current(1)
        else goRef.current(-1)
      },
      onPanResponderTerminationRequest: () => true,
    }),
  ).current

  const onLogin = async () => {
    setLoading(true)
    const { error: err } = await signInWithGoogle()
    if (err && __DEV__) console.warn('[auth] signIn', err.message)
    setLoading(false)
  }

  const current = SLIDES[slide]

  return (
    <View style={styles.root} {...panResponder.panHandlers}>
      <StatusBar style="light" />

      <ImageBackground
        source={{ uri: URIS[slide] }}
        style={styles.hero}
        imageStyle={styles.heroBitmap}
        resizeMode="cover"
      >
        <LinearGradient
          colors={[
            'rgba(8,4,2,0.5)',
            'rgba(8,4,2,0.05)',
            'rgba(8,4,2,0.35)',
            'rgba(8,4,2,0.92)',
          ]}
          locations={[0, 0.32, 0.62, 1]}
          style={[
            styles.overlay,
            {
              paddingTop: insets.top + 20,
              paddingBottom: Math.max(insets.bottom, 12) + 18,
            },
          ]}
        >
          <Text style={styles.brand}>FlightWatcher</Text>
          <View style={styles.brandRule} />

          <View style={styles.spacer} />

          <Text style={styles.kicker}>{current.country.toUpperCase()}</Text>
          <Text style={styles.city}>{current.city}</Text>
          <Text style={styles.tagline}>
            Le bon vol,{'\n'}au bon prix.
          </Text>

          <View style={styles.dots}>
            {SLIDES.map((s, i) => (
              <Pressable
                key={s.id}
                hitSlop={10}
                onPress={() => go(i, true)}
                style={[styles.dot, i === slide && styles.dotActive]}
              />
            ))}
          </View>

          <View style={styles.cta}>
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

            {__DEV__ ? (
              <Pressable
                onPress={continueAsGuest}
                style={({ pressed }) => [styles.guestBtn, pressed && { opacity: 0.65 }]}
                hitSlop={10}
              >
                <Text style={styles.guestLabel}>Continuer sans compte</Text>
              </Pressable>
            ) : (
              <Text style={styles.legal}>Connexion sécurisée · recherche gratuite</Text>
            )}
          </View>
        </LinearGradient>
      </ImageBackground>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080402',
  },
  hero: {
    flex: 1,
    backgroundColor: '#1A120E',
  },
  heroBitmap: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    paddingHorizontal: 26,
  },
  brand: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -0.9,
    color: '#FFFFFF',
  },
  brandRule: {
    marginTop: 11,
    width: 34,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  spacer: {
    flex: 1,
    minHeight: 20,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.6,
    color: colors.primary,
    marginBottom: 10,
  },
  city: {
    fontSize: 44,
    lineHeight: 48,
    fontWeight: '800',
    letterSpacing: -1.6,
    color: '#FFFFFF',
  },
  tagline: {
    marginTop: 12,
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.9)',
    maxWidth: 300,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 20,
    marginBottom: 28,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  dotActive: {
    width: 22,
    backgroundColor: colors.primary,
  },
  cta: {
    gap: 10,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
  },
  googlePressed: { opacity: 0.92, transform: [{ scale: 0.985 }] },
  googleDisabled: { opacity: 0.7 },
  gMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F3F6FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gLetter: {
    fontWeight: '800',
    color: '#4285F4',
    fontSize: 14,
  },
  googleLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  guestBtn: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  legal: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.55)',
  },
})
