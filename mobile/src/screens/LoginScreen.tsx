import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  ImageBackground,
  Dimensions,
  PixelRatio,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'
import { colors, fonts } from '../theme'
import * as WebBrowser from 'expo-web-browser'

WebBrowser.maybeCompleteAuthSession()

/**
 * iPhone-safe hero:
 * - ImageBackground + dark overlay View (NOT expo-linear-gradient as sibling)
 * - Text are CHILDREN of the overlay (same tree) — cannot paint "under" the image
 * - System fontWeight only on hero (no Sora fontFamily — avoids iOS 0-glyph bug)
 */

const { width: W } = Dimensions.get('window')
const HERO_W = Math.min(1400, Math.round(Math.max(W, 390) * Math.min(PixelRatio.get(), 2)))

type Slide = { city: string; country: string; id: string }

const SLIDES: Slide[] = [
  { city: 'Lisbonne', country: 'Portugal', id: 'photo-1555881400-74d7acaacd8b' },
  { city: 'Barcelone', country: 'Espagne', id: 'photo-1583422409516-2895a77efded' },
  { city: 'Rome', country: 'Italie', id: 'photo-1552832230-c0197dd311b5' },
  { city: 'Marrakech', country: 'Maroc', id: 'photo-1517824806704-9040b037703b' },
  { city: 'Budapest', country: 'Hongrie', id: 'photo-1541343672885-9be56236302a' },
]

function uri(id: string) {
  return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${HERO_W}&q=80&fm=jpg`
}

const URIS = SLIDES.map((s) => uri(s.id))

export function LoginScreen() {
  const { signInWithGoogle, continueAsGuest } = useAuth()
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(false)
  const [slide, setSlide] = useState(0)

  const sheetY = useRef(new Animated.Value(20)).current

  useEffect(() => {
    URIS.forEach((u) => {
      void Image.prefetch(u)
    })
  }, [])

  useEffect(() => {
    Animated.timing(sheetY, {
      toValue: 0,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [sheetY])

  useEffect(() => {
    const id = setInterval(() => {
      setSlide((i) => (i + 1) % SLIDES.length)
    }, 5000)
    return () => clearInterval(id)
  }, [])

  const onLogin = async () => {
    setLoading(true)
    const { error: err } = await signInWithGoogle()
    if (err && __DEV__) console.warn('[auth] signIn', err.message)
    setLoading(false)
  }

  const current = SLIDES[slide]

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <ImageBackground
        source={{ uri: URIS[slide] }}
        style={styles.hero}
        imageStyle={styles.heroImage}
        resizeMode="cover"
      >
        {/* Opaque-ish overlay — children Text cannot fall under the bitmap */}
        <View
          style={[
            styles.overlay,
            {
              paddingTop: insets.top + 18,
              paddingBottom: 40,
            },
          ]}
        >
          <View style={styles.brandChip}>
            <Text style={styles.brand}>FlightWatcher</Text>
          </View>

          <View style={styles.heroBottom}>
            <View style={styles.copyBlock}>
              <Text style={styles.city}>{current.city}</Text>
              <Text style={styles.country}>{current.country}</Text>
              <Text style={styles.tagline}>
                Le weekend parfait,{'\n'}au prix juste.
              </Text>
            </View>

            <View style={styles.dots}>
              {SLIDES.map((s, i) => (
                <View
                  key={s.id}
                  style={[styles.dot, i === slide && styles.dotActive]}
                />
              ))}
            </View>
          </View>
        </View>
      </ImageBackground>

      <Animated.View
        style={[
          styles.sheet,
          {
            paddingBottom: Math.max(insets.bottom, 14) + 16,
            transform: [{ translateY: sheetY }],
          },
        ]}
      >
        <View style={styles.handle} />
        <Text style={styles.sheetTitle}>Bienvenue</Text>
        <Text style={styles.sheetBody}>
          Low-cost, séjours vol+hôtel, voyages à plusieurs — tout au même endroit.
        </Text>

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
            <ActivityIndicator color="#FFF9F5" />
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
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.65 }]}
            hitSlop={8}
          >
            <Text style={styles.secondaryLabel}>Continuer sans compte</Text>
          </Pressable>
        ) : (
          <Text style={styles.legal}>Connexion sécurisée · recherche gratuite</Text>
        )}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0604',
  },
  hero: {
    flex: 1,
    minHeight: 300,
    backgroundColor: '#1A120E',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(8,4,2,0.42)',
    paddingHorizontal: 22,
    justifyContent: 'space-between',
  },
  brandChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  brand: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: '#FFFFFF',
  },
  heroBottom: {
    gap: 16,
  },
  copyBlock: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  city: {
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '800',
    letterSpacing: -1.2,
    color: '#FFFFFF',
  },
  country: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  tagline: {
    marginTop: 10,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.95)',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.primary,
  },
  sheet: {
    backgroundColor: '#FFF9F5',
    paddingHorizontal: 24,
    paddingTop: 10,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -18,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -4 },
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5CBB8',
    marginBottom: 14,
  },
  sheetTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.8,
    color: '#1A120E',
  },
  sheetBody: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: '#4A3428',
    marginBottom: 14,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#1A120E',
    paddingHorizontal: 20,
  },
  googlePressed: { opacity: 0.9 },
  googleDisabled: { opacity: 0.65 },
  gMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gLetter: {
    fontWeight: '800',
    color: '#4285F4',
    fontSize: 14,
  },
  googleLabel: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: '#FFF9F5',
  },
  secondaryBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: '#4A3428',
  },
  legal: {
    fontFamily: fonts.regular,
    textAlign: 'center',
    marginTop: 4,
    fontSize: 12,
    color: '#8A6A58',
  },
})
