import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Animated,
  Easing,
  Dimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { colors, fonts } from '../theme'
import * as WebBrowser from 'expo-web-browser'

WebBrowser.maybeCompleteAuthSession()

const { width: W, height: H } = Dimensions.get('window')

function useEntrance(delay = 0) {
  const opacity = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(22)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 700,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 750,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start()
  }, [delay, opacity, translateY])

  return { opacity, transform: [{ translateY }] }
}

function FloatingOrb({
  size,
  color,
  start,
  drift,
  duration,
}: {
  size: number
  color: string
  start: { x: number; y: number }
  drift: { x: number; y: number }
  duration: number
}) {
  const anim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [anim, duration])

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, drift.x],
  })
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, drift.y],
  })
  const scale = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.08, 1],
  })

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.orb,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          left: start.x,
          top: start.y,
          transform: [{ translateX }, { translateY }, { scale }],
        },
      ]}
    />
  )
}

const FROM_CITIES = [
  'Paris',
  'Lyon',
  'Marseille',
  'Bordeaux',
  'Lille',
  'Nantes',
  'Toulouse',
  'Nice',
  'Beauvais',
]

const TO_CITIES = [
  'Barcelone',
  'Rome',
  'Lisbonne',
  'Porto',
  'Milan',
  'Berlin',
  'Prague',
  'Budapest',
  'Dublin',
  'Athènes',
  'Madrid',
  'Vienne',
  'Cracovie',
  'Séville',
]

function RouteTicker() {
  const [fromIdx, setFromIdx] = useState(0)
  const [toIdx, setToIdx] = useState(0)
  const opacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const tick = () => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setFromIdx((i) => (i + 1) % FROM_CITIES.length)
        // Destinations rotate faster for more variety
        setToIdx((i) => (i + 2) % TO_CITIES.length)
        Animated.timing(opacity, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start()
      })
    }
    const id = setInterval(tick, 2600)
    return () => clearInterval(id)
  }, [opacity])

  return (
    <View style={styles.routeHint}>
      <View style={styles.routeDot} />
      <View style={styles.routeLine} />
      <View style={[styles.routeDot, styles.routeDotEnd]} />
      <Animated.Text style={[styles.routeText, { opacity }]} numberOfLines={1}>
        {FROM_CITIES[fromIdx]} → {TO_CITIES[toIdx]}
      </Animated.Text>
    </View>
  )
}

export function LoginScreen({ onContinueAsGuest }: { onContinueAsGuest?: () => void }) {
  const { signInWithGoogle } = useAuth()
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const markStyle = useEntrance(80)
  const heroStyle = useEntrance(220)
  const subStyle = useEntrance(380)
  const ctaStyle = useEntrance(560)
  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.025,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

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
        colors={['#FFF9F5', '#FFD4BC', '#FF6B35', '#E85A28']}
        locations={[0, 0.38, 0.78, 1]}
        style={StyleSheet.absoluteFill}
      />

      <FloatingOrb
        size={220}
        color="rgba(255,255,255,0.35)"
        start={{ x: W * 0.45, y: -40 }}
        drift={{ x: -28, y: 36 }}
        duration={5200}
      />
      <FloatingOrb
        size={140}
        color="rgba(255,255,255,0.22)"
        start={{ x: -40, y: H * 0.28 }}
        drift={{ x: 24, y: -20 }}
        duration={6400}
      />
      <FloatingOrb
        size={90}
        color="rgba(255,107,53,0.28)"
        start={{ x: W * 0.72, y: H * 0.42 }}
        drift={{ x: -18, y: 22 }}
        duration={4800}
      />

      <View
        style={[
          styles.screen,
          {
            paddingTop: insets.top + 32,
            paddingBottom: Math.max(insets.bottom, 18) + 18,
          },
        ]}
      >
        <Animated.View style={[styles.top, markStyle]}>
          <View style={styles.markRow}>
            <View style={styles.markDot} />
            <Text style={styles.mark}>FlightWatcher</Text>
          </View>
        </Animated.View>

        <View style={styles.heroBlock}>
          <Animated.View style={heroStyle}>
            <Text style={styles.hero}>
              Des weekends{'\n'}qui comptent.
            </Text>
          </Animated.View>
          <Animated.View style={subStyle}>
            <Text style={styles.sub}>
              Scanne Ryanair selon ton budget.{'\n'}Trouve le prochain weekend parfait.
            </Text>
            <RouteTicker />
          </Animated.View>
        </View>

        <Animated.View style={[styles.bottom, ctaStyle]}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Animated.View style={{ transform: [{ scale: pulse }] }}>
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
          </Animated.View>

          {onContinueAsGuest ? (
            <Pressable
              onPress={onContinueAsGuest}
              style={({ pressed }) => [styles.guestBtn, pressed && { opacity: 0.75 }]}
              hitSlop={8}
            >
              <Text style={styles.guestLabel}>Continuer sans compte</Text>
            </Pressable>
          ) : null}
        </Animated.View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF9F5', overflow: 'hidden' },
  orb: {
    position: 'absolute',
  },
  screen: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
  },
  top: {
    alignItems: 'flex-start',
  },
  markRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  markDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
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
    paddingBottom: 12,
  },
  hero: {
    fontFamily: fonts.extrabold,
    fontSize: 44,
    lineHeight: 50,
    letterSpacing: -1.8,
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
  routeHint: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  routeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.ink,
  },
  routeDotEnd: {
    backgroundColor: colors.primary,
  },
  routeLine: {
    width: 28,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(26,18,14,0.25)',
  },
  routeText: {
    flexShrink: 1,
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.inkSoft,
    letterSpacing: 0.2,
    includeFontPadding: false,
  },
  bottom: {
    gap: 6,
  },
  error: {
    fontFamily: fonts.medium,
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.75)',
    overflow: 'hidden',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    includeFontPadding: false,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 58,
    borderRadius: 20,
    backgroundColor: colors.white,
    paddingHorizontal: 20,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  googlePressed: { transform: [{ scale: 0.98 }], opacity: 0.96 },
  googleDisabled: { opacity: 0.7 },
  gMark: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F3F6FB',
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
    color: 'rgba(255,255,255,0.95)',
    includeFontPadding: false,
  },
})
