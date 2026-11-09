/**
 * Lot 3 — Promise → Comment ça marche → Ville → Envie.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Animated,
  Easing,
  ImageBackground,
  Dimensions,
  PixelRatio,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  TRAVEL_PREFERENCE_CARDS,
  airportSelectionLabel,
  encodeAirportCodes,
  findCityGroupByCodes,
  groupAirportsByCity,
  loadOnboardingPrefs,
  markOnboardingCompleted,
  parseAirportCodes,
  setDepartureCity,
  setTravelPreference,
  suggestCityFromLocale,
  type Airport,
  type TravelPreference,
} from '@flightwatcher/shared'
import { getApi } from '../lib/client'
import {
  peekCachedAirports,
  subscribeAirports,
} from '../lib/airportsCache'
import { CityAirportPicker } from '../components/CityAirportPicker'
import { ScreenBackground } from '../components/ScreenBackground'
import { colors, fonts, shadow } from '../theme'

type Props = {
  onDone: () => void
}

const { width: W } = Dimensions.get('window')
const PHOTO_W = Math.min(
  1600,
  Math.round(Math.max(W, 390) * Math.min(PixelRatio.get(), 2.5)),
)

/** Frame 1 — Cinque Terre / week-end méditerranéen. */
const PROMISE_PHOTO = `https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=${PHOTO_W}&q=90&fm=jpg`

/** Frame 2 — Arc de Triomphe (bastien-nvs / SprV1eqNrqM). */
const CITY_STEP_PHOTO =
  'https://images.unsplash.com/photo-1603378995290-8d4ce0495ddd?auto=format&fit=crop&w=2400&q=95&fm=jpg'

const PROMISE_FEATURES = [
  {
    title: 'Depuis chez toi',
    detail: 'Des week-ends qui collent à ton budget',
    photo: `https://images.unsplash.com/photo-1603378995290-8d4ce0495ddd?auto=format&fit=crop&w=800&q=90&fm=jpg`,
  },
  {
    title: 'Des idées toutes prêtes',
    detail: 'Un parcours à suivre, ou à partager',
    photo: `https://images.unsplash.com/photo-1527631746610-bca00a040d60?auto=format&fit=crop&w=640&q=80&fm=jpg`,
  },
  {
    title: 'Avec qui tu veux',
    detail: 'Solo, duo ou toute la bande',
    photo: `https://images.unsplash.com/photo-1647282518004-f37573ae12d4?auto=format&fit=crop&w=800&q=90&fm=jpg`,
  },
] as const

const HOW_IT_WORKS = [
  {
    title: 'Parcours',
    detail: 'Balades et week-ends choisis, étape par étape.',
    photo: `https://images.unsplash.com/photo-1527631746610-bca00a040d60?auto=format&fit=crop&w=640&q=80&fm=jpg`,
  },
  {
    title: 'Séjours',
    detail: 'Vol + hôtel au bon prix, prêts à réserver.',
    photo: `https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=640&q=80&fm=jpg`,
  },
  {
    title: 'Activités',
    detail: 'Que faire sur place, dès que ta ville est claire.',
    photo: `https://images.unsplash.com/photo-1555881400-74d7acaacd8b?auto=format&fit=crop&w=640&q=80&fm=jpg`,
  },
  {
    title: 'Planner',
    detail: 'Ton voyage en un lieu — solo ou à plusieurs.',
    photo: `https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=640&q=80&fm=jpg`,
  },
] as const

/** Bandeau « Tu voyages plutôt… » (Fn27DlI8bZ8). */
const PREF_HERO_PHOTO =
  'https://images.unsplash.com/photo-1612278675615-7b093b07772d?auto=format&fit=crop&w=2400&q=95&fm=jpg'

