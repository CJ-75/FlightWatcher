/**
 * Lot 3 — entre canvas app et ancrage photo (Promise → Ville → Envie).
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
  cityImageUrl,
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

const PROMISE_PHOTO = `https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=${PHOTO_W}&q=85&fm=jpg`

const PROMISE_FEATURES = [
  {
    title: 'Depuis ta ville',
    detail: 'Prix clairs, aéroports en coulisse',
    photo: `https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=640&q=80&fm=jpg`,
  },
  {
    title: 'Parcours prêts',
    detail: 'Des idées à partager en un lien',
    photo: `https://images.unsplash.com/photo-1527631746610-bca00a040d60?auto=format&fit=crop&w=640&q=80&fm=jpg`,
  },
  {
    title: 'À plusieurs',
    detail: 'Invite tes amis sans tableur',
    photo: `https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=640&q=80&fm=jpg`,
  },
] as const

const PREF_VISUAL: Record<TravelPreference, { photo: string; line: string }> = {
  amis: {
    photo: `https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=${PHOTO_W}&q=80&fm=jpg`,
    line: 'Week-ends à plusieurs, sans tableur',
  },
  couple: {
    photo: `https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=${PHOTO_W}&q=80&fm=jpg`,
    line: 'Deux places, une même envie',
  },
  solo: {
    photo: `https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=${PHOTO_W}&q=80&fm=jpg`,
    line: 'Tu pars quand tu veux',
  },
  famille: {
    photo: `https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&w=${PHOTO_W}&q=80&fm=jpg`,
    line: 'Des idées qui tiennent la route',
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

function cityPhoto(label: string) {
  const raw = cityImageUrl(label)
  if (!raw) return PROMISE_PHOTO
  if (raw.includes('w=')) return raw.replace(/w=\d+/, `w=${PHOTO_W}`)
  return `${raw}${raw.includes('?') ? '&' : '?'}w=${PHOTO_W}&q=85`
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
  const [step, setStep] = useState<0 | 1 | 2>(0)
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
        toValue: step / 2,
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
                      <Text style={styles.heroBadgeText}>Nouveau</Text>
                    </View>
                    <Text style={styles.heroEyebrow}>
                      WEEK-ENDS · PRÊTS À PARTIR
                    </Text>
                    <Text style={styles.heroTitle}>
                      Le bon départ,{'\n'}le bon prix.
                    </Text>
                    <Text style={styles.heroLead}>
                      Prix clairs depuis ta ville — parcours à partager, sans
                      tableur.
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
              <View style={[styles.cityHero, shadow.soft]}>
                <ImageBackground
                  source={{ uri: cityPhoto(cityLabel) }}
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
                    <Text style={styles.heroEyebrow}>DÉPART</Text>
                    <Text style={styles.heroTitle}>
                      Tu pars{'\n'}d’où ?
                    </Text>
                    <Text style={styles.heroLead}>
                      On te propose {cityLabel} — même champ que dans Vols.
                    </Text>
                  </LinearGradient>
                </ImageBackground>
              </View>

              <View style={[styles.card, shadow.soft]}>
                <Text style={styles.fieldLabel}>Ville de départ</Text>
                <CityAirportPicker
                  airports={airports}
                  value={airport}
                  onChange={setAirport}
                />
                <View style={styles.cityHintRow}>
                  <View style={styles.cityHintDot} />
                  <Text style={styles.cityHintText}>
                    Les aéroports restent en coulisse — tu choisis la ville.
                  </Text>
                </View>
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
                setStep(2)
              }}
            >
              <Text style={styles.ctaText}>Continuer</Text>
            </Pressable>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <View style={styles.stepBody}>
              <View style={[styles.prefHero, shadow.soft]}>
                <ImageBackground
                  source={{
                    uri: pref
                      ? PREF_VISUAL[pref].photo
                      : PREF_VISUAL.amis.photo,
                  }}
                  style={styles.prefHeroImg}
                  imageStyle={styles.prefHeroBitmap}
                >
                  <LinearGradient
                    colors={[
                      'rgba(26,18,14,0.25)',
                      'rgba(26,18,14,0.2)',
                      'rgba(26,18,14,0.8)',
                    ]}
                    locations={[0, 0.35, 1]}
                    style={styles.prefHeroGrad}
                  >
                    <Text style={styles.heroEyebrow}>ENVIE</Text>
                    <Text style={styles.heroTitle}>
                      Tu voyages{'\n'}plutôt…
                    </Text>
                    <Text style={styles.heroLead}>
                      {pref
                        ? PREF_VISUAL[pref].line
                        : 'Choisis une façon de partir — tu pourras changer.'}
                    </Text>
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
    marginBottom: 14,
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
  pane: { flex: 1 },
  stepBody: { flex: 1 },
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
  cityHintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  cityHintDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.primary,
    marginTop: 4,
  },
  cityHintText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
  },
  prefHero: {
    height: 148,
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(40,32,24,0.06)',
  },
  prefHeroImg: { flex: 1 },
  prefHeroBitmap: { borderRadius: 22 },
  prefHeroGrad: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 20,
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
