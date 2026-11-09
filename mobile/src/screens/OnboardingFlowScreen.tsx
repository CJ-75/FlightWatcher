/**
 * Lot 3 — onboarding B cinématique : Promise → Ville → Envie.
 * Contrat Login : ImageBackground → LinearGradient → copy/CTA.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  ImageBackground,
  Dimensions,
  PixelRatio,
  Animated,
  Easing,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  TRAVEL_PREFERENCE_CARDS,
  cityImageUrl,
  markOnboardingCompleted,
  setDepartureCity,
  setTravelPreference,
  suggestCityFromLocale,
  type TravelPreference,
} from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import { colors, fonts } from '../theme'

type Props = {
  onDone: () => void
}

const { width: W, height: H } = Dimensions.get('window')
const HERO_W = Math.min(
  2000,
  Math.round(Math.max(W, 390) * Math.min(PixelRatio.get(), 3)),
)

const PROMISE_HERO =
  `https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=${HERO_W}&q=90&fm=jpg`

const CITY_SUGGESTIONS = [
  { slug: 'paris', label: 'Paris', codes: 'CDG,ORY' },
  { slug: 'lyon', label: 'Lyon', codes: 'LYS' },
  { slug: 'marseille', label: 'Marseille', codes: 'MRS' },
  { slug: 'bordeaux', label: 'Bordeaux', codes: 'BOD' },
  { slug: 'toulouse', label: 'Toulouse', codes: 'TLS' },
  { slug: 'nantes', label: 'Nantes', codes: 'NTE' },
  { slug: 'nice', label: 'Nice', codes: 'NCE' },
  { slug: 'lille', label: 'Lille', codes: 'LIL' },
] as const

const PREF_VISUAL: Record<
  TravelPreference,
  { photo: string; line: string }
> = {
  amis: {
    photo: `https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=${HERO_W}&q=85&fm=jpg`,
    line: 'Week-ends à plusieurs, sans tableur',
  },
  couple: {
    photo: `https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=${HERO_W}&q=85&fm=jpg`,
    line: 'Deux places, une même envie',
  },
  solo: {
    photo: `https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=${HERO_W}&q=85&fm=jpg`,
    line: 'Tu pars quand tu veux',
  },
  famille: {
    photo: `https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=${HERO_W}&q=85&fm=jpg`,
    line: 'Des idées qui tiennent la route',
  },
}

function track(event: string, meta?: Record<string, unknown>) {
  void getApi()
    .trackActivityEvent({
      domain: 'onboarding',
      event,
      surface: 'onboarding',
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      meta: meta || {},
    })
    .catch(() => {})
}

function cityHeroUri(label: string) {
  const raw = cityImageUrl(label)
  if (!raw) return PROMISE_HERO
  if (raw.includes('w=')) return raw.replace(/w=\d+/, `w=${HERO_W}`)
  return `${raw}${raw.includes('?') ? '&' : '?'}w=${HERO_W}&q=90`
}

export function OnboardingFlowScreen({ onDone }: Props) {
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const suggested = useMemo(
    () =>
      suggestCityFromLocale(
        Intl.DateTimeFormat().resolvedOptions().locale,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      ),
    [],
  )
  const [cityQuery, setCityQuery] = useState('')
  const [selectedCity, setSelectedCity] = useState(suggested)
  const [pref, setPref] = useState<TravelPreference | null>(null)

  const fade = useRef(new Animated.Value(1)).current
  const rise = useRef(new Animated.Value(0)).current
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    track('onboarding_started')
  }, [])

  useEffect(() => {
    fade.setValue(0)
    rise.setValue(18)
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: 0,
        duration: 480,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: step / 2,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start()
  }, [step, fade, rise, progress])

  const filtered = CITY_SUGGESTIONS.filter((c) =>
    !cityQuery.trim()
      ? true
      : c.label.toLowerCase().includes(cityQuery.trim().toLowerCase()),
  )

  const finish = async () => {
    await markOnboardingCompleted()
    track('onboarding_completed', {
      city: selectedCity.slug,
      preference: pref,
    })
    onDone()
  }

  const heroUri =
    step === 0
      ? PROMISE_HERO
      : step === 1
        ? cityHeroUri(selectedCity.label)
        : pref
          ? PREF_VISUAL[pref].photo
          : PROMISE_HERO

  const goCity = () => {
    const match =
      CITY_SUGGESTIONS.find((c) => c.slug === selectedCity.slug) ||
      CITY_SUGGESTIONS[0]
    void setDepartureCity({
      slug: match.slug,
      label: match.label,
      airportCodes: match.codes,
    })
    track('onboarding_city_set', { slug: match.slug })
    void getApi()
      .updateProfile({
        home_city_slug: match.slug,
        home_airport: match.codes,
      })
      .catch(() => {})
    setStep(2)
  }

  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['12%', '100%'],
  })

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ImageBackground
        source={{ uri: heroUri }}
        style={styles.hero}
        imageStyle={styles.heroBitmap}
        resizeMode="cover"
      >
        <LinearGradient
          colors={[
            'rgba(6,3,2,0.55)',
            'rgba(6,3,2,0.08)',
            'rgba(6,3,2,0.42)',
            'rgba(6,3,2,0.94)',
          ]}
          locations={[0, 0.28, 0.58, 1]}
          style={[
            styles.overlay,
            {
              paddingTop: insets.top + 16,
              paddingBottom: Math.max(insets.bottom, 12) + 16,
            },
          ]}
        >
          <View style={styles.topMeta}>
            <Text style={styles.brand}>FlightWatcher</Text>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: barWidth }]} />
            </View>
            <Text style={styles.stepCount}>
              {step + 1}
              <Text style={styles.stepCountMuted}> / 3</Text>
            </Text>
          </View>

          <Animated.View
            style={[
              styles.pane,
              { opacity: fade, transform: [{ translateY: rise }] },
            ]}
          >
            {step === 0 ? (
              <>
                <View style={styles.spacer} />
                <Text style={styles.eyebrow}>WEEK-ENDS · PRÊTS À PARTIR</Text>
                <Text style={styles.heroTitle}>
                  Le bon départ,{'\n'}le bon prix.
                </Text>
                <Text style={styles.lead}>
                  Des parcours depuis ta ville, à partager — sans tableur.
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.cta,
                    pressed && styles.ctaPressed,
                  ]}
                  onPress={() => setStep(1)}
                >
                  <Text style={styles.ctaText}>C’est parti</Text>
                </Pressable>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <Text style={styles.eyebrow}>DÉPART</Text>
                <Text style={styles.heroTitle}>
                  Tu pars{'\n'}d’où ?
                </Text>
                <Text style={styles.lead}>
                  On te propose {selectedCity.label}. Les aéroports restent en
                  coulisse.
                </Text>

                <TextInput
                  style={styles.input}
                  placeholder="Chercher une ville"
                  placeholderTextColor="rgba(255,249,245,0.35)"
                  value={cityQuery}
                  onChangeText={setCityQuery}
                  selectionColor={colors.primary}
                />

                <ScrollView
                  style={styles.cityList}
                  contentContainerStyle={styles.cityListContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {filtered.map((c) => {
                    const on = selectedCity.slug === c.slug
                    return (
                      <Pressable
                        key={c.slug}
                        onPress={() =>
                          setSelectedCity({ slug: c.slug, label: c.label })
                        }
                        style={({ pressed }) => [
                          styles.cityRow,
                          on && styles.cityRowOn,
                          pressed && { opacity: 0.92 },
                        ]}
                      >
                        <ImageBackground
                          source={{ uri: cityHeroUri(c.label) }}
                          style={styles.cityThumb}
                          imageStyle={styles.cityThumbImg}
                        >
                          <LinearGradient
                            colors={['transparent', 'rgba(0,0,0,0.55)']}
                            style={StyleSheet.absoluteFill}
                          />
                        </ImageBackground>
                        <View style={styles.cityCopy}>
                          <Text
                            style={[styles.cityName, on && styles.cityNameOn]}
                          >
                            {c.label}
                          </Text>
                          {on ? (
                            <Text style={styles.cityHint}>Sélectionné</Text>
                          ) : null}
                        </View>
                        <View style={[styles.radio, on && styles.radioOn]} />
                      </Pressable>
                    )
                  })}
                </ScrollView>

                <Pressable
                  style={({ pressed }) => [
                    styles.cta,
                    pressed && styles.ctaPressed,
                  ]}
                  onPress={goCity}
                >
                  <Text style={styles.ctaText}>Continuer</Text>
                </Pressable>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <Text style={styles.eyebrow}>ENVIE</Text>
                <Text style={styles.heroTitle}>
                  Tu voyages{'\n'}plutôt…
                </Text>
                <Text style={styles.lead}>
                  On affine les idées. Tu pourras changer plus tard.
                </Text>

                <View style={styles.prefGrid}>
                  {TRAVEL_PREFERENCE_CARDS.map((c) => {
                    const on = pref === c.id
                    const visual = PREF_VISUAL[c.id]
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => setPref(c.id)}
                        style={({ pressed }) => [
                          styles.prefTile,
                          on && styles.prefTileOn,
                          pressed && { transform: [{ scale: 0.985 }] },
                        ]}
                      >
                        <ImageBackground
                          source={{ uri: visual.photo }}
                          style={styles.prefBg}
                          imageStyle={styles.prefBgImg}
                        >
                          <LinearGradient
                            colors={
                              on
                                ? ['rgba(8,4,2,0.15)', 'rgba(8,4,2,0.82)']
                                : ['rgba(8,4,2,0.25)', 'rgba(8,4,2,0.72)']
                            }
                            style={styles.prefOverlay}
                          >
                            <Text style={styles.prefLabel}>{c.label}</Text>
                            <Text style={styles.prefLine}>{visual.line}</Text>
                          </LinearGradient>
                        </ImageBackground>
                      </Pressable>
                    )
                  })}
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.cta,
                    !pref && styles.ctaDisabled,
                    pressed && pref && styles.ctaPressed,
                  ]}
                  disabled={!pref}
                  onPress={() => {
                    if (!pref) return
                    void setTravelPreference(pref)
                    track('onboarding_pref_set', { preference: pref })
                    void getApi()
                      .updateProfile({ travel_preference: pref })
                      .catch(() => {})
                    void finish()
                  }}
                >
                  <Text style={styles.ctaText}>Voir des idées</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void setTravelPreference(null)
                    void finish()
                  }}
                  style={styles.skip}
                  hitSlop={10}
                >
                  <Text style={styles.skipText}>Passer</Text>
                </Pressable>
              </>
            ) : null}
          </Animated.View>
        </LinearGradient>
      </ImageBackground>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080402' },
  hero: { flex: 1, width: W, minHeight: H },
  heroBitmap: { width: '100%', height: '100%' },
  overlay: {
    flex: 1,
    paddingHorizontal: 22,
  },
  topMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  brand: {
    fontFamily: fonts.extrabold,
    fontSize: 15,
    letterSpacing: -0.3,
    color: '#FFF9F5',
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,249,245,0.18)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  stepCount: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: '#FFF9F5',
    letterSpacing: 0.4,
  },
  stepCountMuted: {
    color: 'rgba(255,249,245,0.45)',
    fontFamily: fonts.regular,
  },
  pane: { flex: 1 },
  spacer: { flex: 1, minHeight: 48 },
  eyebrow: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 2.2,
    color: 'rgba(255,176,136,0.95)',
    marginBottom: 12,
    marginTop: 8,
  },
  heroTitle: {
    fontFamily: fonts.serif,
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -1.2,
    color: '#FFF9F5',
    marginBottom: 12,
  },
  lead: {
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 24,
    color: 'rgba(255,249,245,0.72)',
    marginBottom: 22,
    maxWidth: 340,
  },
  cta: {
    marginTop: 'auto',
    backgroundColor: '#FFF9F5',
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
  },
  ctaPressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  ctaDisabled: { opacity: 0.35 },
  ctaText: {
    fontFamily: fonts.bold,
    color: '#1A120E',
    fontSize: 16,
    letterSpacing: -0.2,
  },
  input: {
    fontFamily: fonts.medium,
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,249,245,0.22)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(8,4,2,0.35)',
    color: '#FFF9F5',
    marginBottom: 12,
  },
  cityList: { flexGrow: 0, maxHeight: H * 0.36, marginBottom: 14 },
  cityListContent: { gap: 8, paddingBottom: 4 },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,249,245,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,249,245,0.1)',
  },
  cityRowOn: {
    backgroundColor: 'rgba(255,107,53,0.22)',
    borderColor: 'rgba(255,176,136,0.55)',
  },
  cityThumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cityThumbImg: { borderRadius: 12 },
  cityCopy: { flex: 1, minWidth: 0 },
  cityName: {
    fontFamily: fonts.semibold,
    fontSize: 17,
    color: 'rgba(255,249,245,0.88)',
    letterSpacing: -0.3,
  },
  cityNameOn: { color: '#FFF9F5' },
  cityHint: {
    fontFamily: fonts.medium,
    fontSize: 12,
    color: 'rgba(255,176,136,0.95)',
    marginTop: 2,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(255,249,245,0.35)',
    marginRight: 6,
  },
  radioOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  prefGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  prefTile: {
    width: (W - 44 - 10) / 2,
    height: 118,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,249,245,0.12)',
  },
  prefTileOn: {
    borderColor: colors.primary,
  },
  prefBg: { flex: 1 },
  prefBgImg: { borderRadius: 16 },
  prefOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 12,
  },
  prefLabel: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: '#FFF9F5',
    letterSpacing: -0.3,
  },
  prefLine: {
    fontFamily: fonts.regular,
    fontSize: 11,
    color: 'rgba(255,249,245,0.7)',
    marginTop: 3,
    lineHeight: 14,
  },
  skip: { marginTop: 14, alignItems: 'center', paddingVertical: 6 },
  skipText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: 'rgba(255,249,245,0.48)',
  },
})