const PREF_VISUAL: Record<TravelPreference, { photo: string; line: string }> = {
  amis: {
    // 5_DX7zql8a0
    photo:
      'https://images.unsplash.com/photo-1647282518004-f37573ae12d4?auto=format&fit=crop&w=2400&q=95&fm=jpg',
    line: 'La bande, les rires, zéro prise de tête',
  },
  couple: {
    // gardée — validée
    photo: `https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=${PHOTO_W}&q=80&fm=jpg`,
    line: 'Deux places, une même envie',
  },
  solo: {
    // sCiKTRwnSFg
    photo:
      'https://images.unsplash.com/photo-1620424722820-c86c2672d7f5?auto=format&fit=crop&w=2400&q=95&fm=jpg',
    line: 'Ton rythme, tes envies',
  },
  famille: {
    // DgEtNnBf9_o
    photo:
      'https://images.unsplash.com/photo-1742401709446-53625fca69e8?auto=format&fit=crop&w=2400&q=95&fm=jpg',
    line: 'Des week-ends qui plaisent à tous',
  },
}

function slugifyCity(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
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

export function OnboardingFlowScreen({ onDone }: Props) {
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0)
  const suggested = useMemo(
    () =>
      suggestCityFromLocale(
        Intl.DateTimeFormat().resolvedOptions().locale,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      ),
    [],
  )
  const [airports, setAirports] = useState<Airport[]>(() => peekCachedAirports())
  const [airport, setAirport] = useState('')
  const [pref, setPref] = useState<TravelPreference | null>(null)
  const defaultedOriginRef = useRef(false)

  const fade = useRef(new Animated.Value(1)).current
  const rise = useRef(new Animated.Value(0)).current
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    track('onboarding_started')
  }, [])

  useEffect(() => subscribeAirports(setAirports), [])

  useEffect(() => {
    void loadOnboardingPrefs().then((p) => {
      if (p.departureAirportCodes) setAirport(p.departureAirportCodes)
    })
  }, [])

  useEffect(() => {
    if (!airports.length || defaultedOriginRef.current) return
    if (airport) {
      defaultedOriginRef.current = true
      return
    }
    defaultedOriginRef.current = true
    const groups = groupAirportsByCity(airports)
    const paris = groups.find((g) => g.city.toLowerCase() === 'paris')
    if (paris) {
      const encoded = encodeAirportCodes(paris.airports.map((a) => a.code))
      if (encoded) {
        setAirport(encoded)
        return
      }
    }
    const want = suggested.label.toLowerCase()
    const match = groups.find((g) => g.city.toLowerCase() === want)
    if (match) {
      const encoded = encodeAirportCodes(match.airports.map((a) => a.code))
      if (encoded) setAirport(encoded)
      return
    }
    const fallback = findCityGroupByCodes(groups, ['CDG', 'ORY', 'BVA'])
    if (fallback) {
      const encoded = encodeAirportCodes(fallback.airports.map((a) => a.code))
      if (encoded) setAirport(encoded)
    }
  }, [airports, airport, suggested.label])

  useEffect(() => {
    fade.setValue(0)
    rise.setValue(12)
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 340,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(rise, {
        toValue: 0,
        duration: 380,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(progress, {
        toValue: step / 3,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start()
  }, [step, fade, rise, progress])

  const cityGroups = useMemo(() => groupAirportsByCity(airports), [airports])
  const codes = useMemo(() => parseAirportCodes(airport), [airport])
  const cityLabel = useMemo(() => {
    const group = findCityGroupByCodes(cityGroups, codes)
    if (group) return group.city
    return airportSelectionLabel(airport, cityGroups) || suggested.label
  }, [airport, cityGroups, codes, suggested.label])

  const finish = async () => {
    await markOnboardingCompleted()
    track('onboarding_completed', {
      city: slugifyCity(cityLabel),
      preference: pref,
    })
    onDone()
  }

  const persistCity = () => {
    const slug = slugifyCity(cityLabel) || suggested.slug
    void setDepartureCity({
      slug,
      label: cityLabel,
      airportCodes: airport || null,
    })
    track('onboarding_city_set', { slug, codes: airport })
    void getApi()
      .updateProfile({
        home_city_slug: slug,
        home_airport: airport,
      })
      .catch(() => {})
  }

  const barWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['14%', '100%'],
  })

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + 12,
          paddingBottom: Math.max(insets.bottom, 12) + 14,
        },
      ]}
    >
      <StatusBar style="dark" />
      <ScreenBackground />

      <View style={styles.topMeta}>
        <Text style={styles.brand}>FlightWatcher</Text>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: barWidth }]} />
        </View>
        <Text style={styles.stepCount}>
          {step + 1}
          <Text style={styles.stepCountMuted}> / 4</Text>
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
            <View style={styles.stepBody}>
              <View style={[styles.heroFrame, shadow.soft]}>
                <ImageBackground
                  source={{ uri: PROMISE_PHOTO }}
                  style={styles.heroImage}
                  imageStyle={styles.heroImageBitmap}
                >
                  <LinearGradient
                    colors={[
                      'rgba(26,18,14,0.2)',
                      'rgba(26,18,14,0.15)',
                      'rgba(26,18,14,0.78)',
                    ]}
                    locations={[0, 0.4, 1]}
                    style={styles.heroGrad}
                  >
                    <View style={styles.heroBadge}>
                      <Text style={styles.heroBadgeText}>Week-ends</Text>
                    </View>
                    <Text style={styles.heroEyebrow}>FLIGHTWATCHER</Text>
                    <Text style={styles.heroTitle}>
                      Pars mieux,{'\n'}sans y passer des heures.
                    </Text>
                    <Text style={styles.heroLead}>
                      Des idées depuis chez toi, au bon prix — prêtes à
                      partager.
                    </Text>
                  </LinearGradient>
                </ImageBackground>
              </View>

              <View style={[styles.featureCard, shadow.soft]}>
                {PROMISE_FEATURES.map((f, i) => (
                  <View
                    key={f.title}
                    style={[
                      styles.featureRow,
                      i < PROMISE_FEATURES.length - 1 && styles.featureRowBorder,
                    ]}
                  >
                    <ImageBackground
                      source={{ uri: f.photo }}
                      style={styles.featureThumb}
                      imageStyle={styles.featureThumbImg}
                    />
                    <View style={styles.featureCopy}>
                      <Text style={styles.featureTitle}>{f.title}</Text>
                      <Text style={styles.featureDetail}>{f.detail}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.cta,
                styles.ctaPinned,
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
            <View style={styles.stepBody}>
              <View style={styles.howHeader}>
                <Text style={styles.howEyebrow}>MODE D’EMPLOI</Text>
                <Text style={styles.howTitle}>Comment ça marche</Text>
                <Text style={styles.howLead}>
                  Quatre outils, un même but : partir sans te perdre.
                </Text>
              </View>

              <View style={[styles.howPath, shadow.soft]}>
                {HOW_IT_WORKS.map((f, i) => (
                  <View key={f.title} style={styles.howPathStep}>
                    <View style={styles.howPathRail}>
                      <View style={styles.howPathDot}>
                        <Text style={styles.howPathDotText}>{i + 1}</Text>
                      </View>
                      {i < HOW_IT_WORKS.length - 1 ? (
                        <View style={styles.howPathLine} />
                      ) : null}
                    </View>
                    <View style={styles.howPathCopy}>
                      <Text style={styles.howPathTitle}>{f.title}</Text>
                      <Text style={styles.howPathDetail}>{f.detail}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.cta,
                styles.ctaPinned,
                pressed && styles.ctaPressed,
              ]}
              onPress={() => {
                track('onboarding_how_viewed')
                setStep(2)
              }}
            >
              <Text style={styles.ctaText}>Compris</Text>
            </Pressable>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <View style={styles.stepBody}>
              <View style={[styles.cityHero, shadow.soft]}>
                <ImageBackground
                  source={{ uri: CITY_STEP_PHOTO }}
                  style={styles.cityHeroImg}
                  imageStyle={styles.cityHeroBitmap}
                >
                  <LinearGradient
                    colors={[
                      'rgba(26,18,14,0.22)',
                      'rgba(26,18,14,0.12)',
                      'rgba(26,18,14,0.78)',
                    ]}
                    locations={[0, 0.4, 1]}
                    style={styles.cityHeroGrad}
                  >
                    <Text style={styles.heroEyebrow}>CHEZ TOI</Text>
                    <Text style={styles.heroTitle}>
                      Tu pars{'\n'}d’où ?
                    </Text>
                  </LinearGradient>
                </ImageBackground>
              </View>

              <View style={[styles.card, shadow.soft]}>
                <Text style={styles.fieldLabel}>Ta ville</Text>
                <CityAirportPicker
                  airports={airports}
                  value={airport}
                  onChange={setAirport}
                />
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.cta,
                styles.ctaPinned,
                !codes.length && styles.ctaDisabled,
                pressed && codes.length > 0 && styles.ctaPressed,
              ]}
              disabled={!codes.length}
              onPress={() => {
                persistCity()
                setStep(3)
              }}
            >
              <Text style={styles.ctaText}>Continuer</Text>
            </Pressable>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <View style={styles.stepBody}>
              <View style={[styles.prefHero, shadow.soft]}>
                <ImageBackground
                  source={{
                    uri: pref ? PREF_VISUAL[pref].photo : PREF_HERO_PHOTO,
                  }}
                  style={styles.prefHeroImg}
                  imageStyle={styles.prefHeroBitmap}
                  resizeMode="cover"
                >
                  <LinearGradient
                    colors={[
                      'rgba(26,18,14,0.35)',
                      'rgba(26,18,14,0.18)',
                      'rgba(26,18,14,0.82)',
                    ]}
                    locations={[0, 0.42, 1]}
                    style={styles.prefHeroGrad}
                  >
                    <Text style={styles.heroEyebrow}>AVEC QUI</Text>
                    <Text style={styles.prefHeroTitle}>
                      Tu voyages plutôt…
                    </Text>
                    {pref ? (
                      <Text style={styles.heroLead}>
                        {PREF_VISUAL[pref].line}
                      </Text>
                    ) : null}
                  </LinearGradient>
                </ImageBackground>
              </View>

              <View style={styles.prefGrid}>
                {[0, 1].map((row) => (
                  <View key={row} style={styles.prefRow}>
                    {TRAVEL_PREFERENCE_CARDS.slice(row * 2, row * 2 + 2).map(
                      (c) => {
                        const on = pref === c.id
                        const visual = PREF_VISUAL[c.id]
                        return (
                          <Pressable
                            key={c.id}
                            onPress={() => setPref(c.id)}
                            style={({ pressed }) => [
                              styles.prefTile,
                              shadow.soft,
                              on && styles.prefTileOn,
                              pressed && { opacity: 0.95 },
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
                                    ? [
                                        'rgba(26,18,14,0.1)',
                                        'rgba(232,90,40,0.9)',
                                      ]
                                    : [
                                        'rgba(26,18,14,0.08)',
                                        'rgba(26,18,14,0.82)',
                                      ]
                                }
                                style={styles.prefOverlay}
                              >
                                <Text style={styles.prefLabel}>{c.label}</Text>
                                <Text style={styles.prefLine}>
                                  {visual.line}
                                </Text>
                              </LinearGradient>
                            </ImageBackground>
                          </Pressable>
                        )
                      },
                    )}
                  </View>
                ))}
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.cta,
                styles.ctaPinned,
                !pref && styles.ctaDisabled,
                pressed && pref && styles.ctaPressed,
              ]}
              disabled={!pref}
              onPress={() => {
                if (!pref) return
                persistCity()
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
                persistCity()
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
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 20,
    backgroundColor: colors.canvas,
  },
  topMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
    zIndex: 2,
  },
  brand: {
    fontFamily: fonts.extrabold,
    fontSize: 14,
    letterSpacing: -0.3,
    color: colors.ink,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(40,32,24,0.1)',
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
    color: colors.ink,
  },
  stepCountMuted: {
    color: colors.muted,
    fontFamily: fonts.regular,
  },
  pane: { flex: 1, zIndex: 1 },
  stepBody: { flex: 1, minHeight: 0 },
  heroFrame: {
    flex: 1,
    minHeight: 220,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(40,32,24,0.06)',
  },
  heroImage: {
    width: '100%',
    flex: 1,
    minHeight: 220,
  },
  heroImageBitmap: { borderRadius: 24 },
  heroGrad: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 28,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 10,
  },
  heroBadgeText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: '#FFF9F5',
    letterSpacing: 0.3,
  },
  heroEyebrow: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: 'rgba(255,176,136,0.95)',
    marginBottom: 8,
  },
  heroTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.9,
    color: '#FFF9F5',
    marginBottom: 8,
  },
  heroLead: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,249,245,0.82)',
    maxWidth: 320,
  },
  featureCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 4,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  featureRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  featureThumb: {
    width: 52,
    height: 52,
    borderRadius: 14,
    overflow: 'hidden',
  },
  featureThumbImg: { borderRadius: 14 },
  featureCopy: { flex: 1, minWidth: 0 },
  featureTitle: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.ink,
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  featureDetail: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
  howHeader: {
    marginBottom: 16,
  },
  howEyebrow: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: colors.primary,
    marginBottom: 8,
  },
  howTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.8,
    color: colors.ink,
    marginBottom: 6,
  },
  howLead: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    maxWidth: 320,
  },
  howPath: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 10,
  },
  howPathStep: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 14,
    minHeight: 0,
  },
  howPathRail: {
    width: 32,
    alignItems: 'center',
  },
  howPathDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howPathDotText: {
    fontFamily: fonts.extrabold,
    fontSize: 13,
    color: '#FFF9F5',
  },
  howPathLine: {
    flex: 1,
    width: 2,
    marginTop: 6,
    marginBottom: 6,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
  },
  howPathCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 4,
    paddingBottom: 12,
    justifyContent: 'flex-start',
  },
  howPathTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    letterSpacing: -0.3,
    color: colors.ink,
    marginBottom: 4,
  },
  howPathDetail: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  cityHero: {
    flex: 1,
    minHeight: 200,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(40,32,24,0.06)',
  },
  cityHeroImg: { flex: 1, minHeight: 200 },
  cityHeroBitmap: { borderRadius: 24 },
  cityHeroGrad: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingBottom: 18,
    paddingTop: 28,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 4,
  },
  fieldLabel: {
    fontFamily: fonts.bold,
    fontSize: 12,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: 10,
  },
  prefHero: {
    height: 158,
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 12,
    /** Fond = teinte sombre image — pas de frange grise / canvas si anti-alias. */
    backgroundColor: '#1A120E',
  },
  prefHeroImg: { flex: 1 },
  prefHeroBitmap: {
    borderRadius: 22,
  },
  prefHeroGrad: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 28,
  },
  prefHeroTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.7,
    color: '#FFF9F5',
    marginBottom: 6,
  },
  prefGrid: {
    flex: 1,
    gap: 10,
  },
  prefRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  prefTile: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
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
    marginBottom: 2,
  },
  prefLine: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(255,249,245,0.82)',
  },
  cta: {
    backgroundColor: colors.ink,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
  },
  ctaPinned: {
    marginTop: 12,
  },
  ctaPressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  ctaDisabled: { opacity: 0.35 },
  ctaText: {
    fontFamily: fonts.bold,
    color: '#FFF9F5',
    fontSize: 16,
    letterSpacing: -0.2,
  },
  skip: { marginTop: 10, alignItems: 'center', paddingVertical: 4 },
  skipText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: colors.muted,
  },
})
